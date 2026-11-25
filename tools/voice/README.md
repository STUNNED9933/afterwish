# NPC voices (0.99)

- `lines.json`: what each person says, by moment, plus their voice settings (Kokoro voice, speed, pitch).
  - Haven's townsfolk say `greet` (when you talk to them), `near` (as you pass), and `questDone` (when you hand in their quest).
  - The keep's settlers also call out in a Night: `night`, `heroDown`, `hearthHit`, `nightHeld`, `nightLost`, `bossDown` and `seraph`.
  - The keep's heroes (`hero_m`, `hero_f`) call `wave`, `hurt`, `boss` and `cheer`.
- `make.py`: voices every line with Kokoro, an open text-to-speech model (Apache-2.0, fine for a commercial game). It shifts the pitch with ffmpeg for each character's age and size, trims the silence, evens out the loudness, and writes a 40 kbps mono MP3 for each line to `assets/voice/`. It also writes `src/voicelines.js`.
  - To install: `pip install kokoro-onnx soundfile`, then download `kokoro-v1.0.onnx` and `voices-v1.0.bin` from the github.com/thewh1teagle/kokoro-onnx releases.
  - To run: `python3 tools/voice/make.py <model dir> [ids to redo]`.
- To add or change a line, edit `lines.json` and run `make.py` again with that character's id.
