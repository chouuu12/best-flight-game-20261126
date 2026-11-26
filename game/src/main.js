// Skyline Courier — main loop and game states. The canvas is fixed at
// 1280x720 and scaled by CSS; the loop runs on a fixed 1/60 s step so the
// flight model is deterministic, and rendering follows the state machine:
//
//   title -> briefing -> fly <-> paused -> debrief (complete / crashed)
//
// A `?shot=N` URL parameter freezes the game into one of four staged scenes
// for screenshots: the title, a ring run, a final approach, and the
// debrief. Shot mode never advances the simulation, so a screenshot taken
// twice shows the same frame.

import { GAME_TITLE, GAME_TAGLINE, MISSIONS, PALETTE } from './config.js';
import { createPlane, stepPlane, grazeDamage } from './physics.js';
import { createMissionState, stepMission, crashMission, objectiveText } from './missions.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { groundHeight } from './terrain.js';

const canvas = document.getElementById('game');
const W = 1280;
const H = 720;
const FIXED_DT = 1 / 60;

const renderer = createRenderer(canvas);
const audio = createAudio();
const { input, poll, takeClick, takePress } = createInput(canvas);

const game = {
  mode: 'title', // title | briefing | fly | paused | debrief
  missionIndex: 0,
  plane: null,
  ms: null,
  shot: null,
  frozen: false,
  attractTime: 0,
  debriefStats: null,
};

function startMission(index) {
  const def = MISSIONS[index];
  game.missionIndex = index;
  game.plane = createPlane(def);
  game.ms = createMissionState(def);
  game.mode = 'briefing';
  audio.ensure();
  audio.click();
}

function beginFlight() {
  game.mode = 'fly';
  audio.ensure();
  audio.click();
}

function toDebrief() {
  game.mode = 'debrief';
  const p = game.plane;
  const ms = game.ms;
  game.debriefStats = {
    score: ms.score,
    rings: `${ms.ringsHit}/${ms.rings.length}`,
    landings: ms.landings,
    time: p.time,
    fuel: Math.max(0, Math.round(p.fuel)),
    damage: Math.round(p.damage),
    status: ms.status,
  };
}

// --- staged scenes for screenshots (?shot=1..4) -----------------------------
function applyShot(n) {
  game.shot = n;
  game.frozen = true;
  if (n === 1) {
    // Title screen over the valley, plane cruising in the attract scene.
    startMission(0);
    game.mode = 'title';
    game.plane.s = 2400;
    game.plane.alt = 380;
    game.plane.speed = 130;
    game.plane.roll = 0;
    return;
  }
  if (n === 2) {
    // Mid-flight ring run: two rings and the airfield ahead, HUD lit.
    startMission(0);
    game.mode = 'fly';
    game.plane.s = 3560;
    game.plane.x = 30;
    game.plane.alt = 340;
    game.plane.speed = 148;
    game.plane.heading = 4;
    game.plane.roll = 9;
    game.plane.throttle = 0.82;
    game.plane.time = 42;
    game.ms.rings[0].passed = true;
    game.ms.rings[1].passed = true;
    game.ms.rings[2].passed = true;
    game.ms.ringsHit = 3;
    game.ms.nextRing = 3;
    game.ms.score = 325;
    game.ms.message = 'RING 3 — CLEAN +125';
    game.ms.messageTime = 999;
    return;
  }
  if (n === 3) {
    // Final approach: low over the runway, gear-down slow flight.
    startMission(0);
    game.mode = 'fly';
    // Final approach: low over the runway, gear-down slow flight. The
    // altitude is set above the actual ground at this point of the valley,
    // never an absolute number, so the camera is never under the terrain.
    game.plane.s = 8300;
    game.plane.x = 4;
    game.plane.alt = groundHeight(8300) + 60;
    game.plane.speed = 82;
    game.plane.heading = 0;
    game.plane.roll = -3;
    game.plane.pitch = -4;
    game.plane.throttle = 0.38;
    game.plane.time = 96;
    game.plane.verticalSpeed = -2.4;
    game.ms.rings.forEach((r) => { r.passed = true; });
    game.ms.ringsHit = 8;
    game.ms.nextRing = 8;
    game.ms.score = 925;
    game.ms.message = 'ALL RINGS — land at MARA AIRFIELD';
    game.ms.messageTime = 999;
    return;
  }
  // Shot 4: the debrief after a completed ring run — score, stats, the
  // valley and Mara Airfield ahead behind the panel. The plane is staged
  // in a gentle climb-out over the airfield, not parked on the strip: at
  // ground level the runway's near edge fills the frame and reads as a
  // dark wedge instead of a runway.
  startMission(0);
  game.mode = 'fly';
  game.plane.s = 7900;
  game.plane.x = 0;
  game.plane.alt = groundHeight(7900) + 220;
  game.plane.speed = 110;
  game.plane.heading = 0;
  game.plane.roll = 5;
  game.plane.throttle = 0.6;
  game.plane.time = 118;
  game.plane.fuel = 61;
  game.ms.rings.forEach((r) => { r.passed = true; });
  game.ms.ringsHit = 8;
  game.ms.nextRing = 8;
  game.ms.landings = 1;
  game.ms.runways[0].landed = true;
  game.ms.score = 2475;
  game.ms.status = 'complete';
  game.ms.finishTime = 118;
  toDebrief();
}

