# Recorded soundtrack verification — 2026-09-19

- Input: user-provided `256OrchestralSamples.rar`, extracted outside the project.
- 38 source WAVs selected; filenames, SHA-256 hashes, root pitches and score mappings
  are recorded in `public/audio/render-manifest.json`.
- Recorded families: harp, vibraphone, cello ensemble, violin ensemble, horn, flute.
  Synthetic pads/drone/plucks/bass/electronic percussion remain intentional.
- Harp octave labels differ from the other families. Fundamental-frequency checks
  established harp C3 = MIDI 48; cello/flute/vibes C3 = MIDI 60,
  horn D2 = MIDI 50, violin C4 = MIDI 72.
- All sustained recordings are long enough for their pitched score notes. The
  renderer rejects missing recordings or insufficient sustain duration; no loops
  or synthesized fallback acoustic instruments are used.
- Six stereo MP3s, 48 kHz / 192 kbps, durations 90/79/90/95/84/91 seconds.
  Pre-encode RMS is 0.038 for each track; peaks 0.169–0.246, preserving headroom.
- `npm test`: 67 tests passed, including 11 soundtrack tests. Audio mixing tests use
  deterministic fixtures; actual sample renders separately check finite samples,
  duration and peak bounds.
- `npm run build`: passed; existing large JavaScript chunk warnings remain.
- Chromium browser verification: actual MP3 decoding/playback for all six tracks;
  user-gesture playback, pause/resume position, selection while paused, rapid next
  presses, one active audio element, full automatic playlist wrap, failed request
  and retry. No page errors.
- 12-second excerpts per track exported to `/tmp/distant-stars-sampled/soundtrack-preview.mp3`.

These checks establish audio integrity and working controls. They do not substitute
for a listening judgment about balance, naturalism or cinematic character.

## Soundtrack volume increase — 2026-09-20

- Re-rendered all eight production MP3s from the original local VSCO samples.
- Raised constant-gain RMS target from 0.038 to 0.076 (+6.02 dB), retaining
  the 0.65 peak ceiling and the arrangements' internal dynamics.
- Compared manifests: all eight RMS values doubled; track durations stayed unchanged.
- FFmpeg decoded every MP3 successfully. Decoded peaks range from -9.66 to
  -5.08 dBFS, with no clipping. All 16 soundtrack tests passed.

## Seventh track: 无尽的彼方 — arranged revision

- 112 seconds: introduction (0–8), theme (8–32), answer (32–56), withdrawn
  interlude (56–80), return (80–104), coda (104–112).
- Flute foreground, bowed bass/countermelody, strings, harp and sparse horn.
  Six-chord E-minor sentence rises beneath a recurring, mostly falling motif.
- Eight-layer Shepard arpeggios have 3+3+2 accents and overlapping releases;
  a quiet ten-layer Shepard-Risset texture rises continuously under all sentences.
  Instantaneous pitch controls octave-layer amplitude, and only near-silent edge
  components wrap. No exposed chromatic scale sequence remains.
- Separate-stem level analysis caught the ostinato slightly above the flute.
  Ostinato gain was reduced from 0.027 to 0.020; string support/cello replies added.
- Tests validate balanced octave handoffs across harmonic sentences and measure
  the continuous rise's actual spectral center before/after an octave. All samples
  are finite; pre-encode peak 0.26681, RMS 0.038.
- Full suite: 71 passed. After final balance edits, all 14 soundtrack tests passed
  again. Production build passed (existing large-chunk warnings remain).
- Current recording is exported as public/audio/endless-beyond.mp3.

## Continuous flute revision

- Two-bar slurs replace the short detached flute notes. Pitch changes share a
  phrase envelope; 140 ms crossfades connect sustain bodies, skipping the first
  450 ms of subsequent samples. Breathing is confined to phrase boundaries.
- An isolated render of the real flute samples checked all 30 internal changes:
  the lowest 120 ms transition RMS was 0.818 of the quieter adjacent window
  (-1.75 dB), with no drop to silence. Reverb was disabled for this measurement.
- Regression fixture with a silent 300 ms sample attack verifies that subsequent
  notes skip the attack and maintain energy, end silently, reject score gaps and
  reject insufficient sample lengths. Final soundtrack suite: 15 tests passed.
- Production render peak 0.24552, RMS 0.038; build passed.

## Fewer flute pitch changes

- Reduced each two-bar breath from four or five pitches to two: 4.0 s and 3.3 s
  held notes, retaining the shared phrase envelope and connected transition.
- Main flute line now has 18 notes across nine phrases (previously 39), plus the
  unchanged single-note coda. The middle section still gives space to the cello.
- Re-rendered the production soundtrack; all 15 soundtrack tests and the build
  passed. FFmpeg decoded the final MP3 without errors.

## Eighth track: 未寄出的星光 — lively arrangement

- 96-second cue, 4/4 at 120 BPM. B natural–C–E–G remains literal in the
  recurring marimba hook, with short harp answers, plucked-cello bass/offbeats,
  brief horn replies and a compact tag. The middle keeps the pulse moving.
- Real `Marimba_hit_Outrigger_*` and `CelloEns_pizzT_*` recordings added from the
  supplied archive. Both families' pitch mappings were checked against the
  waveform; cello pizzicato needs the fundamental, not its stronger second harmonic.
- Shared struck-instrument classification ensures these samples retain natural
  decay tails. No extra software or downloaded material was needed.
- Space reduced to decay 0.85 / mix 0.11. Pre-encode peak 0.26714, RMS 0.038.
- All 16 soundtrack tests passed; production build passed with the existing
  large-bundle warning. FFmpeg decoded the finished MP3 without errors.
- Fresh preview: /tmp/distant-stars-sampled/unsent-starlight-lively.mp3.

## Connected BCEG main motif

- Every full B-C-E-G statement now uses equal 0.5-second onset spacing and
  0.58-second note gates with natural ringing tails. No rest interrupts the
  four-note unit. Dynamics are more even across the four notes.
- The middle now passes the complete motif between marimba and harp instead of
  separating B-C and E-G into fragments. Tempo remains 120 BPM, duration 96 s.
- Score validation and the cue's full 48 kHz render check passed; build passed.
  Final MP3 decoded without errors.
