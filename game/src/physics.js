// Skyline Courier — flight model. A small, honest model: throttle sets the
// speed the engine wants, pitch trades speed for altitude, bank turns the
// nose, and the wing quits below stall speed. Fuel burns, gusts shove, the
// ground is solid, and a runway forgives a gentle touchdown and nothing else.

import { WORLD, FLIGHT } from './config.js';
import { clamp, degToRad, angleDiff } from './random.js';
import { groundHeight, gustAt } from './terrain.js';

export function createPlane(mission) {
  const st = mission.start;
  return {
    s: st.s, // metres along the course
    x: st.x, // metres across the course (+right)
    alt: st.alt, // metres above sea level
    speed: st.speed, // knots
    heading: st.heading, // degrees, 0 = along the course
    pitch: 0, // degrees, +up
    roll: 0, // degrees, +right wing down
    throttle: st.throttle, // 0..1
    fuel: mission.fuel, // percent
    damage: 0, // percent of airframe lost
    verticalSpeed: 0, // m/s, +up
    time: 0, // seconds flown
    grounded: false,
    engineOut: false,
    stalled: false,
    onRunway: null,
  };
}

// One fixed step of the model. `input` is { pitch: -1..1, roll: -1..1,
// throttle: -1..1 (change), brake: bool }. `wind` is 0 or 1 (storm on).
// `runways` is the mission's strip list, so a touchdown on a strip can be
// judged by the mission module instead of ending in a crash: the ground
// check returns 'touchdown' over a strip when the arrival is survivable,
// and 'crash' everywhere else. Returns an event string or null.
export function stepPlane(p, input, wind, dt, runways = []) {
  if (p.grounded) return null;
  p.time += dt;

  // --- throttle -----------------------------------------------------------
  p.throttle = clamp(p.throttle + input.throttle * dt * 0.55, 0, 1);
  if (input.brake) p.throttle = Math.max(0, p.throttle - dt * 1.4);

  // --- fuel ---------------------------------------------------------------
  const burn = WORLD.fuelBurnBase + WORLD.fuelBurnThrottle * p.throttle;
  p.fuel = Math.max(0, p.fuel - burn * dt);
  p.engineOut = p.fuel <= 0;
  const thrust = p.engineOut ? 0 : p.throttle;

  // --- speed: the engine pulls toward its target, drag pulls back ---------
  const targetSpeed = 42 + thrust * (WORLD.maxSpeed - 42);
  p.speed += (targetSpeed - p.speed) * FLIGHT.dragFactor * dt;
  p.speed = clamp(p.speed, 0, WORLD.maxSpeed + 15);

  // --- attitude: stick moves pitch and roll toward their targets ----------
  const pitchTarget = clamp(input.pitch * FLIGHT.maxPitch, -FLIGHT.maxPitch, FLIGHT.maxPitch);
  const rollTarget = clamp(input.roll * FLIGHT.maxBank, -FLIGHT.maxBank, FLIGHT.maxBank);
  p.pitch += clamp(pitchTarget - p.pitch, -FLIGHT.pitchRate * dt, FLIGHT.pitchRate * dt);
  p.roll += clamp(rollTarget - p.roll, -FLIGHT.rollRate * dt, FLIGHT.rollRate * dt);

  // --- stall: below stall speed the wing stops lifting ---------------------
  p.stalled = p.speed < WORLD.stallSpeed && p.alt > groundHeight(p.s) + 10;

  // --- turn: bank turns the heading, faster when faster -------------------
  const turnRate = Math.tan(degToRad(p.roll)) * p.speed * FLIGHT.turnFactor;
  p.heading += turnRate * dt;
  p.heading = ((p.heading % 360) + 360) % 360;

  // --- climb: pitch trades speed for altitude; stall sinks ----------------
  const climb = p.stalled
    ? -FLIGHT.sinkAtStall
    : (p.pitch * p.speed * FLIGHT.climbFactor) / 60;
  p.verticalSpeed = climb;
  p.alt += climb * dt;
  p.alt = Math.min(p.alt, WORLD.maxAltitude);

  // --- gusts: a storm shoves the plane sideways and bobs the nose ---------
  if (wind > 0) {
    const g = gustAt(p.time) * wind;
    p.x += g * 9 * dt;
    p.roll += g * 2.2 * dt;
    p.alt += g * 1.6 * dt;
  }

  // --- move along the course ----------------------------------------------
  const metresPerSecond = p.speed * 0.514444;
  p.s += Math.cos(degToRad(p.heading)) * metresPerSecond * dt;
  p.x += Math.sin(degToRad(p.heading)) * metresPerSecond * dt;

  // --- ground --------------------------------------------------------------
  const ground = groundHeight(p.s);
  if (p.alt <= ground + WORLD.groundClearance) {
    p.alt = ground + WORLD.groundClearance;
    // A touchdown on a strip is the mission module's call, not a crash:
    // survivable arrivals return 'touchdown' and the mission judges them.
    const strip = runways.find((r) => Math.abs(p.s - r.s) < r.len / 2 && Math.abs(p.x - r.x) < 30);
    if (strip && -p.verticalSpeed <= 6 && p.speed <= FLIGHT.landingMaxSpeed * 1.4) {
      return 'touchdown';
    }
    return 'crash';
  }
  return null;
}

// Called by the mission module when the plane is over a runway and slow
// enough to land. Returns 'landed' when the touchdown is survivable, or
// 'crash' when it is too hard, too fast or too banked. A landing only
// counts close to the ground (within 6 m): flying 50 m over the strip at
// landing speed is a flyover, not a touchdown.
export function tryLand(p, runway) {
  const along = Math.abs(p.s - runway.s) < runway.len / 2;
  // The strip is 26 m wide; the landing counts within a generous margin
  // of it, so a slightly wide final is a landing, not a go-around.
  const across = Math.abs(p.x - runway.x) < 30;
  if (!along || !across) return null;
  const agl = p.alt - groundHeight(p.s);
  if (agl > 6) return null;
  const sink = -p.verticalSpeed;
  const gentle = sink <= FLIGHT.landingMaxSink;
  const slow = p.speed <= FLIGHT.landingMaxSpeed;
  const level = Math.abs(p.roll) <= FLIGHT.landingMaxBank;
  if (gentle && slow && level) {
    settleOnRunway(p, runway);
    return 'landed';
  }
  if (sink <= 6 && slow && level) {
    // A hard landing: survivable, but it costs airframe.
    settleOnRunway(p, runway);
    p.damage = clamp(p.damage + 15, 0, 100);
    return 'landed-hard';
  }
  if (sink > FLIGHT.landingMaxSink * 2.2 || p.speed > FLIGHT.landingMaxSpeed * 1.4) {
    return 'crash';
  }
  return null;
}

function settleOnRunway(p, runway) {
  p.grounded = true;
  p.onRunway = runway;
  p.alt = groundHeight(p.s) + WORLD.groundClearance;
  p.verticalSpeed = 0;
  p.pitch = 0;
  p.roll = 0;
}

// A soft terrain graze (flying into a ridge side) costs airframe instead of
// ending the flight outright, so a mistake is a decision, not just a death.
export function grazeDamage(p, amount) {
  p.damage = clamp(p.damage + amount, 0, 100);
  return p.damage >= 100 ? 'crash' : 'graze';
}

export { angleDiff };
