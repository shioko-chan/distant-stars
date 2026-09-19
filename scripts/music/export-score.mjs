import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = fs.readFileSync(path.join(root, 'src/content/music.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
new Function('exports', compiled)(exports);
const { MUSIC_TRACKS } = exports;
const directory = path.join(root, 'exports/music');
fs.mkdirSync(directory, { recursive: true });
const round = value => Math.round(value * 1e6) / 1e6;
const pitchNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const pitchName = midi => pitchNames[midi % 12] + (Math.floor(midi / 12) - 1);
const labels = {
    pad: '合成氛围铺底', harp: '竖琴', marimba: '马林巴', pizzicato: '大提琴组拨奏',
    pluck: '合成拨弦', bell: '颤音琴', bass: '合成低音', drone: '合成低鸣',
    strings: '小提琴组', cello: '大提琴组', horn: '圆号', flute: '长笛',
    kick: '合成底鼓', snare: '合成军鼓', hat: '合成踩镲',
    shepard: '谢泼德分解音型的单层', 'shepard-air': '连续上升的谢泼德声层',
};
const sampled = new Set(['harp', 'marimba', 'pizzicato', 'bell', 'strings', 'cello', 'horn', 'flute']);
const origin = { file: 'src/content/music.ts', sha256: createHash('sha256').update(source).digest('hex') };
const index = [];
for (const track of MUSIC_TRACKS) {
    const parts = [...new Set(track.notes.map(note => note.instrument))].map(instrument => ({
        instrument,
        label: labels[instrument],
        sound_source: sampled.has(instrument) ? 'recorded_sample' : 'synthesized',
        ...(instrument === 'shepard-air' ? { continuous_pitch: {
            rise_semitones_per_second: .5, wrap_midi_min: 0, wrap_midi_max_exclusive: 120,
            amplitude_window: { type: 'gaussian', center_midi: 64, sigma_semitones: 12 },
            note_pitch_is: 'initial_pitch',
        } } : {}),
        notes: track.notes.flatMap((note, i) => note.instrument !== instrument ? [] : [{
            id: `n${String(i + 1).padStart(4, '0')}`,
            pitch: pitchName(note.midi), midi: note.midi,
            start_seconds: round(note.start), duration_seconds: round(note.duration),
            gain: Math.round(note.gain * 1e9) / 1e9, pan: round(note.pan),
            ...(note.phrase ? { phrase: note.phrase } : {}),
        }]),
    }));
    const score = {
        format: 'distant-stars-score', version: 1, source: origin,
        id: track.id, title: track.title, description: track.description,
        duration_seconds: track.duration,
        output_gain_after_normalization: track.outputGain ?? 1,
        ...(track.id === 'starstage-rondo' ? { composition: {
            tempo_bpm: 140, beat_unit: 'quarter', tonal_route: ['F major', 'G major'],
            reference: { file: '62793032e55f1.pdf', title: 'ロンド・ロンド・ロンド',
                use: 'Opening/coda gestures, chord pulses, syncopated bass, sparse middle and modulation; newly composed melody.' },
            sections: [[0, 12, '自由装饰引子', '6/4'], [12, 60, '主题与延伸', '4/4'],
                [60, 92, '稀疏间奏与转调', '4/4'], [92, 140, '升调再现与攀升', '4/4'],
                [140, 172, '变化回归', '4/4'], [172, 188, '收束', '4/4'], [188, 198, '尾声装饰句', '10/4']]
                .map(([start, end, name, meter]) => ({ start_seconds: round(start * 60 / 140),
                    end_seconds: round(end * 60 / 140), name, meter })),
        } } : {}),
        conventions: { pitch: 'Scientific pitch notation; C4 = MIDI 60; B means B natural.',
            time: 'Absolute seconds from track start, rounded to six decimals.',
            gain: 'Linear amplitude multiplier, not MIDI velocity; rounded to nine decimals.',
            pan: '-1 left, 0 center, +1 right.',
            duration: 'Score gate duration; sample ringing, crossfade and reverb tails may continue afterwards.',
            parts: 'Grouped by instrument, potentially polyphonic; chronological note IDs preserve original event order.' },
        space: { decay_seconds: track.space.decay, wet_mix: track.space.mix },
        ...(track.id === 'unsent-starlight' ? { composition: {
            tempo_bpm: 172, beat_unit: 'quarter', meter: '4/4',
            primary_motif: { pitches: ['B4', 'C5', 'E5', 'G5'], midi: [71, 72, 76, 79],
                onset_beats: [0, .5, 1, 2], gate_beats: [.5, .5, 1, 2], overlap_seconds: .025,
                development: 'Four-note seed at structural anchors; distinct continuation, bridge extension, varied return and new culmination. No repeated full eight-bar lead.' },
            sections: [
                [0, 4, '引子'], [4, 12, '主题'], [12, 20, '跨小节延伸'], [20, 28, '对比旋律'], [28, 36, '攀升展开'],
                [36, 40, '短暂收低与接入'], [40, 48, '变化再现'], [48, 56, '新高潮与收束'], [56, 60, '收束'],
            ].map(([start, end, name]) => ({ start_seconds: round(start * 4 * 60 / 172),
                end_seconds: round(end * 4 * 60 / 172), name })),
            featured_strings: [
                { start_seconds: round(16 * 4 * 60 / 172), end_seconds: round(20 * 4 * 60 / 172), role: 'Continuation melody; harp lead rests.' },
                { start_seconds: round(48 * 4 * 60 / 172), end_seconds: round(52 * 4 * 60 / 172), role: 'Culmination melody one octave lower; harp lead rests.' },
            ],
            tail_start_seconds: round(60 * 4 * 60 / 172),
        } } : {}),
        note_count: track.notes.length, parts,
    };
    // Keep each note on one line: explicit field names without bloating LLM context.
    const json = JSON.stringify(score, null, 2).replace(
        /\{\n\s+"id": "n\d+",[\s\S]*?\n\s+\}/g,
        note => JSON.stringify(JSON.parse(note)),
    ) + '\n';
    const file = `${track.id}.json`;
    fs.writeFileSync(path.join(directory, file), json);
    const restored = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
    const notes = restored.parts.flatMap(part => part.notes.map(note => ({ ...note, instrument: part.instrument })))
        .sort((a, b) => a.id.localeCompare(b.id));
    assert.equal(notes.length, track.notes.length);
    notes.forEach((note, i) => {
        const original = track.notes[i];
        assert.equal(note.instrument, original.instrument);
        assert.equal(note.midi, original.midi);
        assert.equal(note.pitch, pitchName(original.midi));
        assert.equal(note.phrase, original.phrase);
        for (const [field, key] of [['start_seconds', 'start'], ['duration_seconds', 'duration'], ['gain', 'gain'], ['pan', 'pan']]) {
            assert.ok(Math.abs(note[field] - original[key]) <= (key === 'gain' ? .000000000501 : .000000501), `${track.id} ${note.id} ${field}`);
        }
    });
    index.push({ id: track.id, title: track.title, file, duration_seconds: track.duration,
        note_count: notes.length, instruments: parts.map(part => part.instrument) });
    console.log(`${track.title}: ${notes.length} notes -> ${file}`);
}
fs.writeFileSync(path.join(directory, 'index.json'), JSON.stringify({
    format: 'distant-stars-score-index', version: 1, source: origin, tracks: index,
}, null, 2) + '\n');
