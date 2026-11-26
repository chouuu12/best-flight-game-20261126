// Skyline Courier — game configuration: tuning constants, palette and the
// three missions. Everything the other modules need to agree on lives here,
// so a balance change is one edit, not a hunt through the renderer.

export const GAME_TITLE = 'SKYLINE COURIER';
export const GAME_TAGLINE = 'Fly the valley. Thread the rings. Bring her home.';

// --- world units -----------------------------------------------------------
// Distances are metres, speeds knots, altitudes metres. The valley runs
// along +s; the pilot starts at s = 0 and flies toward larger s.
export const WORLD = {
  seed: 20261126,
  valleyFloor: 120, // metres above sea level at the valley floor
  maxSpeed: 185, // knots at full throttle, clean air
  stallSpeed: 55, // knots: below this the wing stops flying
  cruiseSpeed: 120,
  maxAltitude: 2400,
  groundClearance: 2, // metres: touching the ground at or below this crashes
  fuelBurnBase: 0.016, // percent per second at idle
  fuelBurnThrottle: 0.075, // extra percent per second at full throttle
};

// --- flight tuning ---------------------------------------------------------
export const FLIGHT = {
  pitchRate: 26, // degrees per second of stick input
  maxPitch: 18, // degrees up / down the nose can point
  rollRate: 70, // degrees per second of stick input
  maxBank: 42, // degrees of bank
  turnFactor: 0.055, // heading change per degree of bank per knot
  climbFactor: 0.62, // vertical speed per degree of pitch per knot of speed
  sinkAtStall: 14, // metres per second lost when stalled
  dragFactor: 0.55, // how fast speed chases the throttle target
  landingMaxSink: 3.2, // m/s: harder than this on touchdown is a crash
  landingMaxSpeed: 95, // knots: faster than this on touchdown is a crash
  landingMaxBank: 20, // degrees of bank allowed on touchdown
  ringRadius: 30, // metres: how close to a ring centre counts as a pass
};

// --- scoring ---------------------------------------------------------------
export const SCORE = {
  ring: 100,
  ringTimeBonus: 25, // extra per ring when flown cleanly and fast
  landing: 500,
  landingSmoothBonus: 250, // gentle touchdown, on centreline
  missionComplete: 1000,
  crashPenalty: 0, // a crash ends the sortie; the score stands
  damagePerHit: 25, // percent of airframe per hard terrain graze
};

// --- palette: one dusk-valley style for sky, terrain and instruments -------
export const PALETTE = {
  skyTop: '#2e5f8a',
  skyMid: '#7fb0d6',
  skyLow: '#f2c98a',
  sunCore: '#fff3c4',
  sunGlow: 'rgba(255, 214, 130, 0.55)',
  ridgeFar: '#6d86a8',
  ridgeMid: '#4d6a52',
  ridgeNear: '#33502f',
  fieldA: '#7da95c',
  fieldB: '#a8b96a',
  fieldC: '#c2a15a',
  fieldD: '#5d8a4e',
  river: '#4f8fb8',
  runway: '#3a3f46',
  runwayEdge: '#e8e8e8',
  ringGold: '#ffc93c',
  ringGlow: 'rgba(255, 201, 60, 0.5)',
  ringDone: '#7ee081',
  hudPanel: 'rgba(8, 20, 32, 0.72)',
  hudText: '#eaf6ff',
  hudAccent: '#ffd166',
  hudWarn: '#ff5d5d',
  hudGood: '#7ee081',
  planeBody: '#e8542f',
  planeWing: '#f4f1e8',
  planeGlass: '#9fd8ef',
};

// --- missions --------------------------------------------------------------
// Rings sit at (s, x, alt). Runways sit at (s, x) with a length and a
// heading the pilot should match. Every mission is deterministic: the same
// seed builds the same valley, the same rings and the same weather.
export const MISSIONS = [
  {
    id: 'ring-run',
    name: 'RING RUN',
    short: 'Thread 8 golden rings down the valley',
    briefing:
      'Eight rings hang over the valley floor. Fly through every one, ' +
      'keep your speed up and your wings level, and mind the ridges — ' +
      'the valley floor is not forgiving.',
    start: { s: 0, x: 0, alt: 420, speed: 120, heading: 0, throttle: 0.7 },
    fuel: 100,
    wind: 0,
    rings: [
      { s: 900, x: -40, alt: 380, r: 30 },
      { s: 1900, x: 90, alt: 340, r: 30 },
      { s: 2900, x: -110, alt: 420, r: 30 },
      { s: 3900, x: 30, alt: 300, r: 30 },
      { s: 4900, x: 140, alt: 380, r: 30 },
      { s: 5900, x: -60, alt: 320, r: 30 },
      { s: 6900, x: 60, alt: 400, r: 30 },
      { s: 7800, x: 0, alt: 320, r: 30 },
    ],
    runways: [{ s: 9000, x: 0, len: 700, heading: 0, name: 'MARA AIRFIELD' }],
    goal: 'rings',
  },
  {
    id: 'island-hop',
    name: 'ISLAND HOP',
    short: 'Land on three island strips, fuel is tight',
    briefing:
      'Three short strips wait down the valley. Land on each one in ' +
      'order — gentle, slow, wings level — and take off again. ' +
      'Fuel is tight: full throttle everywhere and you will walk home.',
    start: { s: 0, x: 0, alt: 380, speed: 115, heading: 0, throttle: 0.65 },
    fuel: 78,
    wind: 0,
    rings: [
      { s: 1200, x: 0, alt: 340, r: 30 },
      { s: 3400, x: 40, alt: 330, r: 30 },
      { s: 5600, x: -30, alt: 340, r: 30 },
    ],
    runways: [
      { s: 2200, x: 0, len: 600, heading: 0, name: 'KESTREL STRIP' },
      { s: 4500, x: 0, len: 600, heading: 0, name: 'OTTER STRIP' },
      { s: 6800, x: 0, len: 600, heading: 0, name: 'HERON STRIP' },
    ],
    goal: 'landings',
  },
  {
    id: 'storm-courier',
    name: 'STORM COURIER',
    short: 'Deliver the parcel through gusting wind',
    briefing:
      'A storm is rolling down the valley and a parcel has to reach Mara ' +
      'Airfield before dark. Gusts will shove you sideways — correct ' +
      'early, correct small, and thread the five storm rings on the way.',
    start: { s: 0, x: 0, alt: 460, speed: 135, heading: 0, throttle: 0.8 },
    fuel: 100,
    wind: 1,
    rings: [
      { s: 1000, x: -70, alt: 420, r: 30 },
      { s: 2400, x: 80, alt: 380, r: 30 },
      { s: 3800, x: -90, alt: 440, r: 30 },
      { s: 5200, x: 50, alt: 360, r: 30 },
      { s: 6600, x: 0, alt: 400, r: 30 },
    ],
    runways: [{ s: 8000, x: 0, len: 700, heading: 0, name: 'MARA AIRFIELD' }],
    goal: 'delivery',
  },
];
