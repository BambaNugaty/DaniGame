// HUD canvas — chunky bottom bar with Dani's mood face.
(function () {
  'use strict';

  function create(canvas, faces) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const W = canvas.width, H = canvas.height;
    const FACE_W = 64;

    function moodFor(state) {
      if (state.dead) return 4;
      if (state.recentHurt > 0) return 2;
      if (state.recentKill > 0) return 1;
      if (state.health < 35) return 3;
      return 0;
    }

    function pad(n, len) {
      const s = String(Math.max(0, n | 0));
      return s.padStart(len, '0');
    }

    function drawNumber(value, x, y, len, color) {
      ctx.font = '24px VT323, monospace';
      ctx.textBaseline = 'top';
      ctx.fillStyle = color;
      ctx.fillText(pad(value, len), x, y);
    }

    function drawLabel(text, x, y, color) {
      ctx.font = '12px VT323, monospace';
      ctx.textBaseline = 'top';
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    }

    function render(state) {
      // background — chunky steel
      ctx.fillStyle = '#1a1020';
      ctx.fillRect(0, 0, W, H);
      // top bevel
      ctx.fillStyle = '#3a2050';
      ctx.fillRect(0, 0, W, 2);
      ctx.fillStyle = '#0a0510';
      ctx.fillRect(0, H - 2, W, 2);

      // PANELS
      // Layout: [HEALTH | FACE | AMMO | KILLS]
      const faceX = (W / 2 - FACE_W / 2) | 0;
      const faceY = (H - 56) / 2 + 2;

      // FACE PANEL backdrop
      ctx.fillStyle = '#0a0510';
      ctx.fillRect(faceX - 4, faceY - 4, FACE_W + 8, 56 + 8);
      ctx.fillStyle = '#3a2050';
      ctx.fillRect(faceX - 4, faceY - 4, FACE_W + 8, 2);
      // face — scale 64x64 source to 56 high to fit HUD
      const mood = moodFor(state);
      ctx.drawImage(faces, mood * 64, 0, 64, 64, faceX, faceY, FACE_W, 56);

      // LEFT: health
      drawLabel('HEALTH', 12, 8, '#ff8a1f');
      const maxHealth = state.maxHealth || 100;
      const lowThresh = maxHealth * 0.25;
      const midThresh = maxHealth * 0.6;
      const healthColor = state.health < lowThresh ? '#c11515' : state.health < midThresh ? '#ff8a1f' : '#7cff5a';
      drawNumber(state.health, 12, 22, 3, healthColor);
      // bar
      ctx.fillStyle = '#3a2050';
      ctx.fillRect(72, 28, 50, 12);
      ctx.fillStyle = healthColor;
      const fill = Math.max(0, Math.min(50, (state.health / maxHealth) * 50));
      ctx.fillRect(72, 28, fill, 12);

      // RIGHT of face: ammo
      const ammoX = faceX + FACE_W + 14;
      drawLabel('AMMO', ammoX, 8, '#7cff5a');
      drawNumber(state.ammo, ammoX, 22, 3, state.ammo < 5 ? '#c11515' : '#7cff5a');

      // FAR RIGHT: kills / total + coins + level
      drawLabel('SLAIN', W - 64, 4, '#ff8a1f');
      ctx.font = '16px VT323, monospace';
      ctx.fillStyle = '#f3e7c9';
      ctx.fillText(`${pad(state.kills, 2)}/${pad(state.totalEnemies, 2)}`, W - 64, 16);

      drawLabel('$', W - 64, 30, '#ffd33a');
      ctx.font = '16px VT323, monospace';
      ctx.fillStyle = '#ffd33a';
      ctx.fillText(pad(state.coins || 0, 3), W - 56, 30);

      // CITY LABEL + LEVEL
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillStyle = '#7cff5a';
      const lvlText = `KFAR SABA  L${(state.levelIndex || 0) + 1}/${state.levelCount || 1}`;
      ctx.fillText(lvlText, W / 2 - 60, H - 12);
    }

    return { render };
  }

  window.HUD = { create };
})();
