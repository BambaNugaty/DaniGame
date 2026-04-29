// Main game controller — input, AI, projectiles, collision, game state.
(function () {
  'use strict';

  const view = document.getElementById('view');
  const hudCanvas = document.getElementById('hud');
  const titleEl = document.getElementById('title');
  const titleDani = document.getElementById('title-dani');
  const startBtn = document.getElementById('start-btn');
  const deathOverlay = document.getElementById('death');
  const victoryOverlay = document.getElementById('victory');
  const damageFlash = document.getElementById('damage-flash');
  const muzzleEl = document.getElementById('muzzle');
  const pauseMsg = document.getElementById('pause-msg');
  const playfield = document.getElementById('playfield');

  const player = { x: 0, y: 0, dir: 0 };
  const projectiles = [];      // player orbs
  const enemyProjectiles = []; // boss cola cans
  const enemies = [];
  const friends = [];
  const pickups = [];
  const coins = [];
  const drops = []; // weapon drops on ground
  const respawnQueue = []; // {at, x, y, variant}
  let boss = null;
  let bossSpawnAt = 0;     // performance.now()/1000 timestamp when boss should appear
  let waveTimer = 0;       // seconds until next ambient wave
  let levelStartT = 0;
  const bubbles = [];      // {ownerKind:'boss'|'friend', getPos: ()=>({x,y}), text, expires}

  const upgrades = {
    damage: 0,    // +6 dmg per level
    fireRate: 0,  // -0.05s cooldown per level
    multishot: 0, // +1 projectile per level
  };
  const PRICES = { damage: 8, fireRate: 10, multishot: 15 };
  const MAX_LVL = { damage: 5, fireRate: 4, multishot: 3 };

  const state = {
    started: false, paused: false, dead: false, won: false,
    health: 100, maxHealth: 100, ammo: 25, kills: 0, totalEnemies: 0, coins: 0,
    recentHurt: 0, recentKill: 0,
    fireCooldown: 0, weaponFireFrame: 0,
    bob: 0, walkPhase: 0,
    levelIndex: 0, levelCount: 1,
    shopOpen: false,
    transitioning: false,
    weapon: 'blaster',  // 'blaster' | 'shotgun'
  };

  const tweaks = { fov: 1.05, maxDepth: 22, pixelation: 2, enemySpeed: 1.3, enemyCount: 8 };
  window.GAME_TWEAKS = tweaks;
  window.GAME_APPLY_TWEAKS = (next) => {
    Object.assign(tweaks, next);
    if (rc) {
      rc.setFov(tweaks.fov);
      rc.setMaxDepth(tweaks.maxDepth);
      rc.setPixelation(tweaks.pixelation);
    }
  };

  const keys = {};
  let mouseLocked = false;
  let pointerLockJustAcquired = false;
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Escape' && state.started && !state.dead && !state.won) togglePause();
    if (e.code === 'KeyB' && state.started && !state.dead && !state.won) toggleShop();
    if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+' || e.key === '=') {
      const v = AUDIO.volumeUp(); showVolumeToast(v); e.preventDefault();
    } else if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '-' || e.key === '_') {
      const v = AUDIO.volumeDown(); showVolumeToast(v); e.preventDefault();
    } else if (e.code === 'KeyM') {
      const m = AUDIO.toggleMute(); showVolumeToast(m ? 0 : AUDIO.getVolume(), m);
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  view.addEventListener('click', () => {
    if (state.dead || state.won) return;
    if (state.shopOpen || state.friendShopOpen) return;
    if (!mouseLocked && state.started) view.requestPointerLock();
    else if (state.started) {
      const f = aimedFriend();
      if (f) toggleFriendShop(f);
      else tryFire();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    mouseLocked = document.pointerLockElement === view;
    if (mouseLocked) {
      pauseMsg.classList.remove('show');
      state.paused = false;
      pointerLockJustAcquired = true;
      // Drop the next 2 mousemove events worth of spike — clear after a tick.
      setTimeout(() => { pointerLockJustAcquired = false; }, 80);
      AUDIO.resume();
    } else if (state.started && !state.dead && !state.won && !state.shopOpen) {
      pauseMsg.classList.add('show');
      state.paused = true;
    }
  });
  document.addEventListener('mousemove', (e) => {
    if (!mouseLocked) return;
    if (pointerLockJustAcquired) return; // ignore the spike right after lock
    // Clamp per-event movement to avoid browser-reported spikes that snap the view.
    const mx = Math.max(-80, Math.min(80, e.movementX || 0));
    player.dir += mx * 0.0025;
  });
  function togglePause() { if (mouseLocked) document.exitPointerLock(); }

  let faces, cavemanSprites, friendSprite, bossSprite, colaCanSprite;
  let wallTex, projectileSprite, healthSprite, ammoSprite, coinSprite, weapon, weaponShotgun, weaponDropSprite;
  let rc = null, hud = null;

  startBtn.addEventListener('click', startGame);
  document.getElementById('death-restart').addEventListener('click', restart);
  document.getElementById('victory-restart').addEventListener('click', restart);

  // ---- VOLUME TOAST ----
  const volumeToast = document.getElementById('volume-toast');
  const volumeBars = volumeToast.querySelector('.bars');
  for (let i = 0; i < 10; i++) {
    const b = document.createElement('div');
    b.className = 'bar';
    volumeBars.appendChild(b);
  }
  let volumeToastTimer = null;
  function showVolumeToast(vol, isMuted) {
    const v = Math.max(0, Math.min(1, vol));
    const lit = Math.round(v * 10);
    const bars = volumeBars.querySelectorAll('.bar');
    bars.forEach((b, i) => b.classList.toggle('on', i < lit));
    volumeToast.classList.toggle('muted', !!isMuted);
    volumeToast.querySelector('.label').textContent = isMuted ? 'MUTED' : 'VOL';
    volumeToast.classList.add('show');
    clearTimeout(volumeToastTimer);
    volumeToastTimer = setTimeout(() => volumeToast.classList.remove('show'), 1100);
  }

  // Returns the closest friend in the player's crosshair (narrow angle + LOS), or null.
  function aimedFriend() {
    const fx = Math.cos(player.dir), fy = Math.sin(player.dir);
    let best = null, bestDist = 4.0;
    for (const f of friends) {
      const dx = f.x - player.x, dy = f.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > bestDist) continue;
      const dot = (dx * fx + dy * fy) / (dist || 1);
      if (dot < 0.95) continue; // ~18deg cone
      if (!lineOfSight(player.x, player.y, f.x, f.y)) continue;
      best = f; bestDist = dist;
    }
    return best;
  }

  // ---- FRIEND-SHOP CONSTANTS (must be initialized before buildFriendShopUI runs) ----
  const HP_BOOST_BASE_PRICE = 12;
  const HP_BOOST_AMOUNT = 10;

  // ---- SHOP ----
  buildShopUI();
  buildFriendShopUI();
  function buildShopUI() {
    if (document.getElementById('shop')) return;
    const el = document.createElement('div');
    el.id = 'shop';
    el.style.cssText = `position:absolute;inset:0;display:none;flex-direction:column;
      align-items:center;justify-content:center;z-index:45;
      background:rgba(10,5,20,0.92);text-align:center;padding:5%;font-family:'VT323',monospace;`;
    el.innerHTML = `
      <h2 style="font-family:'Press Start 2P',monospace;color:#ffd33a;font-size:clamp(20px,3.6vw,42px);
        text-shadow:3px 3px 0 #000,0 0 20px rgba(255,211,58,0.6);margin:0 0 8px;letter-spacing:3px;">WEAPON SHOP</h2>
      <div id="shop-coins" style="color:#ffd33a;font-size:clamp(18px,2.4vw,28px);margin-bottom:16px;">$ 0</div>
      <div id="shop-list" style="display:flex;flex-direction:column;gap:10px;width:min(560px,80%);"></div>
      <div style="margin-top:16px;color:#f3e7c9;font-size:clamp(14px,1.6vw,20px);opacity:0.75;">
        Press <span style="color:#7cff5a">B</span> or <span style="color:#7cff5a">ESC</span> to close
      </div>`;
    playfield.appendChild(el);
    const items = [
      { key: 'damage', label: 'DAMAGE +', desc: 'Stronger plasma orbs' },
      { key: 'fireRate', label: 'FIRE RATE +', desc: 'Faster trigger' },
      { key: 'multishot', label: 'MULTI-SHOT +', desc: 'Extra projectile per shot' },
    ];
    const list = el.querySelector('#shop-list');
    items.forEach(it => {
      const row = document.createElement('div');
      row.dataset.key = it.key;
      row.style.cssText = `display:flex;align-items:center;justify-content:space-between;
        background:#1a0a2a;border:2px solid #4a1a6e;padding:10px 14px;color:#f3e7c9;
        font-size:clamp(14px,1.8vw,20px);gap:12px;`;
      row.innerHTML = `
        <div style="text-align:left;flex:1;">
          <div style="color:#7cff5a;font-family:'Press Start 2P',monospace;font-size:0.7em;letter-spacing:2px;">${it.label}</div>
          <div style="opacity:0.75;font-size:0.85em;">${it.desc}</div>
          <div class="lvl" style="color:#ffd33a;font-size:0.95em;margin-top:2px;">LV 0/${MAX_LVL[it.key]}</div>
        </div>
        <button data-buy="${it.key}" style="font-family:'Press Start 2P',monospace;font-size:0.7em;
          padding:8px 12px;background:#ffd33a;color:#1a0a2a;border:0;cursor:pointer;
          box-shadow:0 4px 0 #a86a08;letter-spacing:2px;">BUY $${PRICES[it.key]}</button>`;
      list.appendChild(row);
    });
    el.addEventListener('click', (ev) => {
      const k = ev.target.getAttribute && ev.target.getAttribute('data-buy');
      if (k) buyUpgrade(k);
    });
  }
  function refreshShopUI() {
    const el = document.getElementById('shop');
    if (!el) return;
    el.querySelector('#shop-coins').textContent = `$ ${state.coins}`;
    el.querySelectorAll('#shop-list > div').forEach(row => {
      const k = row.dataset.key;
      const lvl = upgrades[k];
      const max = MAX_LVL[k];
      const price = currentPrice(k);
      row.querySelector('.lvl').textContent = `LV ${lvl}/${max}`;
      const btn = row.querySelector('button');
      if (lvl >= max) {
        btn.textContent = 'MAXED';
        btn.style.background = '#4a1a6e';
        btn.style.color = '#f3e7c9';
        btn.disabled = true;
      } else {
        btn.textContent = `BUY $${price}`;
        btn.disabled = state.coins < price;
        btn.style.opacity = state.coins < price ? '0.5' : '1';
        btn.style.background = '#ffd33a';
        btn.style.color = '#1a0a2a';
      }
    });
  }
  function currentPrice(k) { return PRICES[k] + upgrades[k] * Math.ceil(PRICES[k] * 0.6); }
  function buyUpgrade(k) {
    if (upgrades[k] >= MAX_LVL[k]) return;
    const p = currentPrice(k);
    if (state.coins < p) { AUDIO.SFX.empty(); return; }
    state.coins -= p;
    upgrades[k]++;
    AUDIO.SFX.pickup();
    refreshShopUI();
  }
  function toggleShop() {
    const el = document.getElementById('shop');
    if (!el) return;
    state.shopOpen = !state.shopOpen;
    if (state.shopOpen) {
      if (mouseLocked) document.exitPointerLock();
      el.style.display = 'flex';
      refreshShopUI();
    } else {
      el.style.display = 'none';
      if (state.started && !state.dead && !state.won) {
        // Re-acquire pointer lock on next click
        pauseMsg.classList.add('show');
      }
    }
  }
  // ESC also closes shop
  window.addEventListener('keydown', (e) => {
    if (state.shopOpen && e.code === 'Escape') { toggleShop(); e.stopPropagation(); }
    if (state.friendShopOpen && e.code === 'Escape') { toggleFriendShop(); e.stopPropagation(); }
  });

  // ---- FRIEND SHOP (max-HP boosts) ----
  function buildFriendShopUI() {
    if (document.getElementById('friend-shop')) return;
    const el = document.createElement('div');
    el.id = 'friend-shop';
    el.style.cssText = `position:absolute;inset:0;display:none;flex-direction:column;
      align-items:center;justify-content:center;z-index:46;
      background:rgba(0,20,0,0.92);text-align:center;padding:5%;font-family:'VT323',monospace;`;
    el.innerHTML = `
      <h2 style="font-family:'Press Start 2P',monospace;color:#cfffb0;
        font-size:clamp(18px,3vw,38px);text-shadow:3px 3px 0 #000,0 0 20px rgba(124,255,90,0.6);
        margin:0 0 8px;letter-spacing:3px;">FRIEND'S CLINIC</h2>
      <div style="color:#7cff5a;font-size:clamp(14px,1.6vw,22px);margin-bottom:10px;font-style:italic;">
        "i love you my friend"
      </div>
      <div id="friend-shop-stats" style="color:#f3e7c9;font-size:clamp(16px,1.8vw,24px);margin-bottom:14px;">
        HP 100 / 100 &nbsp;·&nbsp; $ 0
      </div>
      <div id="friend-shop-list" style="display:flex;flex-direction:column;gap:10px;width:min(560px,80%);"></div>
      <div style="margin-top:16px;color:#f3e7c9;font-size:clamp(14px,1.6vw,20px);opacity:0.75;">
        Click <span style="color:#7cff5a">BUY</span> &nbsp;·&nbsp;
        <span style="color:#7cff5a">ESC</span> to leave
      </div>`;
    playfield.appendChild(el);
    const list = el.querySelector('#friend-shop-list');
    const items = [
      { id: 'hp', label: `+${HP_BOOST_AMOUNT} MAX HP`, desc: `Friend patches you up. Also heals you.` },
      { id: 'heal', label: 'FULL HEAL', desc: 'Refill HP to your current max.' },
    ];
    items.forEach(it => {
      const row = document.createElement('div');
      row.dataset.id = it.id;
      row.style.cssText = `display:flex;align-items:center;justify-content:space-between;
        background:#0a2a0a;border:2px solid #2a5a1a;padding:10px 14px;color:#f3e7c9;
        font-size:clamp(14px,1.8vw,20px);gap:12px;`;
      row.innerHTML = `
        <div style="text-align:left;flex:1;">
          <div style="color:#cfffb0;font-family:'Press Start 2P',monospace;font-size:0.7em;letter-spacing:2px;">${it.label}</div>
          <div style="opacity:0.75;font-size:0.85em;">${it.desc}</div>
        </div>
        <button data-buy="${it.id}" style="font-family:'Press Start 2P',monospace;font-size:0.7em;
          padding:8px 12px;background:#cfffb0;color:#003a00;border:0;cursor:pointer;
          box-shadow:0 4px 0 #003a00;letter-spacing:2px;">BUY</button>`;
      list.appendChild(row);
    });
    el.addEventListener('click', (ev) => {
      const id = ev.target.getAttribute && ev.target.getAttribute('data-buy');
      if (!id) return;
      if (id === 'hp') buyHpBoost();
      else if (id === 'heal') buyFullHeal();
    });
  }
  function hpBoostPrice() {
    // Each boost gets a bit more expensive.
    const tier = Math.floor((state.maxHealth - 100) / HP_BOOST_AMOUNT);
    return HP_BOOST_BASE_PRICE + tier * 6;
  }
  function fullHealPrice() {
    return 8;
  }
  function refreshFriendShopUI() {
    const el = document.getElementById('friend-shop');
    if (!el) return;
    el.querySelector('#friend-shop-stats').textContent =
      `HP ${state.health} / ${state.maxHealth}  ·  $ ${state.coins}`;
    const rows = el.querySelectorAll('#friend-shop-list > div');
    rows.forEach(row => {
      const id = row.dataset.id;
      const btn = row.querySelector('button');
      const price = id === 'hp' ? hpBoostPrice() : fullHealPrice();
      const enabled = state.coins >= price &&
        !(id === 'heal' && state.health >= state.maxHealth);
      btn.textContent = `BUY $${price}`;
      btn.disabled = !enabled;
      btn.style.opacity = enabled ? '1' : '0.5';
    });
  }
  function buyHpBoost() {
    const p = hpBoostPrice();
    if (state.coins < p) { AUDIO.SFX.empty(); return; }
    state.coins -= p;
    state.maxHealth += HP_BOOST_AMOUNT;
    state.health = Math.min(state.maxHealth, state.health + HP_BOOST_AMOUNT);
    AUDIO.SFX.pickup();
    refreshFriendShopUI();
  }
  function buyFullHeal() {
    const p = fullHealPrice();
    if (state.coins < p) { AUDIO.SFX.empty(); return; }
    if (state.health >= state.maxHealth) return;
    state.coins -= p;
    state.health = state.maxHealth;
    AUDIO.SFX.pickup();
    refreshFriendShopUI();
  }
  function toggleFriendShop(friend) {
    const el = document.getElementById('friend-shop');
    if (!el) return;
    state.friendShopOpen = !state.friendShopOpen;
    if (state.friendShopOpen) {
      if (mouseLocked) document.exitPointerLock();
      el.style.display = 'flex';
      refreshFriendShopUI();
      if (friend) {
        sayBubble({ kind: 'friend', friend, text: 'i love you my friend', dur: 2.0 });
        friend.sayUntil = performance.now() / 1000 + 2.0;
      }
    } else {
      el.style.display = 'none';
    }
  }

  async function init() {
    await SPRITES.ready;
    faces = SPRITES.makeDaniFaces();
    cavemanSprites = [SPRITES.makeCaveman(0), SPRITES.makeCaveman(1), SPRITES.makeCaveman(2)];
    friendSprite = SPRITES.makeFriend();
    bossSprite = SPRITES.makeBoss();
    colaCanSprite = SPRITES.makeColaCan();
    wallTex = SPRITES.makeWallTextures();
    projectileSprite = SPRITES.makeProjectile();
    healthSprite = SPRITES.makePickup();
    ammoSprite = SPRITES.makeAmmoPickup();
    coinSprite = SPRITES.makeCoin();
    weapon = SPRITES.makeWeapon();
    weaponShotgun = SPRITES.makeWeaponShotgun();
    weaponDropSprite = SPRITES.makeWeaponDrop();

    const td = SPRITES.makeTitleDani();
    const tCtx = titleDani.getContext('2d');
    titleDani.width = td.width; titleDani.height = td.height;
    tCtx.imageSmoothingEnabled = false;
    tCtx.drawImage(td, 0, 0);

    rc = RAYCASTER.create(view, {
      fov: tweaks.fov, maxDepth: tweaks.maxDepth, pixelation: tweaks.pixelation,
      textures: wallTex,
    });
    hud = HUD.create(hudCanvas, faces);

    state.levelCount = LEVEL.count;
    loadLevel(0, true);
    requestAnimationFrame(loop);
  }

  // Hard cap on living cavemen on the map at any time.
  function enemyCapForLevel(idx) {
    return 10 + idx * 2; // L1=10, L2=12, L3=14
  }
  function initialEnemyCountForLevel(idx) {
    return enemyCapForLevel(idx); // start at the cap
  }

  function spawnEnemyAtSafeTile(variant, awayFromPlayer, minDist) {
    const t = LEVEL.randomOpenTile(awayFromPlayer ? player : null, minDist || 4);
    if (!t) return null;
    if (!LEVEL.isOpen(t.x, t.y)) return null;
    const e = makeEnemy(t.x, t.y, variant);
    enemies.push(e);
    return e;
  }

  function loadLevel(idx, fullReset) {
    LEVEL.load(idx);
    state.levelIndex = idx;
    state.transitioning = false;

    player.x = LEVEL.spawn.x; player.y = LEVEL.spawn.y; player.dir = LEVEL.spawn.dir;
    enemies.length = 0; friends.length = 0;
    pickups.length = 0; coins.length = 0;
    drops.length = 0;
    projectiles.length = 0; enemyProjectiles.length = 0;
    respawnQueue.length = 0;
    boss = null;
    bubbles.length = 0;

    // Pre-placed cavemen (in-map) seed positions, but we then top up to target via random open tiles.
    const presets = LEVEL.enemies.slice();
    const target = initialEnemyCountForLevel(idx);
    for (let i = 0; i < target; i++) {
      const variant = i % 3;
      if (i < presets.length && LEVEL.isOpen(presets[i].x, presets[i].y)) {
        enemies.push(makeEnemy(presets[i].x, presets[i].y, variant));
      } else {
        spawnEnemyAtSafeTile(variant, true, 5);
      }
    }
    for (const f of LEVEL.friends) {
      friends.push({
        x: f.x, y: f.y, frame: 0, frameTimer: 0,
        wanderTimer: Math.random() * 2, wanderDir: Math.random() * Math.PI * 2,
        sayUntil: 0,
      });
    }
    for (const p of LEVEL.pickups) {
      pickups.push({
        x: p.x, y: p.y, kind: p.kind, collected: false,
        respawnAt: 0, originX: p.x, originY: p.y,
      });
    }
    // Sprinkle EXTRA pickups so the player never runs dry: more ammo than health.
    function sprinkle(kind, count) {
      for (let i = 0; i < count; i++) {
        const t = LEVEL.randomOpenTile(player, 3);
        if (!t) continue;
        pickups.push({
          x: t.x, y: t.y, kind, collected: false,
          respawnAt: 0, originX: t.x, originY: t.y,
        });
      }
    }
    sprinkle('ammo', 10 + idx * 2);
    sprinkle('health', 6 + idx);

    // Boss: schedule random appearance within 15s..55s of level start.
    levelStartT = performance.now() / 1000;
    bossSpawnAt = levelStartT + 15 + Math.random() * 40;
    waveTimer = 8 + Math.random() * 6;

    state.totalEnemies = enemies.length + 1; // +1 for upcoming boss
    state.kills = 0;
    state.recentHurt = 0; state.recentKill = 0;
    if (fullReset) {
      state.maxHealth = 100;
      state.health = state.maxHealth;
      state.ammo = 25; state.coins = 0;
      upgrades.damage = 0; upgrades.fireRate = 0; upgrades.multishot = 0;
      state.weapon = 'blaster';
      state.dead = false; state.won = false;
    }
  }

  function spawnBossAtRandom() {
    if (boss) return;
    const t = LEVEL.randomOpenTile(player, 8);
    if (!t) return;
    boss = {
      x: t.x, y: t.y, hp: 200, maxHp: 200,
      state: 'idle', frame: 0, frameTimer: 0,
      attackTimer: 0, throwTimer: 2, throwCooldown: 0,
      seenPlayer: false, awoke: false,
      tauntTimer: 0,
    };
    bossWake();
    showBanner('BOSS HAS ARRIVED', '#c11515');
    AUDIO.playClip('bossSpawn');
  }

  function makeEnemy(x, y, variant) {
    return {
      x, y, hp: 30, state: 'idle',
      frame: 0, frameTimer: 0, attackTimer: 0,
      deathTimer: 0,    // time since death
      variant,
      seenPlayer: false,
      wanderTimer: Math.random() * 1.5, wanderDir: Math.random() * Math.PI * 2,
      originX: x, originY: y,
      removed: false,
    };
  }

  function startGame() {
    AUDIO.resume(); AUDIO.SFX.start();
    AUDIO.startMusic();
    AUDIO.fadeMusic(0.18, 800);
    titleEl.classList.add('hidden');
    state.started = true;
    try { view.requestPointerLock(); } catch (e) {}
    setTimeout(() => {
      if (!mouseLocked) pauseMsg.classList.add('show');
    }, 250);
  }
  function restart() {
    deathOverlay.classList.remove('show');
    victoryOverlay.classList.remove('show');
    AUDIO.fadeMusic(0.18, 400);
    loadLevel(0, true);
    state.started = true;
    setTimeout(() => view.requestPointerLock(), 100);
  }

  function isWall(x, y) { return LEVEL.at(x | 0, y | 0) > 0; }
  function tryMove(x, y, dx, dy, radius) {
    const r = radius || 0.22;
    const nx = x + dx, ny = y + dy;
    if (!isWall(nx + Math.sign(dx) * r, y - r) && !isWall(nx + Math.sign(dx) * r, y + r)) x = nx;
    if (!isWall(x - r, ny + Math.sign(dy) * r) && !isWall(x + r, ny + Math.sign(dy) * r)) y = ny;
    return { x, y };
  }
  function lineOfSight(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const dist = Math.hypot(dx, dy);
    const steps = Math.ceil(dist * 4);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (isWall(ax + dx * t, ay + dy * t)) return false;
    }
    return true;
  }

  function tryFire() {
    if (state.dead || state.paused || state.shopOpen || state.friendShopOpen) return;
    if (state.fireCooldown > 0) return;
    if (state.ammo <= 0) { AUDIO.SFX.empty(); return; }
    state.ammo--;
    const isShotgun = state.weapon === 'shotgun';
    state.fireCooldown = Math.max(0.12,
      (isShotgun ? 0.55 : 0.35) - upgrades.fireRate * 0.05);
    state.weaponFireFrame = isShotgun ? 0.18 : 0.12;
    AUDIO.SFX.fire();
    if (isShotgun) setTimeout(() => AUDIO.SFX.fire(), 30);
    muzzleEl.style.opacity = '1';
    setTimeout(() => muzzleEl.style.opacity = '0', 100);
    const base = player.dir;
    const speed = isShotgun ? 14 : 12;
    const baseShots = isShotgun ? 6 : 2;
    const shots = baseShots + upgrades.multishot;
    const spreadStep = isShotgun ? 0.07 : 0.04;
    const baseDmg = (isShotgun ? 14 : 18) + upgrades.damage * 6;
    for (let i = 0; i < shots; i++) {
      const spread = (i - (shots - 1) / 2) * spreadStep;
      const a = base + spread + (Math.random() - 0.5) * 0.03;
      projectiles.push({
        x: player.x + Math.cos(a) * 0.4, y: player.y + Math.sin(a) * 0.4,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: 1.2, owner: 'player', dmg: baseDmg,
      });
    }
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      if (e.removed) continue;
      if (e.state === 'dead') {
        e.deathTimer += dt;
        if (e.deathTimer > 60) e.removed = true;
        continue;
      }
      const dx = player.x - e.x, dy = player.y - e.y;
      const dist = Math.hypot(dx, dy);
      const canSee = dist < 14 && lineOfSight(e.x, e.y, player.x, player.y);
      if (canSee && !e.seenPlayer) { e.seenPlayer = true; AUDIO.SFX.enemyGrunt(); }
      const speed = tweaks.enemySpeed;
      if (e.seenPlayer && dist > 1.0 && dist < 18) {
        e.state = 'chase';
        const a = Math.atan2(dy, dx);
        const moved = tryMove(e.x, e.y, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt, 0.3);
        let blocked = false;
        for (const o of enemies) {
          if (o === e || o.state === 'dead' || o.removed) continue;
          const ddx = o.x - moved.x, ddy = o.y - moved.y;
          if (ddx * ddx + ddy * ddy < 0.5 * 0.5) { blocked = true; break; }
        }
        if (!blocked) { e.x = moved.x; e.y = moved.y; }
        e.frameTimer += dt;
        if (e.frameTimer > 0.18) { e.frameTimer = 0; e.frame = e.frame === 1 ? 2 : 1; }
        if (Math.random() < 0.003) AUDIO.SFX.enemyGrunt();
      } else if (e.seenPlayer && dist <= 1.0) {
        e.state = 'attack';
        e.attackTimer -= dt;
        if (e.attackTimer <= 0) {
          e.attackTimer = 1.0; e.frame = 3;
          if (dist < 1.1) damagePlayer(8 + Math.random() * 8);
        } else if (e.attackTimer < 0.7) e.frame = 0;
        else e.frame = 3;
      } else {
        e.state = 'idle';
        e.wanderTimer -= dt;
        if (e.wanderTimer <= 0) {
          e.wanderTimer = 1.5 + Math.random() * 2.5;
          e.wanderDir = Math.random() * Math.PI * 2;
        }
        if (Math.random() < 0.3) {
          const m = tryMove(e.x, e.y, Math.cos(e.wanderDir) * 0.4 * dt, Math.sin(e.wanderDir) * 0.4 * dt, 0.3);
          e.x = m.x; e.y = m.y;
        }
        e.frameTimer += dt;
        if (e.frameTimer > 0.4) { e.frameTimer = 0; e.frame = e.frame === 0 ? 1 : 0; }
      }
    }
    // garbage collect removed
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].removed) enemies.splice(i, 1);
    }
  }

  function updateBoss(dt) {
    if (!boss || boss.state === 'dead') return;
    const dx = player.x - boss.x, dy = player.y - boss.y;
    const dist = Math.hypot(dx, dy);
    const canSee = dist < 22 && lineOfSight(boss.x, boss.y, player.x, player.y);
    if (canSee && !boss.seenPlayer) {
      boss.seenPlayer = true;
      bossWake();
    }
    if (!boss.seenPlayer) {
      boss.frameTimer += dt;
      if (boss.frameTimer > 0.5) { boss.frameTimer = 0; boss.frame = boss.frame === 0 ? 1 : 0; }
      return;
    }
    boss.throwCooldown -= dt;
    boss.attackTimer -= dt;
    const a = Math.atan2(dy, dx);

    if (dist > 1.6) {
      const speed = tweaks.enemySpeed * 1.2;
      const m = tryMove(boss.x, boss.y, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt, 0.35);
      boss.x = m.x; boss.y = m.y;
      boss.state = 'chase';
      boss.frameTimer += dt;
      if (boss.frameTimer > 0.2) { boss.frameTimer = 0; boss.frame = boss.frame === 0 ? 1 : 0; }

      if (boss.throwCooldown <= 0 && dist > 2.5 && dist < 14) {
        boss.throwCooldown = 1.4 + Math.random() * 0.8;
        boss.frame = 3;
        const sp = 7;
        const aim = a + (Math.random() - 0.5) * 0.06;
        enemyProjectiles.push({
          x: boss.x + Math.cos(aim) * 0.5, y: boss.y + Math.sin(aim) * 0.5,
          vx: Math.cos(aim) * sp, vy: Math.sin(aim) * sp,
          life: 3, kind: 'cola',
        });
        AUDIO.SFX.fire();
      }
    } else {
      boss.state = 'attack';
      if (boss.attackTimer <= 0) {
        boss.attackTimer = 0.9;
        boss.frame = 2;
        if (dist < 1.7) damagePlayer(18 + Math.random() * 8);
        AUDIO.SFX.hit();
      } else if (boss.attackTimer < 0.55) {
        boss.frame = 0;
      } else {
        boss.frame = 2;
      }
    }
  }

  function bossWake() {
    let el = document.getElementById('boss-msg');
    if (!el) {
      el = document.createElement('div');
      el.id = 'boss-msg';
      el.style.cssText = `position:absolute;left:50%;top:14%;transform:translate(-50%,-50%);
        font-family:'Press Start 2P',monospace;color:#ff8a1f;
        font-size:clamp(14px,1.8vw,24px);text-shadow:3px 3px 0 #000,0 0 30px rgba(255,138,31,0.8);
        pointer-events:none;z-index:35;text-align:center;line-height:1.5;
        opacity:0;transition:opacity 0.3s;letter-spacing:2px;`;
      el.innerHTML = '⚠ BOSS APPROACHING ⚠<br/><span style="color:#c11515;font-size:1.4em">PALLET WIELDER</span>';
      playfield.appendChild(el);
    }
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 2400);
    AUDIO.SFX.enemyGrunt();
  }

  function damagePlayer(amount) {
    if (state.dead) return;
    state.health -= amount;
    state.recentHurt = 0.6;
    AUDIO.SFX.playerHurt();
    damageFlash.style.opacity = '1';
    setTimeout(() => damageFlash.style.opacity = '0', 200);
    if (state.health <= 0) {
      state.health = 0; state.dead = true;
      AUDIO.SFX.playerDie();
      AUDIO.playClip('death');
      setTimeout(() => {
        if (mouseLocked) document.exitPointerLock();
        deathOverlay.classList.add('show');
        AUDIO.fadeMusic(0.0, 800);
      }, 600);
    }
  }

  function flashKarma() {
    let el = document.getElementById('karma-msg');
    if (!el) {
      el = document.createElement('div');
      el.id = 'karma-msg';
      el.style.cssText = `position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);
        font-family:'Press Start 2P',monospace;color:#ff5a8a;
        font-size:clamp(14px,2vw,28px);text-shadow:3px 3px 0 #000,0 0 20px rgba(255,90,138,0.7);
        pointer-events:none;z-index:35;text-align:center;line-height:1.5;
        opacity:0;transition:opacity 0.2s;`;
      el.innerHTML = "♡ DON'T HURT<br/>YOUR FRIENDS ♡";
      playfield.appendChild(el);
    }
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 1100);
  }

  function dropCoins(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.15 + Math.random() * 0.25;
      coins.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, life: 30, bob: Math.random() * Math.PI * 2 });
    }
  }

  function onEnemyKilled(e) {
    e.state = 'dead';
    e.deathTimer = 0;
    e.frame = 0;
    state.kills++;
    state.recentKill = 0.8;
    AUDIO.SFX.enemyDie();
    dropCoins(e.x, e.y, 1 + Math.floor(Math.random() * 2));
    // No respawn from the dead. New enemies arrive only via updateWaves,
    // and only up to the per-level cap.
  }

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0 || isWall(p.x, p.y)) { projectiles.splice(i, 1); continue; }
      let consumed = false;
      for (const f of friends) {
        const dx = f.x - p.x, dy = f.y - p.y;
        if (dx * dx + dy * dy < 0.35 * 0.35) {
          damagePlayer(15);
          flashKarma();
          sayBubble({ kind: 'friend', friend: f, text: 'i love you my friend', dur: 2.5 });
          f.sayUntil = performance.now() / 1000 + 2.5;
          projectiles.splice(i, 1);
          consumed = true;
          break;
        }
      }
      if (consumed) continue;
      for (const e of enemies) {
        if (e.state === 'dead' || e.removed) continue;
        const dx = e.x - p.x, dy = e.y - p.y;
        if (dx * dx + dy * dy < 0.35 * 0.35) {
          e.hp -= p.dmg || 18;
          AUDIO.SFX.hit();
          if (e.hp <= 0) {
            onEnemyKilled(e);
            checkLevelComplete();
          }
          projectiles.splice(i, 1);
          consumed = true;
          break;
        }
      }
      if (consumed) continue;
      if (boss && boss.state !== 'dead') {
        const dx = boss.x - p.x, dy = boss.y - p.y;
        if (dx * dx + dy * dy < 0.5 * 0.5) {
          boss.hp -= (p.dmg || 18) * 0.8;
          AUDIO.SFX.hit();
          if (!boss.seenPlayer) { boss.seenPlayer = true; bossWake(); }
          if (boss.hp <= 0) {
            boss.state = 'dead';
            boss.deathTimer = 0;
            state.kills++;
            state.recentKill = 1.5;
            AUDIO.SFX.enemyDie();
            setTimeout(() => AUDIO.SFX.enemyDie(), 200);
            AUDIO.playClip('bossDead');
            dropCoins(boss.x, boss.y, 14);
            // Drop the second weapon at the boss's position.
            drops.push({ x: boss.x, y: boss.y, kind: 'shotgun' });
            showBanner('SHOTGUN DROPPED', '#ffd33a');
            // Reschedule next boss arrival (waves continue).
            bossSpawnAt = performance.now() / 1000 + 30 + Math.random() * 30;
            checkLevelComplete();
          }
          projectiles.splice(i, 1);
        }
      }
    }
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
      const p = enemyProjectiles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0 || isWall(p.x, p.y)) { enemyProjectiles.splice(i, 1); continue; }
      const dx = player.x - p.x, dy = player.y - p.y;
      if (dx * dx + dy * dy < 0.4 * 0.4) {
        damagePlayer(14);
        enemyProjectiles.splice(i, 1);
      }
    }
  }

  function checkLevelComplete() {
    // Boss is now an ambient/recurring threat — level progression is via the
    // exit tile only (walked over in updateExits).
  }

  function advanceLevel() {
    if (state.transitioning) return;
    state.transitioning = true;
    showBanner(`LEVEL ${state.levelIndex + 2}`, '#7cff5a');
    AUDIO.SFX.victory();
    setTimeout(() => loadLevel(state.levelIndex + 1, false), 1400);
  }

  function showBanner(text, color) {
    let el = document.getElementById('level-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'level-banner';
      el.style.cssText = `position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);
        font-family:'Press Start 2P',monospace;font-size:clamp(22px,4vw,52px);
        text-shadow:4px 4px 0 #000,0 0 30px rgba(124,255,90,0.6);
        pointer-events:none;z-index:35;text-align:center;letter-spacing:4px;
        opacity:0;transition:opacity 0.25s;`;
      playfield.appendChild(el);
    }
    el.style.color = color || '#7cff5a';
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 1800);
  }

  function triggerVictory() {
    if (state.won) return;
    state.won = true;
    AUDIO.SFX.victory();
    setTimeout(() => {
      if (mouseLocked) document.exitPointerLock();
      victoryOverlay.classList.add('show');
      AUDIO.fadeMusic(0.0, 800);
    }, 800);
  }

  function updateFriends(dt) {
    const r = 0.25;
    for (const f of friends) {
      f.wanderTimer -= dt;
      if (f.wanderTimer <= 0) {
        f.wanderTimer = 2 + Math.random() * 3;
        f.wanderDir = Math.random() * Math.PI * 2;
      }
      const speed = 0.6;
      const dx = Math.cos(f.wanderDir) * speed * dt;
      const dy = Math.sin(f.wanderDir) * speed * dt;
      const nx = f.x + dx, ny = f.y + dy;
      let moved = false;
      // Try axis moves with body radius so the friend doesn't clip into a wall edge.
      const canX = !isWall(nx + Math.sign(dx) * r, f.y - r) && !isWall(nx + Math.sign(dx) * r, f.y + r);
      const canY = !isWall(f.x - r, ny + Math.sign(dy) * r) && !isWall(f.x + r, ny + Math.sign(dy) * r);
      if (canX) { f.x = nx; moved = true; }
      if (canY) { f.y = ny; moved = true; }
      if (!moved) {
        // Stuck on a wall — pick a new direction immediately so they don't freeze.
        f.wanderDir = Math.random() * Math.PI * 2;
        f.wanderTimer = 0.6 + Math.random();
        f.stuckTicks = (f.stuckTicks || 0) + 1;
        if (f.stuckTicks > 3) {
          // Hard-stuck: try a random open tile near the friend.
          const t = LEVEL.randomOpenTile({ x: f.x, y: f.y }, 1.2);
          if (t) { f.x = t.x; f.y = t.y; }
          f.stuckTicks = 0;
        }
      } else {
        f.stuckTicks = 0;
      }
      f.frameTimer += dt;
      if (f.frameTimer > 0.4) { f.frameTimer = 0; f.frame = f.frame === 0 ? 1 : 0; }
    }
  }

  function updatePickups(dt) {
    const now = performance.now() / 1000;
    for (const p of pickups) {
      if (p.collected) {
        if (p.respawnAt && now >= p.respawnAt) {
          p.collected = false;
          p.respawnAt = 0;
          p.x = p.originX; p.y = p.originY;
        }
        continue;
      }
      const dx = player.x - p.x, dy = player.y - p.y;
      if (dx * dx + dy * dy < 0.45 * 0.45) {
        p.collected = true;
        p.respawnAt = now + (p.kind === 'ammo' ? 12 : 18);
        if (p.kind === 'health') {
          state.health = Math.min(state.maxHealth || 100, state.health + 30);
          AUDIO.SFX.pickup();
        } else if (p.kind === 'ammo') {
          state.ammo += 16;
          AUDIO.SFX.ammoPickup();
        }
      }
    }
    // coins pickup + lifetime
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      c.life -= dt; c.bob += dt * 4;
      if (c.life <= 0) { coins.splice(i, 1); continue; }
      const dx = player.x - c.x, dy = player.y - c.y;
      if (dx * dx + dy * dy < 0.5 * 0.5) {
        state.coins++;
        AUDIO.SFX.ammoPickup();
        coins.splice(i, 1);
      }
    }
  }

  function sayBubble({ kind, friend, text, dur }) {
    bubbles.push({
      kind, friend,
      text,
      expires: performance.now() / 1000 + (dur || 2.5),
      el: null,
    });
  }

  function updateBubbles() {
    const now = performance.now() / 1000;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      if (b.expires <= now) {
        if (b.el && b.el.parentNode) b.el.parentNode.removeChild(b.el);
        bubbles.splice(i, 1);
        continue;
      }
      let pos;
      if (b.kind === 'boss') {
        if (!boss || boss.state === 'dead') { b.expires = 0; continue; }
        pos = { x: boss.x, y: boss.y };
      } else if (b.kind === 'friend') {
        pos = b.friend ? { x: b.friend.x, y: b.friend.y } : null;
      }
      if (!pos) continue;
      const sp = rc.worldToScreen(player, pos.x, pos.y);
      if (!b.el) {
        b.el = document.createElement('div');
        b.el.className = 'speech-bubble' + (b.kind === 'boss' ? ' boss' : ' friend');
        b.el.textContent = b.text;
        playfield.appendChild(b.el);
      }
      if (sp.behind) {
        b.el.style.display = 'none';
      } else {
        b.el.style.display = 'block';
        // Position via percentages of the playfield. The view canvas occupies the top 78%.
        const leftPct = sp.x * 100;
        const topPct = (sp.y * 0.78) * 100 - 12; // a bit above center
        b.el.style.left = `${Math.max(2, Math.min(98, leftPct))}%`;
        b.el.style.top = `${Math.max(2, topPct)}%`;
        // Fade with depth
        const alpha = Math.max(0.3, 1 - sp.depth / 18);
        b.el.style.opacity = alpha.toFixed(2);
      }
    }
  }

  function updateWaves(dt) {
    const now = performance.now() / 1000;
    // BOSS: spawn at scheduled time if not present and not currently dead
    if (!boss && now >= bossSpawnAt) {
      spawnBossAtRandom();
    }
    // Boss despawn after death (~10s) so it can return later
    if (boss && boss.state === 'dead') {
      boss.deathTimer = (boss.deathTimer || 0) + dt;
      if (boss.deathTimer > 10) {
        boss = null;
        // bossSpawnAt was already set when boss died
      }
    }
    // Boss taunt: every ~6s while alive
    if (boss && boss.state !== 'dead' && boss.seenPlayer) {
      boss.tauntTimer = (boss.tauntTimer || 0) - dt;
      if (boss.tauntTimer <= 0) {
        boss.tauntTimer = 6 + Math.random() * 4;
        sayBubble({ kind: 'boss', text: 'זה מלא כסף מה יש לך', dur: 3.2 });
      }
    }
    // Ambient enemy waves: top up to the per-level cap. Never exceed it.
    waveTimer -= dt;
    if (waveTimer <= 0) {
      waveTimer = 10 + Math.random() * 6;
      const aliveCount = enemies.filter(e => e.state !== 'dead' && !e.removed).length;
      const cap = enemyCapForLevel(state.levelIndex);
      const slots = Math.max(0, cap - aliveCount);
      // Only add a few at a time so it feels like waves, not a flood.
      const want = Math.min(slots, 1 + Math.floor(Math.random() * 2));
      for (let i = 0; i < want; i++) {
        const e = spawnEnemyAtSafeTile(Math.floor(Math.random() * 3), true, 6);
        if (e) state.totalEnemies++;
      }
    }
  }

  function updateDrops() {
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      const dx = player.x - d.x, dy = player.y - d.y;
      if (dx * dx + dy * dy < 0.5 * 0.5) {
        if (d.kind === 'shotgun') {
          state.weapon = 'shotgun';
          state.ammo += 20;
          AUDIO.SFX.pickup();
          showBanner('SHOTGUN ACQUIRED', '#ffd33a');
        }
        drops.splice(i, 1);
      }
    }
  }

  function updateExits() {
    if (state.transitioning) return;
    for (const ex of LEVEL.exits) {
      const dx = player.x - ex.x, dy = player.y - ex.y;
      if (dx * dx + dy * dy < 0.5 * 0.5) {
        if (state.levelIndex >= LEVEL.count - 1) triggerVictory();
        else advanceLevel();
        return;
      }
    }
  }

  function updatePlayer(dt) {
    if (state.dead || state.paused || state.shopOpen || state.friendShopOpen) return;
    let mx = 0, my = 0;
    const fx = Math.cos(player.dir), fy = Math.sin(player.dir);
    const sx = -fy, sy = fx;
    if (keys['KeyW'] || keys['ArrowUp']) { mx += fx; my += fy; }
    if (keys['KeyS'] || keys['ArrowDown']) { mx -= fx; my -= fy; }
    if (keys['KeyA']) { mx -= sx; my -= sy; }
    if (keys['KeyD']) { mx += sx; my += sy; }
    if (keys['ArrowLeft']) player.dir -= 2.4 * dt;
    if (keys['ArrowRight']) player.dir += 2.4 * dt;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len; my /= len;
      const speed = 3.0;
      const m = tryMove(player.x, player.y, mx * speed * dt, my * speed * dt, 0.22);
      player.x = m.x; player.y = m.y;
      state.walkPhase += dt * 8;
      state.bob = Math.sin(state.walkPhase) * 4;
      if (Math.random() < 0.04) AUDIO.SFX.footstep();
    } else {
      state.bob *= 0.85;
    }
    updateExits();
    // Tension music: louder when an enemy sees the player.
    let tension = 0;
    for (const e of enemies) {
      if (e.state === 'dead' || e.removed) continue;
      if (e.seenPlayer) {
        const dx = e.x - player.x, dy = e.y - player.y;
        const d = Math.hypot(dx, dy);
        if (d < 12) tension = Math.max(tension, 1 - d / 12);
      }
    }
    if (boss && boss.seenPlayer && boss.state !== 'dead') tension = Math.max(tension, 0.9);
    const targetGain = 0.14 + tension * 0.18;
    if (Math.abs(targetGain - (state._musicGain || 0)) > 0.01) {
      state._musicGain = targetGain;
      AUDIO.fadeMusic(targetGain, 600);
    }
  }

  let lastT = performance.now();
  function loop(t) {
    try {
      tick(t);
    } catch (err) {
      console.error('loop error:', err);
      // Surface to on-screen error overlay if present
      window.dispatchEvent(new ErrorEvent('error', {
        message: String(err && err.message || err), error: err,
        filename: 'game.js', lineno: 0, colno: 0,
      }));
    }
    requestAnimationFrame(loop);
  }
  function tick(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;

    if (state.started) {
      if (state.fireCooldown > 0) state.fireCooldown -= dt;
      if (state.weaponFireFrame > 0) state.weaponFireFrame -= dt;
      if (state.recentHurt > 0) state.recentHurt -= dt;
      if (state.recentKill > 0) state.recentKill -= dt;

      if (!state.paused && !state.dead && !state.won && !state.shopOpen && !state.friendShopOpen) {
        updatePlayer(dt);
        updateEnemies(dt);
        updateBoss(dt);
        updateFriends(dt);
        updateProjectiles(dt);
        updatePickups(dt);
        updateWaves(dt);
        updateDrops();
      }
      updateBubbles();

      rc.render(player);

      const ents = [];
      for (const p of pickups) {
        if (p.collected) continue;
        ents.push({
          x: p.x, y: p.y,
          canvas: p.kind === 'health' ? healthSprite : ammoSprite,
          frame: 0, frameW: 16, size: 0.5, yOffset: 0.25,
        });
      }
      for (const c of coins) {
        ents.push({
          x: c.x, y: c.y, canvas: coinSprite,
          frameW: 16, frame: 0, size: 0.35,
          yOffset: 0.4 + Math.sin(c.bob) * 0.08,
        });
      }
      for (const d of drops) {
        ents.push({
          x: d.x, y: d.y, canvas: weaponDropSprite,
          frameW: 24, frame: 0, size: 0.6,
          yOffset: 0.25 + Math.sin(performance.now() / 300) * 0.06,
        });
      }
      for (const f of friends) {
        const frameW = friendSprite.width / 2;
        ents.push({ x: f.x, y: f.y, canvas: friendSprite, frameW, frame: f.frame, size: 1, yOffset: 0 });
      }
      for (const e of enemies) {
        if (e.removed) continue;
        const sprite = cavemanSprites[e.variant];
        const frameW = sprite.width / 4;
        let frame = e.frame;
        if (e.state === 'dead') frame = 0;
        const fade = e.state === 'dead' ? Math.max(0, 1 - e.deathTimer / 60) : 1;
        ents.push({
          x: e.x, y: e.y, canvas: sprite, frameW,
          frame, size: e.state === 'dead' ? 0.55 : 1,
          yOffset: e.state === 'dead' ? 0.32 : 0,
          alpha: fade,
        });
      }
      if (boss) {
        const frameW = bossSprite.width / 4;
        ents.push({
          x: boss.x, y: boss.y, canvas: bossSprite, frameW,
          frame: boss.state === 'dead' ? 0 : boss.frame,
          size: boss.state === 'dead' ? 0.6 : 1.6,
          yOffset: boss.state === 'dead' ? 0.4 : -0.15,
        });
      }
      for (const pr of projectiles) {
        ents.push({ x: pr.x, y: pr.y, canvas: projectileSprite, frameW: 16, frame: 0, size: 0.4 });
      }
      for (const pr of enemyProjectiles) {
        ents.push({ x: pr.x, y: pr.y, canvas: colaCanSprite, frameW: 24, frame: 0, size: 0.5 });
      }
      rc.renderSprites(player, ents);

      const wpn = state.weapon === 'shotgun' ? weaponShotgun : weapon;
      const weaponSprite = state.weaponFireFrame > 0 ? wpn.fire : wpn.idle;
      rc.renderWeapon(weaponSprite, state.bob * 0.3, Math.abs(state.bob) * 0.5 + (state.weaponFireFrame > 0 ? 8 : 0));

      hud.render(state);

      // Tint crosshair green when aiming at a friend (hint: click opens shop, not fire)
      const ch = document.getElementById('crosshair');
      if (ch) {
        const f = aimedFriend();
        ch.style.setProperty('--neon', f ? '#cfffb0' : '#7cff5a');
        ch.style.filter = f ? 'drop-shadow(0 0 6px #cfffb0)' : '';
      }

      if (boss && boss.seenPlayer && boss.state !== 'dead') {
        renderBossHealthBar();
      } else {
        hideBossHealthBar();
      }
    }
  }

  function renderBossHealthBar() {
    let el = document.getElementById('boss-hp');
    if (!el) {
      el = document.createElement('div');
      el.id = 'boss-hp';
      el.style.cssText = `position:absolute;left:50%;top:6%;transform:translateX(-50%);
        width:60%;height:18px;background:#1a0510;border:3px solid #c11515;
        z-index:25;pointer-events:none;box-shadow:0 0 20px rgba(193,21,21,0.6);`;
      const fill = document.createElement('div');
      fill.id = 'boss-hp-fill';
      fill.style.cssText = `height:100%;background:linear-gradient(90deg,#c11515,#ff8a1f);transition:width 0.2s;`;
      el.appendChild(fill);
      const lbl = document.createElement('div');
      lbl.style.cssText = `position:absolute;left:50%;top:-22px;transform:translateX(-50%);
        font-family:'Press Start 2P',monospace;color:#ff8a1f;font-size:11px;
        text-shadow:2px 2px 0 #000;letter-spacing:2px;white-space:nowrap;`;
      lbl.textContent = 'PALLET WIELDER';
      el.appendChild(lbl);
      playfield.appendChild(el);
    }
    document.getElementById('boss-hp-fill').style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
    el.style.display = 'block';
  }
  function hideBossHealthBar() {
    const el = document.getElementById('boss-hp');
    if (el) el.style.display = 'none';
  }

  init();
})();
