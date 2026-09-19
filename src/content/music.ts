export type MusicInstrument = 'pad' | 'harp' | 'marimba' | 'pizzicato' | 'pluck' | 'bell' | 'bass'
    | 'shepard' | 'shepard-air' | 'drone' | 'strings' | 'cello' | 'horn' | 'flute' | 'kick' | 'snare' | 'hat';

export interface MusicNote {
    instrument: MusicInstrument;
    midi: number;
    start: number;
    duration: number;
    gain: number;
    pan: number;
    /** Flute or string notes under one slur share an envelope and connected transitions. */
    phrase?: string;
}

export interface MusicTrack {
    id: string;
    title: string;
    description: string;
    duration: number;
    /** Final level after normalization. */
    outputGain?: number;
    space: { decay: number; mix: number };
    notes: readonly MusicNote[];
}

function add(notes: MusicNote[], instrument: MusicInstrument, midi: number,
    start: number, duration: number, gain: number, pan = 0) {
    notes.push({ instrument, midi, start, duration, gain, pan });
}

function byTime(notes: MusicNote[]): readonly MusicNote[] {
    return notes.sort((a, b) => a.start - b.start);
}

function distantStars(): readonly MusicNote[] {
    const notes: MusicNote[] = [];
    // Exposition, a minor-key answer, expanding counterpoint, then the theme's return.
    const harmony = [[45, 52, 59, 60], [41, 48, 55, 57], [38, 45, 53, 57],
        [40, 47, 55, 59], [48, 55, 59, 64], [43, 50, 57, 62]];
    const theme = [[76, 71, 69, 64], [72, 69, 67, 64], [77, 76, 74, 69],
        [71, 74, 76, 79], [83, 79, 76, 71], [76, 71, 69, 64]];
    const answers = [[57, 59, 60], [57, 55, 52], [53, 57, 60], [55, 59, 62], [64, 62, 59], [62, 59, 57]];
    for (let phrase = 0; phrase < harmony.length; phrase++) {
        const start = phrase * 13;
        harmony[phrase].forEach((midi, voice) => {
            add(notes, 'pad', midi, start + voice * .21, 13.5, .033, (voice - 1.5) * .3);
        });
        theme[phrase].forEach((midi, step) => {
            add(notes, 'pad', midi, start + 1.1 + step * 2.8, 5.1, .067, step % 2 ? .2 : -.2);
        });
        if (phrase > 0) answers[phrase].forEach((midi, step) => {
            add(notes, 'cello', midi, start + 2 + step * 3.7, 3.9, phrase < 4 ? .036 : .047, -.32);
        });
        if (phrase >= 2 && phrase <= 4) {
            for (let step = 0; step < 10; step++) {
                const pitch = harmony[phrase][[1, 2, 3, 2, 1][step % 5]] + 24;
                add(notes, 'pluck', pitch, start + .8 + step * 1.1, 1.7,
                    step % 5 === 0 ? .034 : .020, step % 2 ? .55 : -.55);
            }
        }
        if (phrase === 3 || phrase === 4) {
            add(notes, 'horn', phrase === 3 ? 64 : 67, start + 4.5, 4.5, .041, .25);
            add(notes, 'horn', phrase === 3 ? 67 : 71, start + 9, 3.3, .036, .25);
        }
    }
    [45, 52, 59, 64].forEach((midi, voice) => add(notes, 'pad', midi, 78, 7, .028, (voice - 1.5) * .25));
    add(notes, 'cello', 45, 78, 6, .036, -.32);
    add(notes, 'pad', 69, 78.6, 6.4, .048, .1);
    return byTime(notes);
}

function blueCradle(): readonly MusicNote[] {
    const notes: MusicNote[] = [];
    const eighth = 5 / 12; // 6/8, dotted quarter = 48; each bar rocks for 2.5 seconds.
    // An eight-bar sentence and its expanded answer, with a separate cadence.
    const bars = [
        [48, 60, 64, 67], [52, 60, 64, 67], [53, 60, 65, 69], [53, 60, 65, 69],
        [50, 62, 65, 69], [53, 62, 65, 69], [43, 59, 62, 67], [48, 60, 64, 67],
        [45, 60, 64, 69], [52, 59, 64, 67], [53, 60, 65, 69], [50, 62, 65, 69],
        [47, 59, 62, 65], [43, 59, 62, 67], [48, 60, 64, 67], [52, 60, 64, 67],
        // A contrasting eight-bar bridge in the relative minor, then a homeward cadence.
        [45, 60, 64, 69], [41, 60, 65, 69], [50, 62, 65, 69], [40, 59, 64, 68],
        [45, 60, 64, 69], [50, 62, 65, 69], [43, 59, 62, 67], [43, 59, 62, 65],
        [53, 60, 65, 69], [43, 59, 62, 67], [48, 60, 64, 67], [48, 60, 64, 67],
    ];
    bars.forEach(([bass, low, middle, high], bar) => {
        const start = bar * 6 * eighth;
        const bridge = bar >= 16 && bar < 24;
        const taper = bar >= 26 ? .75 : bridge ? .82 : 1;
        add(notes, 'bass', bass, start, 5.4 * eighth, .058 * taper, -.08);
        const pattern = bridge ? [low, high, middle, low + 12, middle, high] : [low, middle, high, low + 12, high, middle];
        pattern.forEach((midi, step) => {
            add(notes, 'harp', midi, start + step * eighth, 1.8 * eighth,
                (step % 3 === 0 ? .057 : .038) * taper, -.26 + step * .075);
        });
        if (bar >= 8 && bar < 26) {
            add(notes, 'cello', bridge ? low - 12 : bass + 12, start + .07, 3.2 * eighth, .037 * taper, -.4);
            add(notes, 'cello', bridge ? middle - 12 : low, start + 3.1 * eighth, 2.7 * eighth, .031 * taper, -.4);
        }
    });
    // Right hand breathes across the rocking accompaniment, entering after two bars.
    const melody = [
        [2, 0, 76, 3], [2, 3, 79, 2], [2, 5, 76, 1],
        [3, 0, 74, 3], [3, 3, 72, 3], [4, 0, 74, 4], [4, 4, 77, 2],
        [5, 0, 76, 3], [5, 3, 74, 3], [6, 0, 71, 3], [6, 3, 74, 2],
        [7, 0, 72, 5],
        [8, 0, 76, 2], [8, 2, 79, 1], [8, 3, 81, 3],
        [9, 0, 79, 3], [9, 3, 76, 3], [10, 0, 77, 4], [10, 4, 81, 2],
        [11, 0, 79, 3], [11, 3, 77, 2], [11, 5, 76, 1],
        [12, 0, 74, 4], [12, 4, 77, 2], [13, 0, 74, 3], [13, 3, 71, 3],
        [14, 0, 72, 5], [16, 0, 76, 4], [16, 4, 72, 2],
        [17, 0, 77, 3], [17, 3, 76, 3], [18, 0, 74, 2], [18, 2, 77, 4],
        [19, 0, 76, 3], [19, 3, 71, 2], [19, 5, 68, 1],
        [20, 0, 69, 4], [20, 4, 72, 2], [21, 0, 74, 3], [21, 3, 77, 3],
        [22, 0, 79, 4], [22, 4, 77, 2], [23, 0, 74, 3], [23, 3, 71, 3],
        [24, 0, 69, 3], [24, 3, 72, 3], [25, 0, 71, 3], [25, 3, 74, 3], [26, 0, 72, 8],
    ];
    melody.forEach(([bar, step, midi, length]) => {
        add(notes, 'harp', midi, (bar * 6 + step) * eighth, length * eighth,
            bar >= 24 ? .068 : .087, .24);
    });
    [48, 60, 64, 67, 72].forEach((midi, voice) => {
        add(notes, 'harp', midi, 70 + voice * .055, 4.5, .043, (voice - 2) * .12);
    });
    return byTime(notes);
}

