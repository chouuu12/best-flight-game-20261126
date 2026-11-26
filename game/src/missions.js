// Skyline Courier — missions. A mission is a list of rings to thread and
// runways to land on, in order, with a score that rewards clean flying:
// rings for accuracy, landings for gentleness, and a time bonus for pace.
// The module owns the objective text the HUD shows, so the renderer never
// has to know what "done" means for each mission type.

import { SCORE, FLIGHT } from './config.js';
import { tryLand } from './physics.js';
import { groundHeight } from './terrain.js';

export function createMissionState(mission) {
  return {
    def: mission,
    rings: mission.rings.map((r) => ({ ...r, passed: false, missed: false })),
    runways: mission.runways.map((r) => ({ ...r, landed: false })),
    nextRing: 0,
    nextRunway: 0,
    score: 0,
    ringsHit: 0,
    landings: 0,
    status: 'flying', // flying | complete | crashed | out-of-fuel
    message: '',
    messageTime: 0,
    finishTime: 0,
    bestLandingSink: null,
  };
}

export function objectiveText(ms) {
  const m = ms.def;
  if (ms.status === 'complete') return 'MISSION COMPLETE — well flown!';
  if (ms.status === 'crashed') return 'AIRCRAFT LOST — press R to fly again';
  if (m.goal === 'rings') {
    return `Rings ${ms.ringsHit}/${ms.rings.length} — then land at ${m.runways[0].name}`;
  }
  if (m.goal === 'landings') {
    return `Landings ${ms.landings}/${ms.runways.length} — next: ${ms.runways[ms.nextRunway]?.name ?? 'done'}`;
  }
  return `Rings ${ms.ringsHit}/${ms.rings.length} — deliver to ${m.runways[0].name}`;
}

// Distance from the plane to a ring centre, in metres, across and up.
export function ringDistance(p, ring) {
  const dx = p.x - ring.x;
  const dy = p.alt - ring.alt;
  return Math.hypot(dx, dy);
}

// Advance the mission one step. Returns an event for the main loop:
// 'ring', 'landed', 'complete', 'crashed', 'fuel-out' or null.
export function stepMission(ms, p, dt) {
  ms.messageTime = Math.max(0, ms.messageTime - dt);

  // --- rings: the next ring in order ---------------------------------------
  const ring = ms.rings[ms.nextRing];
  if (ring && ms.status === 'flying') {
    const ds = ring.s - p.s;
    if (ds < -20 && !ring.passed) {
      ring.missed = true;
      ms.nextRing++;
      setMessage(ms, `MISSED RING ${ms.nextRing} — keep flying`);
    } else if (Math.abs(ds) < 18) {
      const d = ringDistance(p, ring);
      if (d < (ring.r ?? FLIGHT.ringRadius)) {
        ring.passed = true;
        ms.ringsHit++;
        ms.nextRing++;
        const fast = p.speed > 130;
        const bonus = fast ? SCORE.ringTimeBonus : 0;
        ms.score += SCORE.ring + bonus;
        setMessage(
          ms,
          bonus > 0 ? `RING ${ms.ringsHit} — CLEAN +${SCORE.ring + bonus}` : `RING ${ms.ringsHit} +${SCORE.ring}`,
        );
        return 'ring';
      }
    }
  }

  // --- runways: landing is checked while low and slow over a strip --------
  const runway = ms.runways[ms.nextRunway];
  if (runway && ms.status === 'flying' && p.alt - groundHeight(p.s) < 60) {
    const result = tryLand(p, runway);
    if (result === 'landed' || result === 'landed-hard') {
      runway.landed = true;
      ms.landings++;
      ms.nextRunway++;
      const sink = -p.verticalSpeed;
      const centred = Math.abs(p.x - runway.x) < 6;
      const smooth = sink < 1.6 && centred && result === 'landed';
      const gained = SCORE.landing + (smooth ? SCORE.landingSmoothBonus : 0);
      ms.score += gained;
      ms.bestLandingSink = ms.bestLandingSink === null ? sink : Math.min(ms.bestLandingSink, sink);
      setMessage(
        ms,
        result === 'landed-hard'
          ? `HARD TOUCHDOWN +${gained} — airframe took a knock`
          : smooth ? `TOUCHDOWN — SMOOTH +${gained}` : `TOUCHDOWN +${gained}`,
      );
      if (ms.def.goal === 'landings' && ms.nextRunway >= ms.runways.length) {
        return finishMission(ms, p, 'complete');
      }
      if (ms.def.goal !== 'landings') {
        return finishMission(ms, p, 'complete');
      }
      // Island hop: take off again from this strip.
      p.grounded = false;
      p.onRunway = null;
      p.alt += 2;
      p.speed = Math.max(p.speed, 70);
      p.throttle = 0.75;
      return 'landed';
    }
    if (result === 'crash') {
      return crashMission(ms, p, 'Too hard on the runway');
    }
  }

  // --- fuel: empty tanks mean a glide to wherever the ground is -----------
  if (p.fuel <= 0 && p.engineOut && ms.status === 'flying') {
    setMessage(ms, 'FUEL EMPTY — gliding, find the runway!');
  }

  // --- rings done but no landing yet: the runway is the finish ------------
  if (ms.def.goal !== 'landings' && ms.nextRing >= ms.rings.length && ms.status === 'flying') {
    setMessage(ms, `ALL RINGS — land at ${ms.def.runways[0].name}`, true);
  }
  return null;
}

function finishMission(ms, p, status) {
  ms.status = status;
  ms.finishTime = p.time;
  const timeBonus = Math.max(0, Math.round(600 - p.time)) * 2;
  ms.score += SCORE.missionComplete + timeBonus;
  setMessage(ms, `MISSION COMPLETE +${SCORE.missionComplete}  TIME BONUS +${timeBonus}`);
  return 'complete';
}

export function crashMission(ms, p, why) {
  if (ms.status !== 'flying') return 'crashed';
  ms.status = 'crashed';
  ms.finishTime = p.time;
  setMessage(ms, `CRASH — ${why}`);
  return 'crashed';
}

function setMessage(ms, text, sticky = false) {
  ms.message = text;
  ms.messageTime = sticky ? 999 : 3.2;
}
