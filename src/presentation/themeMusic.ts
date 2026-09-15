// A quiet, original 48-second ambient theme, rendered once and looped locally.
// Wrapping each note's release into the start keeps the loop seamless.
export function createTheme(context: AudioContext): AudioBuffer {
    const rate = context.sampleRate, duration = 48;
    const buffer = context.createBuffer(2, rate * duration, rate);
    const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
    const note = (midi: number, start: number, length: number, gain: number, pan: number) => {
        const frequency = 440 * 2 ** ((midi - 69) / 12);
        for (let i = 0; i < length * rate; i++) {
            const t = i / rate;
            const envelope = Math.min(t / .8, 1) * Math.max(0, 1 - t / length) ** 2;
            const tone = Math.sin(2 * Math.PI * frequency * t) + .18 * Math.sin(2 * Math.PI * frequency * 2 * t);
            const sample = tone * envelope * gain;
            const index = (Math.round(start * rate) + i) % left.length;
            left[index] += sample * Math.sqrt((1 - pan) / 2);
            right[index] += sample * Math.sqrt((1 + pan) / 2);
        }
    };
    const chords = [[45, 52, 59, 60], [41, 48, 55, 57], [48, 55, 59, 64], [43, 50, 57, 62]];
    const melody = [[76, 71, 69, 64], [72, 69, 67, 64], [71, 76, 79, 76], [74, 69, 67, 71]];
    chords.forEach((chord, bar) => {
        chord.forEach((pitch, voice) => note(pitch, bar * 12, 16, .065, (voice - 1.5) / 3));
        melody[bar].forEach((pitch, beat) => note(pitch, bar * 12 + beat * 3, 5, .075, beat % 2 ? .35 : -.35));
    });
    return buffer;
}