function coronalSails(): readonly MusicNote[] {
    const notes: MusicNote[] = [];
    const beat = .625; // 96 BPM, 4/4. Short notes and syncopation drive the sails.
    const roots = [38, 38, 38, 38, 41, 41, 43, 43, 38, 45, 38, 38, 41, 43, 45, 45,
        38, 36, 41, 43, 38, 41, 45, 38, 46, 41, 43, 45, 38, 41, 45, 38];
    const hooks = [[74, 77, 81, 79, 77], [74, 81, 84, 81, 77], [77, 81, 86, 84, 81], [79, 81, 83, 81, 77]];
    roots.forEach((root, bar) => {
        const start = bar * 4 * beat;
        if (bar >= 10 && bar < 16) {
            // Six bars of weightlessness: exposed motif, harmonic rise, then the engine returns.
            add(notes, 'pluck', [86, 81, 84, 83, 85, 81][bar - 10], start + .75 * beat, 2.1, .069, bar % 2 ? -.55 : .55);
            add(notes, 'pluck', [81, 77, 81, 79, 81, 73][bar - 10], start + 2.5 * beat, 1.4, .034, bar % 2 ? .55 : -.55);
            if (bar % 2 === 0) [root + 12, root + 19, root + 26].forEach((midi, voice) =>
                add(notes, 'pad', midi, start, 5, .025, (voice - 1) * .35));
            return;
        }
        const opening = bar < 4;
        const closing = bar === roots.length - 1;
        [0, 1.5, 2.75].forEach((offset, step) => {
            add(notes, 'bass', root + (step === 1 ? 12 : 0), start + offset * beat,
                (step === 0 ? .8 : .5) * beat, closing ? .060 : .081);
        });
        const kicks = bar < 2 ? [0, 2] : [0, 1, 2, 3];
        kicks.forEach(offset => add(notes, 'kick', 36, start + offset * beat, .19, opening ? .071 : .090));
        if (bar >= 4) [1, 3].forEach(offset => add(notes, 'snare', 50, start + offset * beat, .18, .033, .1));
        if (bar === 7 || bar === 23 || bar === 30) [3.25, 3.5, 3.75].forEach((offset, i) =>
            add(notes, 'snare', 50, start + offset * beat, .12, .014 + i * .005, .1));
        if (bar >= 2) {
            for (let step = 0; step < 8; step++) {
                add(notes, 'hat', 84, start + (step * .5 + .25) * beat, .055,
                    step % 2 ? .016 : .024, step % 2 ? .28 : -.28);
            }
        }
        const hook = hooks[bar % hooks.length];
        [0, .75, 1.5, 2.5, 3.25].forEach((offset, step) => {
            add(notes, 'pluck', hook[step] - (opening ? 12 : 0), start + offset * beat,
                (step === 4 ? .6 : .36) * beat, opening ? .066 : .087, step % 2 ? .25 : -.25);
        });
        if (bar >= 16 && !closing) {
            add(notes, 'pluck', hook[1] + 12, start + 3.75 * beat, .42, .034, .6);
        }
        if (bar >= 24 && bar % 2 === 0) {
            add(notes, 'horn', [62, 65, 67, 69][(bar - 24) / 2], start + .2, 4.2, .036, -.3);
        }
    });
    add(notes, 'bass', 38, 80, 2.9, .058);
    [62, 69, 76].forEach((midi, voice) => add(notes, 'pluck', midi, 80.18 + voice * .11, 2.8, .052, (voice - 1) * .35));
    add(notes, 'pluck', 74, 81.9, 3.2, .048, .15);
    return byTime(notes);
}

