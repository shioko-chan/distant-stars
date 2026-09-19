import { describe, expect, it } from 'vitest';
import { MUSIC_TRACKS, type MusicInstrument, type MusicTrack } from '../content/music';
import { renderTheme, RECORDED_INSTRUMENTS, RECORDED_STRUCK_INSTRUMENTS, type SampleBank } from './themeMusic';
import { applyMusicSpace } from './musicSpace';

function rms(samples: Float32Array, start = 0, end = samples.length): number {
    start = Math.round(start); end = Math.round(end);
    let energy = 0;
    for (let i = start; i < end; i++) energy += samples[i] ** 2;
    return Math.sqrt(energy / (end - start));
}

// Deterministic recording fixture checks mixing boundaries, not acoustic realism.
function bankFor(track: MusicTrack, rate: number): SampleBank {
    const bank = new Map();
    for (const note of track.notes) if (RECORDED_INSTRUMENTS.has(note.instrument) && !bank.has(`${note.instrument}:${note.midi}`)) {
        const struck = RECORDED_STRUCK_INSTRUMENTS.has(note.instrument);
        const left = Float32Array.from({ length: rate * 12 }, (_, i) =>
            .3 * Math.sin(2 * Math.PI * 440 * 2 ** ((note.midi - 69) / 12) * i / rate) * (struck ? Math.exp(-i / rate * 1.5) : 1));
        bank.set(`${note.instrument}:${note.midi}`, { left, right: left });
    }
    return bank;
}
function render(track: MusicTrack, rate: number) { return renderTheme(track, rate, bankFor(track, rate)); }

function solo(instrument: MusicInstrument): MusicTrack {
    return {
        id: 'solo', title: 'solo', description: '', duration: 5, space: { decay: 1, mix: 0 },
        notes: [{ instrument, midi: 60, start: 0, duration: 3, gain: .1, pan: 0 }],
    };
}

