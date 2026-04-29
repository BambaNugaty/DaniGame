// Tiny Web Audio synth — no asset files, just oscillators & noise.
(function () {
  'use strict';

  let ctx = null;
  let masterGain = null;
  let muted = false;
  let masterVolume = 0.35;
  const MASTER_MAX = 1.0;
  const MASTER_MIN = 0.0;
  const VOLUME_STEP = 0.1;

  try {
    const saved = parseFloat(localStorage.getItem('dani_volume'));
    if (!isNaN(saved)) masterVolume = Math.max(MASTER_MIN, Math.min(MASTER_MAX, saved));
  } catch (e) {}

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : masterVolume;
    masterGain.connect(ctx.destination);
    return ctx;
  }

  function noiseBuffer(durationMs) {
    const c = ensure(); if (!c) return null;
    const len = Math.floor(c.sampleRate * durationMs / 1000);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function play({ type = 'sine', freq = 440, freqEnd = null, durMs = 200, gain = 0.5, attack = 0.005, release = 0.05, detune = 0, filter = null }) {
    const c = ensure(); if (!c || muted) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (freqEnd != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), c.currentTime + durMs / 1000);
    if (detune) o.detune.value = detune;
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(gain, c.currentTime + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durMs / 1000);
    let last = o;
    if (filter) {
      const f = c.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.value = filter.freq || 800;
      o.connect(f); f.connect(g); last = g;
    } else {
      o.connect(g);
    }
    g.connect(masterGain);
    o.start();
    o.stop(c.currentTime + durMs / 1000 + 0.05);
  }

  function playNoise({ durMs = 100, gain = 0.4, filterFreq = 2000, filterType = 'lowpass', release = 0.05 }) {
    const c = ensure(); if (!c || muted) return;
    const buf = noiseBuffer(durMs);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(gain, c.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durMs / 1000);
    src.connect(f); f.connect(g); g.connect(masterGain);
    src.start();
    src.stop(c.currentTime + durMs / 1000 + 0.05);
  }

  // ---- specific game sounds ----
  const SFX = {
    fire() {
      // A chunky plasma blast: down-sweep square + noise
      play({ type: 'square', freq: 480, freqEnd: 90, durMs: 180, gain: 0.25, filter: { type: 'lowpass', freq: 1800 } });
      playNoise({ durMs: 120, gain: 0.15, filterFreq: 1200 });
    },
    hit() {
      play({ type: 'sawtooth', freq: 220, freqEnd: 80, durMs: 140, gain: 0.18 });
      playNoise({ durMs: 80, gain: 0.18, filterFreq: 800 });
    },
    enemyDie() {
      play({ type: 'sawtooth', freq: 180, freqEnd: 50, durMs: 350, gain: 0.22 });
      playNoise({ durMs: 280, gain: 0.18, filterFreq: 600 });
    },
    enemyGrunt() {
      play({ type: 'sawtooth', freq: 100 + Math.random() * 30, freqEnd: 70, durMs: 220, gain: 0.16, filter: { type: 'lowpass', freq: 700 } });
    },
    playerHurt() {
      play({ type: 'square', freq: 220, freqEnd: 90, durMs: 280, gain: 0.22 });
    },
    playerDie() {
      play({ type: 'sawtooth', freq: 200, freqEnd: 40, durMs: 900, gain: 0.3 });
    },
    pickup() {
      play({ type: 'square', freq: 600, durMs: 70, gain: 0.18 });
      setTimeout(() => play({ type: 'square', freq: 900, durMs: 100, gain: 0.18 }), 70);
    },
    ammoPickup() {
      play({ type: 'square', freq: 400, durMs: 60, gain: 0.18 });
      setTimeout(() => play({ type: 'square', freq: 700, durMs: 80, gain: 0.18 }), 50);
    },
    victory() {
      [392, 494, 587, 784].forEach((f, i) => setTimeout(() => play({ type: 'square', freq: f, durMs: 200, gain: 0.22 }), i * 130));
    },
    footstep() {
      playNoise({ durMs: 50, gain: 0.06, filterFreq: 400 });
    },
    empty() {
      play({ type: 'square', freq: 120, durMs: 70, gain: 0.12 });
    },
    start() {
      [262, 330, 392, 523].forEach((f, i) => setTimeout(() => play({ type: 'square', freq: f, durMs: 120, gain: 0.2 }), i * 80));
    },
  };

  function resume() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); }
  function setMuted(v) {
    muted = !!v;
    if (masterGain) masterGain.gain.value = muted ? 0 : masterVolume;
  }
  function setVolume(v) {
    const c = ensure();
    masterVolume = Math.max(MASTER_MIN, Math.min(MASTER_MAX, v));
    try { localStorage.setItem('dani_volume', String(masterVolume)); } catch (e) {}
    if (masterGain && !muted) {
      masterGain.gain.cancelScheduledValues(c.currentTime);
      masterGain.gain.linearRampToValueAtTime(masterVolume, c.currentTime + 0.08);
    }
    return masterVolume;
  }
  function getVolume() { return masterVolume; }
  function volumeUp() { return setVolume(masterVolume + VOLUME_STEP); }
  function volumeDown() { return setVolume(masterVolume - VOLUME_STEP); }
  function toggleMute() { setMuted(!muted); return muted; }

  // ---- LOBBY MUSIC: chunky retro chiptune loop ----
  // Bassline + lead riff, looped. Built from pure oscillators.
  let musicNodes = null;
  let musicTimer = null;
  let musicStep = 0;

  // Notes (Hz). Riff inspired by retro FPS lobby vibes — minor key, driving.
  // Em pentatonic-ish over a moving bass.
  const BASS = [
    82.41, 82.41, 82.41, 82.41, // E2
    82.41, 82.41, 123.47, 123.47, // E2, B2
    98.00, 98.00, 98.00, 98.00, // G2
    98.00, 98.00, 110.00, 123.47, // G2, A2, B2
    73.42, 73.42, 73.42, 73.42, // D2
    73.42, 73.42, 110.00, 110.00, // D2, A2
    82.41, 82.41, 82.41, 82.41, // E2
    82.41, 110.00, 123.47, 146.83, // E2, A2, B2, D3
  ];
  const LEAD = [
    659.25, 0, 587.33, 0, 493.88, 0, 587.33, 0, // E5, D5, B4, D5
    659.25, 0, 783.99, 0, 659.25, 587.33, 493.88, 0, // E5, G5, E5, D5, B4
    587.33, 0, 493.88, 0, 440.00, 0, 493.88, 0, // D5, B4, A4, B4
    587.33, 659.25, 587.33, 493.88, 440.00, 0, 0, 0,
    493.88, 0, 440.00, 0, 392.00, 0, 440.00, 0, // B4, A4, G4, A4
    493.88, 0, 587.33, 0, 493.88, 440.00, 392.00, 0,
    659.25, 0, 587.33, 0, 493.88, 0, 587.33, 0,
    659.25, 783.99, 880.00, 783.99, 659.25, 587.33, 493.88, 0,
  ];
  // Simple 4-on-floor hat pattern
  const HAT = [
    0, 1, 0, 1, 0, 1, 0, 1,
    0, 1, 0, 1, 0, 1, 0, 1,
    0, 1, 0, 1, 0, 1, 0, 1,
    0, 1, 0, 1, 0, 1, 0, 1,
    0, 1, 0, 1, 0, 1, 0, 1,
    0, 1, 0, 1, 0, 1, 0, 1,
    0, 1, 0, 1, 0, 1, 0, 1,
    0, 1, 0, 1, 0, 1, 0, 1,
  ];
  const KICK = [
    1, 0, 0, 0, 1, 0, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0,
    1, 0, 0, 0, 1, 0, 1, 0,
  ];

  function startMusic() {
    const c = ensure(); if (!c) return;
    if (musicTimer) return;
    musicStep = 0;
    if (!musicNodes) {
      musicNodes = { gain: c.createGain() };
      musicNodes.gain.gain.value = 0.18;
      musicNodes.gain.connect(masterGain);
    }
    const stepMs = 130; // ~115 bpm at 16ths

    function tick() {
      if (muted || !musicNodes) return;
      const i = musicStep % BASS.length;

      // BASS: square wave, low filter
      const bf = BASS[i];
      if (bf > 0) {
        const o = c.createOscillator();
        const g = c.createGain();
        const f = c.createBiquadFilter();
        o.type = 'square'; o.frequency.value = bf;
        f.type = 'lowpass'; f.frequency.value = 500;
        g.gain.value = 0;
        g.gain.linearRampToValueAtTime(0.18, c.currentTime + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + stepMs / 1000 * 0.9);
        o.connect(f); f.connect(g); g.connect(musicNodes.gain);
        o.start(); o.stop(c.currentTime + stepMs / 1000);
      }

      // LEAD: pulse-y square, brighter
      const lf = LEAD[i];
      if (lf > 0) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'square'; o.frequency.value = lf;
        o.detune.value = -6;
        g.gain.value = 0;
        g.gain.linearRampToValueAtTime(0.07, c.currentTime + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + stepMs / 1000 * 1.6);
        o.connect(g); g.connect(musicNodes.gain);
        o.start(); o.stop(c.currentTime + stepMs / 1000 * 1.7);
        // detuned harmony oct
        const o2 = c.createOscillator();
        const g2 = c.createGain();
        o2.type = 'triangle'; o2.frequency.value = lf;
        o2.detune.value = 7;
        g2.gain.value = 0;
        g2.gain.linearRampToValueAtTime(0.05, c.currentTime + 0.005);
        g2.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + stepMs / 1000 * 1.6);
        o2.connect(g2); g2.connect(musicNodes.gain);
        o2.start(); o2.stop(c.currentTime + stepMs / 1000 * 1.7);
      }

      // KICK: low sine sweep
      if (KICK[i]) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, c.currentTime);
        o.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.12);
        g.gain.value = 0;
        g.gain.linearRampToValueAtTime(0.35, c.currentTime + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.18);
        o.connect(g); g.connect(musicNodes.gain);
        o.start(); o.stop(c.currentTime + 0.2);
      }

      // HAT: filtered noise burst
      if (HAT[i]) {
        const len = Math.floor(c.sampleRate * 0.04);
        const buf = c.createBuffer(1, len, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let n = 0; n < len; n++) d[n] = Math.random() * 2 - 1;
        const src = c.createBufferSource();
        src.buffer = buf;
        const f = c.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 6000;
        const g = c.createGain();
        g.gain.value = 0;
        g.gain.linearRampToValueAtTime(0.05, c.currentTime + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.05);
        src.connect(f); f.connect(g); g.connect(musicNodes.gain);
        src.start(); src.stop(c.currentTime + 0.06);
      }

      musicStep++;
    }
    tick();
    musicTimer = setInterval(tick, stepMs);
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    const c = ensure();
    if (c && musicNodes) {
      try {
        musicNodes.gain.gain.cancelScheduledValues(c.currentTime);
        musicNodes.gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.2);
      } catch (e) {}
    }
  }

  // ---- VOICE CLIPS (mp3 stingers) ----
  // Pools of relative paths; one is chosen at random per call.
  const CLIP_POOLS = {
    death: [
      'assets/Ashoro Dead sound 1.mp3',
      'assets/Ashoro Dead sound 2.mp3',
    ],
    bossSpawn: [
      'assets/BEN the FInal Boss 1.mp3',
      'assets/BEN the FInal Boss 2.mp3',
      'assets/BEN the FInal Boss 3.mp3',
      'assets/BEN the FInal Boss 4.mp3',
    ],
    bossDead: [
      'assets/BEN after kill the FInal Boss 1.mp3',
      'assets/BEN after kill the FInal Boss 2.mp3',
    ],
  };

  // Pre-create one Audio element per source so playback is instant after first load.
  const clipCache = {};
  function getClipEl(src) {
    if (!clipCache[src]) {
      const a = new Audio(encodeURI(src));
      a.preload = 'auto';
      clipCache[src] = a;
    }
    return clipCache[src];
  }

  // Track last-played per pool so we don't repeat the same one back-to-back.
  const lastClipChoice = {};
  let lastPlayedClip = null;

  function playClip(poolName, { volume = 1, ducking = true } = {}) {
    const pool = CLIP_POOLS[poolName];
    if (!pool || !pool.length) return null;
    if (muted) return null;
    let pick;
    if (pool.length > 1) {
      do {
        pick = pool[Math.floor(Math.random() * pool.length)];
      } while (pick === lastClipChoice[poolName]);
    } else {
      pick = pool[0];
    }
    lastClipChoice[poolName] = pick;

    // Stop any previously-playing voice clip so two don't overlap.
    if (lastPlayedClip && !lastPlayedClip.paused) {
      try { lastPlayedClip.pause(); lastPlayedClip.currentTime = 0; } catch (e) {}
    }

    const el = getClipEl(pick);
    try { el.currentTime = 0; } catch (e) {}
    el.volume = Math.max(0, Math.min(1, masterVolume * volume));
    const p = el.play();
    if (p && p.catch) p.catch(() => {});
    lastPlayedClip = el;

    if (ducking) {
      // Lower the chiptune music while the voice clip plays, then restore.
      const c = ensure();
      if (c && musicNodes) {
        const prev = musicNodes.gain.gain.value;
        musicNodes.gain.gain.cancelScheduledValues(c.currentTime);
        musicNodes.gain.gain.linearRampToValueAtTime(prev * 0.25, c.currentTime + 0.15);
        const restore = () => {
          try {
            musicNodes.gain.gain.cancelScheduledValues(c.currentTime);
            musicNodes.gain.gain.linearRampToValueAtTime(prev, c.currentTime + 0.4);
          } catch (e) {}
          el.removeEventListener('ended', restore);
        };
        el.addEventListener('ended', restore);
      }
    }
    return el;
  }

  function fadeMusic(targetGain, durMs) {
    const c = ensure(); if (!c || !musicNodes) return;
    musicNodes.gain.gain.cancelScheduledValues(c.currentTime);
    musicNodes.gain.gain.linearRampToValueAtTime(targetGain, c.currentTime + durMs / 1000);
  }

  window.AUDIO = { SFX, resume, setMuted, startMusic, stopMusic, fadeMusic, setVolume, getVolume, volumeUp, volumeDown, toggleMute, playClip };
})();