function longVoyage(): readonly MusicNote[] {
    const notes: MusicNote[] = [];
    // Three distant islands of sound; no clock, ostinato, or recurring chord cycle.
    add(notes, 'drone', 38, .4, 14.2, .091, -.18);
    add(notes, 'drone', 45, 2.9, 9.1, .043, .4);
    add(notes, 'harp', 62, 5.7, 4.5, .054, -.63);
    add(notes, 'bell', 81, 11.3, 3.5, .025, .68);

    add(notes, 'drone', 34, 20.8, 16.8, .081, .22);
    add(notes, 'bell', 69, 22.1, 3.9, .036, -.6);
    add(notes, 'drone', 41, 26.1, 10, .040, -.4);
    add(notes, 'harp', 65, 30.7, 4.8, .047, .5);
    add(notes, 'harp', 64, 34.25, 3.1, .030, -.25);

    add(notes, 'drone', 38, 43.2, 14.5, .080, -.1);
    add(notes, 'bell', 74, 45.9, 3.8, .032, .62);
    add(notes, 'drone', 50, 48.7, 9.4, .039, .35);
    add(notes, 'harp', 69, 55.1, 6.3, .048, -.5);
    add(notes, 'drone', 45, 58.6, 5.4, .036, .2);
    // A low counterline gradually acquires a second voice; its resolution is delayed.
    [[7.8, 50, 5.1], [25.4, 53, 5.6], [32.2, 52, 5.1], [47.8, 57, 6.5], [55.6, 53, 5.8]].forEach(([start, midi, duration]) =>
        add(notes, 'cello', midi, start, duration, .036, -.38));
    add(notes, 'drone', 34, 66.2, 12.5, .072, .25);
    add(notes, 'cello', 53, 67.1, 5.8, .043, -.4);
    add(notes, 'cello', 52, 72.4, 5.5, .037, -.4);
    add(notes, 'bell', 77, 68.9, 4.8, .029, .65);
    add(notes, 'harp', 64, 75.2, 4.1, .045, .45);
    add(notes, 'drone', 38, 82, 7.5, .060, -.15);
    add(notes, 'cello', 50, 82.7, 6.5, .032, -.38);
    add(notes, 'harp', 69, 84.6, 4.2, .034, .4);
    return byTime(notes);
}

function delayedEchoes(): readonly MusicNote[] {
    const notes: MusicNote[] = [];
    const ring = (midi: number, start: number, gain: number, pan: number) => {
        add(notes, 'bell', midi, start, 2.1, gain, pan);
        add(notes, 'bell', midi, start + .67, 1.8, gain * .43, -pan);
        add(notes, 'bell', midi, start + 1.53, 1.5, gain * .18, pan * .65);
    };
    // Calls and answers use unequal gaps; the replies cross the stereo field.
    ring(78, .4, .105, -.7);
    ring(74, 1.11, .086, -.5);
    ring(81, 2.24, .080, -.65);
    ring(71, 4.59, .076, .7);
    ring(78, 5.19, .066, .5);

    ring(74, 9.4, .099, .7);
    ring(71, 10.26, .083, .5);
    ring(76, 11.71, .078, .65);
    ring(66, 14.04, .072, -.7);
    ring(74, 14.93, .061, -.5);

    ring(81, 18.7, .103, -.65);
    ring(78, 19.31, .088, -.45);
    ring(86, 20.19, .075, -.7);
    ring(83, 21.46, .066, -.5);
    ring(74, 23.39, .077, .7);
    ring(81, 24.12, .065, .5);

    // A shorter, lower answer leaves the center of the piece conspicuously bare.
    ring(66, 28.5, .080, .7);
    ring(69, 30.08, .066, .45);
    ring(71, 33.21, .065, -.7);

    ring(78, 38.6, .097, -.7);
    ring(74, 39.31, .082, -.5);
    ring(81, 40.44, .074, -.65);
    ring(83, 42.56, .076, .7);
    ring(78, 43.21, .060, .5);

    ring(74, 47.5, .072, .65);
    ring(71, 48.88, .059, .45);
    ring(71, 52.4, .048, -.65);
    // A second, lower voice moves in three-note groups under the uneven bell calls.
    [18.7, 38.6, 60.4].forEach((start, section) => {
        const pitches = section === 1 ? [50, 57, 61] : [47, 54, 59];
        for (let step = 0; step < 12; step++) {
            add(notes, 'pluck', pitches[step % 3], start + step * .74, 1.3,
                step % 3 === 0 ? .035 : .022, step % 2 ? .3 : -.3);
        }
    });
    // Return of the first call in augmentation, answered by its descending inversion.
    ring(78, 60.4, .094, -.7);
    ring(81, 61.82, .078, -.5);
    ring(86, 64.08, .072, -.65);
    ring(74, 65.29, .075, .7);
    ring(71, 66.49, .064, .5);
    ring(66, 68.14, .052, .7);
    ring(78, 71.6, .062, -.6);
    ring(74, 73.11, .053, .6);
    ring(71, 76.4, .045, -.4);
    return byTime(notes);
}

