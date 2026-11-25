# Voice the NPCs (0.99): every line in lines.json, spoken by Kokoro (an open text-to-speech model, Apache-2.0),
# pitched per character with ffmpeg (age, size), and saved as small mono MP3s in assets/voice. Also writes
# src/voicelines.js (what each says, and how long each line lasts).
#
#   pip install kokoro-onnx soundfile
#   (model: kokoro-v1.0.onnx and voices-v1.0.bin, from github.com/thewh1teagle/kokoro-onnx releases)
#   python3 tools/voice/make.py <model dir> [only-these-ids,comma,separated]
import json, os, subprocess, sys, tempfile
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'voice')
os.makedirs(OUT, exist_ok=True)
lines = json.load(open(os.path.join(HERE, 'lines.json')))
model = sys.argv[1]
only = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else None
k = Kokoro(os.path.join(model, 'kokoro-v1.0.onnx'), os.path.join(model, 'voices-v1.0.bin'))
SR = 24000
table = {}
for who, d in lines.items():
    if who.startswith('_'):
        continue
    table[who] = {}
    for moment, said in d.items():
        if not isinstance(said, list):
            continue
        table[who][moment] = []
        for i, text in enumerate(said):
            name = f'{who}_{moment}_{i}'
            mp3 = os.path.join(OUT, name + '.mp3')
            if not only or who in only or not os.path.exists(mp3):
                samples, sr = k.create(text, voice=d['voice'], speed=d.get('speed', 1.0), lang='en-gb' if d['voice'].startswith('b') else 'en-us')
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t:
                    sf.write(t.name, samples, sr)
                    wav = t.name
                f = d.get('pitch', 1.0)
                chain = [f'asetrate={int(sr * f)}', f'aresample={SR}', f'atempo={1 / f:.4f}'] if abs(f - 1) > 0.005 else [f'aresample={SR}']
                if d.get('fx') == 'husk':
                    chain += ['aecho=0.8:0.6:70|140:0.35|0.2', 'lowpass=f=3200', 'volume=0.8']  # far off, and hollow
                chain += ['silenceremove=start_periods=1:start_threshold=-50dB', 'areverse', 'silenceremove=start_periods=1:start_threshold=-50dB', 'areverse', 'loudnorm=I=-18:TP=-2:LRA=9']
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-af', ','.join(chain), '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame', '-b:a', '40k', mp3], check=True)
                os.unlink(wav)
            dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3], capture_output=True, text=True).stdout.strip() or 0)
            table[who][moment].append({'f': name, 't': text, 'd': round(dur, 2)})
            print(name, round(dur, 2), flush=True)
js = '// Written by tools/voice/make.py (0.99): what each of the game\'s people says out loud, by moment.\n'
js += '// f: assets/voice/<f>.mp3 (served at voice/<f>.mp3); t: the words (the bubble); d: seconds long.\n'
js += 'export const VOICE_LINES = ' + json.dumps(table, indent=1, ensure_ascii=False) + ';\n'
open(os.path.join(ROOT, 'src', 'voicelines.js'), 'w').write(js)
total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print('files', len(os.listdir(OUT)), 'bytes', total)
