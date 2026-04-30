// PhotoBook.js — gallery viewer for boss-kill selfies. Triggered from the
// "PHOTO BOOK" button on the title screen and from the death/victory overlays.
// Reads from SELFIE.getGallery() (localStorage-backed).
(function () {
  'use strict';

  let modalEl = null;

  function buildModal() {
    if (modalEl) return modalEl;
    const el = document.createElement('div');
    el.id = 'photo-book';
    el.style.cssText =
      'position:fixed;inset:0;display:none;flex-direction:column;align-items:center;' +
      'justify-content:flex-start;padding:5vh 4vw;z-index:60;' +
      'background:rgba(8,3,18,0.95);overflow-y:auto;';
    el.innerHTML = `
      <h2 style="font-family:'Press Start 2P',monospace;color:#ffd33a;
        font-size:clamp(20px,3.4vw,40px);text-shadow:3px 3px 0 #000,0 0 20px rgba(255,211,58,0.6);
        margin:0 0 18px;letter-spacing:3px;">PHOTO BOOK</h2>
      <div id="pb-empty" style="display:none;font-family:'VT323',monospace;color:#cfb8ff;
        font-size:clamp(18px,2.2vw,28px);margin:40px 0;text-align:center;line-height:1.6;">
        no selfies yet.<br/>kill a boss to take one.
      </div>
      <div id="pb-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
        gap:24px;width:min(1100px,100%);"></div>
      <div style="margin-top:24px;display:flex;gap:14px;flex-wrap:wrap;justify-content:center;">
        <button id="pb-clear" style="font-family:'Press Start 2P',monospace;font-size:11px;
          padding:10px 16px;background:transparent;color:#ff5a8a;border:2px solid #ff5a8a;
          cursor:pointer;letter-spacing:2px;">CLEAR ALL</button>
        <button id="pb-close" style="font-family:'Press Start 2P',monospace;font-size:11px;
          padding:10px 16px;background:#ffd33a;color:#1a0a2a;border:0;cursor:pointer;
          letter-spacing:2px;box-shadow:0 4px 0 #a86a08;">CLOSE</button>
      </div>`;
    document.body.appendChild(el);
    modalEl = el;
    el.querySelector('#pb-close').addEventListener('click', close);
    el.querySelector('#pb-clear').addEventListener('click', () => {
      if (!window.SELFIE) return;
      if (confirm('Delete all selfies? This cannot be undone.')) {
        SELFIE.clearGallery();
        refresh();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && el.style.display === 'flex') close();
    });
    return el;
  }

  function refresh() {
    const list = window.SELFIE ? SELFIE.getGallery() : [];
    const grid = modalEl.querySelector('#pb-grid');
    const empty = modalEl.querySelector('#pb-empty');
    grid.innerHTML = '';
    empty.style.display = list.length ? 'none' : 'block';
    // newest first
    [...list].reverse().forEach((entry, i) => {
      const card = document.createElement('div');
      const tilt = (i % 2 === 0 ? -1 : 1) * (2 + (i % 3));
      card.style.cssText =
        `background:#f7f3e8;padding:10px 10px 30px;` +
        `box-shadow:0 12px 22px rgba(0,0,0,0.55),0 3px 0 rgba(0,0,0,0.3);` +
        `transform:rotate(${tilt}deg);transition:transform 0.2s;`;
      card.onmouseenter = () => card.style.transform = 'rotate(0deg) scale(1.04)';
      card.onmouseleave = () => card.style.transform = `rotate(${tilt}deg)`;
      const img = document.createElement('img');
      img.src = entry.dataURL;
      img.style.cssText = 'display:block;width:100%;image-rendering:pixelated;border:1px solid rgba(0,0,0,0.25);';
      const cap = document.createElement('div');
      cap.textContent = entry.label || 'untitled';
      cap.style.cssText = "font-family:'VT323',monospace;color:#202020;font-size:18px;text-align:center;margin-top:6px;letter-spacing:1px;";
      card.appendChild(img);
      card.appendChild(cap);
      grid.appendChild(card);
    });
  }

  function open() {
    buildModal();
    refresh();
    modalEl.style.display = 'flex';
  }
  function close() { if (modalEl) modalEl.style.display = 'none'; }

  function init() {
    const btn = document.getElementById('photo-book-btn');
    if (btn) btn.addEventListener('click', open);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PHOTO_BOOK = { open, close };
})();
