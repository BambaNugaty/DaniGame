// EventBus.js — minimal pub/sub used by gameplay systems (juice, score, audio).
// Synchronous emit; listeners may add/remove during dispatch (we snapshot the
// listener list per-emit so handlers that unsubscribe themselves don't skip a
// peer that registered alongside them).
(function () {
  'use strict';

  const listeners = new Map(); // event -> Set<fn>

  function on(event, fn) {
    let set = listeners.get(event);
    if (!set) { set = new Set(); listeners.set(event, set); }
    set.add(fn);
    return () => off(event, fn);
  }

  function off(event, fn) {
    const set = listeners.get(event);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) listeners.delete(event);
  }

  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set || set.size === 0) return;
    const snapshot = Array.from(set);
    for (const fn of snapshot) {
      try { fn(payload); }
      catch (err) { console.error(`EventBus listener for '${event}' threw:`, err); }
    }
  }

  function clear() { listeners.clear(); }

  window.EVENTS = { on, off, emit, clear };
})();