function dawnBeyond(): readonly MusicNote[] {
    const notes: MusicNote[] = [];
    const beat = 5 / 6; // 3/4 at 72 BPM: a broad orchestral waltz.
    const harmony = [
        [53, 60, 65], [53, 60, 69], [58, 62, 65], [55, 60, 64],
        [57, 60, 65], [50, 57, 65], [55, 58, 62], [48, 55, 64],
        [53, 60, 69], [57, 64, 72], [58, 65, 74], [60, 67, 76],
        [62, 69, 77], [58, 65, 74], [55, 62, 70], [60, 65, 67],
        // Quiet minor-key interlude, followed by an expanded home-key reprise.
        [50, 57, 65], [57, 60, 64], [58, 62, 65], [48, 55, 64],
        [50, 57, 65], [55, 58, 62], [48, 55, 64], [48, 55, 67],
        [53, 60, 69], [57, 64, 72], [58, 65, 74], [60, 67, 76],
        [53, 60, 69], [58, 65, 74], [48, 55, 64], [53, 60, 69],
    ];
    harmony.forEach(([bass, middle, upper], bar) => {
        const start = bar * 3 * beat;
        const interlude = bar >= 16 && bar < 24;
        const gain = bar < 8 ? .029 + bar * .0016 : bar < 16 ? .044 + (bar - 8) * .001
            : interlude ? .023 : .048 + (bar - 24) * .0015;
        add(notes, 'strings', bass, start, 3.15 * beat, gain, -.3);
        // A sustained bass and two soft upper pulses make the three-beat sway audible.
        add(notes, 'strings', middle, start + beat, .95 * beat, gain * .84, -.08);
        add(notes, 'strings', upper, start + beat, .95 * beat, gain, .3);
        add(notes, 'strings', middle, start + 2 * beat, 1.05 * beat, gain * .72, -.08);
        add(notes, 'strings', upper, start + 2 * beat, 1.05 * beat, gain * .88, .3);
        if (bar >= 8 && !interlude) {
            add(notes, 'strings', upper + 12, start + .08, 3 * beat, gain * .52, -.5);
        }
        add(notes, 'cello', bass - 12, start + .06, 2.9 * beat, gain * .9, -.45);
        if (interlude) {
            [middle, upper, middle + 12].forEach((midi, step) =>
                add(notes, 'harp', midi, start + (step + .5) * beat, 1.6 * beat, .045, .3));
        }
        if (bar >= 24) {
            // The horn moves against the flute, resolving suspensions on the third beat.
            add(notes, 'horn', middle + (bar % 2 ? 2 : 0), start, 1.9 * beat, .043, -.15);
            add(notes, 'horn', middle, start + 2 * beat, 1.05 * beat, .037, -.15);
        }
    });
    const melody = [
        [0, 1, 69, 1], [0, 2, 72, 1], [1, 0, 76, 2], [1, 2, 74, 1],
        [2, 0, 77, 2], [2, 2, 74, 1], [3, 0, 72, 2.4],
        [4, 0, 72, 1.5], [4, 1.5, 76, 1.5], [5, 0, 77, 2], [5, 2, 76, 1],
        [6, 0, 74, 1], [6, 1, 70, 1], [6, 2, 69, 1], [7, 0, 67, 2.4],
        [8, 0, 76, 2], [8, 2, 79, 1], [9, 0, 81, 2], [9, 2, 79, 1],
        [10, 0, 82, 1.5], [10, 1.5, 81, .5], [10, 2, 79, 1], [11, 0, 84, 2.5],
        [12, 0, 86, 2], [12, 2, 84, 1], [13, 0, 82, 2], [13, 2, 81, 1],
        [14, 0, 79, 1], [14, 1, 77, 1], [14, 2, 74, 1], [15, 0, 79, 2.5],
        [16, 0, 69, 2.5], [18, 1, 74, 1.8], [20, 0, 72, 2], [22, 1, 67, 1.8],
        [24, 0, 81, 1.5], [24, 1.5, 79, .5], [24, 2, 77, 1],
        [25, 0, 76, 1], [25, 1, 79, 2], [26, 0, 82, 2], [26, 2, 81, 1], [27, 0, 84, 2.5],
        [28, 0, 81, 2], [28, 2, 84, 1], [29, 0, 82, 2], [29, 2, 81, 1],
        [30, 0, 79, 1], [30, 1, 76, 2], [31, 0, 77, 3],
    ];
    melody.forEach(([bar, offset, midi, length]) => {
        add(notes, 'flute', midi, (bar * 3 + offset) * beat, length * beat * .97,
            bar < 8 ? .073 : bar < 16 ? .096 : bar < 24 ? .056 : .095, .14);
    });
    [53, 60, 65, 69, 72].forEach((midi, voice) => {
        add(notes, 'strings', midi, 80 + voice * .07, 5.9, .035, (voice - 2) * .2);
    });
    add(notes, 'cello', 41, 80, 5.9, .039, -.45);
    add(notes, 'horn', 65, 80.1, 5.2, .032, -.15);
    add(notes, 'flute', 77, 80, 5.3, .070, .14);
    return byTime(notes);
}

