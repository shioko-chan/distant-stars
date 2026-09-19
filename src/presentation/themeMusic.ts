import type { MusicInstrument, MusicNote, MusicTrack } from '../content/music';
import { applyMusicSpace } from './musicSpace';

const TABLE_SIZE = 2048;
const TABLE_MASK = TABLE_SIZE - 1;
const SINE = Float32Array.from({ length: TABLE_SIZE }, (_, i) => Math.sin(2 * Math.PI * i / TABLE_SIZE));

interface Voice {
    partials: readonly number[];
    attack: number;
    release: number;
    decay: number;
    bright?: readonly number[];
    brightnessDecay?: number;
}

// Distinct envelopes and spectra, rather than a single synth with different pitches.
const VOICES: Partial<Record<MusicInstrument, Voice>> = {
    shepard: { partials: [.78, .18, 0, .04], attack: .012, release: .55, decay: .7 },
    'shepard-air': { partials: [1], attack: 7, release: 9, decay: 240 },
    pad: { partials: [.8, .15, .05], attack: 1.4, release: 2, decay: 30 },
    pluck: { partials: [.72, .18, .07, .03], bright: [0, .08, .06, .03, .02, .01], attack: .004, release: .1, decay: .36, brightnessDecay: .09 },
    bass: { partials: [.78, .17, .05], attack: .025, release: .14, decay: 1.5 },
    drone: { partials: [.87, .1, .03], attack: 3.5, release: 4, decay: 60 },
    kick: { partials: [1], attack: .003, release: .06, decay: .12 },
    snare: { partials: [1], attack: .002, release: .05, decay: .065 },
    hat: { partials: [1], attack: .002, release: .035, decay: .045 },
};

function readWave(wave: Float32Array, phase: number): number {
    const whole = Math.floor(phase), index = whole & TABLE_MASK;
    return wave[index] + (wave[(index + 1) & TABLE_MASK] - wave[index]) * (phase - whole);
}

function smooth(value: number): number {
    const x = Math.min(1, Math.max(0, value));
    return x * x * (3 - 2 * x);
}

export interface RecordedNote { left: Float32Array; right: Float32Array }
export type SampleBank = ReadonlyMap<string, RecordedNote>;
export const RECORDED_INSTRUMENTS = new Set<MusicInstrument>(['harp', 'bell', 'marimba', 'pizzicato', 'strings', 'cello', 'horn', 'flute']);
export const RECORDED_STRUCK_INSTRUMENTS = new Set<MusicInstrument>(['harp', 'bell', 'marimba', 'pizzicato']);

// Sustain samples have no recorded interval transitions. For a slur, skip the
// repeated breath attack after the first note and crossfade the sustained bodies.
// A shared phrase envelope places breathing at phrase boundaries only.
function renderSustainPhrase(notes: readonly MusicNote[], recordings: SampleBank,
    left: Float32Array, right: Float32Array, rate: number) {
    const phraseStart = notes[0].start;
    const last = notes[notes.length - 1];
    const phraseEnd = last.start + last.duration;
    const instrument = notes[0].instrument;
    const strings = instrument === 'strings';
    const transition = strings ? .18 : .14;
    for (let index = 0; index < notes.length; index++) {
        const note = notes[index];
        const recording = recordings.get(`${instrument}:${note.midi}`);
        if (!recording) throw new Error(`Missing recording: ${instrument}:${note.midi}`);
        const next = notes[index + 1];
        if (next && Math.abs(note.start + note.duration - next.start) > 1 / rate) {
            throw new Error(`Gap or overlap inside ${instrument} phrase: ${note.phrase}`);
        }
        const sourceStart = strings ? Math.round(.35 * rate) : index === 0 ? 0 : Math.round(.45 * rate);
        const offset = Math.round(note.start * rate);
        const length = Math.min(Math.round((note.duration + (next ? transition : 0)) * rate), left.length - offset);
        if (recording.left.length < sourceStart + length || recording.right.length < sourceStart + length) {
            throw new Error(`Sustain recording too short for ${instrument} phrase: ${note.midi}`);
        }
        // Match the actual sustained body, not the transient peak. One constant
        // correction per note preserves vibrato; the crossfade smooths level changes.
        let bodyGain = 1;
        if (strings) {
            let energy = 0;
            for (let i = sourceStart; i < sourceStart + length; i++) {
                const mid = (recording.left[i] + recording.right[i]) * .5;
                energy += mid * mid;
            }
            const rms = Math.sqrt(energy / length);
            if (rms < .00001) throw new Error(`Silent sustain body: ${instrument}:${note.midi}`);
            bodyGain = Math.min(4, .06 / rms);
        }
        const l = note.gain * Math.sqrt((1 - note.pan) / 2), r = note.gain * Math.sqrt((1 + note.pan) / 2);
        for (let i = 0; i < length; i++) {
            const time = note.start + i / rate;
            const position = (time - phraseStart) / (phraseEnd - phraseStart);
            const breath = smooth((time - phraseStart) / .16) * smooth((phraseEnd - time - 1 / rate) / .32)
                * (.9 + .1 * Math.sin(Math.PI * position));
            const fadeIn = index === 0 ? 1 : Math.sqrt(smooth(i / (transition * rate)));
            const fadeOut = next ? Math.sqrt(1 - smooth((i / rate - note.duration) / transition)) : 1;
            const envelope = breath * fadeIn * fadeOut * bodyGain;
            const source = sourceStart + i;
            const mid = (recording.left[source] + recording.right[source]) * .5;
            const side = (recording.left[source] - recording.right[source]) * .3;
            left[offset + i] += (mid + side) * envelope * l;
            right[offset + i] += (mid - side) * envelope * r;
        }
    }
}

