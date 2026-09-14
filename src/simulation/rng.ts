export function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => { value += 0x6d2b79f5; let t = value; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function deterministicNoise(seed: number, salt: number) { return mulberry32(seed ^ Math.imul(salt + 1, 0x9e3779b1))(); }
