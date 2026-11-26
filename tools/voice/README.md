# NPC lines and voices (0.99)

**Now (0.99.2): text only.** Edit `lines.json`, then run `python3 tools/voice/text.py`. It writes `src/voicelines.js` with each line and how long its bubble stays up. Spoken audio is off: Kokoro and Chatterbox (`sample_chatterbox.py`, the "Voice samples" workflow) both sounded too flat, with no real elders or children. To bring audio back, voice the lines with `make.py` (below) or something better, so each line has an `f` (its MP3); `src/voice.js` plays any line that has one.

- `lines.json`: what each person says, by moment, plus their voice settings (Kokoro voice, speed, pitch).
  - Haven's townsfolk say `greet` (when you talk to them), `near` (as you pass), and `questDone` (when you hand in their quest).
  - The keep's settlers also call out in a Night: `night`, `heroDown`, `hearthHit`, `nightHeld`, `nightLost`, `bossDown` and `seraph`.
  - The keep's heroes (`hero_m`, `hero_f`) call `wave`, `hurt`, `boss` and `cheer`.
- `make.py`: voices every line with Kokoro, an open text-to-speech model (Apache-2.0, fine for a commercial game). It shifts the pitch with ffmpeg for each character's age and size, trims the silence, evens out the loudness, and writes a 40 kbps mono MP3 for each line to `assets/voice/`. It also writes `src/voicelines.js`.
  - To install: `pip install kokoro-onnx soundfile`, then download `kokoro-v1.0.onnx` and `voices-v1.0.bin` from the github.com/thewh1teagle/kokoro-onnx releases.
  - To run: `python3 tools/voice/make.py <model dir> [ids to redo]`.
- To add or change a line, edit `lines.json` and run `make.py` again with that character's id.
