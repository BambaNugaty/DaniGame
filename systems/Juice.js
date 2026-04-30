// Juice.js — game-feel layer.
//   • Screen shake (Squirrel Eiserloh trauma model: shake = trauma², decays).
//   • Hit-stop: scales the gameplay dt to ~0 for a few frames on a kill so the
//     impact reads as weighty.
//   • Floating damage numbers as DOM divs anchored to world coords.
//   • Blood / sweat particles drawn directly to the view canvas after sprites.
//
// Reads CONST for tuning, listens on EVENTS for triggers, and exposes a small
// API for the game loop: update(dt), applyToCamera(rc), drawParticles(rc).
(function () {
  'use strict';

  const SHAKE_MAX_OFFSET = 0.12;     // tile units max camera offset
  const SHAKE_MAX_ROTATE = 0.04;     // radians max camera yaw jiggle
  const SHAKE_DECAY = 1.6;           // trauma units per second
  const HIT_STOP_KILL = 0.04;        // 40ms freeze on enemy kill
  const HIT_STOP_BOSS = 0.12;        // 120ms freeze on boss kill
  const HIT_STOP_HURT = 0.025;       // 25ms freeze on player damage taken

  const DAMAGE_NUMBER_MS = 700;
  const PARTICLE_GRAVITY = 1.6;      // tile units per s²
  const PARTICLE_DRAG = 1.2;
  const PARTICLE_BLOOD_COUNT = 6;
  const PARTICLE_KILL_BURST = 14;

  const state = {
    trauma: 0,
    timeScale: 1,
    timeScaleHoldT: 0,                // seconds remaining at current scale
    timeScaleTarget: 1,
    shakeSeed: Math.random() * 1000,
    particles: [],                    // {x,y,z,vx,vy,vz,life,maxLife,color,size}
    activeNumbers: 0,                 // for soft cap
  };

  let playfieldEl = null;
  let _rc = null;

  function init({ playfield, rc }) {
    playfieldEl = playfield;
    _rc = rc;
    if (!window.EVENTS) return;

    EVENTS.on('enemy:hit', onEnemyHit);
    EVENTS.on('enemy:killed', onEnemyKilled);
    EVENTS.on('boss:hit', onBossHit);
    EVENTS.on('boss:killed', onBossKilled);
    EVENTS.on('player:damaged', onPlayerDamaged);
    EVENTS.on('player:fired', onPlayerFired);
  }

  // ─── Event handlers ─────────────────────────────────────────────

  function onEnemyHit(p) {
    addTrauma(0.18);
    spawnDamageNumber(p.x, p.y, Math.round(p.dmg), '#ffd33a');
    spawnBlood(p.x, p.y, PARTICLE_BLOOD_COUNT, '#c11515');
  }
  function onEnemyKilled(p) {
    addTrauma(0.42);
    setHitStop(HIT_STOP_KILL);
    spawnBlood(p.x, p.y, PARTICLE_KILL_BURST, '#c11515');
    spawnBlood(p.x, p.y, 4, '#ff8a1f');
  }
  function onBossHit(p) {
    addTrauma(0.22);
    spawnDamageNumber(p.x, p.y, Math.round(p.dmg), '#ff8a1f');
    spawnBlood(p.x, p.y, PARTICLE_BLOOD_COUNT + 2, '#c11515');
  }
  function onBossKilled(p) {
    addTrauma(1.0);
    setHitStop(HIT_STOP_BOSS);
    spawnBlood(p.x, p.y, PARTICLE_KILL_BURST * 2, '#c11515');
    spawnBlood(p.x, p.y, 8, '#ffd33a');
  }
  function onPlayerDamaged(p) {
    addTrauma(0.45 + Math.min(0.4, p.amount / 80));
    setHitStop(HIT_STOP_HURT);
  }
  function onPlayerFired() {
    addTrauma(0.08);
  }

  // ─── Trauma (screen shake) ──────────────────────────────────────

  function addTrauma(amount) {
    state.trauma = Math.min(1, state.trauma + amount);
  }

  function applyToCamera(rc) {
    if (!rc || !rc.setCameraOffset) return;
    const t = state.trauma;
    if (t <= 0.001) { rc.setCameraOffset(0, 0, 0); return; }
    // shake = trauma². sample three independent noise streams.
    const k = t * t;
    const s = state.shakeSeed;
    const n1 = noise(s + 0);
    const n2 = noise(s + 41.7);
    const n3 = noise(s + 99.2);
    rc.setCameraOffset(
      n1 * SHAKE_MAX_OFFSET * k,
      n2 * SHAKE_MAX_OFFSET * k,
      n3 * SHAKE_MAX_ROTATE * k
    );
  }

  // smoothly varying [-1,1] from a seed; advanced each frame in update()
  function noise(seed) {
    return Math.sin(seed) * Math.cos(seed * 1.31) * 0.96;
  }

  // ─── Hit-stop ───────────────────────────────────────────────────

  function setHitStop(seconds, scale) {
    if (seconds > state.timeScaleHoldT) {
      state.timeScaleHoldT = seconds;
      state.timeScale = scale != null ? scale : 0.05;
    }
  }
  function getTimeScale() { return state.timeScale; }

  // ─── Damage numbers ─────────────────────────────────────────────

  function spawnDamageNumber(wx, wy, value, color) {
    if (!playfieldEl || !_rc || state.activeNumbers > 24) return;
    const sp = _rc.worldToScreen({ x: 0, y: 0, dir: 0 }, 0, 0); // fallback
    // we need the player to project — exposed via window.__GAME_PLAYER if game.js sets it.
    const player = window.__GAME_PLAYER;
    if (!player) return;
    const proj = _rc.worldToScreen(player, wx, wy);
    if (proj.behind) return;
    const el = document.createElement('div');
    el.className = 'dmg-number';
    el.textContent = String(value);
    el.style.cssText =
      `position:absolute;pointer-events:none;z-index:30;` +
      `font-family:'Press Start 2P',monospace;font-size:clamp(11px,1.4vw,18px);` +
      `color:${color};text-shadow:2px 2px 0 #000,0 0 6px rgba(0,0,0,0.9);` +
      `letter-spacing:1px;left:${(proj.x * 100).toFixed(2)}%;` +
      `top:${(proj.y * 0.78 * 100 - 4).toFixed(2)}%;` +
      `transform:translate(-50%,-50%);` +
      `transition:transform ${DAMAGE_NUMBER_MS}ms cubic-bezier(.2,.8,.2,1),opacity ${DAMAGE_NUMBER_MS}ms ease-out;` +
      `opacity:1;will-change:transform,opacity;`;
    playfieldEl.appendChild(el);
    state.activeNumbers++;
    // kick the float on next frame so the transition takes effect
    requestAnimationFrame(() => {
      const dx = (Math.random() - 0.5) * 30;
      el.style.transform = `translate(calc(-50% + ${dx}px),calc(-50% - 42px))`;
      el.style.opacity = '0';
    });
    setTimeout(() => {
      el.parentNode && el.parentNode.removeChild(el);
      state.activeNumbers--;
    }, DAMAGE_NUMBER_MS + 50);
  }

  // ─── Particles ──────────────────────────────────────────────────

  function spawnBlood(wx, wy, n, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.4 + Math.random() * 2.6;
      const vz = 1.6 + Math.random() * 2.4;
      state.particles.push({
        x: wx + (Math.random() - 0.5) * 0.1,
        y: wy + (Math.random() - 0.5) * 0.1,
        z: 0.3 + Math.random() * 0.5,         // height above ground
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        vz,
        life: 0.5 + Math.random() * 0.4,
        maxLife: 0.9,
        color,
        size: 2 + Math.floor(Math.random() * 3),
      });
    }
    if (state.particles.length > 400) state.particles.splice(0, state.particles.length - 400);
  }

  function updateParticles(dt) {
    const arr = state.particles;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) { arr.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vz -= PARTICLE_GRAVITY * dt;
      const drag = Math.max(0, 1 - PARTICLE_DRAG * dt);
      p.vx *= drag; p.vy *= drag;
      if (p.z < 0) { p.z = 0; p.vz = 0; p.vx *= 0.5; p.vy *= 0.5; }
    }
  }

  function drawParticles(rc, rawPlayer) {
    if (!rc || !state.particles.length) return;
    const ctx = rc.ctx;
    const o = rc.state.cameraOffset;
    const player = { x: rawPlayer.x + o.x, y: rawPlayer.y + o.y, dir: rawPlayer.dir + o.dir };
    const W = rc.state.W, H = rc.state.H;
    const fov = rc.state.fov;
    const dirX = Math.cos(player.dir), dirY = Math.sin(player.dir);
    const planeLen = Math.tan(fov / 2);
    const planeX = -dirY * planeLen, planeY = dirX * planeLen;
    const invDet = 1 / (planeX * dirY - dirX * planeY);

    for (const p of state.particles) {
      const sx = p.x - player.x, sy = p.y - player.y;
      const tx = invDet * (dirY * sx - dirX * sy);
      const ty = invDet * (-planeY * sx + planeX * sy);
      if (ty <= 0.05) continue;
      const screenX = (W / 2) * (1 + tx / ty);
      // height-from-floor → screen Y (anchored to floor at H/2 + offset)
      const baseY = H / 2 + Math.abs(Math.floor(H / ty)) * 0.5;
      const yPx = baseY - (p.z / ty) * (H / 2);
      const sizePx = Math.max(1, Math.floor(p.size / ty));
      const alpha = Math.max(0, p.life / p.maxLife);
      // z-test against zBuffer
      const colX = Math.max(0, Math.min(W - 1, Math.floor(screenX)));
      if (rc.state.zBuffer[colX] != null && ty >= rc.state.zBuffer[colX]) continue;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(Math.floor(screenX - sizePx / 2), Math.floor(yPx - sizePx / 2), sizePx, sizePx);
    }
    ctx.globalAlpha = 1;
  }

  // ─── Public update ──────────────────────────────────────────────

  function update(realDt) {
    // trauma decays in real time, not gameplay-scaled time, so the shake
    // smooths out even during hit-stop.
    state.trauma = Math.max(0, state.trauma - SHAKE_DECAY * realDt);
    state.shakeSeed += realDt * 80;

    // hit-stop timer ticks in real time
    if (state.timeScaleHoldT > 0) {
      state.timeScaleHoldT -= realDt;
      if (state.timeScaleHoldT <= 0) {
        state.timeScale = 1;
      }
    }

    // particles use gameplay dt (so they freeze with hit-stop)
    updateParticles(realDt * state.timeScale);
  }

  function reset() {
    state.trauma = 0;
    state.timeScale = 1;
    state.timeScaleHoldT = 0;
    state.particles.length = 0;
  }

  window.JUICE = {
    init, update, applyToCamera, drawParticles, getTimeScale, reset,
    addTrauma, setHitStop, spawnDamageNumber, spawnBlood,
  };
})();
