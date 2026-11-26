// Skyline Courier — deterministic randomness. Every procedural piece of the
// valley (ridge shapes, field colours, cloud placement, gusts) comes from a
// seeded generator, so the same mission always builds the same world and a
// screenshot taken twice shows the same scene.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A value-noise helper: smooth pseudo-random values in [0, 1) along one
// axis, built from a seeded table so the terrain profile is continuous.
export function makeNoise1D(seed, size = 256) {
  const rand = mulberry32(seed);
  const table = new Float32Array(size);
  for (let i = 0; i < size; i++) table[i] = rand();
  const at = (i) => table[((i % size) + size) % size];
  return function noise(x) {
    const i = Math.floor(x);
    const f = x - i;
    const a = at(i);
    const b = at(i + 1);
    const u = f * f * (3 - 2 * f); // smoothstep between table entries
    return a + (b - a) * u;
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest signed difference between two headings in degrees.
export function angleDiff(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export function degToRad(d) {
  return (d * Math.PI) / 180;
}
