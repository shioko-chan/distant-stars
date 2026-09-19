import type { MusicInstrument, MusicTrack } from '../content/music';
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
const VOICES: Record<MusicInstrument, Voice> = {
    pad: { partials: [.8, .15, .05], attack: 1.4, release: 2, decay: 30 },
    piano: { partials: [.72, .2, .08], bright: [0, 0, .06, .08, .04, .02], attack: .006, release: .18, decay: 2.1, brightnessDecay: .3 },
    pluck: { partials: [.72, .18, .07, .03], bright: [0, .08, .06, .03, .02, .01], attack: .004, release: .1, decay: .36, brightnessDecay: .09 },
    bell: { partials: [1], attack: .005, release: .5, decay: 2.4 },
    bass: { partials: [.78, .17, .05], attack: .025, release: .14, decay: 1.5 },
    drone: { partials: [.87, .1, .03], attack: 3.5, release: 4, decay: 60 },
    strings: { partials: [.55, .24, .11, .055, .03, .015], attack: .7, release: 1.3, decay: 24 },
    cello: { partials: [.48, .27, .13, .07, .035, .015], attack: .23, release: .65, decay: 18 },
    horn: { partials: [.58, .25, .11, .045, .015], bright: [0, .08, .06, .035, .015], attack: .32, release: .65, decay: 14, brightnessDecay: 1.2 },
    flute: { partials: [.91, .06, .03], attack: .13, release: .3, decay: 12 },
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

// Only the selected score is rendered, using cached, band-limited wavetables.
export function renderTheme(track: MusicTrack, rate: number): { left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer> } {
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

    for (const note of track.notes) {
        const { instrument, duration, gain, pan } = note;
        const voice = VOICES[instrument];
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
        for (let i = 0; i < frames; i++) {
            const t = i / rate;
            const envelope = smooth(i / attackFrames) * smooth((frames - 1 - i) / releaseFrames) * decay;
            let tone: number;
            switch (instrument) {
                case 'pad':
                    tone = .55 * readWave(wave, phase) + .45 * readWave(wave, phase * 1.003);
                    tone *= .9 + .1 * readWave(SINE, t * .11 * TABLE_SIZE);
                    break;
                case 'strings':
                    tone = .5 * readWave(wave, phase) + .5 * readWave(wave, phase * .998);
                    break;
                case 'cello':
                    tone = .82 * readWave(wave, phase) + .18 * readWave(wave, phase * 1.001);
                    break;
                case 'horn':
                    tone = readWave(wave, phase);
                    if (bright) tone += smooth(t / .8) * brightness * readWave(bright, phase);
                    tone *= .72 + .28 * smooth(t / 1.4);
                    break;
                case 'drone':
                    tone = .6 * readWave(wave, phase) + .25 * readWave(SINE, phase * .501)
                        + .15 * readWave(wave, phase * 1.0015);
                    tone *= .8 + .2 * readWave(SINE, t * .07 * TABLE_SIZE);
                    break;
                case 'bell':
                    // Inharmonic partials and independent decay make a struck metal sound.
                    tone = .64 * readWave(SINE, phase);
                    if (frequency * 2.756 < rate * .45) tone += .26 * brightness * readWave(SINE, phase * 2.756);
                    if (frequency * 5.404 < rate * .45) tone += .1 * brightness * brightness * readWave(SINE, phase * 5.404);
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
            } else if (instrument === 'flute' || instrument === 'strings' || instrument === 'cello') {
                phase += step * (1 + .002 * smooth(t) * readWave(SINE, t * 5.1 * TABLE_SIZE));
            } else {
                phase += step;
            }
            decay *= decayStep;
            brightness *= brightStep;
        }
    }

    applyMusicSpace(left, right, rate, track.space);

    // One constant mix adjustment retains each arrangement's internal dynamics.
    // Bound both average level and peak; sparse pieces keep their intended quiet.
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
    const mixGain = Math.min(1.8, .038 / Math.max(rms, .0001), .65 / Math.max(peak, .0001));
    for (let i = 0; i < left.length; i++) {
        left[i] *= mixGain;
        right[i] *= mixGain;
    }
    return { left, right };
}
