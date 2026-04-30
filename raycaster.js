// Classic DDA raycaster. Renders walls into a low-res buffer, then draws
// floor/ceiling, then sprites (depth-sorted) and the weapon overlay.
(function () {
  'use strict';

  function create(view, opts) {
    const ctx = view.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const state = {
      W: view.width,
      H: view.height,
      fov: opts.fov || 1.05, // ~60deg
      maxDepth: opts.maxDepth || 22,
      pixelation: opts.pixelation || 1, // 1 = full, higher = chunkier (skip columns)
      zBuffer: new Float32Array(view.width),
      textures: opts.textures || {},
      texSize: 64,
      // Additive camera offset applied on top of player position/heading for the
      // duration of one frame. Used by Juice for screen shake. Reset by the
      // caller after each frame; raycaster only reads it.
      cameraOffset: { x: 0, y: 0, dir: 0 },
    };

    function setFov(f) { state.fov = f; }
    function setMaxDepth(d) { state.maxDepth = d; }
    function setPixelation(p) { state.pixelation = Math.max(1, p | 0); }
    function setCameraOffset(ox, oy, odir) {
      state.cameraOffset.x = ox || 0;
      state.cameraOffset.y = oy || 0;
      state.cameraOffset.dir = odir || 0;
    }
    function effectivePlayer(p) {
      const o = state.cameraOffset;
      return { x: p.x + o.x, y: p.y + o.y, dir: p.dir + o.dir };
    }

    // Renders one frame.
    function render(rawPlayer) {
      const player = effectivePlayer(rawPlayer);
      const { W, H, fov, maxDepth, zBuffer, textures, texSize } = state;
      const dirX = Math.cos(player.dir);
      const dirY = Math.sin(player.dir);
      // perpendicular plane (camera plane), length = tan(fov/2)
      const planeLen = Math.tan(fov / 2);
      const planeX = -dirY * planeLen;
      const planeY = dirX * planeLen;

      // CEILING & FLOOR — gradient from the active level's palette so each
      // map reads with its own mood (suburb dusk, mall fluorescent, station
      // amber, etc). Falls back to suburb if LEVEL hasn't loaded a palette.
      const palette = (window.LEVEL && window.LEVEL.palette) || null;
      const skyStops = palette ? palette.sky : [['#1a0a2a', 0], ['#4a1a4a', 0.5], ['#a04a2a', 1]];
      const floorStops = palette ? palette.floor : [['#3a2a3a', 0], ['#1a1020', 0.4], ['#080510', 1]];

      const skyGrad = ctx.createLinearGradient(0, 0, 0, H / 2);
      for (const [color, stop] of skyStops) skyGrad.addColorStop(stop, color);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, H / 2);

      const floorGrad = ctx.createLinearGradient(0, H / 2, 0, H);
      for (const [color, stop] of floorStops) floorGrad.addColorStop(stop, color);
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, H / 2, W, H / 2);

      // optional simple "road stripe" hint at floor
      // skipped for performance

      // WALL CASTING
      const px = state.pixelation;
      for (let x = 0; x < W; x += px) {
        const cameraX = 2 * x / W - 1;
        const rayX = dirX + planeX * cameraX;
        const rayY = dirY + planeY * cameraX;
        let mapX = player.x | 0;
        let mapY = player.y | 0;
        const deltaX = rayX === 0 ? 1e30 : Math.abs(1 / rayX);
        const deltaY = rayY === 0 ? 1e30 : Math.abs(1 / rayY);
        let stepX, stepY, sideDistX, sideDistY;
        if (rayX < 0) { stepX = -1; sideDistX = (player.x - mapX) * deltaX; }
        else { stepX = 1; sideDistX = (mapX + 1 - player.x) * deltaX; }
        if (rayY < 0) { stepY = -1; sideDistY = (player.y - mapY) * deltaY; }
        else { stepY = 1; sideDistY = (mapY + 1 - player.y) * deltaY; }

        let hit = 0, side = 0, tile = 0;
        let dist = 0;
        for (let i = 0; i < 64; i++) {
          if (sideDistX < sideDistY) {
            sideDistX += deltaX; mapX += stepX; side = 0;
          } else {
            sideDistY += deltaY; mapY += stepY; side = 1;
          }
          tile = LEVEL.at(mapX, mapY);
          if (tile > 0) { hit = 1; break; }
          if (i > maxDepth * 2) break;
        }
        if (!hit) {
          for (let xx = 0; xx < px; xx++) zBuffer[x + xx] = maxDepth;
          continue;
        }
        if (side === 0) dist = (sideDistX - deltaX);
        else dist = (sideDistY - deltaY);

        const lineH = Math.max(1, Math.floor(H / dist));
        const drawStart = Math.max(0, (-lineH / 2 + H / 2) | 0);
        const drawEnd = Math.min(H, (lineH / 2 + H / 2) | 0);

        // Texture pick
        let tex = null;
        if (tile === 1) tex = textures.concrete;
        else if (tile === 2) tex = textures.hedge;
        else if (tile === 3) tex = textures.brick;
        else if (tile === 4) tex = textures.sign;
        else if (tile === 5) tex = textures.garage;
        else if (tile === 6) tex = textures.mall_glass;
        else if (tile === 7) tex = textures.station_tile;
        else if (tile === 8) tex = textures.mall_storefront;
        else tex = textures.concrete;

        let wallX;
        if (side === 0) wallX = player.y + dist * rayY;
        else wallX = player.x + dist * rayX;
        wallX -= Math.floor(wallX);
        let texX = (wallX * texSize) | 0;
        if (side === 0 && rayX > 0) texX = texSize - texX - 1;
        if (side === 1 && rayY < 0) texX = texSize - texX - 1;

        // draw a vertical column from the texture
        ctx.drawImage(tex, texX, 0, 1, texSize, x, drawStart, px, drawEnd - drawStart);

        // shade by distance & side
        const shade = Math.min(0.9, dist / maxDepth) + (side === 1 ? 0.18 : 0);
        if (shade > 0.02) {
          ctx.fillStyle = `rgba(0,0,0,${shade.toFixed(3)})`;
          ctx.fillRect(x, drawStart, px, drawEnd - drawStart);
        }

        for (let xx = 0; xx < px; xx++) zBuffer[x + xx] = dist;
      }
    }

    // Render sprites (billboards). `entities` is array of {x,y,canvas,frameW,frame,size}
    function renderSprites(rawPlayer, entities) {
      const player = effectivePlayer(rawPlayer);
      const { W, H, fov, zBuffer } = state;
      const dirX = Math.cos(player.dir);
      const dirY = Math.sin(player.dir);
      const planeLen = Math.tan(fov / 2);
      const planeX = -dirY * planeLen;
      const planeY = dirX * planeLen;
      const invDet = 1.0 / (planeX * dirY - dirX * planeY);

      // build list with depth
      const list = [];
      for (const e of entities) {
        const sx = e.x - player.x, sy = e.y - player.y;
        const transformX = invDet * (dirY * sx - dirX * sy);
        const transformY = invDet * (-planeY * sx + planeX * sy); // depth
        if (transformY <= 0.05) continue;
        list.push({ e, transformX, transformY });
      }
      list.sort((a, b) => b.transformY - a.transformY);

      for (const { e, transformX, transformY } of list) {
        const screenX = (W / 2) * (1 + transformX / transformY);
        const spriteH = Math.abs(Math.floor(H / transformY)) * (e.size || 1);
        const spriteW = spriteH * ((e.frameW || e.canvas.width) / e.canvas.height);
        const drawStartX = Math.floor(screenX - spriteW / 2);
        const drawEndX = Math.floor(screenX + spriteW / 2);

        // vertical anchor: floor-aligned
        const yOffset = e.yOffset || 0;
        const drawStartY = Math.floor(H / 2 - spriteH / 2 + yOffset * spriteH);
        const drawEndY = drawStartY + spriteH;

        // Per-column draw with z-test
        const fW = e.frameW || e.canvas.width;
        const fH = e.canvas.height;
        const fSrcX = (e.frame || 0) * fW;
        const prevAlpha = ctx.globalAlpha;
        if (e.alpha != null && e.alpha < 1) ctx.globalAlpha = Math.max(0, e.alpha);
        for (let x = Math.max(0, drawStartX); x < Math.min(W, drawEndX); x++) {
          if (transformY >= zBuffer[x]) continue;
          const tx = Math.floor((x - drawStartX) * fW / spriteW);
          if (tx < 0 || tx >= fW) continue;
          ctx.drawImage(e.canvas, fSrcX + tx, 0, 1, fH, x, drawStartY, 1, spriteH);
        }
        ctx.globalAlpha = prevAlpha;

        // Optional shade by distance
        const shade = Math.min(0.6, transformY / state.maxDepth);
        if (shade > 0.05) {
          ctx.fillStyle = `rgba(0,0,0,${shade.toFixed(3)})`;
          // shade only over the visible part
          const sx = Math.max(0, drawStartX);
          const ex = Math.min(W, drawEndX);
          const sy = Math.max(0, drawStartY);
          const ey = Math.min(H, drawEndY);
          ctx.globalCompositeOperation = 'source-atop';
          // Skip full-rect shade — too expensive over the whole sprite. Use simple darken
          // by drawing only on already-painted pixels at low alpha.
          ctx.fillRect(sx, sy, ex - sx, ey - sy);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }

    // Renders the weapon overlay at the bottom-center.
    function renderWeapon(weaponSprite, bobX, bobY) {
      const { W, H } = state;
      // smaller weapon; sit lower so only the top edge of the hands shows
      const scale = (H * 0.55) / weaponSprite.height;
      const dw = weaponSprite.width * scale;
      const dh = weaponSprite.height * scale;
      // push it down past the bottom edge so it reads as "lower"
      const yOffset = H * 0.08;
      ctx.drawImage(weaponSprite, (W - dw) / 2 + bobX, H - dh + yOffset + bobY, dw, dh);
    }

    function worldToScreen(rawPlayer, wx, wy) {
      const player = effectivePlayer(rawPlayer);
      const { W, H, fov } = state;
      const dirX = Math.cos(player.dir);
      const dirY = Math.sin(player.dir);
      const planeLen = Math.tan(fov / 2);
      const planeX = -dirY * planeLen;
      const planeY = dirX * planeLen;
      const invDet = 1.0 / (planeX * dirY - dirX * planeY);
      const sx = wx - player.x, sy = wy - player.y;
      const transformX = invDet * (dirY * sx - dirX * sy);
      const transformY = invDet * (-planeY * sx + planeX * sy);
      if (transformY <= 0.05) return { x: 0, y: 0, depth: transformY, behind: true };
      const screenX = (W / 2) * (1 + transformX / transformY);
      const screenY = H / 2;
      return {
        x: screenX / W,   // 0..1 normalized
        y: screenY / H,
        depth: transformY,
        behind: false,
      };
    }
    return { render, renderSprites, renderWeapon, worldToScreen, setFov, setMaxDepth, setPixelation, setCameraOffset, state, ctx };
  }

  window.RAYCASTER = { create };
})();