// Offline rendering only. Recorded notes are resampled with FFmpeg before mixing.
// No synthesized substitutes for missing recordings: an incomplete bank is an error.
export function renderTheme(track: MusicTrack, rate: number, recordings: SampleBank): { left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer> } {
    const frames = Math.round(rate * track.duration);
    const left = new Float32Array(frames), right = new Float32Array(frames);
    const waves = new Map<string, Float32Array>();
    const waveFor = (name: string, partials: readonly number[], frequency: number) => {
        // Leave room below Nyquist for detuning and vibrato.
        const harmonics = Math.min(partials.length, Math.floor(rate * .45 / frequency));
        const key = `${name}:${harmonics}`;
        let wave = waves.get(key);
        if (!wave) {
            wave = new Float32Array(TABLE_SIZE);
            for (let harmonic = 1; harmonic <= harmonics; harmonic++) {
                for (let i = 0; i < TABLE_SIZE; i++) wave[i] += partials[harmonic - 1] * SINE[(i * harmonic) & TABLE_MASK];
            }
            waves.set(key, wave);
        }
        return wave;
    };

    const sustainPhrases = new Map<string, MusicNote[]>();
    for (const note of track.notes) if ((note.instrument === 'flute' || note.instrument === 'strings') && note.phrase) {
        const key = `${note.instrument}:${note.phrase}`;
        const phrase = sustainPhrases.get(key) ?? [];
        phrase.push(note);
        sustainPhrases.set(key, phrase);
    }
    for (const phrase of sustainPhrases.values()) {
        renderSustainPhrase(phrase.sort((a, b) => a.start - b.start), recordings, left, right, rate);
    }

    for (const note of track.notes) {
        const { instrument, duration, gain, pan } = note;
        if ((instrument === 'flute' || instrument === 'strings') && note.phrase) continue;
        if (RECORDED_INSTRUMENTS.has(instrument)) {
            const recording = recordings.get(`${instrument}:${note.midi}`);
            if (!recording) throw new Error(`Missing recording: ${instrument}:${note.midi}`);
            const offset = Math.round(note.start * rate);
            const struck = RECORDED_STRUCK_INSTRUMENTS.has(instrument);
            // Let struck strings/metals ring into the next note; sustained parts breathe at note-off.
            const length = Math.min(recording.left.length, Math.round((duration + (struck ? .65 : 0)) * rate), left.length - offset);
            const attack = Math.min(length * .2, rate * (struck ? .004 : .045));
            const release = Math.min(length * .4, rate * (struck ? .35 : .3));
            const l = gain * Math.sqrt((1 - pan) / 2), r = gain * Math.sqrt((1 + pan) / 2);
            for (let i = 0; i < length; i++) {
                const envelope = smooth(i / attack) * smooth((length - 1 - i) / release);
                // Preserve the recorded stereo body while keeping score placement restrained.
                const mid = (recording.left[i] + recording.right[i]) * .5;
                const side = (recording.left[i] - recording.right[i]) * .3;
                left[offset + i] += (mid + side) * envelope * l;
                right[offset + i] += (mid - side) * envelope * r;
            }
            continue;
        }
        const voice = VOICES[instrument];
        if (!voice) throw new Error(`Unknown instrument: ${instrument}`);
        const frequency = 440 * 2 ** ((note.midi - 69) / 12);
        const wave = waveFor(instrument, voice.partials, frequency);
        const bright = voice.bright ? waveFor(`${instrument}-bright`, voice.bright, frequency) : null;
        const offset = Math.round(note.start * rate);
        const frames = Math.min(Math.round(duration * rate), left.length - offset);
        const attackFrames = Math.max(1, Math.min(voice.attack * rate, frames * .25));
        const releaseFrames = Math.max(1, Math.min(voice.release * rate, frames * .4));
        const leftGain = gain * Math.sqrt((1 - pan) / 2), rightGain = gain * Math.sqrt((1 + pan) / 2);
        const step = frequency * TABLE_SIZE / rate;
        const decayStep = Math.exp(-1 / (rate * voice.decay));
        const brightStep = Math.exp(-1 / (rate * (voice.brightnessDecay ?? .65)));
        const kickPitchStep = Math.exp(-1 / (rate * .035));
        let phase = 0, decay = 1, brightness = 1, kickPitch = 105;
        let seed = (Math.round(note.start * 1000) + note.midi * 65537 + 1) | 0;
        let previousNoise = 0;
        // Half a semitone per second: one endless octave every 24 seconds.
        // Multiplicative frequency increments keep phase continuous between control updates.
        const riseRatio = 2 ** (.5 / (12 * rate));
        let risingFrequency = frequency, spectralGain = 0;
        for (let i = 0; i < frames; i++) {
            const t = i / rate;
            const envelope = smooth(i / attackFrames) * smooth((frames - 1 - i) / releaseFrames) * decay;
            let tone: number;
            switch (instrument) {
                case 'shepard-air': {
                    // Recycle only at MIDI 120 -> 0, where the fixed Gaussian is almost silent.
                    // Dynamic gain is essential: a fixed-gain gliss would simply climb out of range.
                    if (i % 32 === 0) {
                        const pitch = 69 + 12 * Math.log2(risingFrequency / 440);
                        spectralGain = Math.exp(-.5 * ((pitch - 64) / 12) ** 2);
                    }
                    tone = risingFrequency < rate * .45 ? readWave(SINE, phase) * spectralGain : 0;
                    break;
                }
                case 'pad':
                    tone = .55 * readWave(wave, phase) + .45 * readWave(wave, phase * 1.003);
                    tone *= .9 + .1 * readWave(SINE, t * .11 * TABLE_SIZE);
                    break;
                case 'drone':
                    tone = .6 * readWave(wave, phase) + .25 * readWave(SINE, phase * .501)
                        + .15 * readWave(wave, phase * 1.0015);
                    tone *= .8 + .2 * readWave(SINE, t * .07 * TABLE_SIZE);
                    break;
                case 'kick':
                    tone = readWave(SINE, phase);
                    break;
                case 'snare':
                case 'hat': {
                    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
                    const noise = seed / 2147483648;
                    if (instrument === 'hat') {
                        tone = (noise - previousNoise) * .5;
                        previousNoise = noise;
                    } else {
                        previousNoise += .45 * (noise - previousNoise);
                        tone = .7 * previousNoise + .3 * readWave(SINE, phase);
                    }
                    break;
                }
                default:
                    tone = readWave(wave, phase);
                    if (bright) tone += brightness * readWave(bright, phase);
            }
            const sample = tone * envelope;
            left[offset + i] += sample * leftGain;
            right[offset + i] += sample * rightGain;
            if (instrument === 'kick') {
                phase += (42 + kickPitch) * TABLE_SIZE / rate;
                kickPitch *= kickPitchStep;
            } else if (instrument === 'shepard-air') {
                phase += risingFrequency * TABLE_SIZE / rate;
                risingFrequency *= riseRatio;
                if (risingFrequency >= 440 * 2 ** ((120 - 69) / 12)) risingFrequency /= 1024;
            } else {
                phase += step;
            }
            decay *= decayStep;
            brightness *= brightStep;
        }
    }

    applyMusicSpace(left, right, rate, track.space);

    // One constant mix adjustment retains each arrangement's internal dynamics.
    // Bound average level and peak without compressing phrase dynamics.
    const fadeFrames = Math.min(Math.round(1.5 * rate), left.length);
    let energy = 0, peak = 0;
    for (let i = 0; i < left.length; i++) {
        const fade = smooth((left.length - 1 - i) / fadeFrames);
        left[i] *= fade;
        right[i] *= fade;
        energy += left[i] ** 2 + right[i] ** 2;
        peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    }
    const rms = Math.sqrt(energy / (2 * left.length));
    const mixGain = Math.min(.076 / Math.max(rms, .0001), .65 / Math.max(peak, .0001)) * (track.outputGain ?? 1);
    for (let i = 0; i < left.length; i++) {
        left[i] *= mixGain;
        right[i] *= mixGain;
    }
    return { left, right };
}
