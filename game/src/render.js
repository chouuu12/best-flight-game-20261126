// Skyline Courier — renderer. One canvas, one dusk-valley style: a sky
// gradient with a low sun, three ridge layers, a patchwork valley floor
// with a river and runways drawn as perspective strips, golden rings
// hanging over the course, the courier plane in chase view, and a glass
// cockpit's worth of instruments on the HUD. Everything is drawn from the
// plane state and the seeded terrain, so the same state always draws the
// same frame.

import { PALETTE, FLIGHT, WORLD } from './config.js';
import {
  groundHeight, ridgeHeight, riverX, riverHalfWidth, fieldColourIndex,
  makeClouds, SUN,
} from './terrain.js';
import { clamp, lerp, degToRad, angleDiff, makeNoise1D } from './random.js';
import { objectiveText } from './missions.js';

// Ridge noise tables, shared by the two ridge layers.
const ridgeNoiseL = makeNoise1D(WORLD.seed + 201);
const ridgeNoiseR = makeNoise1D(WORLD.seed + 217);

const FIELD_COLOURS = [PALETTE.fieldA, PALETTE.fieldB, PALETTE.fieldC, PALETTE.fieldD];
const FOCAL = 380; // reference distance for the label-size scale factor

// Project a world point (ds ahead, lateral dx, height dy above the plane)
// to screen space. True perspective by slope: a point's screen offset is
// its offset over its distance times a focal length in pixels, so ground
// directly below the plane fills the bottom of the screen and the far
// ground meets the sky exactly at the horizon. Distance is clamped so a
// point at the camera never divides by zero.
const FOCAL_PX = 520;
function project(p, ds, dx, dy, W, H, horizonY) {
  const d = Math.max(ds, 24);
  return {
    x: W / 2 + (dx / d) * FOCAL_PX,
    y: horizonY - (dy / d) * FOCAL_PX,
    scale: FOCAL / (ds + FOCAL),
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.hudPanel;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(234, 246, 255, 0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function text(ctx, s, x, y, size, colour, align = 'left', weight = '600') {
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const clouds = makeClouds(26);

  function drawSky(W, H, horizonY, rollRad) {
    const g = ctx.createLinearGradient(0, 0, 0, horizonY + 4);
    g.addColorStop(0, PALETTE.skyTop);
    g.addColorStop(0.55, PALETTE.skyMid);
    g.addColorStop(1, PALETTE.skyLow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, horizonY + 4);
    // Sun: a low glow disc, fixed in the sky so the light never moves.
    const sunX = W * SUN.x;
    const sunY = H * SUN.y;
    const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 130);
    glow.addColorStop(0, PALETTE.sunGlow);
    glow.addColorStop(1, 'rgba(255, 214, 130, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 140, sunY - 140, 280, 280);
    ctx.fillStyle = PALETTE.sunCore;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawClouds(p, W, H, horizonY) {
    ctx.save();
    for (const c of clouds) {
      const ds = c.s - p.s;
      if (ds < 50 || ds > 6500) continue;
      const pos = project(p, ds, c.x - p.x, c.alt - p.alt, W, H, horizonY);
      if (pos.y > horizonY - 4) continue;
      const r = c.size * pos.scale * 0.9;
      if (r < 3) continue;
      ctx.globalAlpha = clamp(0.25 + pos.scale * 0.6, 0, 0.9);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, r, r * 0.36, 0, 0, Math.PI * 2);
      ctx.ellipse(pos.x - r * 0.55, pos.y + r * 0.08, r * 0.6, r * 0.28, 0, 0, Math.PI * 2);
      ctx.ellipse(pos.x + r * 0.55, pos.y + r * 0.08, r * 0.6, r * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // A ridge layer: a noisy skyline across the screen, parallaxed by heading.
  function drawRidge(p, W, H, horizonY, side, colour, parallax, amp, base) {
    const noise = side < 0 ? ridgeNoiseL : ridgeNoiseR;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(-4, horizonY + 2);
    for (let x = -4; x <= W + 4; x += 16) {
      const worldX = x * 0.004 + p.heading * parallax + (side < 0 ? 0 : 7.3);
      const h = base + noise(worldX) * amp;
      ctx.lineTo(x, horizonY - h);
    }
    ctx.lineTo(W + 4, horizonY + 2);
    ctx.closePath();
    ctx.fill();
  }

  function drawGround(p, W, H, horizonY, missionDef) {
    // Base fill first: the farthest strip sits a few pixels below the
    // horizon (perspective), and without this the gap shows the page's
    // dark background as a black band along the horizon.
    ctx.fillStyle = PALETTE.fieldA;
    ctx.fillRect(-W, horizonY, W * 3, H - horizonY + 4);
    // Perspective strips, far to near, each coloured by its field cell.
    // Stop once the strips are closer than the eye can separate: past
    // ~750 strips the loop would only burn frames for sub-pixel slices.
    const strips = [];
    let ds = 4200;
    while (ds > 6) {
      const next = ds * 0.8;
      strips.push([ds, Math.max(0, next)]);
      ds = next;
    }
    for (const [far, near] of strips) {
      const yFar = project(p, far, 0, -(p.alt - groundHeight(p.s + far)), W, H, horizonY).y;
      const yNear = project(p, near, 0, -(p.alt - groundHeight(p.s + near)), W, H, horizonY).y;
      if (Math.abs(yNear - yFar) < 0.5) continue;
      const mid = (far + near) / 2;
      // Split each strip into lateral field cells so the valley reads as
      // patchwork, not as flat horizontal bands.
      for (let lx = -1600; lx < 1600; lx += 200) {
        const idx = fieldColourIndex(p.s + mid, p.x + lx + 100);
        ctx.fillStyle = FIELD_COLOURS[idx];
        const aFar = project(p, far, lx - p.x, -(p.alt - groundHeight(p.s + far)), W, H, horizonY);
        const bFar = project(p, far, lx + 200 - p.x, -(p.alt - groundHeight(p.s + far)), W, H, horizonY);
        const aNear = project(p, near, lx - p.x, -(p.alt - groundHeight(p.s + near)), W, H, horizonY);
        const bNear = project(p, near, lx + 200 - p.x, -(p.alt - groundHeight(p.s + near)), W, H, horizonY);
        ctx.beginPath();
        ctx.moveTo(aFar.x, aFar.y);
        ctx.lineTo(bFar.x, bFar.y);
        ctx.lineTo(bNear.x, bNear.y);
        ctx.lineTo(aNear.x, aNear.y);
        ctx.closePath();
        ctx.fill();
      }
    }
    drawRiver(p, W, H, horizonY);
    for (const rw of missionDef.runways) drawRunway(p, W, H, horizonY, rw);
  }

  function drawRiver(p, W, H, horizonY) {
    ctx.fillStyle = PALETTE.river;
    ctx.beginPath();
    let started = false;
    for (let ds = 4200; ds >= 0; ds -= 120) {
      const cx = riverX(p.s + ds) - p.x;
      const half = riverHalfWidth(p.s + ds);
      const a = project(p, ds, cx - half, -(p.alt - groundHeight(p.s + ds)), W, H, horizonY);
      const b = project(p, ds, cx + half, -(p.alt - groundHeight(p.s + ds)), W, H, horizonY);
      if (a.y < horizonY) continue;
      if (!started) {
        ctx.moveTo(a.x, a.y);
        started = true;
      } else {
        ctx.lineTo(a.x, a.y);
      }
      void b;
    }
    // Right bank, back toward the camera.
    for (let ds = 0; ds <= 4200; ds += 120) {
      const cx = riverX(p.s + ds) - p.x;
      const half = riverHalfWidth(p.s + ds);
      const b = project(p, ds, cx + half, -(p.alt - groundHeight(p.s + ds)), W, H, horizonY);
      if (b.y < horizonY) continue;
      ctx.lineTo(b.x, b.y);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawRunway(p, W, H, horizonY, rw) {
    const s0 = rw.s - rw.len / 2;
    const s1 = rw.s + rw.len / 2;
    if (s1 < p.s - 50 || s0 > p.s + 4200) return;
    const halfW = 13;
    const pts = [];
    for (let ds = Math.max(0, s0 - p.s); ds <= s1 - p.s; ds += 60) {
      pts.push(ds);
    }
    if (pts.length < 2) return;
    // Asphalt.
    ctx.fillStyle = PALETTE.runway;
    ctx.beginPath();
    pts.forEach((ds, i) => {
      const a = project(p, ds, rw.x - p.x - halfW, -(p.alt - groundHeight(p.s + ds)), W, H, horizonY);
      if (i === 0) ctx.moveTo(a.x, a.y);
      else ctx.lineTo(a.x, a.y);
    });
    for (let i = pts.length - 1; i >= 0; i--) {
      const b = project(p, pts[i], rw.x - p.x + halfW, -(p.alt - groundHeight(p.s + pts[i])), W, H, horizonY);
      ctx.lineTo(b.x, b.y);
    }
    ctx.closePath();
    ctx.fill();
    // Lead-in line: a dashed centreline extension from the threshold
    // toward the pilot, so lining up on final is a matter of following
    // the line instead of guessing the strip's heading.
    if (s0 - p.s > 0 && s0 - p.s < 1800) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.setLineDash([18, 26]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      for (let ds = Math.max(0, s0 - p.s - 1400); ds <= s0 - p.s; ds += 60) {
        const c = project(p, ds, rw.x - p.x, -(p.alt - groundHeight(p.s + ds)) + 1.5, W, H, horizonY);
        if (!started) { ctx.moveTo(c.x, c.y); started = true; }
        else ctx.lineTo(c.x, c.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Centreline dashes and edge lines. Dashes closer than 40 m are
    // skipped: at that range their projected size explodes and they read
    // as bars across the screen instead of dashes.
    ctx.fillStyle = '#f5f5f5';
    for (let ds = Math.max(40, s0 - p.s); ds <= s1 - p.s; ds += 90) {
      const c = project(p, ds, rw.x - p.x, -(p.alt - groundHeight(p.s + ds)), W, H, horizonY);
      const w = Math.max(1.5, (1.2 / Math.max(ds, 24)) * FOCAL_PX);
      const h = Math.max(2, (6 / Math.max(ds, 24)) * FOCAL_PX);
      ctx.fillRect(c.x - w / 2, c.y - h / 2, w, h);
    }
    // Threshold bars at both ends.
    for (const end of [s0, s1]) {
      const ds = end - p.s;
      if (ds < 40 || ds > 4200) continue;
      const c = project(p, ds, rw.x - p.x, -(p.alt - groundHeight(p.s + ds)), W, H, horizonY);
      const half = (13 / Math.max(ds, 24)) * FOCAL_PX;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(c.x - half, c.y - 2, half * 2, 4);
    }
    // Name board, floating over the near threshold.
    const nearDs = Math.max(0, s0 - p.s);
    const label = project(p, nearDs, rw.x - p.x, -(p.alt - groundHeight(p.s + nearDs)) + 26, W, H, horizonY);
    if (label.y > horizonY + 10) {
      text(ctx, rw.name, label.x, label.y, Math.max(11, 15 * label.scale + 6), '#ffffff', 'center', '700');
    }
  }

  function drawRings(p, W, H, horizonY, ms) {
    const rings = ms.rings;
    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i];
      const ds = ring.s - p.s;
      if (ds < -30 || ds > 3600) continue;
      const pos = project(p, ds, ring.x - p.x, ring.alt - p.alt, W, H, horizonY);
      const r = Math.max(3, (ring.r / Math.max(ds, 24)) * FOCAL_PX * 0.95);
      const isNext = i === ms.nextRing && ms.status === 'flying';
      ctx.save();
      if (isNext) {
        const pulse = 1 + Math.sin(p.time * 5) * 0.06;
        ctx.shadowColor = PALETTE.ringGlow;
        ctx.shadowBlur = 26 * pulse;
      }
      ctx.strokeStyle = ring.passed ? PALETTE.ringDone : ring.missed ? '#8a8f96' : PALETTE.ringGold;
      ctx.lineWidth = Math.max(2, r * 0.22);
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, r, r * 0.92, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, r * 0.82, r * 0.75, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (isNext && ds > 40) {
        text(ctx, `${Math.round(ds)} m`, pos.x, pos.y - r - 18, 15, PALETTE.hudAccent, 'center', '700');
      }
    }
  }

  // The courier plane in chase view: seen from behind and slightly above,
  // banking with the roll, nose pointing up-screen toward the horizon.
  function drawPlane(p, W, H) {
    const cx = W / 2;
    const cy = H * 0.8;
    ctx.save();
    ctx.translate(cx, cy + p.pitch * 0.9);
    ctx.rotate(degToRad(p.roll) * 0.85);
    const S = 1.3; // overall scale
    ctx.scale(S, S);
    // Prop disc (nose, up-screen) with a soft blur.
    ctx.fillStyle = 'rgba(200, 225, 240, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, -58, 34, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2f36';
    ctx.beginPath();
    ctx.ellipse(0, -58, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tail fin and stabilisers.
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(-4, -34);
    ctx.lineTo(0, -58);
    ctx.lineTo(4, -34);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeWing;
    ctx.beginPath();
    ctx.moveTo(-34, -30);
    ctx.lineTo(34, -30);
    ctx.lineTo(30, -22);
    ctx.lineTo(-30, -22);
    ctx.closePath();
    ctx.fill();
    // Main wings, long and slightly swept, with tip lights.
    ctx.fillStyle = PALETTE.planeWing;
    ctx.beginPath();
    ctx.moveTo(-86, 6);
    ctx.quadraticCurveTo(-70, -6, -14, -2);
    ctx.lineTo(14, -2);
    ctx.quadraticCurveTo(70, -6, 86, 6);
    ctx.quadraticCurveTo(60, 12, 12, 10);
    ctx.lineTo(-12, 10);
    ctx.quadraticCurveTo(-60, 12, -86, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(-86, 6, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#35d461';
    ctx.beginPath();
    ctx.arc(86, 6, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // Fuselage: tapered body, orange with a white cheatline, glass canopy.
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(-13, 34);
    ctx.quadraticCurveTo(-15, -20, -7, -44);
    ctx.lineTo(7, -44);
    ctx.quadraticCurveTo(15, -20, 13, 34);
    ctx.quadraticCurveTo(0, 40, -13, 34);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4f1e8';
    ctx.fillRect(-13, 8, 26, 5);
    ctx.fillStyle = PALETTE.planeGlass;
    ctx.beginPath();
    ctx.ellipse(0, -26, 8, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(-2.5, -30, 2.5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCompass(p, W) {
    const cx = W / 2;
    const y = 26;
    panel(ctx, cx - 210, 10, 420, 44);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - 210, 10, 420, 44);
    ctx.clip();
    for (let d = -90; d <= 90; d += 5) {
      const hdg = (Math.round(p.heading / 5) * 5 + d + 360) % 360;
      const x = cx + d * 2.1;
      const major = hdg % 30 === 0;
      ctx.strokeStyle = major ? '#eaf6ff' : 'rgba(234,246,255,0.45)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y + 16);
      ctx.lineTo(x, y + (major ? 2 : 8));
      ctx.stroke();
      if (major) {
        const label = hdg === 0 ? 'N' : hdg === 90 ? 'E' : hdg === 180 ? 'S' : hdg === 270 ? 'W' : String(hdg).padStart(3, '0');
        text(ctx, label, x, y + 30, 12, '#eaf6ff', 'center', '700');
      }
    }
    ctx.restore();
    // Centre caret and current heading.
    ctx.fillStyle = PALETTE.hudAccent;
    ctx.beginPath();
    ctx.moveTo(cx - 7, 12);
    ctx.lineTo(cx + 7, 12);
    ctx.lineTo(cx, 22);
    ctx.closePath();
    ctx.fill();
    text(ctx, `HDG ${String(Math.round(p.heading)).padStart(3, '0')}°`, cx, 74, 15, PALETTE.hudAccent, 'center', '700');
  }

  function drawFlightInstruments(p, W, H, ms) {
    // Top-left: altitude, speed, vertical speed.
    panel(ctx, 16, 10, 210, 108);
    text(ctx, 'ALTITUDE', 30, 32, 11, '#9fb6c8', 'left', '700');
    text(ctx, `${Math.round(p.alt)} m`, 30, 62, 26, PALETTE.hudText, 'left', '700');
    text(ctx, `${Math.round(p.alt * 3.28084)} ft`, 150, 62, 13, '#9fb6c8', 'left');
    text(ctx, 'SPEED', 30, 88, 11, '#9fb6c8', 'left', '700');
    text(ctx, `${Math.round(p.speed)} kt`, 30, 112, 22, PALETTE.hudText, 'left', '700');
    const vsi = p.verticalSpeed;
    text(ctx, `VSI ${vsi >= 0 ? '+' : ''}${vsi.toFixed(1)} m/s`, 140, 108, 12, vsi < -3 ? PALETTE.hudWarn : '#9fb6c8', 'left');

    // Top-right: score, time, fuel, damage, objective.
    panel(ctx, W - 246, 10, 230, 108);
    text(ctx, 'SCORE', W - 232, 32, 11, '#9fb6c8', 'left', '700');
    text(ctx, String(ms.score), W - 232, 62, 26, PALETTE.hudAccent, 'left', '700');
    text(ctx, `TIME ${Math.floor(p.time / 60)}:${String(Math.floor(p.time % 60)).padStart(2, '0')}`, W - 120, 62, 13, '#9fb6c8', 'left');
    // Fuel bar.
    text(ctx, 'FUEL', W - 232, 88, 11, '#9fb6c8', 'left', '700');
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(ctx, W - 190, 76, 120, 12, 6);
    ctx.fill();
    ctx.fillStyle = p.fuel < 20 ? PALETTE.hudWarn : p.fuel < 45 ? PALETTE.hudAccent : PALETTE.hudGood;
    if (p.fuel > 0.5) {
      roundRect(ctx, W - 190, 76, 120 * clamp(p.fuel / 100, 0, 1), 12, 6);
      ctx.fill();
    }
    text(ctx, `${Math.round(p.fuel)}%`, W - 62, 88, 12, PALETTE.hudText, 'left', '700');
    // Damage bar.
    text(ctx, 'DMG', W - 232, 108, 11, '#9fb6c8', 'left', '700');
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(ctx, W - 190, 96, 120, 12, 6);
    ctx.fill();
    ctx.fillStyle = p.damage > 60 ? PALETTE.hudWarn : PALETTE.hudAccent;
    if (p.damage > 0.5) {
      roundRect(ctx, W - 190, 96, 120 * clamp(p.damage / 100, 0, 1), 12, 6);
      ctx.fill();
    }
    text(ctx, `${Math.round(p.damage)}%`, W - 62, 108, 12, PALETTE.hudText, 'left', '700');

    // Objective line under the compass.
    text(ctx, objectiveText(ms), W / 2, 100, 14, '#ffffff', 'center', '600');

    // Bottom-left: throttle lever.
    panel(ctx, 16, H - 150, 64, 134);
    text(ctx, 'THR', 48, H - 128, 11, '#9fb6c8', 'center', '700');
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(ctx, 40, H - 118, 16, 84, 8);
    ctx.fill();
    const thrH = 84 * clamp(p.throttle, 0, 1);
    ctx.fillStyle = p.engineOut ? PALETTE.hudWarn : PALETTE.hudAccent;
    roundRect(ctx, 40, H - 34 - thrH, 16, thrH, 8);
    ctx.fill();
    text(ctx, `${Math.round(p.throttle * 100)}%`, 48, H - 22, 12, PALETTE.hudText, 'center', '700');

    drawAttitude(p, W, H);

    // Warnings, centre screen.
    const warnings = [];
    if (p.stalled) warnings.push('STALL — NOSE DOWN, FULL THROTTLE');
    if (p.fuel > 0 && p.fuel < 15) warnings.push('LOW FUEL');
    if (p.engineOut) warnings.push('ENGINE OUT — GLIDE TO THE RUNWAY');
    const ground = groundHeight(p.s);
    if (p.alt - ground < 60 && !p.grounded) warnings.push('TERRAIN — PULL UP');
    if (warnings.length) {
      const blink = Math.sin(p.time * 8) > -0.2;
      if (blink) {
        warnings.forEach((w, i) => {
          text(ctx, w, W / 2, 150 + i * 24, 17, PALETTE.hudWarn, 'center', '800');
        });
      }
    }

    // Mission message banner.
    if (ms.messageTime > 0) {
      ctx.globalAlpha = clamp(ms.messageTime, 0, 1);
      panel(ctx, W / 2 - 260, 196, 520, 40);
      text(ctx, ms.message, W / 2, 222, 16, PALETTE.hudAccent, 'center', '700');
      ctx.globalAlpha = 1;
    }
  }

  // Artificial horizon: a round gauge, sky above the line, ground below,
  // rotating with bank and sliding with pitch — the instrument a pilot
  // actually flies by when the horizon outside is hard to read.
  function drawAttitude(p, W, H) {
    const cx = W - 96;
    const cy = H - 96;
    const r = 62;
    ctx.save();
    panel(ctx, cx - r - 14, cy - r - 26, r * 2 + 28, r * 2 + 48);
    text(ctx, 'ATTITUDE', cx, cy - r - 8, 11, '#9fb6c8', 'center', '700');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(degToRad(-p.roll));
    const pitchPx = clamp(p.pitch, -30, 30) * 1.6;
    ctx.fillStyle = '#5fa8d3';
    ctx.fillRect(-r - 2, -r - 2 - pitchPx, r * 2 + 4, r + 2 + pitchPx);
    ctx.fillStyle = '#8a6b46';
    ctx.fillRect(-r - 2, pitchPx, r * 2 + 4, r + 2 - pitchPx + 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, pitchPx);
    ctx.lineTo(r, pitchPx);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    for (const d of [-20, -10, 10, 20]) {
      const y = pitchPx - d * 1.6;
      ctx.beginPath();
      ctx.moveTo(-18, y);
      ctx.lineTo(18, y);
      ctx.stroke();
    }
    ctx.restore();
    // Fixed wings symbol on top of the rotating gauge.
    ctx.strokeStyle = PALETTE.hudAccent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 26, cy);
    ctx.lineTo(cx - 8, cy);
    ctx.moveTo(cx + 8, cy);
    ctx.lineTo(cx + 26, cy);
    ctx.stroke();
    ctx.fillStyle = PALETTE.hudAccent;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(234,246,255,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawScene(state) {
    const { p, ms, W, H, time } = state;
    const rollRad = degToRad(p.roll);
    const horizonY = H * 0.44 + p.pitch * 5;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    // Roll the whole world around the horizon centre; the plane stays level
    // on screen because it banks the other way in drawPlane.
    ctx.translate(W / 2, horizonY);
    ctx.rotate(rollRad * 0.55);
    ctx.translate(-W / 2, -horizonY);
    drawSky(W, H, horizonY, rollRad);
    drawClouds(p, W, H, horizonY);
    drawRidge(p, W, H, horizonY, -1, PALETTE.ridgeFar, 0.02, 120, 60);
    drawRidge(p, W, H, horizonY, 1, PALETTE.ridgeMid, 0.045, 90, 26);
    drawGround(p, W, H, horizonY, ms.def);
    drawRings(p, W, H, horizonY, ms);
    ctx.restore();
    drawPlane(p, W, H);
    void time;
  }

  function render(state) {
    const { W, H } = state;
    // Size the backing store once: resetting canvas.width every frame
    // reallocates it and clears the canvas, which churns memory hard
    // when requestAnimationFrame runs unthrottled (headless screenshots).
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    drawScene(state);
    if (state.mode === 'fly' || state.mode === 'paused') {
      drawCompass(state.p, W);
      drawFlightInstruments(state.p, W, H, state.ms);
      if (state.mode === 'paused') {
        ctx.fillStyle = 'rgba(8, 20, 32, 0.55)';
        ctx.fillRect(0, 0, W, H);
        text(ctx, 'PAUSED', W / 2, H / 2 - 10, 44, '#ffffff', 'center', '800');
        text(ctx, 'P — resume    R — restart    M — mute', W / 2, H / 2 + 30, 16, '#cfe3f2', 'center');
      }
    }
  }

  return { render, drawScene, drawCompass, drawFlightInstruments, ctx };
}