function endlessBeyond(): readonly MusicNote[] {
    const notes: MusicNote[] = [];
    // 60 BPM, four six-bar sentences: theme, answer, withdrawn interlude, return.
    // E minor -> Gmaj7 -> Am9 -> Bm7 -> Cmaj7(#11) -> Dsus2, without a V-I cadence.
    // The harmony rises beneath a falling melody. Octave layers fold quietly back
    // under a fixed spectral window; the listener hears an ostinato, not a scale drill.
    const chords = [
        { root: 40, voices: [55, 59, 66], pattern: [0, 7, 14, 10, 7, 14, 12, 7] },
        { root: 43, voices: [54, 59, 62], pattern: [0, 7, 14, 11, 7, 14, 12, 7] },
        { root: 45, voices: [55, 60, 64], pattern: [0, 7, 14, 10, 7, 14, 12, 7] },
        { root: 47, voices: [57, 62, 66], pattern: [0, 7, 14, 10, 7, 14, 12, 7] },
        { root: 48, voices: [55, 59, 66], pattern: [0, 7, 18, 11, 7, 14, 12, 7] },
        { root: 50, voices: [57, 62, 64], pattern: [0, 7, 14, 19, 7, 14, 12, 7] },
    ];
    // One held pitch per bar: B-D / C-A / G-A. Two pitches share each breath,
    // leaving the rising accompaniment room to move beneath the sustained melody.
    const theme = [71, 74, 72, 69, 67, 69];
    const sentenceGains = [.78, .96, .48, 1.08];
    for (let sentence = 0; sentence < 4; sentence++) {
        const withdrawn = sentence === 2;
        const fluteLine: { midi: number; start: number }[] = [];
        for (let bar = 0; bar < 6; bar++) {
            const start = 8 + sentence * 24 + bar * 4;
            const chord = chords[bar];
            const dynamic = sentenceGains[sentence];
            // Breath-shaped chord changes and a quiet bowed bass keep the texture human.
            chord.voices.forEach((midi, voice) => add(notes, 'pad', midi,
                start + voice * .055, 4.6, .012 * dynamic, (voice - 1) * .38));
            add(notes, 'cello', chord.root, start + .08, 3.65, .061 * dynamic, -.28);
            if (!withdrawn) {
                add(notes, 'strings', chord.voices[2], start + .4, 3.4, .065 * dynamic, .35);
                // The answer starts on E; the return restores the original B.
                const pitch = sentence === 1 && bar === 0 ? 76 : theme[bar];
                fluteLine.push({ midi: pitch, start: start + .5 });
            } else if (bar % 2 === 0) {
                // A fragment of the same theme, in a lower voice, across the empty middle.
                add(notes, 'cello', theme[bar] - 24, start + 1.3, 2.45, .095, .12);
            }
            if (sentence === 1 || sentence === 3) {
                add(notes, 'cello', chord.voices[0], start + .35, 1.25, .054 * dynamic, -.2);
                add(notes, 'cello', chord.voices[1] - 12, start + 2.3, 1.4, .045 * dynamic, -.2);
            }
            // Eight-note 3+3+2 accents, with overlapping glass-like tails. A complete
            // harmonic sentence rises an octave, while its spectral center stays fixed.
            chord.pattern.forEach((interval, pulse) => {
                const pitch = chord.root + sentence * 12 + interval;
                const pitchClass = pitch % 12;
                const pitches = Array.from({ length: 8 }, (_, octave) => 12 + pitchClass + octave * 12);
                const weights = pitches.map(midi => Math.exp(-.5 * ((midi - 67) / 12) ** 2));
                const norm = Math.sqrt(weights.reduce((sum, weight) => sum + weight ** 2, 0));
                const accent = pulse === 0 || pulse === 3 || pulse === 6 ? 1 : .7;
                const swing = pulse % 2 ? .035 : 0;
                pitches.forEach((midi, octave) => add(notes, 'shepard', midi,
                    start + pulse * .5 + swing, 1.15,
                    .020 * dynamic * accent * weights[octave] / norm,
                    pulse % 2 ? .3 : -.3));
            });
            // A few acoustic reflections separate the synthetic ostinato from the foreground.
            if (bar % 2 === 0) add(notes, 'harp', chord.root + 36,
                start + 2.65, 2.1, .033 * dynamic, .5);
            if (sentence === 3 && bar >= 2) add(notes, 'horn', chord.voices[0],
                start + .9, 2.8, .026, -.35);
        }
        // One breath spans two bars. Inside the slur, each pitch lasts until the
        // next; only the ends of these seven-second phrases leave a breath gap.
        for (let phrase = 0; phrase < 3; phrase++) {
            const start = 8 + sentence * 24 + phrase * 8;
            const line = fluteLine.filter(note => note.start >= start && note.start < start + 8);
            line.forEach((note, i) => notes.push({
                instrument: 'flute', midi: note.midi, start: note.start,
                duration: (line[i + 1]?.start ?? start + 7.8) - note.start,
                gain: .15 * sentenceGains[sentence], pan: -.08,
                phrase: `endless-flute-${sentence}-${phrase}`,
            }));
        }
    }
    // A very quiet continuous Shepard-Risset rise connects every chord and sentence.
    // Each octave's gain follows its instantaneous pitch; only inaudible edge layers wrap.
    for (let octave = 0; octave < 10; octave++) {
        add(notes, 'shepard-air', 4 + octave * 12, 4, 102, .0048, (octave % 2 ? 1 : -1) * .32);
    }
    [52, 59, 66].forEach((midi, voice) => add(notes, 'pad', midi,
        voice * .18, 8.5, .013, (voice - 1) * .35));
    add(notes, 'harp', 71, 1.4, 3.3, .042, -.35);
    add(notes, 'harp', 76, 3.6, 3.6, .033, .35);
    add(notes, 'bell', 83, 6.1, 3.6, .016, .48);
    // The theme evaporates on the ninth, without a triumphant resolution.
    [52, 59, 66].forEach((midi, voice) => add(notes, 'pad', midi,
        104 + voice * .08, 6, .010, (voice - 1) * .3));
    add(notes, 'flute', 66, 104.4, 3.2, .062, -.08);
    add(notes, 'harp', 76, 105.7, 3.1, .024, .4);
    return byTime(notes);
}

