// Skyline Courier — terrain. The valley is a deterministic function of
// distance along the course (s): a floor height, ridge heights on both
// sides, a winding river, patchwork fields and the runways. The renderer
// asks this module "what is here at distance s" and draws it; the physics
// asks "how high is the ground at s" and crashes into it.

import { WORLD } from './config.js';
import { makeNoise1D, clamp, lerp } from './random.js';

const floorNoise = makeNoise1D(WORLD.seed + 11);
const leftNoise = makeNoise1D(WORLD.seed + 23);
const rightNoise = makeNoise1D(WORLD.seed + 37);
const riverNoise = makeNoise1D(WORLD.seed + 51);
const fieldNoise = makeNoise1D(WORLD.seed + 67);

// Height of the valley floor at distance s (metres above sea level).
export function groundHeight(s) {
  const rolling = floorNoise(s * 0.00035) * 70;
  const swell = Math.sin(s * 0.00012) * 45;
  return WORLD.valleyFloor + rolling + swell;
}

// Height of the ridge crests, left and right of the valley, at distance s.
// The left ridge is the taller one; both rise well above the flight path so
// the horizon always has mountains on it.
export function ridgeHeight(s, side) {
  const n = side < 0 ? leftNoise(s * 0.00028) : rightNoise(s * 0.00031);
  const base = side < 0 ? 620 : 520;
  return groundHeight(s) + base + n * 420 + Math.sin(s * 0.00009 + side) * 60;
}

// Lateral position of the river centreline at distance s (metres, +right).
// It meanders widely so it crosses the valley instead of running straight
// at the camera.
export function riverX(s) {
  return (riverNoise(s * 0.00022) - 0.5) * 900 + Math.sin(s * 0.0006) * 160;
}

// Which field colour a ground strip at distance s and lateral x gets. The
// patchwork is a checker of 240 m along-track by 160 m across-track cells,
// jittered by noise so the pattern never looks like a grid.
export function fieldColourIndex(s, x) {
  const along = Math.floor(s / 240 + fieldNoise(s * 0.0004) * 0.6);
  const across = Math.floor(x / 160 + fieldNoise(x * 0.001 + 9) * 0.5);
  const n = fieldNoise(along * 3.7 + across * 7.3);
  return (along + across * 2 + Math.floor(n * 4)) % 4;
}

// Lateral half-width of the river at distance s.
export function riverHalfWidth(s) {
  return 10 + riverNoise(s * 0.0005 + 4) * 8;
}

// The course the pilot should fly: a gentle S-curve the rings follow.
export function courseX(s) {
  return Math.sin(s * 0.00045) * 90 + Math.sin(s * 0.00013) * 40;
}

// A gust value for storm missions: -1..1, slow and smooth, from the same
// seed so a storm run is the same storm every time.
const gustNoise = makeNoise1D(WORLD.seed + 91);
export function gustAt(timeSeconds) {
  const slow = gustNoise(timeSeconds * 0.05) - 0.5;
  const fast = gustNoise(timeSeconds * 0.23 + 40) - 0.5;
  return clamp(slow * 1.4 + fast * 0.7, -1, 1);
}

// Clouds: fixed, seeded puffs in world space so they never jump around.
export function makeClouds(count = 26) {
  const rand = makeNoise1D(WORLD.seed + 113);
  const clouds = [];
  for (let i = 0; i < count; i++) {
    clouds.push({
      s: rand(i * 1.31) * 9000,
      x: (rand(i * 2.17 + 5) - 0.5) * 2600,
      alt: 700 + rand(i * 3.71 + 11) * 500,
      size: 60 + rand(i * 5.03 + 23) * 130,
    });
  }
  return clouds;
}

// Where the sun sits in the sky (screen-space direction), fixed for the
// whole game so the light never changes between screenshots.
export const SUN = { x: 0.72, y: 0.16 };
