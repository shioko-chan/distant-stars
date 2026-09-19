import { describe, expect, it } from 'vitest';
import { MUSIC_TRACKS, type MusicInstrument, type MusicTrack } from '../content/music';
import { renderTheme } from './themeMusic';
import { applyMusicSpace } from './musicSpace';

function rms(samples: Float32Array, start = 0, end = samples.length): number {
    let energy = 0;
    for (let i = start; i < end; i++) energy += samples[i] ** 2;
    return Math.sqrt(energy / (end - start));
}

function solo(instrument: MusicInstrument): MusicTrack {
    return {
        id: 'solo', title: 'solo', description: '', duration: 5, space: { decay: 1, mix: 0 },
        notes: [{ instrument, midi: 60, start: 0, duration: 3, gain: .1, pan: 0 }],
    };
}

describe('distinct soundtrack arrangements', () => {
    it('keeps six named pieces with valid, independently scored notes', () => {
        expect(MUSIC_TRACKS).toHaveLength(6);
        expect(new Set(MUSIC_TRACKS.map(track => track.id)).size).toBe(6);
        expect(new Set(MUSIC_TRACKS.map(track => track.title)).size).toBe(6);
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
        expect(palettes.size).toBe(6);
    });

    it.each(MUSIC_TRACKS)('renders $title at 48 kHz without clipping, invalid samples or hard edges', track => {
        const { left, right } = renderTheme(track, 48000);
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

    it('gives struck and sustained instruments different audible envelopes', () => {
        const rate = 24000;
        const decayRatio = (instrument: MusicInstrument) => {
            const samples = renderTheme(solo(instrument), rate).left;
            return rms(samples, rate * 1.5, rate * 2) / rms(samples, rate * .1, rate * .3);
        };
        expect(decayRatio('pluck')).toBeLessThan(.05);
        expect(decayRatio('piano')).toBeLessThan(.6);
        expect(decayRatio('strings')).toBeGreaterThan(2);
    });

    it('releases every instrument to silence at the note end, independently of the track fade', () => {
        const instruments: MusicInstrument[] = ['pad', 'piano', 'pluck', 'bell', 'bass', 'drone', 'strings', 'cello', 'horn', 'flute', 'kick', 'snare', 'hat'];
        const rate = 24000;
        for (const instrument of instruments) {
            const samples = renderTheme(solo(instrument), rate).left;
            expect(Math.abs(samples[3 * rate - 1]), instrument).toBe(0);
            expect(rms(samples, 3 * rate), instrument).toBe(0);
            expect(rms(samples, 0, 3 * rate), instrument).toBeGreaterThan(.0005);
        }
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
