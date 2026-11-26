"""Try Chatterbox (MIT, Resemble AI) on a handful of lines, to compare with Kokoro.

Each character's timbre is cloned from their own current Kokoro lines (stitched into a
~10 s reference), so no real person's voice is used. Run on CPU (GitHub Actions):
    python tools/voice/sample_chatterbox.py out/
"""
import json, os, subprocess, sys, glob

OUT = sys.argv[1] if len(sys.argv) > 1 else 'out'
os.makedirs(OUT, exist_ok=True)
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LINES = json.load(open(os.path.join(ROOT, 'tools/voice/lines.json')))

# who -> (moments to sample, exaggeration, cfg_weight)
PICK = {
    'wren': (['greet', 'questDone'], 0.55, 0.5),
    'bram': (['greet', 'near'], 0.45, 0.5),
    'pip': (['greet', 'questDone'], 0.75, 0.4),
    'odile': (['near', 'greet'], 0.5, 0.5),
    'hero_f': (['hurt', 'cheer', 'wave'], 0.9, 0.3),
    'hero_m': (['hurt', 'boss'], 0.9, 0.3),
}


def ref_for(who):
    files = sorted(glob.glob(os.path.join(ROOT, f'assets/voice/{who}_*.mp3')))[:8]
    lst = os.path.join(OUT, f'_{who}.txt')
    with open(lst, 'w') as f:
        for p in files: f.write(f"file '{p}'\n")
    ref = os.path.join(OUT, f'_ref_{who}.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst,
                    '-t', '11', '-ar', '24000', '-ac', '1', ref], check=True)
    return ref


def to_mp3(wav, mp3):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-af', 'loudnorm=I=-16:TP=-1.5',
                    '-ac', '1', '-b:a', '64k', mp3], check=True)
    os.remove(wav)


import torch, torchaudio as ta
torch.set_num_threads(os.cpu_count() or 4)
models = {}
try:
    from chatterbox.tts import ChatterboxTTS
    models['cb'] = ChatterboxTTS.from_pretrained(device='cpu')
except Exception as e:
    print('chatterbox failed:', e)
try:
    from chatterbox.tts_turbo import ChatterboxTurboTTS
    models['turbo'] = ChatterboxTurboTTS.from_pretrained(device='cpu')
except Exception as e:
    print('turbo unavailable:', e)
if not models: sys.exit(1)

for who, (moments, exag, cfg) in PICK.items():
    ref = ref_for(who)
    n = 0
    for m in moments:
        for text in LINES[who][m][:2]:
            if n >= 4: break
            n += 1
            for tag, model in models.items():
                kw = dict(audio_prompt_path=ref)
                if tag == 'cb': kw.update(exaggeration=exag, cfg_weight=cfg)
                try:
                    wav = model.generate(text, **kw)
                except TypeError:
                    wav = model.generate(text, audio_prompt_path=ref)
                base = os.path.join(OUT, f'{tag}_{who}_{m}_{n}')
                ta.save(base + '.wav', wav, model.sr)
                to_mp3(base + '.wav', base + '.mp3')
                print('made', base, '|', text, flush=True)
            # the current Kokoro take, for side-by-side listening
            i = LINES[who][m].index(text)
            old = os.path.join(ROOT, f'assets/voice/{who}_{m}_{i}.mp3')
            if os.path.exists(old):
                subprocess.run(['cp', old, os.path.join(OUT, f'kokoro_{who}_{m}_{n}.mp3')])
for f in glob.glob(os.path.join(OUT, '_*')): os.remove(f)