function unsentStarlight(): readonly MusicNote[] {
    const notes: MusicNote[] = [];
    const beat = 60 / 172;
    // Beat-based phrases: the four-note seed opens a complete eight-bar sentence.
    // Each tuple is [pitch, onset in quarter beats, gate in quarter beats].
    const theme: readonly (readonly [number, number, number])[] = [
        [71, 0, .5], [72, .5, .5], [76, 1, 1], [79, 2, 2],
        [81, 4, 1.5], [79, 5.5, .5], [76, 6, 1], [74, 7, .75],
        [76, 8, 1.5], [74, 9.5, .5], [72, 10, 2],
        [71, 12, 1], [69, 13, 1], [67, 14, 1.5],
        [69, 16, 1.5], [72, 17.5, .5], [76, 18, 1], [77, 19, 1],
        [83, 20, 1.5], [81, 21.5, .5], [79, 22, 1.5],
        [76, 24, 1], [74, 25, .5], [72, 25.5, 1.5], [74, 27, 1],
        [71, 28, 1.5], [72, 29.5, 2],
    ];
    const bridge: readonly (readonly [number, number, number])[] = [
        [76, 0, 1.5], [79, 1.5, .5], [81, 2, 2],
        [83, 4, 1], [81, 5, .5], [79, 5.5, 1.5], [76, 7, 1],
        [78, 8, 1.5], [79, 9.5, .5], [81, 10, 2.5],
        [79, 13, 1], [78, 14, 1], [74, 15, .75],
        [76, 16, 1], [74, 17, .5], [72, 17.5, 1.5], [71, 19, 1],
        [69, 20, 2], [72, 22, 1], [76, 23, .75],
        [74, 24, 1.5], [72, 25.5, .5], [71, 26, 2],
        [69, 28, 1], [71, 29, .5], [74, 29.5, 1], [79, 30.5, 1],
    ];
    // The continuation starts before its bar line and avoids another four-note call.
    const continuation: typeof theme = [
        [79, -.5, 1.5], [76, 1, .5], [74, 1.5, .5], [72, 2, 2.5],
        [74, 4.5, .5], [76, 5, 1], [79, 6, 1.5], [76, 7.5, .5],
        [77, 8, 2.5], [76, 10.5, .5], [74, 11, 1],
        [72, 12, 1], [69, 13, .5], [66, 13.5, 1.5], [69, 15, .75],
        [71, 16, 2.5], [74, 18.5, .5], [79, 19, 1.5],
        [81, 20.5, .5], [79, 21, .5], [76, 21.5, 1], [72, 22.5, 1.5],
        [74, 24, 1], [77, 25, 1.5], [76, 26.5, .5], [74, 27, 1],
        [72, 28, 2.5], [71, 31, .5], [69, 31.5, .5],
    ];
    // A denser, climbing extension carries the bridge forward instead of repeating it.
    const flight: typeof theme = [
        [72, 0, .5], [76, .5, 1], [81, 1.5, 1.5], [79, 3, .5], [76, 3.5, .5],
        [79, 4, 1.5], [78, 5.5, .5], [76, 6, 2],
        [74, 8.5, .5], [78, 9, .5], [81, 9.5, 1], [83, 10.5, 1.5],
        [86, 12, 2], [83, 14, .5], [81, 14.5, .5], [79, 15, 1],
        [81, 16, 1.5], [79, 17.5, .5], [76, 18, 2.5],
        [74, 20.5, .5], [72, 21, .5], [69, 21.5, 1.5], [65, 23, 1],
        [67, 24, 3], [69, 27, .5], [71, 27.5, .5],
        [74, 28, 1], [71, 29, 1], [67, 30, 1.5],
    ];
    // Only the opening identifies the returning theme; its destination is now higher.
    const returnTheme: typeof theme = [
        ...theme.slice(0, 4),
        [83, 4, 2.5], [81, 6.5, .5], [79, 7, 1.5],
        [76, 8.5, .5], [79, 9, 1.5], [81, 10.5, 1.5],
        [78, 12, 2], [76, 14, .5], [74, 14.5, 1], [72, 15.5, .5],
        [71, 16, 1], [74, 17, .5], [79, 17.5, 1.5], [81, 19, 1],
        [84, 20, 2.5], [83, 22.5, .5], [81, 23, 1],
        [79, 24, 1.5], [77, 25.5, .5], [74, 26, 2],
        [76, 28, 1.5], [79, 29.5, 1.5],
    ];
    const culmination: typeof theme = [
        [84, 0, 3], [83, 3, .5], [81, 3.5, .5],
        [79, 4, 1.5], [76, 5.5, .5], [79, 6, 1.5],
        [81, 8, 1], [84, 9, 1], [88, 10, 2],
        [86, 12, 1.5], [84, 13.5, .5], [81, 14, 2],
        [83, 16, 2.5], [81, 18.5, .5], [79, 19, 1],
        [76, 20, 1.5], [74, 21.5, .5], [72, 22, 2],
        [74, 24, 1], [71, 25, 1.5], [67, 26.5, 1.5],
        [72, 28, 3],
    ];
    const phrase = (line: typeof theme, bar: number, instrument: MusicInstrument, gain: number, shift = 0) => {
        line.forEach(([pitch, onset, gate], i) => add(notes, instrument, pitch + shift,
            (bar * 4 + onset) * beat, gate * beat + .025,
            gain * (instrument === 'harp' ? .65 : 1) * (i % 4 === 0 ? 1.04 : .91), instrument === 'harp' ? .12 : -.12));
    };
    // Inverted basses connect the harmony; the bridge has a separate harmonic route.
    const harmony = [
        [36, 60, 64, 71], [47, 59, 62, 67], [45, 60, 64, 69], [43, 59, 64, 67],
        [41, 60, 65, 69], [40, 60, 64, 67], [38, 60, 65, 69], [43, 59, 62, 69],
        [36, 60, 64, 71], [40, 60, 64, 67], [41, 60, 64, 69], [42, 60, 66, 69],
        [43, 59, 62, 67], [45, 60, 64, 69], [43, 59, 62, 65], [36, 60, 64, 67],
    ];
    const bridgeHarmony = [
        [45, 60, 64, 71], [40, 59, 64, 67], [38, 57, 62, 66], [43, 59, 62, 67],
        [41, 60, 64, 69], [38, 60, 65, 69], [43, 60, 62, 67], [43, 59, 62, 65],
    ];
    for (let bar = 0; bar < 60; bar++) {
        const intro = bar < 4, quiet = bar >= 36 && bar < 40, returning = bar >= 40 && bar < 56;
        const level = intro ? .5 : quiet ? .34 : returning ? 1.02 + (bar - 40) * .018 : bar >= 56 ? .72 : .82;
        const chord = bar >= 20 && bar < 36 ? bridgeHarmony[(bar - 20) % 8]
            : harmony[bar >= 56 ? [0, 4, 14, 15][bar - 56] : (returning ? bar - 40 : Math.max(0, bar - 4)) % 16];
        const start = bar * 4;
        // A lighter quarter-note pulse underneath a melody that crosses the beat.
        (quiet ? [0] : bar >= 28 && bar < 36 ? [0, 1.5, 3] : [0, 2]).forEach((offset, i) => add(notes, 'pizzicato', chord[0] + (i ? 12 : 0),
            (start + offset) * beat, .18, .115 * level * (i ? .72 : 1), -.25));
        if (!quiet && bar % 4 !== 3) [1, 3].forEach((offset, i) => add(notes, 'pizzicato', chord[i + 1],
            (start + offset) * beat, .14, .050 * level, .25));
        // Break the arpeggio at phrase ends to leave audible breathing room.
        if (bar % 8 !== 3 && bar < 56) {
            (quiet ? [1, 3] : bar >= 20 && bar < 36 ? [.5, 2, 3.5] : [.5, 1.5, 2.5, 3.5]).forEach((offset, i) => add(notes, 'harp',
                chord[1 + i % 3], (start + offset) * beat, .20, .050 * level, .35));
        }
        if (!intro && !quiet) {
            // Raise the string bed, but give the solo line room during its entrances.
            const stringLevel = level * ((bar >= 16 && bar < 20) || (bar >= 48 && bar < 52) ? .65 : 1);
            // Audible bowed-string pulse: connected lower voices, lifted upper offbeat.
            chord.slice(1, 3).forEach((pitch, i) => add(notes, 'strings', pitch,
                start * beat, 3.65 * beat, .095 * stringLevel, i ? .28 : -.28));
            add(notes, 'strings', chord[3], (start + 2) * beat,
                1.75 * beat, .101 * stringLevel, .16);
        }
        if (returning && bar % 4 === 2) {
            // A descending counterline leaves the upper melody clear.
            [chord[3] - 12, chord[2] - 12, chord[1] - 12].forEach((pitch, i) =>
                add(notes, 'cello', pitch, (start + i * 2) * beat, 2 * beat + .03, .075 * level, -.3));
        }
    }
    phrase(theme.slice(0, 4), 0, 'harp', .23);
    phrase(theme, 4, 'harp', .30);
    phrase(continuation.filter(([, onset]) => onset < 16), 12, 'harp', .30);
    // Strings take the sentence over at 22.3 s; the harp melody yields completely.
    phrase(continuation.filter(([, onset]) => onset >= 16), 12, 'strings', .17);
    phrase(bridge, 20, 'marimba', .28);
    phrase(flight, 28, 'marimba', .30);
    // A single recollection, then a small rising pickup into the return.
    phrase(theme.slice(0, 4), 36, 'harp', .14, -12);
    phrase([[67, 0, 1], [69, 1, 1], [72, 3, 1], [74, 5, 1.5], [79, 7, 1]], 38, 'harp', .17);
    phrase(returnTheme, 40, 'harp', .36);
    // A second foreground entrance at 67.0 s, in the violin's warmer middle register.
    phrase(culmination.filter(([, onset]) => onset < 16), 48, 'strings', .21, -12);
    phrase(culmination.filter(([, onset]) => onset >= 16), 48, 'harp', .38);
    // Brass enters at structural turns, with a different line at each entrance.
    phrase([[64, 1, 2.5], [62, 4, 1], [60, 5, 2]], 18, 'horn', .05);
    phrase([[62, 0, 2], [65, 3, 1.5], [67, 5, 2]], 34, 'horn', .06);
    phrase([[67, 0, 3], [69, 4, 2], [71, 6, 1.5]], 50, 'horn', .075);
    [40, 48].forEach(bar => add(notes, 'bell', 83, (bar * 4 + 2) * beat, .7, .027, .4));
    phrase(theme.slice(0, 4), 56, 'harp', .25);
    phrase([[76, 0, 1], [74, 1, 1], [72, 2, 3]], 57, 'harp', .22);
    [48, 60, 64, 67].forEach((pitch, i) => add(notes, 'strings', pitch,
        59 * 4 * beat, 3.5 * beat, .060, (i - 1.5) * .18));
    return byTime(notes);
}

