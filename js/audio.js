// audio.js — a generative ambient score, synthesized live in the browser.
// Same "theme" each time (slow zen pads + airy noise + occasional bells), but a
// fresh random seed on every load chooses the key, scale, voicing and the bell
// timing, so no two visits sound the same.

const SCALES = {
  minorPentatonic: [0, 3, 5, 7, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};

const semis = (n) => Math.pow(2, n / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.playing = false;
    this.voices = [];
    this.timers = [];
    this._onState = null;
    this.master = null;
    this.rng = Math.random;
  }

  onState(fn) {
    this._onState = fn;
  }
  _emit() {
    if (this._onState) this._onState(this.playing);
  }

  _ensureCtx() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
  }

  // Call SYNCHRONOUSLY inside a user gesture. Resumes the context and plays a
  // 1-sample silent buffer — the kick that unlocks Web Audio on iOS Safari and
  // several Android browsers. Safe to call repeatedly.
  resumeNow() {
    try {
      this._ensureCtx();
      const ctx = this.ctx;
      if (ctx.state !== 'running' && ctx.resume) ctx.resume();
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch (e) {}
  }

  // Build the whole graph once, on first user gesture.
  _init() {
    if (this.started) return;
    this.started = true;
    this._ensureCtx();
    const ctx = this.ctx;

    // Random musical identity for this load.
    const rng = (this.rng = mulb(((Math.random() * 1e9) | 0) ^ Date.now()));
    const rootHz = 110 * semis(Math.floor(rng() * 8)); // A2 .. up a few steps
    const scaleNames = Object.keys(SCALES);
    const scale = SCALES[scaleNames[(rng() * scaleNames.length) | 0]];
    this.rootHz = rootHz;
    this.scale = scale;

    // note frequency by scale degree (can exceed scale length -> octave up)
    this.noteAt = (deg) => {
      const len = scale.length;
      const oct = Math.floor(deg / len);
      const within = ((deg % len) + len) % len;
      return rootHz * semis(scale[within] + 12 * oct);
    };

    // ---- master chain ----
    const master = (this.master = ctx.createGain());
    master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 3;
    comp.attack.value = 0.02;
    comp.release.value = 0.4;
    master.connect(comp).connect(ctx.destination);

    // gentle hi-cut so it stays soft/airy
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 5200;
    tone.Q.value = 0.4;
    tone.connect(master);

    // ---- reverb (generated impulse) ----
    const reverb = ctx.createConvolver();
    reverb.buffer = this._impulse(4.2, 2.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    reverb.connect(wet).connect(tone);
    const dry = ctx.createGain();
    dry.gain.value = 0.6;
    dry.connect(tone);
    this.send = (node, wetAmt = 0.7) => {
      node.connect(dry);
      const w = ctx.createGain();
      w.gain.value = wetAmt;
      node.connect(w).connect(reverb);
    };

    this._buildPad();
    this._buildDrone();
    this._buildAir();
  }

  _impulse(seconds, decay) {
    const { ctx } = this;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  _buildPad() {
    const { ctx, rng } = this;
    const count = 4;
    const degrees = [0, 2, 4, 6]; // chord-ish spread over the scale
    for (let i = 0; i < count; i++) {
      const g = ctx.createGain();
      g.gain.value = 0;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 800 + rng() * 700;
      filt.Q.value = 0.7;
      const pan = ctx.createStereoPanner();
      pan.pan.value = (rng() * 2 - 1) * 0.7;

      // two detuned oscillators for a soft chorus
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = rng() > 0.5 ? 'sine' : 'triangle';
      o2.type = 'sine';
      const f = this.noteAt(degrees[i] + (rng() > 0.6 ? 7 : 0));
      o1.frequency.value = f;
      o2.frequency.value = f;
      o2.detune.value = 6 + rng() * 8;

      o1.connect(filt);
      o2.connect(filt);
      filt.connect(g).connect(pan);
      this.send(pan, 0.85);
      o1.start();
      o2.start();

      // slow breathing amplitude LFO
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.03 + rng() * 0.08;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.06 + rng() * 0.05;
      lfo.connect(lfoGain).connect(g.gain);
      lfo.start();

      // slow filter sweep LFO
      const flfo = ctx.createOscillator();
      flfo.frequency.value = 0.02 + rng() * 0.05;
      const flfoGain = ctx.createGain();
      flfoGain.gain.value = 300 + rng() * 300;
      flfo.connect(flfoGain).connect(filt.frequency);
      flfo.start();

      this.voices.push({ o1, o2, g, filt, base: 0.085 + rng() * 0.04, degree: degrees[i] });
    }
  }

  _buildDrone() {
    const { ctx } = this;
    const g = ctx.createGain();
    g.gain.value = 0;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = this.rootHz / 2;
    const o5 = ctx.createOscillator();
    o5.type = 'sine';
    o5.frequency.value = (this.rootHz / 2) * semis(7);
    o.connect(g);
    o5.connect(g);
    this.send(g, 0.4);
    o.start();
    o5.start();
    this.drone = { g, base: 0.12 };
  }

  _buildAir() {
    const { ctx, rng } = this;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(bp).connect(g);
    this.send(g, 0.9);
    // slow sweep
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.015 + rng() * 0.03;
    const lg = ctx.createGain();
    lg.gain.value = 1500;
    lfo.connect(lg).connect(bp.frequency);
    src.start();
    lfo.start();
    this.air = { g, base: 0.02 };
  }

  _bell() {
    if (!this.playing) return;
    const { ctx, rng } = this;
    const deg = 4 + Math.floor(rng() * 8); // upper register
    const f = this.noteAt(deg);
    const o = ctx.createOscillator();
    o.type = rng() > 0.5 ? 'sine' : 'triangle';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2.001; // shimmer overtone
    const g = ctx.createGain();
    const peak = 0.06 + rng() * 0.05;
    const dur = 2.5 + rng() * 4;
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    const pan = ctx.createStereoPanner();
    pan.pan.value = (rng() * 2 - 1) * 0.8;
    const o2g = ctx.createGain();
    o2g.gain.value = 0.35;
    o.connect(g);
    o2.connect(o2g).connect(g);
    g.connect(pan);
    this.send(pan, 0.95);
    o.start(now);
    o2.start(now);
    o.stop(now + dur + 0.1);
    o2.stop(now + dur + 0.1);

    const next = 3500 + rng() * 7000;
    this.timers.push(setTimeout(() => this._bell(), next));
  }

  _evolve() {
    if (!this.playing) return;
    const { ctx, rng } = this;
    // random-walk the pad voicing for slow harmonic drift
    this.voices.forEach((v) => {
      const step = Math.floor(rng() * 3) - 1; // -1,0,1
      v.degree = Math.max(-2, Math.min(12, v.degree + step));
      const f = this.noteAt(v.degree + (rng() > 0.7 ? 7 : 0));
      const t = ctx.currentTime;
      v.o1.frequency.setTargetAtTime(f, t, 2.5);
      v.o2.frequency.setTargetAtTime(f, t, 2.5);
    });
    const next = 12000 + rng() * 9000;
    this.timers.push(setTimeout(() => this._evolve(), next));
  }

  _fadeMaster(to, time = 2.5) {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), t);
    this.master.gain.exponentialRampToValueAtTime(Math.max(to, 0.0001), t + time);
  }

  _setVoiceLevels(on) {
    const t = this.ctx.currentTime;
    this.voices.forEach((v) =>
      v.g.gain.setTargetAtTime(on ? v.base : 0, t, 1.5)
    );
    if (this.drone) this.drone.g.gain.setTargetAtTime(on ? this.drone.base : 0, t, 2);
    if (this.air) this.air.g.gain.setTargetAtTime(on ? this.air.base : 0, t, 2);
  }

  async play() {
    this.resumeNow(); // synchronous unlock within the gesture (iOS/Android)
    this._init();
    try { if (this.ctx.state === 'suspended') await this.ctx.resume(); } catch (e) {}
    if (this.playing) return;
    this.playing = true;
    this._setVoiceLevels(true);
    this._fadeMaster(0.85, 3.5);
    // kick off generative threads
    this.timers.push(setTimeout(() => this._bell(), 2500));
    this.timers.push(setTimeout(() => this._evolve(), 8000));
    this._emit();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this._setVoiceLevels(false);
    this._fadeMaster(0.0001, 1.4);
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
    this._emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }
}

// tiny local PRNG so audio.js stays dependency-free
function mulb(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