// --- menus ------------------------------------------------------------------
function drawTitle(ctx) {
  const def = MISSIONS[game.missionIndex];
  ctx.fillStyle = 'rgba(8, 20, 32, 0.35)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 64px system-ui, sans-serif';
  ctx.fillText(GAME_TITLE, W / 2, 150);
  ctx.fillStyle = PALETTE.hudAccent;
  ctx.font = '600 20px system-ui, sans-serif';
  ctx.fillText(GAME_TAGLINE, W / 2, 184);
  ctx.fillStyle = '#cfe3f2';
  ctx.font = '400 15px system-ui, sans-serif';
  ctx.fillText('Keyboard + mouse — arrows or WASD fly, W/S throttle, mouse steers, wheel throttles', W / 2, 216);

  // Mission cards.
  MISSIONS.forEach((m, i) => {
    const x = 190 + i * 310;
    const y = 250;
    const w = 280;
    const h = 150;
    ctx.fillStyle = i === game.missionIndex ? 'rgba(255, 209, 102, 0.92)' : 'rgba(8, 20, 32, 0.78)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = i === game.missionIndex ? '#ffffff' : 'rgba(234,246,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    const fg = i === game.missionIndex ? '#1a2a3a' : '#eaf6ff';
    const sub = i === game.missionIndex ? '#4a5a6a' : '#9fb6c8';
    ctx.fillStyle = fg;
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.fillText(`${i + 1}. ${m.name}`, W / 2 + (x + w / 2 - W / 2), y + 40);
    ctx.fillStyle = sub;
    ctx.font = '400 14px system-ui, sans-serif';
    wrapText(ctx, m.short, x + w / 2, y + 68, w - 28, 20);
    ctx.fillStyle = sub;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(m.goal === 'landings' ? '3 LANDINGS' : `${m.rings.length} RINGS`, x + w / 2, y + 128);
  });

  ctx.fillStyle = '#eaf6ff';
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillText('Click a mission or press 1 / 2 / 3', W / 2, 448);
  ctx.fillStyle = '#9fb6c8';
  ctx.font = '400 13px system-ui, sans-serif';
  ctx.fillText('Fly the valley, thread the rings, and bring her home. Fuel and airframe are finite — fly like it.', W / 2, 478);
}

function wrapText(ctx, s, cx, y, maxW, lineH) {
  const words = s.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, yy);
      line = word;
      yy += lineH;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, cx, yy);
}

function drawBriefing(ctx) {
  const m = MISSIONS[game.missionIndex];
  ctx.fillStyle = 'rgba(8, 20, 32, 0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.hudAccent;
  ctx.font = '800 40px system-ui, sans-serif';
  ctx.fillText(m.name, W / 2, 190);
  ctx.fillStyle = '#eaf6ff';
  ctx.font = '400 18px system-ui, sans-serif';
  wrapText(ctx, m.briefing, W / 2, 240, 760, 28);
  ctx.fillStyle = '#9fb6c8';
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.fillText(`Rings: ${m.rings.length}    Runways: ${m.runways.map((r) => r.name).join(' · ')}    Fuel: ${m.fuel}%`, W / 2, 360);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 20px system-ui, sans-serif';
  ctx.fillText('CLICK OR PRESS ENTER TO FLY', W / 2, 440);
  ctx.fillStyle = '#9fb6c8';
  ctx.font = '400 14px system-ui, sans-serif';
  ctx.fillText('↑↓ pitch    ←→ bank    W/S throttle    Space brake    P pause    M mute', W / 2, 474);
}

function drawDebrief(ctx) {
  const s = game.debriefStats;
  const done = s.status === 'complete';
  ctx.fillStyle = 'rgba(8, 20, 32, 0.62)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = done ? PALETTE.hudGood : PALETTE.hudWarn;
  ctx.font = '800 44px system-ui, sans-serif';
  ctx.fillText(done ? 'MISSION COMPLETE' : 'AIRCRAFT LOST', W / 2, 170);
  ctx.fillStyle = PALETTE.hudAccent;
  ctx.font = '800 30px system-ui, sans-serif';
  ctx.fillText(`SCORE  ${s.score}`, W / 2, 220);
  const rows = [
    [`Rings threaded`, s.rings],
    [`Landings`, String(s.landings)],
    [`Time flown`, `${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}`],
    [`Fuel remaining`, `${s.fuel}%`],
    [`Airframe damage`, `${s.damage}%`],
  ];
  ctx.font = '400 17px system-ui, sans-serif';
  rows.forEach(([label, value], i) => {
    const y = 268 + i * 32;
    ctx.fillStyle = '#9fb6c8';
    ctx.textAlign = 'right';
    ctx.fillText(label, W / 2 - 10, y);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(value, W / 2 + 10, y);
  });
  ctx.textAlign = 'center';
  ctx.fillStyle = '#eaf6ff';
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillText('R — fly again      1/2/3 — another mission      T — title screen', W / 2, 470);
}