function starstageRondo(): readonly MusicNote[] {
    const notes: MusicNote[] = [];
    const beat = 60 / 140;
    const intro = 12;
    // Original F-major theme: rising sixth followed by a turning descent.
    // The reference informs gesture, syncopation and modulation, not these pitches.
    type Line = readonly (readonly [number, number, number])[];
    const opening: Line = [
        [74, 0, .5], [76, .5, .5], [81, 1, 1.5], [79, 2.5, .5], [77, 3, 1],
        [76, 4, 2], [72, 6, .5], [74, 6.5, .5], [77, 7, 1.5],
        [79, 8.5, 1], [77, 9.5, .5], [76, 10, 1], [74, 11, 1],
        [72, 12, 1.5], [69, 13.5, .5], [72, 14, 1.5],
    ];
    const onward: Line = [
        [77, 0, 1.5], [81, 1.5, .5], [84, 2, 2],
        [82, 4, 1], [81, 5, .5], [79, 5.5, 1], [77, 6.5, 1.5],
        [76, 8, .75], [77, 8.75, .25], [79, 9, 1.5], [72, 10.5, 1.5],
        [74, 12, 1], [76, 13, .5], [77, 13.5, 2],
    ];
    const turn: Line = [
        [81, 0, 2], [79, 2, .5], [77, 2.5, .5], [76, 3, 1],
        [74, 4, 1.5], [77, 5.5, .5], [79, 6, 1.5],
        [76, 8, 2], [72, 10, 1], [70, 11, 1],
        [69, 12, 1], [72, 13, 1], [77, 14, 1.5],
    ];
    const interlude: Line = [
        [69, 0, 2.5], [72, 3, 1], [74, 5, 2], [77, 8, 2.5], [76, 11, 1], [72, 13, 2],
        [70, 16, 2], [74, 19, 1], [77, 20, 1.5], [79, 22, 1],
        [78, 24, 2], [81, 26, 1], [83, 28, 1.5], [86, 30, 1.5],
    ];
    const ascent: Line = [
        [79, 0, 1], [83, 1, .5], [86, 1.5, 2],
        [84, 4, 1], [83, 5, .5], [81, 5.5, .5], [79, 6, 2],
        [81, 8, 1.5], [84, 9.5, .5], [88, 10, 1.5],
        [86, 12, 1], [83, 13, 1], [79, 14, 1.5],
    ];
    const returnLine: Line = [
        [76, 0, .5], [78, .5, .5], [83, 1, 1.5], [81, 2.5, .5], [79, 3, 1],
        [86, 4, 2], [84, 6, 1], [83, 7, 1],
        [81, 8, 1.5], [79, 9.5, .5], [78, 10, 1], [76, 11, 1],
        [74, 12, 1], [78, 13, 1], [79, 14, 2],
    ];
    const play = (line: Line, at: number, instrument: MusicInstrument, gain: number, shift = 0) => {
        line.forEach(([pitch, onset, gate], i) => add(notes, instrument, pitch + shift,
            (at + onset) * beat, gate * beat, gain * (i % 4 === 0 ? 1 : .88), instrument === 'harp' ? .22 : -.1));
    };
    // Two free-feeling six-beat gestures lead to a stable four-beat pulse.
    play([[81, 0, 1], [77, 1.25, .5], [74, 1.75, .5], [69, 2.25, 1.25]], 0, 'harp', .15);
    play([[53, 0, 2], [60, 2.5, .5], [65, 3, .5], [69, 3.5, .5], [74, 4, .5], [77, 4.5, .5], [81, 5, .5]], 6, 'harp', .12);
    add(notes, 'bell', 77, 0, 1.2, .038, .3);
    const chords = [
        [41, 57, 60, 65], [40, 55, 60, 64], [38, 57, 62, 65], [36, 55, 60, 64],
        [34, 53, 58, 62], [33, 53, 57, 60], [43, 55, 58, 62], [36, 55, 58, 64],
    ];
    for (let bar = 0; bar < 44; bar++) {
        const sparse = bar >= 12 && bar < 20;
        const shift = bar >= 20 ? 2 : 0;
        const level = sparse ? .58 : bar >= 32 && bar < 40 ? 1.06 : bar >= 40 ? .72 : .84;
        const chord = chords[bar % 8].map(pitch => pitch + shift);
        const at = intro + bar * 4;
        if (!sparse) {
            // Compact chord strokes and short ornaments give the cue its rondo pulse.
            [0, 1, 2.5].forEach((offset, hit) => chord.slice(1, 3).forEach((pitch, voice) =>
                add(notes, 'marimba', pitch, (at + offset) * beat, .21, .048 * level * (hit ? .8 : 1), -.22 + voice * .1)));
            [0, 1.5, 3].forEach((offset, i) => add(notes, 'pizzicato', chord[0] + (i === 1 ? 12 : 0),
                (at + offset) * beat, .2, .10 * level * (i ? .8 : 1), -.22));
            if (bar % 4 === 3 && bar < 40) {
                [chord[1], chord[2], chord[3]].forEach((pitch, i) => add(notes, 'harp', pitch + 12,
                    (at + 3 + i / 3) * beat, .18, .058 * level, .25));
            }
        } else {
            add(notes, 'pizzicato', chord[0], at * beat, .25, .055, -.22);
            chord.slice(1).forEach((pitch, i) => add(notes, 'harp', pitch,
                (at + i * .16) * beat, .65, .065, .2));
        }
        if (bar >= 20 && bar < 40 && bar % 2 === 0) {
            // Warm middle-register cello supplies counter-motion without high violins.
            add(notes, 'cello', chord[1] - 12, at * beat, 2.8 * beat, .058 * level, -.32);
            add(notes, 'cello', chord[2] - 12, (at + 3) * beat, 2.4 * beat, .050 * level, -.32);
        }
    }
    play(opening, intro, 'marimba', .25);
    play(onward, intro + 16, 'marimba', .26);
    play(turn, intro + 32, 'marimba', .24);
    play(interlude, intro + 48, 'harp', .15);
    play(opening, intro + 80, 'marimba', .27, 2);
    play(onward, intro + 96, 'harp', .18, 2);
    play(ascent, intro + 112, 'marimba', .28);
    play(returnLine, intro + 128, 'marimba', .29);
    play(turn, intro + 144, 'harp', .16, 2);
    play([[79, 0, 2], [78, 3, 1], [76, 4, 2], [74, 7, 1], [71, 8, 2], [74, 11, 1], [79, 12, 3]], intro + 160, 'marimba', .22);
    [20, 32].forEach(bar => add(notes, 'bell', 86, (intro + bar * 4) * beat, 1, .027, .3));
    // A ten-beat cadenza releases the pulse and settles in G major.
    const end = intro + 176;
    play([[79, 0, 1], [74, 1.5, .5], [71, 2, 1], [67, 3, 1.5],
        [55, 5, .4], [62, 5.4, .4], [67, 5.8, .4], [71, 6.2, .4], [74, 6.6, .4], [79, 7, 2]], end, 'harp', .12);
    [43, 55, 59, 62].forEach((pitch, i) => add(notes, 'marimba', pitch, (end + 8.5 + i * .07) * beat, .7, .072, (i - 1.5) * .12));
    return byTime(notes);
}

