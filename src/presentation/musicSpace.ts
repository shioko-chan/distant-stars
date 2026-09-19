import type { MusicTrack } from '../content/music';

// Damped parallel combs followed by short allpass diffusers (Schroeder topology).
// https://www.dsprelated.com/freebooks/pasp/Schroeder_Reverberators.html
// Delay-line memory stays small regardless of the track's length.
export function applyMusicSpace(left: Float32Array, right: Float32Array, rate: number, space: MusicTrack['space']) {
    if (space.mix === 0) return;
    const damping = Math.exp(-2 * Math.PI * 3200 / rate);
    const bassCut = Math.exp(-2 * Math.PI * 140 / rate);
    [left, right].forEach((samples, channel) => {
        const combs = [.0297, .0371, .0411, .0437].map(seconds => {
            const length = Math.round((seconds + channel * .0013) * rate);
            return {
                data: new Float32Array(length), index: 0, filtered: 0,
                feedback: Math.min(.9, 10 ** (-3 * length / (rate * space.decay))),
            };
        });
        const diffusers = [.0051, .0017].map(seconds => ({
            data: new Float32Array(Math.round((seconds + channel * .0003) * rate)), index: 0,
        }));
        let previous = 0, highpass = 0;
        for (let i = 0; i < samples.length; i++) {
            const dry = samples[i];
            highpass = dry - previous + bassCut * highpass;
            previous = dry;
            let wet = 0;
            for (const comb of combs) {
                const delayed = comb.data[comb.index];
                comb.filtered = delayed * (1 - damping) + comb.filtered * damping;
                comb.data[comb.index] = highpass + comb.filtered * comb.feedback;
                if (++comb.index === comb.data.length) comb.index = 0;
                wet += delayed * .25;
            }
            for (const diffuser of diffusers) {
                const output = diffuser.data[diffuser.index] - wet * .5;
                diffuser.data[diffuser.index] = wet + output * .5;
                if (++diffuser.index === diffuser.data.length) diffuser.index = 0;
                wet = output;
            }
            samples[i] = dry + wet * space.mix;
        }
    });
}
