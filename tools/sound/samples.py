# (1.2) The games' instrument samples: recorded instruments from the Fluid R3 GM soundfont (Frank Wen; rendered
# to per-note MP3s by github.com/gleitz/midi-js-soundfonts, CC BY 3.0: credited in ASSETS.md and the games'
# credits). Only some notes of each are kept (every few semitones; the player pitches between them), cut to the
# length each instrument needs, faded, made mono at 64 kbit/s: assets/sound/<inst>/<midi>.mp3, and
# assets/sound/index.json listing them.
#
#   python3 tools/sound/samples.py            (needs ffmpeg; downloads from raw.githubusercontent.com)
import base64, json, os, re, subprocess, sys, tempfile, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'sound')
URL = 'https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/FluidR3_GM/{}-mp3.js'
NOTE = {'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}

# our name: (soundfont name, lowest midi, highest midi, every n semitones, seconds kept)
INSTRUMENTS = {
  'flute': ('flute', 60, 96, 4, 3.0),
  'oboe': ('oboe', 58, 91, 4, 3.0),
  'horn': ('french_horn', 41, 77, 4, 3.0),
  'trumpet': ('trumpet', 55, 84, 4, 2.5),
  'strings': ('string_ensemble_1', 36, 84, 4, 4.0),
  'tremolo': ('tremolo_strings', 40, 76, 6, 3.0),
  'pizz': ('pizzicato_strings', 36, 84, 4, 1.2),
  'cello': ('cello', 36, 67, 4, 3.0),
  'harp': ('orchestral_harp', 36, 96, 4, 2.5),
  'celesta': ('celesta', 60, 108, 4, 2.0),
  'glock': ('glockenspiel', 72, 108, 4, 2.0),
  'bells': ('tubular_bells', 52, 84, 6, 4.0),
  'organ': ('church_organ', 36, 84, 6, 3.0),
  'choir': ('choir_aahs', 48, 79, 4, 3.5),
  'bass': ('acoustic_bass', 28, 60, 4, 1.6),
  'contrabass': ('contrabass', 28, 55, 4, 3.0),
  'timp': ('timpani', 36, 60, 4, 2.0),
  'taiko': ('taiko_drum', 36, 60, 12, 1.5),
  'woodblock': ('woodblock', 60, 84, 12, 0.5),
  'tom': ('melodic_tom', 40, 64, 12, 1.0),
  'nylon': ('acoustic_guitar_nylon', 40, 84, 4, 2.5),
  'recorder': ('recorder', 60, 96, 4, 3.0),
  'whistle': ('whistle', 72, 96, 6, 2.0),
  # (for sound effects and ambience)
  'cymbal': ('reverse_cymbal', 60, 60, 12, 2.5),
  'breath': ('breath_noise', 60, 60, 12, 1.5),
  'sea': ('seashore', 60, 60, 12, 6.0),
  'birds': ('bird_tweet', 72, 84, 12, 2.5),
  'tinkle': ('tinkle_bell', 72, 96, 12, 1.5),
}

def note_midi(name):
  m = re.match(r'([A-G]b?)(-?\d)', name)
  return NOTE[m.group(1)] + 12 * (int(m.group(2)) + 1)

def main():
  only = set(sys.argv[1:]) or None
  os.makedirs(OUT, exist_ok=True)
  index = json.load(open(os.path.join(OUT, 'index.json'))) if os.path.exists(os.path.join(OUT, 'index.json')) else {}
  for ours, (sf, lo, hi, every, secs) in INSTRUMENTS.items():
    if only and ours not in only: continue
    js = urllib.request.urlopen(URL.format(sf), timeout=60).read().decode()
    notes = dict(re.findall(r'"([A-G]b?-?\d)":\s*"data:audio/mp3;base64,([^"]+)"', js))
    have = sorted((note_midi(n), n) for n in notes)
    want = list(range(lo, hi + 1, every))
    if want[-1] != hi and hi > lo: want.append(hi)
    os.makedirs(os.path.join(OUT, ours), exist_ok=True)
    kept = []
    for m in want:
      best = min(have, key=lambda h: abs(h[0] - m))
      if best[0] in kept: continue
      with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as f:
        f.write(base64.b64decode(notes[best[1]]))
      out = os.path.join(OUT, ours, f'{best[0]}.mp3')
      fade = max(0.05, min(0.4, secs * 0.15))
      subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f.name, '-t', str(secs), '-af', f'afade=t=out:st={secs - fade}:d={fade}', '-ac', '1', '-ar', '44100', '-b:a', '64k', out], check=True)
      os.unlink(f.name)
      kept.append(best[0])
    index[ours] = sorted(kept)
    size = sum(os.path.getsize(os.path.join(OUT, ours, f'{k}.mp3')) for k in kept)
    print(f'{ours:10s} {sf:24s} {len(kept):2d} notes {size // 1024:4d} KB', flush=True)
  json.dump(index, open(os.path.join(OUT, 'index.json'), 'w'), indent=0)

main()
