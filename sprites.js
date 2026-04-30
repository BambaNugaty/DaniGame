// Photo-based sprite generation for Dani & cavemen, plus pixel-art textures.
// Photos are pre-processed: pixelated, palette-quantized for cursed PS1 vibe.

(function () {
  'use strict';

  const PAL = {
    bone: '#f3e7c9',
    daniGreen: '#5a9a3a',
    daniGreenDark: '#2a5a1a',
    daniBelly: '#c8e890',
    daniSpike: '#ff8a1f',
    eyeBlack: '#0a0a0a',
    blood: '#c11515',
    bloodDark: '#5a0a0a',
    neon: '#7cff5a',
    plasma: '#7cff5a',
  };

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return { c, ctx };
  }

  // Load image then call cb. We pre-load both & expose a ready Promise.
  const images = {};
  function loadImg(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Pixelate by drawing into a small canvas, then up-scaling with nearest neighbor
  // to a target size.
  function pixelate(img, srcW, srcH, dstW, dstH, downscale) {
    const small = makeCanvas(downscale, Math.round(downscale * (srcH / srcW)));
    small.ctx.drawImage(img, 0, 0, small.c.width, small.c.height);
    const out = makeCanvas(dstW, dstH);
    out.ctx.imageSmoothingEnabled = false;
    out.ctx.drawImage(small.c, 0, 0, dstW, dstH);
    return out.c;
  }

  // Crude background remover: any pixel close to a "background sample" goes transparent.
  // We'll sample top-corners.
  function chromaKey(canvas, tolerance) {
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    // Don't actually key — these photos have busy backgrounds. Instead we'll use
    // an oval mask later. Just return the canvas.
    return canvas;
  }

  // Apply an elliptical alpha mask so background fades to transparent — good for
  // billboarded enemies.
  function ovalMask(canvas, feather) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const cx = w / 2, cy = h / 2;
    const rx = w * 0.45, ry = h * 0.5;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        const r = dx * dx + dy * dy;
        let a = 1;
        if (r > 1) a = 0;
        else if (r > 1 - feather) a = (1 - r) / feather;
        const i = (y * w + x) * 4;
        d[i + 3] = Math.round(d[i + 3] * a);
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  // Dim/shift palette for a "mood" overlay.
  function tintCanvas(srcCanvas, tintColor, tintAmount) {
    const out = makeCanvas(srcCanvas.width, srcCanvas.height);
    out.ctx.drawImage(srcCanvas, 0, 0);
    out.ctx.globalCompositeOperation = 'source-atop';
    out.ctx.globalAlpha = tintAmount;
    out.ctx.fillStyle = tintColor;
    out.ctx.fillRect(0, 0, out.c.width, out.c.height);
    out.ctx.globalAlpha = 1;
    out.ctx.globalCompositeOperation = 'source-over';
    return out.c;
  }

  // ----- DANI HUD FACES — 5 moods, photo-based -----
  // Returns a sheet 5 frames wide, each frame 64x64.
  function makeDaniFaces(daniImg) {
    const W = 64, H = 64;
    const sheet = makeCanvas(W * 5, H);
    const ctx = sheet.ctx;

    // pixelated dani portrait (square crop centered on face)
    const srcW = daniImg.naturalWidth, srcH = daniImg.naturalHeight;
    const cropSize = Math.min(srcW, srcH);
    const cropX = (srcW - cropSize) / 2;
    const cropY = (srcH - cropSize) / 2 - srcH * 0.05; // bias up to face

    // Make a base square pixelated face at 32x32
    const base = makeCanvas(32, 32);
    base.ctx.imageSmoothingEnabled = false;
    base.ctx.drawImage(daniImg, cropX, cropY, cropSize, cropSize, 0, 0, 32, 32);

    function drawFrame(ox, mood) {
      // base photo upscaled
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(base.c, ox, 0, W, H);

      // chunky border / vignette
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(ox, 0, W, 4);
      ctx.fillRect(ox, H - 4, W, 4);
      ctx.fillRect(ox, 0, 4, H);
      ctx.fillRect(ox + W - 4, 0, 4, H);

      // mood-specific overlays
      if (mood === 0) {
        // calm — slight green tint to match Dani's reptilian rule
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = PAL.daniGreen;
        ctx.fillRect(ox, 0, W, H);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      } else if (mood === 1) {
        // grin — yellow/orange tint, "just blasted something"
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = PAL.daniSpike;
        ctx.fillRect(ox, 0, W, H);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        // little teeth grin overlay
        ctx.fillStyle = '#fff';
        ctx.fillRect(ox + 24, 44, 16, 4);
        ctx.fillStyle = '#000';
        for (let i = 0; i < 5; i++) ctx.fillRect(ox + 26 + i * 3, 44, 1, 4);
      } else if (mood === 2) {
        // hurt — red tint + blood
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = PAL.blood;
        ctx.fillRect(ox, 0, W, H);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = PAL.blood;
        ctx.fillRect(ox + 30, 8, 3, 16);
        ctx.fillRect(ox + 32, 12, 2, 18);
        ctx.fillStyle = PAL.bloodDark;
        ctx.fillRect(ox + 30, 24, 3, 4);
      } else if (mood === 3) {
        // angry — heavy red, dark
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#7a0a0a';
        ctx.fillRect(ox, 0, W, H);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        // angry brow lines
        ctx.fillStyle = '#000';
        ctx.fillRect(ox + 12, 16, 16, 2);
        ctx.fillRect(ox + 36, 16, 16, 2);
      } else if (mood === 4) {
        // dead — desaturate + X eyes
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(ox, 0, W, H);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        // big X eyes
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ox + 14, 22); ctx.lineTo(ox + 26, 34);
        ctx.moveTo(ox + 26, 22); ctx.lineTo(ox + 14, 34);
        ctx.moveTo(ox + 38, 22); ctx.lineTo(ox + 50, 34);
        ctx.moveTo(ox + 50, 22); ctx.lineTo(ox + 38, 34);
        ctx.stroke();
        ctx.fillStyle = PAL.blood;
        ctx.fillRect(ox + 28, 48, 8, 4);
      }
    }

    for (let m = 0; m < 5; m++) drawFrame(m * W, m);
    return sheet.c;
  }

  // ----- CAVEMAN ENEMY — photo-based, 4 frames (idle, walk1, walk2, attack) -----
  // 48x64 per frame
  function makeCaveman(caveImg, variant = 0) {
    const FW = 48, FH = 64;
    const sheet = makeCanvas(FW * 4, FH);
    const ctx = sheet.ctx;
    ctx.imageSmoothingEnabled = false;

    // pixelated portrait
    const srcW = caveImg.naturalWidth, srcH = caveImg.naturalHeight;
    // for the photo of the caveman we want full upper body — use top portion
    const cropW = srcW;
    const cropH = Math.min(srcH, srcW * (FH / FW));

    const base = makeCanvas(FW, FH);
    base.ctx.imageSmoothingEnabled = false;
    base.ctx.drawImage(caveImg, 0, 0, cropW, cropH, 0, 0, FW, FH);

    // soft oval mask so backdrop fades
    ovalMask(base.c, 0.35);

    // variant tint
    let tint = null;
    if (variant === 1) tint = '#a04020';
    else if (variant === 2) tint = '#406a30';

    let tinted = base.c;
    if (tint) tinted = tintCanvas(base.c, tint, 0.3);

    function drawFrame(ox, frame) {
      // body
      ctx.drawImage(tinted, ox + (frame === 1 ? -1 : frame === 2 ? 1 : 0), frame === 3 ? -2 : 0);

      // primitive shadow under feet
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(ox + 6, FH - 4, FW - 12, 3);

      // CLUB held in right hand — chunky pixel club
      const clubX = ox + (frame === 3 ? 4 : FW - 18);
      const clubY = frame === 3 ? 10 : 28;
      // shaft
      ctx.fillStyle = '#4a2a10';
      ctx.fillRect(clubX, clubY, 3, 18);
      // head
      ctx.fillStyle = '#8a5a2a';
      ctx.fillRect(clubX - 3, clubY - 6, 9, 8);
      ctx.fillStyle = '#6a3a1a';
      ctx.fillRect(clubX - 3, clubY - 6, 9, 2);
      ctx.fillRect(clubX - 3, clubY, 9, 2);
      // spike
      ctx.fillStyle = '#cccccc';
      ctx.fillRect(clubX - 4, clubY - 4, 1, 3);
      ctx.fillRect(clubX + 6, clubY - 4, 1, 3);

      if (frame === 3) {
        // attack snarl — red edge tint at top
        ctx.fillStyle = 'rgba(255,30,30,0.25)';
        ctx.fillRect(ox, 0, FW, FH);
      }
    }

    for (let f = 0; f < 4; f++) drawFrame(f * FW, f);
    return sheet.c;
  }

  // ----- WALL TEXTURES -----
  function makeWallTextures() {
    const SZ = 64;
    const textures = {};

    {
      const { c, ctx } = makeCanvas(SZ, SZ);
      ctx.fillStyle = '#d8c298';
      ctx.fillRect(0, 0, SZ, SZ);
      const img = ctx.getImageData(0, 0, SZ, SZ);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = (Math.random() * 30) | 0;
        img.data[i] = Math.max(0, img.data[i] - n);
        img.data[i + 1] = Math.max(0, img.data[i + 1] - n);
        img.data[i + 2] = Math.max(0, img.data[i + 2] - n);
      }
      ctx.putImageData(img, 0, 0);
      // windows
      ctx.fillStyle = '#1a1020';
      ctx.fillRect(8, 8, 16, 20);
      ctx.fillRect(40, 8, 16, 20);
      ctx.fillRect(8, 36, 16, 20);
      ctx.fillRect(40, 36, 16, 20);
      ctx.fillStyle = '#a08458';
      ctx.fillRect(6, 28, 20, 2);
      ctx.fillRect(38, 28, 20, 2);
      ctx.fillRect(6, 56, 20, 2);
      ctx.fillRect(38, 56, 20, 2);
      ctx.fillStyle = '#3a3050';
      ctx.fillRect(10, 10, 4, 2);
      ctx.fillRect(42, 10, 4, 2);
      ctx.fillRect(10, 38, 4, 2);
      ctx.fillRect(42, 38, 4, 2);
      textures.concrete = c;
    }
    {
      const { c, ctx } = makeCanvas(SZ, SZ);
      ctx.fillStyle = '#2a5a1a';
      ctx.fillRect(0, 0, SZ, SZ);
      for (let i = 0; i < 220; i++) {
        ctx.fillStyle = ['#3a7a2a', '#4a8a3a', '#1a4a0a', '#5a9a4a'][Math.floor(Math.random() * 4)];
        ctx.fillRect((Math.random() * SZ) | 0, (Math.random() * SZ) | 0, 2, 2);
      }
      textures.hedge = c;
    }
    {
      const { c, ctx } = makeCanvas(SZ, SZ);
      ctx.fillStyle = '#3a2010';
      ctx.fillRect(0, 0, SZ, SZ);
      ctx.fillStyle = '#a04a2a';
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const offset = row % 2 === 0 ? 0 : 4;
          ctx.fillRect(col * 8 + offset + 1, row * 8 + 1, 6, 6);
        }
      }
      const img = ctx.getImageData(0, 0, SZ, SZ);
      for (let i = 0; i < img.data.length; i += 4) {
        if (Math.random() < 0.3) {
          const n = (Math.random() * 50) | 0;
          img.data[i] = Math.max(0, img.data[i] - n);
          img.data[i + 1] = Math.max(0, img.data[i + 1] - n);
          img.data[i + 2] = Math.max(0, img.data[i + 2] - n);
        }
      }
      ctx.putImageData(img, 0, 0);
      textures.brick = c;
    }
    {
      const { c, ctx } = makeCanvas(SZ, SZ);
      ctx.fillStyle = '#ff8a1f';
      ctx.fillRect(0, 0, SZ, SZ);
      ctx.fillStyle = '#7a1a00';
      ctx.fillRect(0, 0, SZ, 4);
      ctx.fillRect(0, SZ - 4, SZ, 4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(14, 14, 8, 36);
      ctx.fillRect(14, 14, 26, 6);
      ctx.fillRect(14, 28, 20, 6);
      ctx.fillStyle = '#7cff5a';
      ctx.fillRect(46, 46, 6, 6);
      textures.sign = c;
    }
    {
      const { c, ctx } = makeCanvas(SZ, SZ);
      ctx.fillStyle = '#5a5a6a';
      ctx.fillRect(0, 0, SZ, SZ);
      for (let y = 0; y < SZ; y += 6) {
        ctx.fillStyle = '#3a3a4a';
        ctx.fillRect(0, y, SZ, 1);
        ctx.fillStyle = '#7a7a8a';
        ctx.fillRect(0, y + 1, SZ, 1);
      }
      ctx.fillStyle = '#1a1a2a';
      ctx.fillRect(2, 2, SZ - 4, 2);
      ctx.fillRect(2, SZ - 4, SZ - 4, 2);
      textures.garage = c;
    }
    // ── mall_glass — storefront window with reflective vertical highlights ──
    {
      const { c, ctx } = makeCanvas(SZ, SZ);
      // base teal-blue glass
      const grad = ctx.createLinearGradient(0, 0, 0, SZ);
      grad.addColorStop(0, '#3a5a7a');
      grad.addColorStop(0.5, '#5a8aa8');
      grad.addColorStop(1, '#2a4a6a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, SZ, SZ);
      // vertical highlight reflections
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(10, 4, 2, SZ - 8);
      ctx.fillRect(40, 4, 1, SZ - 8);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(22, 8, 1, SZ - 16);
      // dark frame
      ctx.fillStyle = '#1a2a3a';
      ctx.fillRect(0, 0, SZ, 3);
      ctx.fillRect(0, SZ - 3, SZ, 3);
      ctx.fillRect(0, 0, 3, SZ);
      ctx.fillRect(SZ - 3, 0, 3, SZ);
      // crossbar
      ctx.fillRect(0, SZ / 2 - 1, SZ, 2);
      textures.mall_glass = c;
    }
    // ── station_tile — clean ceramic wall tile, subway feel ──
    {
      const { c, ctx } = makeCanvas(SZ, SZ);
      ctx.fillStyle = '#dcdcd4';
      ctx.fillRect(0, 0, SZ, SZ);
      // tile grid: 4 columns × 4 rows of 16×16, with grout
      ctx.fillStyle = '#7a7a72';
      for (let y = 0; y <= SZ; y += 16) ctx.fillRect(0, y, SZ, 1);
      for (let x = 0; x <= SZ; x += 16) ctx.fillRect(x, 0, 1, SZ);
      // subtle dirt/wear
      const img = ctx.getImageData(0, 0, SZ, SZ);
      for (let i = 0; i < img.data.length; i += 4) {
        if (Math.random() < 0.18) {
          const n = (Math.random() * 22) | 0;
          img.data[i] = Math.max(0, img.data[i] - n);
          img.data[i + 1] = Math.max(0, img.data[i + 1] - n);
          img.data[i + 2] = Math.max(0, img.data[i + 2] - n);
        }
      }
      ctx.putImageData(img, 0, 0);
      textures.station_tile = c;
    }
    // ── mall_storefront — bright retail facade with abstract logo ──
    {
      const { c, ctx } = makeCanvas(SZ, SZ);
      ctx.fillStyle = '#c11515';
      ctx.fillRect(0, 0, SZ, SZ);
      // top awning band
      ctx.fillStyle = '#ffd33a';
      ctx.fillRect(0, 0, SZ, 10);
      ctx.fillStyle = '#1a0a2a';
      ctx.fillRect(0, 9, SZ, 2);
      // logo: bold "M" shape
      ctx.fillStyle = '#fff';
      ctx.fillRect(14, 22, 6, 28);
      ctx.fillRect(44, 22, 6, 28);
      ctx.fillRect(20, 22, 4, 4);
      ctx.fillRect(40, 22, 4, 4);
      ctx.fillRect(24, 26, 4, 4);
      ctx.fillRect(36, 26, 4, 4);
      ctx.fillRect(28, 30, 4, 4);
      ctx.fillRect(32, 30, 4, 4);
      // bottom shadow
      ctx.fillStyle = '#7a0a0a';
      ctx.fillRect(0, SZ - 4, SZ, 4);
      textures.mall_storefront = c;
    }
    return textures;
  }

  // ----- PROJECTILE & PICKUPS -----
  function makeProjectile() {
    const SZ = 16;
    const { c, ctx } = makeCanvas(SZ, SZ);
    const grad = ctx.createRadialGradient(SZ / 2, SZ / 2, 1, SZ / 2, SZ / 2, SZ / 2);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.3, '#cfffb0');
    grad.addColorStop(0.7, '#7cff5a');
    grad.addColorStop(1, 'rgba(60,170,40,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SZ, SZ);
    return c;
  }
  function makePickup() {
    const SZ = 16;
    const { c, ctx } = makeCanvas(SZ, SZ);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2, 2, 12, 12);
    ctx.fillStyle = '#c11515';
    ctx.fillRect(6, 4, 4, 8);
    ctx.fillRect(4, 6, 8, 4);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(2, 2, 12, 1); ctx.fillRect(2, 13, 12, 1);
    ctx.fillRect(2, 2, 1, 12); ctx.fillRect(13, 2, 1, 12);
    return c;
  }
  function makeCoin() {
    const SZ = 16;
    const { c, ctx } = makeCanvas(SZ, SZ);
    const grad = ctx.createRadialGradient(SZ / 2 - 2, SZ / 2 - 2, 1, SZ / 2, SZ / 2, SZ / 2);
    grad.addColorStop(0, '#fff8c0');
    grad.addColorStop(0.5, '#ffd33a');
    grad.addColorStop(1, '#a86a08');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(SZ / 2, SZ / 2, SZ / 2 - 1, SZ / 2 - 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a4a00';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('$', SZ / 2, SZ / 2 + 1);
    ctx.strokeStyle = '#5a3000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(SZ / 2, SZ / 2, SZ / 2 - 1, SZ / 2 - 1, 0, 0, Math.PI * 2);
    ctx.stroke();
    return c;
  }
  function makeAmmoPickup() {
    const SZ = 16;
    const { c, ctx } = makeCanvas(SZ, SZ);
    ctx.fillStyle = '#1a3a0a';
    ctx.fillRect(3, 2, 10, 12);
    ctx.fillStyle = '#7cff5a';
    ctx.fillRect(4, 3, 8, 10);
    ctx.fillStyle = '#1a3a0a';
    ctx.fillRect(6, 5, 4, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(7, 6, 2, 4);
    return c;
  }

  // ----- WEAPON: Dani's photo-arm + chunky blaster -----
  function makeWeapon(daniImg) {
    const W = 256, H = 192;
    const idle = makeCanvas(W, H);
    const fire = makeCanvas(W, H);

    // Pixelated arm using Dani's lower face area & shoulder — actually we'll just
    // draw two scaly green arms with Dani-tinted skin tone.
    function drawHands(ctx) {
      // Two chunky scaly hands
      const handY = H - 80;
      ctx.fillStyle = PAL.daniGreen;
      // left hand
      ctx.fillRect(40, handY, 56, 80);
      ctx.fillStyle = PAL.daniGreenDark;
      ctx.fillRect(40, handY, 56, 6);
      ctx.fillRect(40, handY, 6, 80);
      // right hand
      ctx.fillStyle = PAL.daniGreen;
      ctx.fillRect(W - 96, handY, 56, 80);
      ctx.fillStyle = PAL.daniGreenDark;
      ctx.fillRect(W - 96, handY, 56, 6);
      ctx.fillRect(W - 46, handY, 6, 80);
      // claws
      ctx.fillStyle = PAL.bone;
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(50 + i * 12, handY - 8, 4, 10);
        ctx.fillRect(W - 90 + i * 12, handY - 8, 4, 10);
      }
      // photo overlay on a small "face peeking" detail in lower center as easter egg —
      // skip (keeps it cleaner).
    }

    function drawBlaster(ctx, firing) {
      const cx = W / 2;
      const bodyY = H - 100;

      // back / grip
      ctx.fillStyle = '#2a2a3a';
      ctx.fillRect(cx - 60, bodyY, 120, 70);
      ctx.fillStyle = '#3a3a4a';
      ctx.fillRect(cx - 56, bodyY + 4, 112, 62);

      // top accent stripe
      ctx.fillStyle = PAL.daniSpike;
      ctx.fillRect(cx - 50, bodyY + 4, 100, 8);

      // barrel
      ctx.fillStyle = '#1a1a2a';
      ctx.fillRect(cx - 28, bodyY - 40, 56, 50);
      ctx.fillStyle = '#5a5a6a';
      ctx.fillRect(cx - 24, bodyY - 36, 48, 8);
      // muzzle ring
      ctx.fillStyle = '#9a9aaa';
      ctx.fillRect(cx - 32, bodyY - 44, 64, 8);
      ctx.fillStyle = '#000';
      ctx.fillRect(cx - 18, bodyY - 48, 36, 6);

      // glowing chamber
      ctx.fillStyle = '#0a2a0a';
      ctx.fillRect(cx - 40, bodyY + 18, 80, 40);
      ctx.fillStyle = PAL.neon;
      ctx.fillRect(cx - 36, bodyY + 22, 72, 32);
      ctx.fillStyle = '#cfffb0';
      ctx.fillRect(cx - 30, bodyY + 26, 12, 8);
      ctx.fillRect(cx + 4, bodyY + 30, 16, 8);
      ctx.fillRect(cx + 24, bodyY + 28, 8, 6);

      // bolts
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(cx - 52, bodyY + 8, 4, 4);
      ctx.fillRect(cx + 48, bodyY + 8, 4, 4);
      ctx.fillRect(cx - 52, bodyY + 60, 4, 4);
      ctx.fillRect(cx + 48, bodyY + 60, 4, 4);

      if (firing) {
        const mx = cx, my = bodyY - 50;
        const grad = ctx.createRadialGradient(mx, my, 1, mx, my, 80);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, '#ffe14a');
        grad.addColorStop(0.65, '#ff8a1f');
        grad.addColorStop(1, 'rgba(255,138,31,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(mx - 80, my - 80, 160, 160);
        // sparks
        ctx.fillStyle = '#fff';
        ctx.fillRect(mx - 4, my - 40, 4, 16);
        ctx.fillRect(mx + 18, my - 30, 6, 4);
        ctx.fillRect(mx - 30, my - 24, 8, 4);
        ctx.fillRect(mx + 36, my - 16, 4, 4);
      }
    }

    drawHands(idle.ctx);
    drawBlaster(idle.ctx, false);
    drawHands(fire.ctx);
    drawBlaster(fire.ctx, true);

    // pixelate by downscale-then-upscale
    function chunky(srcCanvas) {
      const small = makeCanvas(srcCanvas.width / 2, srcCanvas.height / 2);
      small.ctx.imageSmoothingEnabled = false;
      small.ctx.drawImage(srcCanvas, 0, 0, small.c.width, small.c.height);
      const out = makeCanvas(srcCanvas.width, srcCanvas.height);
      out.ctx.imageSmoothingEnabled = false;
      out.ctx.drawImage(small.c, 0, 0, out.c.width, out.c.height);
      return out.c;
    }
    return { idle: chunky(idle.c), fire: chunky(fire.c) };
  }

  // ----- WEAPON 2: Super-shotgun (double-barrel) -----
  function makeWeaponShotgun(daniImg) {
    const W = 256, H = 192;
    const idle = makeCanvas(W, H);
    const fire = makeCanvas(W, H);
    function drawHands(ctx) {
      const handY = H - 80;
      ctx.fillStyle = PAL.daniGreen;
      ctx.fillRect(40, handY, 56, 80);
      ctx.fillStyle = PAL.daniGreenDark;
      ctx.fillRect(40, handY, 56, 6); ctx.fillRect(40, handY, 6, 80);
      ctx.fillStyle = PAL.daniGreen;
      ctx.fillRect(W - 96, handY, 56, 80);
      ctx.fillStyle = PAL.daniGreenDark;
      ctx.fillRect(W - 96, handY, 56, 6); ctx.fillRect(W - 46, handY, 6, 80);
      ctx.fillStyle = PAL.bone;
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(50 + i * 12, handY - 8, 4, 10);
        ctx.fillRect(W - 90 + i * 12, handY - 8, 4, 10);
      }
    }
    function drawShotgun(ctx, firing) {
      const cx = W / 2;
      const bodyY = H - 100;

      // wooden stock (held by hands at the bottom)
      ctx.fillStyle = '#5a3010';
      ctx.fillRect(cx - 70, bodyY + 10, 140, 70);
      ctx.fillStyle = '#7a4020';
      ctx.fillRect(cx - 66, bodyY + 14, 132, 62);
      // grain lines
      ctx.fillStyle = '#3a1a04';
      for (let i = 0; i < 4; i++) ctx.fillRect(cx - 60 + i * 30, bodyY + 18, 2, 54);

      // metal receiver
      ctx.fillStyle = '#2a2a36';
      ctx.fillRect(cx - 60, bodyY - 12, 120, 32);
      ctx.fillStyle = '#5a5a6a';
      ctx.fillRect(cx - 56, bodyY - 8, 112, 24);
      ctx.fillStyle = '#1a1a24';
      ctx.fillRect(cx - 46, bodyY - 4, 92, 14);

      // double barrels — pointing UP (forward into the screen)
      ctx.fillStyle = '#1a1a24';
      ctx.fillRect(cx - 50, bodyY - 70, 28, 60);
      ctx.fillRect(cx + 22, bodyY - 70, 28, 60);
      // highlight stripes along the top of each barrel
      ctx.fillStyle = '#5a5a6a';
      ctx.fillRect(cx - 46, bodyY - 66, 6, 56);
      ctx.fillRect(cx + 26, bodyY - 66, 6, 56);
      // outer ring (muzzle ends)
      ctx.fillStyle = '#9a9aaa';
      ctx.fillRect(cx - 54, bodyY - 76, 36, 8);
      ctx.fillRect(cx + 18, bodyY - 76, 36, 8);
      // muzzle holes (looking down the barrels)
      ctx.fillStyle = '#000';
      ctx.fillRect(cx - 48, bodyY - 80, 24, 10);
      ctx.fillRect(cx + 24, bodyY - 80, 24, 10);
      ctx.fillStyle = '#1a1a24';
      ctx.fillRect(cx - 44, bodyY - 78, 16, 6);
      ctx.fillRect(cx + 28, bodyY - 78, 16, 6);

      // sight bead at top center
      ctx.fillStyle = '#c11515';
      ctx.fillRect(cx - 4, bodyY - 84, 8, 6);

      // trigger guard
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(cx - 14, bodyY + 22, 28, 18);
      ctx.fillStyle = '#9a8a4a';
      ctx.fillRect(cx - 4, bodyY + 26, 8, 14);

      // bolts on receiver
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(cx - 52, bodyY - 6, 4, 4);
      ctx.fillRect(cx + 48, bodyY - 6, 4, 4);
      ctx.fillRect(cx - 52, bodyY + 12, 4, 4);
      ctx.fillRect(cx + 48, bodyY + 12, 4, 4);

      if (firing) {
        const mx = cx, my = bodyY - 80;
        const grad = ctx.createRadialGradient(mx, my, 2, mx, my, 130);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.25, '#ffe14a');
        grad.addColorStop(0.55, '#ff5a1f');
        grad.addColorStop(1, 'rgba(255,90,31,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(mx - 130, my - 130, 260, 260);
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 10; i++) {
          ctx.fillRect(mx + (Math.random() * 120 - 60), my + (Math.random() * 80 - 60), 4, 4);
        }
      }
    }
    drawHands(idle.ctx); drawShotgun(idle.ctx, false);
    drawHands(fire.ctx); drawShotgun(fire.ctx, true);
    function chunky(src) {
      const small = makeCanvas(src.width / 2, src.height / 2);
      small.ctx.imageSmoothingEnabled = false;
      small.ctx.drawImage(src, 0, 0, small.c.width, small.c.height);
      const out = makeCanvas(src.width, src.height);
      out.ctx.imageSmoothingEnabled = false;
      out.ctx.drawImage(small.c, 0, 0, out.c.width, out.c.height);
      return out.c;
    }
    return { idle: chunky(idle.c), fire: chunky(fire.c) };
  }

  // Pickup sprite for the dropped weapon
  function makeWeaponDrop() {
    const SZ = 24;
    const { c, ctx } = makeCanvas(SZ, SZ);
    // glow
    const grad = ctx.createRadialGradient(SZ / 2, SZ / 2, 1, SZ / 2, SZ / 2, SZ / 2);
    grad.addColorStop(0, 'rgba(255,220,80,0.7)');
    grad.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SZ, SZ);
    // gun body
    ctx.fillStyle = '#5a3010';
    ctx.fillRect(3, 12, 8, 6);
    ctx.fillStyle = '#2a2a36';
    ctx.fillRect(10, 11, 6, 7);
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(15, 11, 7, 3);
    ctx.fillRect(15, 15, 7, 3);
    ctx.fillStyle = '#c11515';
    ctx.fillRect(20, 9, 2, 2);
    return c;
  }

  // ----- TITLE-SCREEN DANI: large pixelated portrait with crown -----
  function makeTitleDani(daniImg) {
    const W = 256, H = 256;
    const out = makeCanvas(W, H);
    const ctx = out.ctx;
    // pixelate to ~48x48 and upscale
    const small = makeCanvas(48, 48);
    small.ctx.imageSmoothingEnabled = false;
    const srcW = daniImg.naturalWidth, srcH = daniImg.naturalHeight;
    const cropSize = Math.min(srcW, srcH);
    const cropX = (srcW - cropSize) / 2;
    const cropY = (srcH - cropSize) / 2 - srcH * 0.05;
    small.ctx.drawImage(daniImg, cropX, cropY, cropSize, cropSize, 0, 0, 48, 48);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small.c, 16, 40, W - 32, H - 56);
    // green tint
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = PAL.daniGreen;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // CROWN
    ctx.fillStyle = '#ffd84a';
    ctx.fillRect(40, 28, 176, 24);
    ctx.fillRect(40, 16, 24, 24);
    ctx.fillRect(116, 8, 24, 32);
    ctx.fillRect(192, 16, 24, 24);
    ctx.fillStyle = '#a06a10';
    ctx.fillRect(40, 48, 176, 4);
    // jewels
    ctx.fillStyle = '#c11515';
    ctx.fillRect(120, 18, 16, 16);
    ctx.fillStyle = '#7cff5a';
    ctx.fillRect(48, 24, 8, 8);
    ctx.fillRect(200, 24, 8, 8);
    // chunky border
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, 4);
    ctx.fillRect(0, H - 4, W, 4);
    ctx.fillRect(0, 0, 4, H);
    ctx.fillRect(W - 4, 0, 4, H);
    return out.c;
  }

  // ----- FRIEND NPC — peaceful, do NOT kill -----
  function makeFriend(friendImg) {
    const FW = 48, FH = 64;
    const sheet = makeCanvas(FW * 2, FH);
    const ctx = sheet.ctx;
    ctx.imageSmoothingEnabled = false;
    const srcW = friendImg.naturalWidth, srcH = friendImg.naturalHeight;
    const cropW = srcW;
    const cropH = Math.min(srcH, srcW * (FH / FW));
    const base = makeCanvas(FW, FH);
    base.ctx.imageSmoothingEnabled = false;
    base.ctx.drawImage(friendImg, 0, 0, cropW, cropH, 0, 0, FW, FH);
    ovalMask(base.c, 0.35);

    function drawFrame(ox, frame) {
      ctx.drawImage(base.c, ox + (frame === 1 ? 1 : 0), 0);
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(ox + 6, FH - 4, FW - 12, 3);
      // friendly halo / heart above
      ctx.fillStyle = '#ff5a8a';
      ctx.fillRect(ox + 20, 2, 2, 2);
      ctx.fillRect(ox + 24, 2, 2, 2);
      ctx.fillRect(ox + 18, 4, 10, 2);
      ctx.fillRect(ox + 20, 6, 6, 2);
      ctx.fillRect(ox + 22, 8, 2, 2);
      // peaceful green outline glow
      ctx.fillStyle = 'rgba(124,255,90,0.18)';
      ctx.fillRect(ox + 2, 12, FW - 4, FH - 16);
    }
    drawFrame(0, 0);
    drawFrame(FW, 1);
    return sheet.c;
  }

  // ----- BOSS — uses a wooden pallet as a weapon, throws Coke cans -----
  function makeBoss(bossImg) {
    const FW = 64, FH = 96;
    const sheet = makeCanvas(FW * 4, FH);
    const ctx = sheet.ctx;
    ctx.imageSmoothingEnabled = false;
    const srcW = bossImg.naturalWidth, srcH = bossImg.naturalHeight;
    const cropSize = Math.min(srcW, srcH);
    const cropX = (srcW - cropSize) / 2;
    const cropY = 0;

    const head = makeCanvas(FW, FW);
    head.ctx.imageSmoothingEnabled = false;
    head.ctx.drawImage(bossImg, cropX, cropY, cropSize, cropSize, 0, 0, FW, FW);
    ovalMask(head.c, 0.3);

    function drawFrame(ox, frame) {
      // muscular body shape (chunky pixel torso)
      const bodyTop = FW - 10;
      ctx.fillStyle = '#3a1a10';
      ctx.fillRect(ox + 8, bodyTop, FW - 16, 36);
      ctx.fillStyle = '#1a0a05';
      ctx.fillRect(ox + 8, bodyTop, FW - 16, 4);
      // arms (skin tone)
      ctx.fillStyle = '#c89878';
      ctx.fillRect(ox + 2, bodyTop + 4, 10, 28);
      ctx.fillRect(ox + FW - 12, bodyTop + 4, 10, 28);
      ctx.fillStyle = '#a87858';
      ctx.fillRect(ox + 2, bodyTop + 4, 10, 3);
      ctx.fillRect(ox + FW - 12, bodyTop + 4, 10, 3);
      // legs
      ctx.fillStyle = '#1a1a3a';
      ctx.fillRect(ox + 12, FH - 26, 16, 24);
      ctx.fillRect(ox + FW - 28, FH - 26, 16, 24);
      ctx.fillStyle = '#0a0a1a';
      ctx.fillRect(ox + 12, FH - 4, 16, 4);
      ctx.fillRect(ox + FW - 28, FH - 4, 16, 4);
      // head photo
      ctx.drawImage(head.c, ox, 0);
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(ox + 6, FH - 3, FW - 12, 2);

      if (frame === 0 || frame === 1) {
        // PALLET — held to the side
        const px = ox + (frame === 1 ? FW - 14 : -2);
        const py = FH - 64;
        ctx.fillStyle = '#a07040';
        ctx.fillRect(px, py, 14, 38);
        ctx.fillStyle = '#5a3010';
        for (let i = 0; i < 4; i++) ctx.fillRect(px, py + i * 10, 14, 2);
        ctx.fillRect(px, py, 2, 38);
        ctx.fillRect(px + 12, py, 2, 38);
      } else if (frame === 2) {
        // PALLET swinging — overhead
        ctx.save();
        ctx.translate(ox + FW / 2, FH - 50);
        ctx.rotate(-0.4);
        ctx.fillStyle = '#a07040';
        ctx.fillRect(-10, -28, 20, 44);
        ctx.fillStyle = '#5a3010';
        for (let i = 0; i < 4; i++) ctx.fillRect(-10, -28 + i * 11, 20, 2);
        ctx.restore();
        // red rage tint
        ctx.fillStyle = 'rgba(255,30,30,0.3)';
        ctx.fillRect(ox, 0, FW, FH);
      } else if (frame === 3) {
        // throwing a Coke can — arm raised
        ctx.fillStyle = '#c89878';
        ctx.fillRect(ox + FW - 14, bodyTop - 14, 12, 18);
        // can in hand
        ctx.fillStyle = '#c11515';
        ctx.fillRect(ox + FW - 8, bodyTop - 22, 8, 12);
        ctx.fillStyle = '#fff';
        ctx.fillRect(ox + FW - 7, bodyTop - 18, 6, 2);
      }
    }
    for (let f = 0; f < 4; f++) drawFrame(f * FW, f);
    return sheet.c;
  }

  // ----- COCA-COLA CAN PROJECTILE -----
  function makeColaCan() {
    const SZ = 24;
    const { c, ctx } = makeCanvas(SZ, SZ);
    // can body
    ctx.fillStyle = '#c11515';
    ctx.fillRect(6, 4, 12, 18);
    ctx.fillStyle = '#7a0a0a';
    ctx.fillRect(6, 4, 12, 2);
    ctx.fillRect(6, 20, 12, 2);
    // top rim
    ctx.fillStyle = '#9a9aaa';
    ctx.fillRect(6, 2, 12, 2);
    // white label stripe
    ctx.fillStyle = '#fff';
    ctx.fillRect(6, 11, 12, 3);
    ctx.fillStyle = '#c11515';
    ctx.fillRect(8, 12, 1, 1);
    ctx.fillRect(10, 12, 1, 1);
    ctx.fillRect(12, 12, 1, 1);
    ctx.fillRect(14, 12, 1, 1);
    ctx.fillRect(16, 12, 1, 1);
    // highlight
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(7, 5, 1, 16);
    return c;
  }

  // ----- LOAD ASSETS -----
  const ready = (async () => {
    const [dani, caveman, friend, boss] = await Promise.all([
      loadImg('assets/dani.png'),
      loadImg('assets/caveman.png'),
      loadImg('assets/friend.png'),
      loadImg('assets/boss.png'),
    ]);
    images.dani = dani;
    images.caveman = caveman;
    images.friend = friend;
    images.boss = boss;
    return images;
  })();

  window.SPRITES = {
    PAL,
    ready,
    images,
    makeDaniFaces: () => makeDaniFaces(images.dani),
    makeCaveman: (variant) => makeCaveman(images.caveman, variant),
    makeFriend: () => makeFriend(images.friend),
    makeBoss: () => makeBoss(images.boss),
    makeColaCan,
    makeWallTextures,
    makeProjectile,
    makePickup,
    makeAmmoPickup,
    makeCoin,
    makeWeapon: () => makeWeapon(images.dani),
    makeWeaponShotgun: () => makeWeaponShotgun(images.dani),
    makeWeaponDrop,
    makeTitleDani: () => makeTitleDani(images.dani),
  };
})();
