# Distant Stars soundtrack

Nine original arrangements, rendered at 48 kHz stereo / 192 kbps MP3.

Recorded instruments: harp, vibraphone, marimba, plucked cello, violin ensemble, cello ensemble,
French horn and flute, from **Sam Gossner / Versilian Studios LLC**,
256-Sample Pack of Orchestral Sounds (May 12, 2016).

- Publisher: https://versilian-studios.com/vsco-community/
- Original download: https://s3.amazonaws.com/VersilianStudios/256OrchestralSamples.rar
- Publisher identifies the WAV collection as CC0. The original archive's
  redistribution/modification terms are preserved verbatim in VSCO-LICENSE.txt.
- render-manifest.json records the exact source filenames, SHA-256 hashes,
  root MIDI pitches, note mappings and pre-encode mix measurements.

The pack contains no piano. Harp replaces the previous synthesized piano;
vibraphone replaces synthesized bells. Pads, drones, electronic plucks,
bass and electronic percussion remain synthesized. Sustain recordings retain
natural attacks and vibrato; no artificial sustain loops are used.

Rebuild from the extracted archive with Node.js, the project's installed
TypeScript, and FFmpeg (libmp3lame enabled):

    npm run music:render -- /absolute/path/to/extracted-256-samples

The renderer uses nearest recorded notes, FFmpeg pitch/rate conversion,
recorded stereo, note releases, per-track space and constant-gain level matching.
The mix targets stereo RMS 0.076 (6.02 dB above the previous 0.038), with a
0.65 peak ceiling; constant gain preserves each track's dynamics.
Harp filenames use C3 = MIDI 48; the other selected families use C3 = MIDI 60.
The uncompressed sample pack is not shipped with the game. The audio files here
are the production assets; ordinary npm build/test does not require the pack.

“无尽的彼方” is a four-sentence E-minor arrangement (theme, answer, sparse
interlude, return), with flute, cello, violin, harp and restrained horn.
An eight-layer Shepard ostinato plays accented 3+3+2 arpeggios over rising
Em9 / Gmaj7 / Am9 / Bm7 / Cmaj7(#11) / Dsus2 harmony. Its fixed Gaussian window
is centered on MIDI 67 (sigma 12 semitones). A separate quiet ten-layer
Shepard-Risset air texture glides up half a semitone per second, with amplitude
following instantaneous pitch (center MIDI 64, sigma 12). Layers recycle only
at the nearly silent extremes. The foreground theme remains in ordinary pitch.
Reference: https://musicweb.ucsd.edu/~trsmyth/stream175/Shepard_Tones.html

The flute theme in “无尽的彼方” uses two-bar slurs (about seven seconds per
breath), with only two held pitches per breath (4.0 and 3.3 seconds). Subsequent notes start 450 ms into the sustain recording and share
140 ms equal-power crossfades under one phrase envelope. These are simulated
legato transitions from sustain recordings, not a recorded legato instrument.

“未寄出的星光” (1:28) is a 4/4 cue at 172 BPM. The connected B–C–E–G
seed uses half, half, one and two quarter-beat gates and opens eight-bar
sentences with longer answers and breathing gaps. Harp carries the first theme
and a distinct syncopated continuation; marimba leads a contrasting bridge and
its climbing extension. No complete eight-bar melody is replayed unchanged.
Bars 36–39 briefly thin to sparse harp and bass. The return recalls only the initial
four notes, takes a different melodic route, and leads to a new upper-register
culmination with cello counterlines. Bass and arpeggio rhythms change in the
bridge, and brass enters at three structural turns with distinct lines.
The 60-bar score ends with a quiet tag and a reverb tail (room decay 0.95,
wet mix 0.12). The tempo is an original arrangement choice; it is not a verified
transcription of the reference recording's tempo.

Additional recorded families: `Marimba_hit_Outrigger_*` and `CelloEns_pizzT_*`,
from the same supplied archive. Both use C3 = MIDI 60; plucked C1's fundamental
was checked by autocorrelation (about 65.6 Hz), despite its stronger second harmonic.

The latest balance lowers the harp melody by 3.7 dB before mix normalization,
raises bowed strings and gives them a connected lower-voice pulse plus upper
accents each bar. The interlude is four bars; the return starts at bar 40.
The shared renderer retains the user-adjusted RMS target of 0.076.

To render only one existing track while preserving other MP3s and their manifest
measurements, append its id (the existing manifest must be present):

    npm run music:render -- /absolute/path/to/extracted-256-samples unsent-starlight

The opening marimba answer at 2.8 seconds has been removed. Bowed-string backing
is raised about 2.3 dB in score gain. At bars 16–19 (22.3–27.9 s) and 48–51
(67.0–72.6 s), strings take over the actual melody while the harp lead rests;
the string backing yields during these entrances to keep the lead clear.

“未寄出的星光” is restored to the approved strings-forward version: independent
sustain-note rendering, 160 ms score overlaps in the featured leads, and no
track-specific output attenuation. The later rewritten solo lines, phrase
legato processing and mix reductions are not used by this restored score.
