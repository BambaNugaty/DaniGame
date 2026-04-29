// Multi-level layouts. 0 = open, >0 = wall texture id.
// 1 = concrete, 2 = hedge, 3 = brick, 4 = sign, 5 = garage
// s = spawn, c = caveman, f = friend (don't shoot), h = health, a = ammo, e = exit
// Note: BOSS is no longer pre-placed — game.js spawns it at a random open tile.
(function () {
  'use strict';

  // ---------- LEVEL 1 — Suburb sprawl (32x28) ----------
  const L1 = [
    '11111111111111111111111111111111',
    '1...........1...........1......1',
    '1.s.........1...c....c..1...c..1',
    '1......22222.....22222..1......1',
    '1......2...2....c2...2..1......1',
    '1.....f2.h.2.....2.a.2..1...c..1',
    '1......2...2.....2...2..1......1',
    '1......22.22.....22.22..1......1',
    '1.......................1......1',
    '111111.....c.....c..............',
    '1....1...........1.............1',
    '1....1.......c...1...c.....c...1',
    '1....1...........1.............1',
    '1....1...141.....1.............1',
    '1...c1..14441....1.....22222...1',
    '1....1...141.....1.....2...2...1',
    '1....1...........1.....2.h.2...1',
    '1.....................f2...2...1',
    '1.................c....22222...1',
    '1...c..........................1',
    '1......333333..................1',
    '1......3....3.....c.....c......1',
    '1......3.a..3..................1',
    '1......3....3..................1',
    '1......333333..................1',
    '1.....................c......c.1',
    '1.................ee...........1',
    '11111111111111111111111111111111',
  ];

  // ---------- LEVEL 2 — Strip-mall maze (32x28) ----------
  const L2 = [
    '33333333333333333333333333333333',
    '3.s............................3',
    '3....3333..3333..3333..3333....3',
    '3....3..3..3..3..3..3..3..3....3',
    '3....3.a3..3.h3..3a.3..3h.3....3',
    '3.c..3..3..3..3..3..3..3..3.c..3',
    '3....3333..3333..3333..3333....3',
    '3..............................3',
    '3..............f...............3',
    '3.222222222....22222222....222.3',
    '3.2.......2............2..c..2.3',
    '3.2..c....2..55555555..2.....2.3',
    '3.2.......2..5......5..2.....2.3',
    '3.2.......2..5..a.h.5..2..f..2.3',
    '3.2.......2..5......5..2.....2.3',
    '3.2....c..2..55555555..2..c..2.3',
    '3.222222222............2.....2.3',
    '3..............................3',
    '3....3333..3333..3333..3333....3',
    '3....3..3..3..3..3..3..3..3....3',
    '3....3.h3..3..3..3a.3..3h.3....3',
    '3.c..3..3..3..3..3..3..3..3.c..3',
    '3....3333..3333..3333..3333....3',
    '3..............................3',
    '3..............................3',
    '3....c....c....c......c....c...3',
    '3..............ee..............3',
    '33333333333333333333333333333333',
  ];

  // ---------- LEVEL 3 — Industrial arena (32x28) ----------
  const L3 = [
    '11111111111111111111111111111111',
    '1.s............................1',
    '1......c....c....c....c....c...1',
    '1..............................1',
    '1...3333........3333.......333.1',
    '1...3..3...h....3..3.......333.1',
    '1...3..3....c...3..3..a....333.1',
    '1...3333........3333.......333.1',
    '1.....c..........c.......c.....1',
    '1..............................1',
    '1......555555555555555555......1',
    '1......5..................5....1',
    '1......5...c..........c...5....1',
    '1......5..................5....1',
    '1......5...........h......5....1',
    '1......5..a...............5....1',
    '1......5..................5....1',
    '1......555555555555555555......1',
    '1..............................1',
    '1.....c....h....a..c.....c.....1',
    '1..............................1',
    '1...3333........3333........33.1',
    '1...3.f3........3f.3........33.1',
    '1...3..3...c....3..3..c.....33.1',
    '1...3..3........3..3........33.1',
    '1...3333........3333........33.1',
    '1......c....c....c.....c....c..1',
    '11111111111111111111111111111111',
  ];

  const LAYOUTS = [L1, L2, L3];

  const wallChar = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5 };
  const state = {
    index: 0,
    count: LAYOUTS.length,
    W: 0, H: 0,
    grid: null,
    spawn: { x: 1.5, y: 1.5, dir: 0 },
    enemies: [],
    friends: [],
    pickups: [],
    exits: [],
    openTiles: [],
  };

  function load(idx) {
    state.index = Math.max(0, Math.min(LAYOUTS.length - 1, idx));
    const layout = LAYOUTS[state.index];
    const W = layout[0].length;
    const H = layout.length;
    const grid = new Uint8Array(W * H);
    state.W = W; state.H = H; state.grid = grid;
    state.enemies = [];
    state.friends = [];
    state.pickups = [];
    state.exits = [];
    state.openTiles = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ch = layout[y][x];
        if (wallChar[ch]) { grid[y * W + x] = wallChar[ch]; continue; }
        // open tile
        if (ch !== '.' && ch !== 's' && ch !== 'c' && ch !== 'f' && ch !== 'h' && ch !== 'a' && ch !== 'e') {
          // unknown char treated as open
        }
        state.openTiles.push({ x: x + 0.5, y: y + 0.5 });
        if (ch === 's') state.spawn = { x: x + 0.5, y: y + 0.5, dir: 0 };
        else if (ch === 'c') state.enemies.push({ x: x + 0.5, y: y + 0.5 });
        else if (ch === 'f') state.friends.push({ x: x + 0.5, y: y + 0.5 });
        else if (ch === 'h') state.pickups.push({ x: x + 0.5, y: y + 0.5, kind: 'health' });
        else if (ch === 'a') state.pickups.push({ x: x + 0.5, y: y + 0.5, kind: 'ammo' });
        else if (ch === 'e') state.exits.push({ x: x + 0.5, y: y + 0.5 });
      }
    }
  }

  function at(x, y) {
    if (x < 0 || y < 0 || x >= state.W || y >= state.H) return 1;
    return state.grid[y * state.W + x];
  }
  function isOpen(x, y) {
    return at(x | 0, y | 0) === 0;
  }
  function randomOpenTile(awayFrom, minDist) {
    const tiles = state.openTiles;
    if (!tiles.length) return null;
    for (let tries = 0; tries < 60; tries++) {
      const t = tiles[Math.floor(Math.random() * tiles.length)];
      if (awayFrom) {
        const dx = t.x - awayFrom.x, dy = t.y - awayFrom.y;
        if (dx * dx + dy * dy < (minDist || 4) * (minDist || 4)) continue;
      }
      return { x: t.x, y: t.y };
    }
    return { x: tiles[0].x, y: tiles[0].y };
  }

  load(0);

  window.LEVEL = {
    get W() { return state.W; },
    get H() { return state.H; },
    get grid() { return state.grid; },
    at, isOpen, randomOpenTile,
    get spawn() { return state.spawn; },
    get enemies() { return state.enemies; },
    get friends() { return state.friends; },
    get pickups() { return state.pickups; },
    get exits() { return state.exits; },
    get openTiles() { return state.openTiles; },
    get index() { return state.index; },
    get count() { return state.count; },
    load,
  };
})();
