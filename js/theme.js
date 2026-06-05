// theme.js — light / dark palettes + a tiny pub/sub manager.
// Colors used by Three.js are plain hex numbers. The DOM is themed via CSS
// variables driven by the [data-theme] attribute on <html>.

export const THEMES = {
  dark: {
    name: 'dark',
    bg: 0x05060c,
    fog: 0x05060c,
    star: 0xbcd2ff,
    starFaint: 0x6f80b5,
    dust: 0x8da2ff,
    primary: 0x4fe3ff, // cyan
    secondary: 0xb98bff, // violet
    accent: 0xffd27d, // warm gold
    grid: 0x24345f,
    gridStrong: 0x3a5aa8,
    apple: 0xff647c,
    creature: 0x7dffc4,
    paper: 0x0c1020,
    bloom: 0.95,
    bloomThreshold: 0.22,
    bloomRadius: 0.75,
    exposure: 1.05,
  },
  light: {
    name: 'light',
    bg: 0xeaf0fb,
    fog: 0xeaf0fb,
    star: 0x9aabd0,
    starFaint: 0xc3cee6,
    dust: 0x6f86c9,
    primary: 0x0a6cf0, // strong blue
    secondary: 0x7a3df0, // violet
    accent: 0xd9760a, // amber
    grid: 0xbcc9e6,
    gridStrong: 0x8ba2d6,
    apple: 0xe23a59,
    creature: 0x10a37f,
    paper: 0xf7faff,
    bloom: 0.0,
    bloomThreshold: 1.0,
    bloomRadius: 0.7,
    exposure: 1.0,
  },
};

export class ThemeManager {
  constructor(initial = 'dark') {
    this.listeners = new Set();
    this.current = initial;
  }
  get palette() {
    return THEMES[this.current];
  }
  apply() {
    document.documentElement.setAttribute('data-theme', this.current);
    this.listeners.forEach((fn) => fn(this.palette));
  }
  set(name) {
    if (!THEMES[name]) return;
    this.current = name;
    this.apply();
  }
  toggle() {
    this.set(this.current === 'dark' ? 'light' : 'dark');
  }
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