// --- per-frame update --------------------------------------------------------
function update() {
  const click = takeClick();
  const p = game.plane;
  const ms = game.ms;

  if (takePress('mutePressed')) {
    const muted = audio.toggleMute();
    if (ms) ms.message = muted ? 'SOUND OFF' : 'SOUND ON';
    if (ms) ms.messageTime = 1.5;
  }

  if (game.mode === 'title') {
    const pressed = takePress('missionPressed');
    if (pressed !== false && pressed !== undefined && pressed >= 0) {
      startMission(pressed);
      return;
    }
    if (click) {
      MISSIONS.forEach((m, i) => {
        const x = 190 + i * 310;
        if (click.x >= x && click.x <= x + 280 && click.y >= 250 && click.y <= 400) {
          startMission(i);
        }
      });
    }
    // Attract scene: the plane cruises the valley behind the title.
    if (p && !game.frozen) {
      game.attractTime += FIXED_DT;
      p.s += 40 * FIXED_DT;
      if (p.s > 7000) p.s = 0;
      p.roll = Math.sin(game.attractTime * 0.3) * 8;
    }
    return;
  }

  if (game.mode === 'briefing') {
    if (click || takePress('confirmPressed')) beginFlight();
    return;
  }

  if (game.mode === 'paused') {
    if (takePress('pausePressed')) game.mode = 'fly';
    if (takePress('restartPressed')) startMission(game.missionIndex);
    return;
  }

  if (game.mode === 'debrief') {
    if (takePress('restartPressed')) startMission(game.missionIndex);
    const pressed = takePress('missionPressed');
    if (pressed !== false && pressed !== undefined && pressed >= 0) startMission(pressed);
    if (takePress('confirmPressed')) game.mode = 'title';
    return;
  }

  // mode === 'fly'
  if (takePress('pausePressed')) {
    game.mode = 'paused';
    return;
  }
  if (takePress('restartPressed')) {
    startMission(game.missionIndex);
    return;
  }
  if (game.frozen) return;

  const stick = poll();
  const event = stepPlane(p, stick, game.ms.def.wind, FIXED_DT, game.ms.def.runways);
  if (event === 'crash') {
    crashMission(ms, p, 'Terrain — the valley floor is solid');
    audio.crash();
    toDebrief();
    return;
  }
  // 'touchdown' means the plane met the ground on a strip at a survivable
  // speed: the mission module judges it below (landed, hard, or a
  // go-around), so the flight simply continues into stepMission.

  // Ridge graze: flying into a ridge side costs airframe, not the flight.
  const ground = groundHeight(p.s);
  if (p.alt - ground < 26 && p.speed > 90) {
    if (grazeDamage(p, 0.4) === 'crash') {
      crashMission(ms, p, 'Airframe gave out after the ridge graze');
      audio.crash();
      toDebrief();
      return;
    }
  }

  const mev = stepMission(ms, p, FIXED_DT);
  if (mev === 'ring') audio.ring();
  if (mev === 'landed') audio.thud();
  if (mev === 'complete') {
    audio.ring();
    toDebrief();
    return;
  }
  if (mev === 'crashed') {
    audio.crash();
    toDebrief();
    return;
  }
  if (p.stalled && Math.floor(p.time * 2) !== Math.floor((p.time - FIXED_DT) * 2)) {
    audio.alarm();
  }
  audio.update(p);
}

function frame() {
  update();
  const state = {
    p: game.plane,
    ms: game.ms,
    W,
    H,
    time: game.plane ? game.plane.time : 0,
    mode: game.mode,
  };
  renderer.render(state);
  const ctx = renderer.ctx;
  if (game.mode === 'title') drawTitle(ctx);
  if (game.mode === 'briefing') drawBriefing(ctx);
  if (game.mode === 'debrief') drawDebrief(ctx);
  requestAnimationFrame(frame);
}

// --- boot --------------------------------------------------------------------
(function boot() {
  // The page carries a plain-text controls hint for no-JS browsers; the
  // canvas HUD explains the controls in-game, so hide the hint once the
  // game boots to keep the frame clean for screenshots.
  const fallback = document.getElementById('fallback');
  if (fallback) fallback.style.display = 'none';
  const params = new URLSearchParams(window.location.search);
  const shot = Number(params.get('shot') || 0);
  startMission(0);
  game.mode = 'title';
  if (shot >= 1 && shot <= 4) applyShot(shot);
  requestAnimationFrame(frame);
})();
