"""Write src/voicelines.js from tools/voice/lines.json, text only (no audio): the speech bubbles.

Each line gets a reading time (d, seconds) from its length. Run after editing lines.json:
    python3 tools/voice/text.py
(tools/voice/make.py does the same with spoken audio, if voices come back.)
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
lines = json.load(open(os.path.join(ROOT, 'tools/voice/lines.json')))
table = {}
for who, c in lines.items():
    if who.startswith('_'):
        continue
    for moment, ls in c.items():
        if not isinstance(ls, list):
            continue
        table.setdefault(who, {})[moment] = [
            {'t': t, 'd': round(min(6.5, max(2.2, 1.4 + 0.3 * len(t.split()))), 1)} for t in ls]
js = '// Written by tools/voice/text.py from tools/voice/lines.json: what each of the game\'s people says, by moment.\n'
js += '// t: the words (the bubble); d: seconds it stays up. No f: no audio (spoken lines are off for now).\n'
js += 'export const VOICE_LINES = ' + json.dumps(table, indent=1, ensure_ascii=False) + ';\n'
open(os.path.join(ROOT, 'src', 'voicelines.js'), 'w').write(js)
print(sum(len(v) for c in table.values() for v in c.values()), 'lines')
