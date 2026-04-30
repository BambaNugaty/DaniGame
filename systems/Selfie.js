// Selfie.js — boss-kill cinematic. The camera takes over, orbits the fallen
// boss, snaps a photo, and slides a polaroid keepsake into the corner. The
// snapshot is persisted to localStorage so the title-screen "PHOTO BOOK"
// gallery can show every selfie the player has taken.
//
// Flow:
//   boss:killed → ORBIT (camera circles boss for ~2.6s, slight slow-mo)
//   → FLASH (white flash + shutter SFX, frame is captured)
//   → POLAROID (paper slides in, rests for ~2s, slides out)
//   → DONE (player coords restored, cinematic flag lifted)
(function () {
  'use strict';

  const RADIUS = 2.1;               // try this first; we shrink if cramped
  const RADIUS_MIN = 1.05;          // floor; tighter and the boss fills the frame
  const ORBIT_DURATION = 2.6;       // seconds
  const FLASH_DURATION = 0.18;
  const POLAROID_HOLD = 2.0;
  const POLAROID_FADE = 0.4;
  const SLOWMO_SCALE = 0.35;
  const STORAGE_KEY = 'dani_selfies';
  const STORAGE_LIMIT = 30;
  const SCAN_ANGLES = 32;           // how many directions to probe for a clear view
  const LOS_STEP = 0.12;            // sample density for line-of-sight check

  // S = state. PHASE: 0=idle, 1=orbit, 2=flash, 3=polaroid_in, 4=polaroid_hold, 5=polaroid_out
  const S = {
    phase: 0,
    t: 0,
    startAngle: 0,
    sweep: 5.4,                     // how far around the boss we orbit (radians)
    radius: RADIUS,                 // current valid orbit radius (set per-run)
    target: null,                   // saved boss snapshot {x,y,name}
    saved: null,                    // {x,y,dir} of player to restore
    flashEl: null,
    polaroidEl: null,
    captureCanvas: null,
    captureCount: 0,
    bossName: 'PALLET WIELDER',
    cleanupSlowmo: null,
  };

  let _playfield, _view, _rc, _player, _state, _daniSprite;

  function init({ playfield, view, rc, player, state }) {
    _playfield = playfield; _view = view; _rc = rc; _player = player; _state = state;
    // The title-dani canvas is already populated by game.js init() with the
    // crowned Dani portrait. We composite from it onto every polaroid.
    _daniSprite = document.getElementById('title-dani');

    if (window.EVENTS) {
      EVENTS.on('boss:killed', onBossKilled);
    }
    S.captureCount = getGallery().length;
  }

  function isActive() { return S.phase !== 0; }

  function onBossKilled(p) {
    if (S.phase !== 0) return;
    // Start IMMEDIATELY (no setTimeout). The previous 140ms delay let the
    // JUICE hit-stop play out, but it also let the dropped coins flash on
    // screen for those 140ms. Now we lock the cinematic gate from frame 0 —
    // coins/drops/particles are hidden instantly. The hit-stop still plays
    // (orbit progresses in real time regardless), so the kill still "thumps".
    start(p);
  }

  function start(p) {
    if (S.phase !== 0) return;
    S.phase = 1;
    S.t = 0;
    S.target = { x: p.x, y: p.y, name: S.bossName };
    S.saved = { x: _player.x, y: _player.y, dir: _player.dir };
    // Find the largest radius and contiguous arc around the boss with a clear
    // line-of-sight back to him. This guarantees the camera never sits inside
    // a wall (which would full-occlude the boss) and stays aimed at a visible
    // subject the whole orbit.
    const plan = planOrbit(p.x, p.y, _player);
    S.radius = plan.radius;
    S.startAngle = plan.startAngle;
    S.sweep = plan.sweep;

    _state.cinematic = true;
    if (window.JUICE) window.JUICE.setHitStop(ORBIT_DURATION, SLOWMO_SCALE);
    applyCinematicFilter(true);
  }

  // ─── Orbit planning ────────────────────────────────────────────

  // Returns true if every step from (ax,ay) to (bx,by) is in an open tile.
  function losClear(ax, ay, bx, by) {
    if (!window.LEVEL) return true;
    const dx = bx - ax, dy = by - ay;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(2, Math.ceil(dist / LOS_STEP));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!LEVEL.isOpen(ax + dx * t, ay + dy * t)) return false;
    }
    return true;
  }

  // For one angle: pull the camera in from `desiredR` until both the camera
  // tile and the LOS to boss are open. Returns the chosen radius or 0 if no
  // viable radius exists at this angle.
  function safeRadiusAtAngle(bx, by, angle, desiredR) {
    let r = desiredR;
    while (r >= RADIUS_MIN) {
      const x = bx + Math.cos(angle) * r;
      const y = by + Math.sin(angle) * r;
      if (window.LEVEL && LEVEL.isOpen(x, y) && losClear(x, y, bx, by)) return r;
      r -= 0.15;
    }
    return 0;
  }

  // Decide the orbit's radius, start angle, and sweep so the camera stays out
  // of walls and the boss is visible the whole time. Strategy:
  //   1. Try the desired RADIUS. Find the longest contiguous arc of angles
  //      where a camera at that radius has clear LOS to the boss.
  //   2. If that arc is long enough (>= 1/4 circle), orbit it.
  //   3. Otherwise shrink RADIUS by 0.3 and retry, down to RADIUS_MIN.
  //   4. Final fallback: pick the single best angle, do a tiny static dolly.
  function planOrbit(bx, by, fromPlayer) {
    const minArcAngles = Math.max(6, (SCAN_ANGLES / 4) | 0);
    for (let r = RADIUS; r >= RADIUS_MIN; r -= 0.3) {
      const ok = new Array(SCAN_ANGLES);
      for (let i = 0; i < SCAN_ANGLES; i++) {
        const a = (i / SCAN_ANGLES) * Math.PI * 2;
        ok[i] = safeRadiusAtAngle(bx, by, a, r) > 0;
      }
      // longest contiguous wrap-around run of true
      let bestStart = -1, bestLen = 0;
      for (let s = 0; s < SCAN_ANGLES; s++) {
        if (!ok[s]) continue;
        let len = 0;
        for (let k = 0; k < SCAN_ANGLES; k++) {
          if (ok[(s + k) % SCAN_ANGLES]) len++;
          else break;
        }
        if (len > bestLen) { bestLen = len; bestStart = s; }
      }
      if (bestLen >= SCAN_ANGLES) {
        // full circle is clear — start near the player's current direction so
        // the camera transition feels continuous, then sweep ~310°
        const startAngle = Math.atan2(fromPlayer.y - by, fromPlayer.x - bx);
        return { radius: r, startAngle, sweep: 5.4 };
      }
      if (bestLen >= minArcAngles) {
        // pad in by one slot on each side to avoid grazing the wall boundaries
        const inset = 1;
        const usableLen = bestLen - inset * 2;
        const startSlot = (bestStart + inset) % SCAN_ANGLES;
        const startAngle = (startSlot / SCAN_ANGLES) * Math.PI * 2;
        const sweep = (usableLen / SCAN_ANGLES) * Math.PI * 2;
        return { radius: r, startAngle, sweep };
      }
    }
    // Cramped corridor: pick the single best angle (clearest LOS) and orbit
    // a tiny ±15° around it so we still get *some* motion.
    let bestAngle = 0, bestR = 0;
    for (let i = 0; i < SCAN_ANGLES; i++) {
      const a = (i / SCAN_ANGLES) * Math.PI * 2;
      const r = safeRadiusAtAngle(bx, by, a, RADIUS);
      if (r > bestR) { bestR = r; bestAngle = a; }
    }
    if (bestR === 0) bestR = RADIUS_MIN; // last resort
    return { radius: bestR, startAngle: bestAngle - 0.26, sweep: 0.52 };
  }

  function applyCinematicFilter(on) {
    if (!_view) return;
    if (on) {
      _view.style.transition = 'filter 0.4s ease-out';
      _view.style.filter = 'saturate(0.7) contrast(1.1) brightness(0.92)';
    } else {
      _view.style.filter = '';
      // remove the transition after it finishes so live damage flashes etc.
      // aren't accidentally smoothed.
      setTimeout(() => { _view.style.transition = ''; }, 450);
    }
  }

  function update(realDt) {
    if (S.phase === 0) return;
    S.t += realDt;

    if (S.phase === 1) updateOrbit();
    else if (S.phase === 2) updateFlash();
    // phases 3/4/5 are DOM-driven (CSS transitions); we just wait for timeouts
  }

  // Ease in-out cubic. Smooth start, smooth stop.
  function ease(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }

  function updateOrbit() {
    const tgt = S.target;
    const p = Math.min(1, S.t / ORBIT_DURATION);
    const e = ease(p);
    const angle = S.startAngle + e * S.sweep;
    // Per-frame safety: even if planOrbit picked a clear arc, the desired
    // radius may now graze a wall corner due to the discrete tile probe. Pull
    // in until the camera tile is open.
    const r = safeRadiusAtAngle(tgt.x, tgt.y, angle, S.radius) || S.radius;
    _player.x = tgt.x + Math.cos(angle) * r;
    _player.y = tgt.y + Math.sin(angle) * r;
    _player.dir = Math.atan2(tgt.y - _player.y, tgt.x - _player.x);
    if (p >= 1) enterFlash();
  }

  function enterFlash() {
    S.phase = 2;
    S.t = 0;
    if (window.AUDIO && AUDIO.SFX && AUDIO.SFX.pickup) AUDIO.SFX.pickup();
    showFlash();
    // Capture on the next animation frame so the flash is on screen but the
    // raycaster has just rendered the final orbit frame underneath.
    requestAnimationFrame(() => {
      capture();
    });
  }

  function updateFlash() {
    if (S.t >= FLASH_DURATION) showPolaroid();
  }

  function showFlash() {
    if (!S.flashEl) {
      const el = document.createElement('div');
      el.id = 'selfie-flash';
      el.style.cssText =
        'position:absolute;inset:0;background:#fff;opacity:0;z-index:48;' +
        'pointer-events:none;transition:opacity 0.05s ease-out;';
      _playfield.appendChild(el);
      S.flashEl = el;
    }
    S.flashEl.style.transition = 'opacity 0.05s ease-out';
    S.flashEl.style.opacity = '0.95';
    setTimeout(() => {
      S.flashEl.style.transition = `opacity ${FLASH_DURATION}s ease-out`;
      S.flashEl.style.opacity = '0';
    }, 50);
  }

  function capture() {
    const W = 280, H = 200;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    // Source the upper portion of the view (the canvas covers playfield top
    // ~78%) so the HUD bar isn't included. The HUD canvas is also faded to 0
    // during cinematic, but cropping the bottom is the belt-and-suspenders.
    const sH = Math.floor(_view.height * 0.95);
    ctx.drawImage(_view, 0, 0, _view.width, sH, 0, 0, W, H);
    // Overlay: Dani's crowned portrait in the bottom-left, like a real selfie
    // where Dani's head pokes into frame. This makes the photo "Dani × Boss"
    // not just "Boss alone".
    compositeDani(ctx, W, H);
    S.captureCanvas = c;
    S.captureCount++;
    saveToGallery(c, `DANI × ${S.target.name} #${S.captureCount}`);
  }

  function compositeDani(ctx, W, H) {
    const sprite = _daniSprite;
    if (!sprite || !sprite.width || !sprite.height) return;
    const targetW = Math.floor(W * 0.36);
    const ratio = sprite.height / sprite.width;
    const targetH = Math.floor(targetW * ratio);
    const padX = 6;
    const padY = 6;
    const x = padX;
    const y = H - targetH - padY;
    // soft drop shadow behind so Dani reads against any background
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 3, y - 3, targetW + 6, targetH + 6);
    // a thin bright frame to sell it as a portrait/sticker
    ctx.fillStyle = '#ffd33a';
    ctx.fillRect(x - 2, y - 2, targetW + 4, targetH + 4);
    ctx.fillStyle = '#1a0a2a';
    ctx.fillRect(x - 1, y - 1, targetW + 2, targetH + 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, 0, 0, sprite.width, sprite.height, x, y, targetW, targetH);
    ctx.restore();
  }

  function showPolaroid() {
    S.phase = 3;
    S.t = 0;
    const label = `DANI × ${S.target.name} #${S.captureCount}`;
    const el = buildPolaroidEl(S.captureCanvas, label);
    _playfield.appendChild(el);
    S.polaroidEl = el;
    // trigger slide-in
    requestAnimationFrame(() => {
      el.style.transform = 'translate(0,0) rotate(-4deg)';
      el.style.opacity = '1';
    });
    setTimeout(() => holdPolaroid(), 450);
  }

  function holdPolaroid() {
    S.phase = 4;
    setTimeout(() => fadePolaroid(), POLAROID_HOLD * 1000);
  }

  function fadePolaroid() {
    S.phase = 5;
    if (S.polaroidEl) {
      S.polaroidEl.style.transition = `transform ${POLAROID_FADE}s ease-in, opacity ${POLAROID_FADE}s ease-in`;
      S.polaroidEl.style.transform = 'translate(0, 80%) rotate(-4deg)';
      S.polaroidEl.style.opacity = '0';
    }
    setTimeout(() => finish(), POLAROID_FADE * 1000 + 50);
  }

  function finish() {
    if (S.polaroidEl && S.polaroidEl.parentNode) S.polaroidEl.parentNode.removeChild(S.polaroidEl);
    S.polaroidEl = null;
    if (S.flashEl && S.flashEl.parentNode) S.flashEl.parentNode.removeChild(S.flashEl);
    S.flashEl = null;
    if (S.saved) {
      _player.x = S.saved.x;
      _player.y = S.saved.y;
      _player.dir = S.saved.dir;
    }
    applyCinematicFilter(false);
    _state.cinematic = false;
    S.phase = 0;
    S.t = 0;
    S.target = null;
    S.saved = null;
    S.captureCanvas = null;
  }

  // External cancel (e.g. on level reload during cinematic).
  function cancel() {
    if (S.phase === 0) return;
    if (S.polaroidEl && S.polaroidEl.parentNode) S.polaroidEl.parentNode.removeChild(S.polaroidEl);
    if (S.flashEl && S.flashEl.parentNode) S.flashEl.parentNode.removeChild(S.flashEl);
    S.polaroidEl = null;
    S.flashEl = null;
    applyCinematicFilter(false);
    if (_state) _state.cinematic = false;
    S.phase = 0;
    S.target = null;
    S.saved = null;
  }

  // ─── Polaroid DOM ──────────────────────────────────────────────

  function buildPolaroidEl(canvas, label) {
    const wrap = document.createElement('div');
    wrap.className = 'polaroid';
    // Responsive: width is a percentage of the playfield with a hard cap so
    // the polaroid is always on-screen regardless of viewport. Anchored bottom
    // to keep it clear of the boss banner area.
    wrap.style.cssText =
      'position:absolute;right:3%;bottom:14%;z-index:47;pointer-events:none;' +
      'width:min(38%, 320px);' +
      'background:#f7f3e8;padding:8px 8px 32px;box-sizing:border-box;' +
      'box-shadow:0 18px 30px rgba(0,0,0,0.6),0 4px 0 rgba(0,0,0,0.3);' +
      'transform:translate(140%, 30%) rotate(-12deg);opacity:0;' +
      'transition:transform 0.45s cubic-bezier(.22,.9,.32,1.1),opacity 0.45s ease-out;' +
      'image-rendering:pixelated;will-change:transform,opacity;';
    if (canvas) {
      canvas.style.cssText =
        'display:block;width:100%;height:auto;image-rendering:pixelated;' +
        'border:1px solid rgba(0,0,0,0.25);';
      wrap.appendChild(canvas);
    }
    const cap = document.createElement('div');
    cap.textContent = label;
    cap.style.cssText =
      'position:absolute;left:0;right:0;bottom:4px;text-align:center;' +
      "font-family:'VT323',monospace;color:#202020;" +
      'font-size:clamp(11px,1.4vw,18px);letter-spacing:1px;';
    wrap.appendChild(cap);
    // taped corner
    const tape = document.createElement('div');
    tape.style.cssText =
      'position:absolute;top:-8px;left:50%;transform:translateX(-50%) rotate(-4deg);' +
      'width:46px;height:14px;background:rgba(255,235,150,0.7);' +
      'box-shadow:0 1px 2px rgba(0,0,0,0.2);';
    wrap.appendChild(tape);
    return wrap;
  }

  // ─── Gallery (localStorage) ────────────────────────────────────

  function getGallery() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function saveToGallery(canvas, label) {
    try {
      const dataURL = canvas.toDataURL('image/jpeg', 0.82);
      const list = getGallery();
      list.push({ dataURL, label, ts: Date.now() });
      while (list.length > STORAGE_LIMIT) list.shift();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      // localStorage full or blocked — silently drop. The polaroid still
      // shows in-game; only the persistent gallery is affected.
      console.warn('[selfie] gallery save failed:', e);
    }
  }

  function clearGallery() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    S.captureCount = 0;
  }

  window.SELFIE = {
    init, update, isActive, cancel,
    getGallery, clearGallery,
  };
})();
