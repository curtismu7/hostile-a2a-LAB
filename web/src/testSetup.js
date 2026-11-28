import "@testing-library/jest-dom/vitest";

// React Flow measures the DOM; jsdom has no layout, so give it the few browser APIs it reads.
class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = globalThis.ResizeObserver || RO;
globalThis.DOMMatrixReadOnly = globalThis.DOMMatrixReadOnly || class { constructor() { this.m22 = 1; } };
Object.defineProperties(HTMLElement.prototype, {
  offsetWidth: { configurable: true, get() { return 200; } },
  offsetHeight: { configurable: true, get() { return 80; } },
});

// The Real-or-mock modal remembers its dismissal in sessionStorage for the browser session; every test starts a fresh one.
afterEach(() => { try { sessionStorage.clear(); } catch { /* storage blocked */ } });

// Some Node versions expose a half-working global localStorage that shadows jsdom's; use a plain in-memory one.
if (typeof globalThis.localStorage?.clear !== "function") {
  const store = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() },
  });
}