export const MUSIC_TRACKS: readonly MusicTrack[] = [
    {
        id: 'distant-stars', title: '遥远群星', description: '星云主题经由大提琴对位与圆号展开，再回到最初的微光',
        duration: 90, space: { decay: 1.8, mix: .19 }, notes: distantStars(),
    },
    {
        id: 'blue-cradle', title: '蓝色摇篮', description: '六拍竖琴与大提琴问答，越过小调桥段后温柔归航',
        duration: 79, space: { decay: .85, mix: .12 }, notes: blueCradle(),
    },
    {
        id: 'coronal-sails', title: '日冕之帆', description: '切分引擎、失重间奏与圆号主题，层层推进的启航乐章',
        duration: 90, space: { decay: .7, mix: .08 }, notes: coronalSails(),
    },
    {
        id: 'long-voyage', title: '漫长航路', description: '低鸣与大提琴逐渐交汇，穿过不安的远方后归于寂静',
        duration: 95, space: { decay: 2.2, mix: .23 }, notes: longVoyage(),
    },
    {
        id: 'delayed-echoes', title: '迟来的回声', description: '颤音琴问答与三音拨弦交织，主题拉长后反向回应',
        duration: 84, space: { decay: 1.4, mix: .16 }, notes: delayedEchoes(),
    },
    {
        id: 'dawn-beyond', title: '彼岸晨曦', description: '弦乐与长笛走过静谧竖琴间奏，在圆号对位中迎来晨光',
        duration: 91, space: { decay: 1.65, mix: .18 }, notes: dawnBeyond(),
    },
    {
        id: 'endless-beyond', title: '无尽的彼方', description: '长笛主题与弦乐穿行于玻璃般的循环音型，暗处的谢泼德声层始终向上漂移',
        duration: 112, space: { decay: 2.8, mix: .25 }, notes: endlessBeyond(),
    },
    {
        id: 'unsent-starlight', title: '未寄出的星光', description: '172 BPM 的 BCEG 主题逐段延伸、攀升，经过留白后以变化再现走向高潮',
        duration: 88, space: { decay: .95, mix: .12 }, notes: unsentStarlight(),
    },
    {
        id: 'starstage-rondo', title: '星幕间的回旋', description: '自由装饰句开启轻快回旋，切分低音与和弦短奏交错，升调后展开新的旋律',
        duration: 90, outputGain: .85, space: { decay: 1.05, mix: .13 }, notes: starstageRondo(),
    },
];