describe('distinct soundtrack arrangements', () => {
    it('keeps nine named pieces with valid, independently scored notes', () => {
        expect(MUSIC_TRACKS).toHaveLength(9);
        expect(new Set(MUSIC_TRACKS.map(track => track.id)).size).toBe(9);
        expect(new Set(MUSIC_TRACKS.map(track => track.title)).size).toBe(9);
        const palettes = new Set<string>();
        for (const track of MUSIC_TRACKS) {
            expect(track.duration).toBeGreaterThanOrEqual(75);
            expect(track.space.mix).toBeGreaterThan(0);
            expect(track.space.mix).toBeLessThan(.3);
            expect(track.space.decay).toBeGreaterThan(0);
            expect(track.notes.length).toBeGreaterThan(0);
            palettes.add([...new Set(track.notes.map(note => note.instrument))].sort().join(','));
            for (const note of track.notes) {
                expect([note.midi, note.start, note.duration, note.gain, note.pan].every(Number.isFinite)).toBe(true);
                expect(note.start).toBeGreaterThanOrEqual(0);
                expect(note.duration).toBeGreaterThan(0);
                expect(note.start + note.duration).toBeLessThanOrEqual(track.duration + 1e-6);
                expect(note.midi).toBeGreaterThanOrEqual(0);
                expect(note.midi).toBeLessThanOrEqual(127);
                expect(note.gain).toBeGreaterThan(0);
                expect(Math.abs(note.pan)).toBeLessThanOrEqual(1);
            }
        }
        expect(palettes.size).toBe(9);
    });

    it.each(MUSIC_TRACKS)('renders $title at 48 kHz without clipping, invalid samples or hard edges', track => {
        const { left, right } = render(track, 48000);
        expect(left.length).toBe(Math.round(48000 * track.duration));
        expect(right.length).toBe(left.length);
        let stereoDifference = 0;
        for (const samples of [left, right]) {
            let peak = 0;
            for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
            expect(Number.isFinite(peak)).toBe(true);
            expect(rms(samples)).toBeGreaterThan(.003);
            expect(peak).toBeLessThanOrEqual(.651);
            expect(samples[0]).toBe(0);
            expect(Math.abs(samples[samples.length - 1])).toBe(0);
        }
        for (let i = 0; i < left.length; i++) stereoDifference += Math.abs(left[i] - right[i]);
        expect(stereoDifference).toBeGreaterThan(1);
    });

    it('keeps octave handoffs balanced inside the repeating harmonic ostinato', () => {
        const track = MUSIC_TRACKS.find(track => track.id === 'endless-beyond')!;
        const notes = track.notes.filter(note => note.instrument === 'shepard');
        const starts = [...new Set(notes.map(note => note.start))];
        expect(starts).toHaveLength(192);
        for (const start of starts) {
            const group = notes.filter(note => note.start === start);
            expect(group).toHaveLength(8);
            expect(group.every(note => note.midi % 12 === group[0].midi % 12)).toBe(true);
            for (let i = 1; i < group.length; i++) expect(group[i].midi - group[i - 1].midi).toBe(12);
            const strongest = group.reduce((a, b) => a.gain > b.gain ? a : b);
            expect(Math.abs(strongest.midi - 67)).toBeLessThanOrEqual(6);
        }
        const normalized = (start: number) => {
            const group = notes.filter(note => note.start === start);
            const sum = Math.sqrt(group.reduce((s, n) => s + n.gain ** 2, 0));
            return group.map(n => ({ midi: n.midi, weight: n.gain / sum }));
        };
        // The next harmonic sentence has climbed one octave but no audible register reset.
        const first = normalized(starts[0]), repeated = normalized(starts[48]);
        first.forEach((note, i) => {
            expect(repeated[i].midi).toBe(note.midi);
            expect(repeated[i].weight).toBeCloseTo(note.weight, 10);
        });
    });

    it("retains the rising air layer's spectral center after a full octave", () => {
        const rate = 12000;
        const track: MusicTrack = { ...solo('shepard-air'), duration: 43,
            notes: Array.from({ length: 10 }, (_, octave) => ({
                instrument: 'shepard-air', midi: 4 + 12 * octave, start: 0, duration: 42, gain: .01, pan: 0,
            })),
        };
        const samples = renderTheme(track, rate, new Map()).left;
        // Measure the actual waveform at its ten predicted moving partials.
        const spectralCenter = (time: number) => {
            let weight = 0, weightedPitch = 0;
            for (let octave = 0; octave < 10; octave++) {
                const pitch = (4 + 12 * octave + time * .5) % 120;
                const frequency = 440 * 2 ** ((pitch - 69) / 12);
                if (frequency >= rate * .45) continue;
                let real = 0, imaginary = 0;
                for (let i = 0; i < rate * .1; i++) {
                    const sample = samples[Math.round((time - .05) * rate) + i];
                    const window = .5 - .5 * Math.cos(2 * Math.PI * i / (rate * .1 - 1));
                    real += sample * window * Math.cos(2 * Math.PI * frequency * i / rate);
                    imaginary += sample * window * Math.sin(2 * Math.PI * frequency * i / rate);
                }
                const power = real ** 2 + imaginary ** 2;
                weight += power; weightedPitch += power * pitch;
            }
            return weightedPitch / weight;
        };
        expect(spectralCenter(10)).toBeGreaterThan(60);
        expect(spectralCenter(10)).toBeLessThan(68);
        expect(Math.abs(spectralCenter(10) - spectralCenter(34))).toBeLessThan(1);
    });

    it('gives struck and sustained instruments different audible envelopes', () => {
        const rate = 24000;
        const decayRatio = (instrument: MusicInstrument) => {
            const samples = render(solo(instrument), rate).left;
            return rms(samples, rate * 1.5, rate * 2) / rms(samples, rate * .1, rate * .3);
        };
        expect(decayRatio('pluck')).toBeLessThan(.05);
        expect(decayRatio('harp')).toBeLessThan(.6);
        expect(decayRatio('strings')).toBeGreaterThan(.9);
    });

    it('releases every instrument to silence at the note end, independently of the track fade', () => {
        const instruments: MusicInstrument[] = ['shepard', 'shepard-air', 'pad', 'pluck', 'bass', 'drone', 'strings', 'cello', 'horn', 'flute', 'kick', 'snare', 'hat'];
        const rate = 24000;
        for (const instrument of instruments) {
            const samples = render(solo(instrument), rate).left;
            expect(Math.abs(samples[3 * rate - 1]), instrument).toBe(0);
            expect(rms(samples, 3 * rate), instrument).toBe(0);
            expect(rms(samples, 0, 3 * rate), instrument).toBeGreaterThan(.0005);
        }
    });

    it('connects flute pitches without replaying the attack or dropping to silence', () => {
        const rate = 24000;
        const track: MusicTrack = { ...solo('flute'), duration: 6, notes: [
            { instrument: 'flute', midi: 60, start: 0, duration: 2, gain: .1, pan: 0, phrase: 'breath' },
            { instrument: 'flute', midi: 67, start: 2, duration: 2, gain: .1, pan: 0, phrase: 'breath' },
        ] };
        const bank = new Map();
        for (const midi of [60, 67]) {
            // A deliberately silent attack makes an accidental retrigger measurable.
            const left = Float32Array.from({ length: 5 * rate }, (_, i) => i < .3 * rate ? 0
                : .2 * Math.sin(2 * Math.PI * 440 * 2 ** ((midi - 69) / 12) * i / rate));
            bank.set(`flute:${midi}`, { left, right: left });
        }
        const { left } = renderTheme(track, rate, bank);
        const before = rms(left, 1.8 * rate, 1.9 * rate);
        const during = rms(left, 2.02 * rate, 2.12 * rate);
        const after = rms(left, 2.3 * rate, 2.4 * rate);
        expect(during).toBeGreaterThan(Math.min(before, after) * .8);
        expect(during).toBeLessThan(Math.max(before, after) * 1.25);
        expect(rms(left, 4 * rate)).toBe(0);
        const withGap = { ...track, notes: [track.notes[0], { ...track.notes[1], start: 2.1 }] };
        expect(() => renderTheme(withGap, rate, bank)).toThrow('Gap or overlap inside flute phrase');
        const short = new Float32Array(rate * 2);
        bank.set('flute:67', { left: short, right: short });
        expect(() => renderTheme(track, rate, bank)).toThrow('Sustain recording too short for flute phrase');
    });

    it('connects string sustains without repeated attacks or sample-level jumps', () => {
        const rate = 12000;
        const track: MusicTrack = { ...solo('strings'), duration: 6, space: { decay: 1, mix: 0 }, notes: [
            { instrument: 'strings', midi: 60, start: 0, duration: 2, gain: .2, pan: 0, phrase: 'bow' },
            { instrument: 'strings', midi: 67, start: 2, duration: 2, gain: .2, pan: 0, phrase: 'bow' },
        ] };
        const bank = new Map();
        for (const [midi, amplitude] of [[60, .04], [67, .32]]) {
            const left = Float32Array.from({ length: 5 * rate }, (_, i) => i < .3 * rate ? 0
                : amplitude * Math.sin(2 * Math.PI * 440 * 2 ** ((midi - 69) / 12) * i / rate));
            bank.set(`strings:${midi}`, { left, right: left });
        }
        const { left } = renderTheme(track, rate, bank);
        const before = rms(left, 1.5 * rate, 1.8 * rate);
        const after = rms(left, 2.4 * rate, 2.7 * rate);
        expect(after / before).toBeGreaterThan(.9);
        expect(after / before).toBeLessThan(1.1);
        const transition = rms(left, 2.02 * rate, 2.14 * rate);
        expect(transition).toBeGreaterThan(before * .8);
        expect(transition).toBeLessThan(before * 1.25);
        expect(rms(left, 4 * rate)).toBe(0);
        const short = new Float32Array(rate * 2);
        bank.set('strings:67', { left: short, right: short });
        expect(() => renderTheme(track, rate, bank)).toThrow('Sustain recording too short for strings phrase');
    });

    it('requires real recordings and lets struck samples ring after note-off', () => {
        expect(() => renderTheme(solo('cello'), 24000, new Map())).toThrow('Missing recording');
        const samples = render(solo('harp'), 24000).left;
        expect(rms(samples, 3 * 24000, 3.4 * 24000)).toBeGreaterThan(0);
        expect(rms(samples, 3.65 * 24000)).toBe(0);
    });

    it('adds a decaying stereo space without moving the dry attack or producing an unstable tail', () => {
        const rate = 24000;
        const left = new Float32Array(rate * 5), right = new Float32Array(rate * 5);
        left[0] = right[0] = 1;
        applyMusicSpace(left, right, rate, { decay: 1.4, mix: .2 });
        expect(left[0]).toBe(1);
        expect(right[0]).toBe(1);
        expect(rms(left, rate * .05, rate * .5)).toBeGreaterThan(.00001);
        expect(rms(left, rate * 3, rate * 4)).toBeLessThan(rms(left, rate * .05, rate * .5) * .01);
        expect(left.every(Number.isFinite) && right.every(Number.isFinite)).toBe(true);
        expect(left.some((value, index) => value !== right[index])).toBe(true);
    });
});
