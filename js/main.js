// main.js — orchestrates the renderer, post-processing, persistent cosmos,
// the scroll timeline, theme, audio and the per-frame camera choreography.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { buildJourney } from './chapters.js';
import { AudioEngine } from './audio.js';
import { ThemeManager } from './theme.js';
import { clamp, smoothstep } from './utils.js';

const MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.35 : 1;

// ---------------- renderer / scene ----------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05060c, 0.014);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 0, 11);

// lights for the solid meshes (apple, sphere, worldline)
const amb = new THREE.AmbientLight(0xffffff, 0.55);
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(4, 6, 5);
const rim = new THREE.DirectionalLight(0x88aaff, 0.6);
rim.position.set(-5, -2, -4);
scene.add(amb, key, rim);

// ---------------- persistent cosmos ----------------
function glow(sharp) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (sharp) {
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.22, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const GLOW = glow(true);

function makeField(count, rMin, rMax, size, opacity) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = rMin + Math.random() * (rMax - rMin);
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    pos[i * 3 + 2] = r * Math.cos(ph);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ map: GLOW, size, transparent: true, depthWrite: false, opacity, sizeAttenuation: true });
  m.userData.baseOpacity = opacity;
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return { points: p, mat: m };
}

const stars = makeField(1500, 28, 68, 0.5, 0.85);
const dust = makeField(300, 6, 22, 0.26, 0.4);
scene.add(stars.points, dust.points);

// ---------------- theme ----------------
// dark-first: the journey is designed for deep space; the toggle (persisted) wins.
const themeMgr = new ThemeManager(localStorage.getItem('tess-theme') || 'dark');

// ---------------- journey ----------------
const journey = buildJourney(themeMgr.palette);
scene.add(journey.root);

// ---------------- post-processing ----------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.15, 0.85, 0.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// apply a palette to all the 3D systems
function applyTheme3D(p) {
  renderer.setClearColor(p.bg, 1);
  scene.fog.color.setHex(p.fog);
  renderer.toneMappingExposure = p.exposure;
  bloom.strength = p.bloom;
  bloom.threshold = p.bloomThreshold;
  bloom.radius = p.bloomRadius;
  const dark = p.name === 'dark';
  stars.mat.color.setHex(p.star);
  stars.mat.opacity = dark ? 0.9 : 0.3;
  stars.mat.userData.baseOpacity = stars.mat.opacity;
  stars.mat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
  stars.mat.needsUpdate = true;
  dust.mat.color.setHex(p.dust);
  dust.mat.opacity = dark ? 0.55 : 0.32;
  dust.mat.userData.baseOpacity = dust.mat.opacity;
  dust.mat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
  dust.mat.needsUpdate = true;
  journey.recolor(p);
}
themeMgr.onChange(applyTheme3D);
themeMgr.apply(); // sets [data-theme] + runs applyTheme3D

// ---------------- audio ----------------
const audio = new AudioEngine();

// ---------------- DOM / controls ----------------
const sections = [...document.querySelectorAll('.chapter')];
const contents = sections.map((s) => s.querySelector('.chapter__content'));
const progressFill = document.getElementById('progressFill');
const hint = document.getElementById('hint');
const soundBtn = document.getElementById('soundBtn');
const themeBtn = document.getElementById('themeBtn');
const chapterLabel = document.getElementById('chapterLabel');

let audioStarted = false;
function setSoundUI(on) {
  soundBtn.classList.toggle('is-on', on);
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.querySelector('.ctrl__label').textContent = on ? 'Sound on' : 'Sound off';
}
audio.onState(setSoundUI);

soundBtn.addEventListener('click', () => {
  audioStarted = true;
  hideHint();
  audio.toggle();
});
themeBtn.addEventListener('click', () => {
  themeMgr.toggle();
  localStorage.setItem('tess-theme', themeMgr.current);
  themeBtn.querySelector('.ctrl__label').textContent = themeMgr.current === 'dark' ? 'Dark' : 'Light';
});
themeBtn.querySelector('.ctrl__label').textContent = themeMgr.current === 'dark' ? 'Dark' : 'Light';

function hideHint() {
  if (hint) hint.classList.add('hidden');
}
function firstGesture(e) {
  if (audioStarted) return;
  if (e.target && e.target.closest && e.target.closest('.ui')) return; // controls handle themselves
  audioStarted = true;
  audio.play();
  hideHint();
}
window.addEventListener('pointerdown', firstGesture);
window.addEventListener('keydown', firstGesture);
window.addEventListener('wheel', () => hideHint(), { once: true, passive: true });

// replay buttons (data-scroll-top)
document.querySelectorAll('[data-scroll-top]').forEach((b) =>
  b.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }))
);

// ---------------- camera choreography ----------------
const camPos = new THREE.Vector3(0, 0, 11);
const camTarget = new THREE.Vector3(0, 0, 0);
const desiredPos = new THREE.Vector3();
const desiredTarget = new THREE.Vector3();

const ROMAN = ['✦', '0', 'I', 'II', 'II · I', 'III', 'III · II', 'TIME', 'SPACETIME', 'IV', 'TESSERACT', '∞'];

// ---------------- main loop ----------------
const clock = new THREE.Clock();
let time = 0;
let running = true;

function computeStates() {
  const vh = innerHeight;
  let active = 0;
  let best = -1;
  const states = sections.map((s, i) => {
    const r = s.getBoundingClientRect();
    const travel = Math.max(1, r.height - vh);
    const raw = -r.top / travel;
    const weight = smoothstep(-0.35, 0.1, raw) * (1 - smoothstep(0.9, 1.2, raw));
    if (weight > best) { best = weight; active = i; }
    return { raw, lp: clamp(raw, 0, 1), weight };
  });
  return { states, active };
}

function setOpacity(group, w) {
  group.traverse((o) => {
    const m = o.material;
    if (!m) return;
    const arr = Array.isArray(m) ? m : [m];
    arr.forEach((mm) => {
      if (mm.userData.baseOpacity === undefined) mm.userData.baseOpacity = mm.opacity ?? 1;
      mm.transparent = true;
      mm.opacity = mm.userData.baseOpacity * w;
    });
  });
}

function frame() {
  if (!running) return;
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;

  const { states, active } = computeStates();

  // update each chapter (only the visible ones)
  journey.chapters.forEach((ch, i) => {
    const st = states[i];
    if (st.weight <= 0.004) {
      if (ch.group.visible) ch.group.visible = false;
      return;
    }
    ch.group.visible = true;
    ch.update(st.lp, time, st.weight);
    setOpacity(ch.group, st.weight);
  });

  // text + parallax — fade in as a section enters its pin, out as it leaves.
  // (smoothstep starts before raw=0 so the hero reads ~full at scroll top.)
  contents.forEach((el, i) => {
    if (!el) return;
    const raw = states[i].raw;
    const o = smoothstep(-0.35, 0.06, raw) * (1 - smoothstep(0.78, 1.0, raw));
    el.style.opacity = o.toFixed(3);
    el.style.transform = `translate3d(0, ${(-raw + 0.5) * 26}px, 0)`;
  });

  // camera from the active chapter, smoothly damped
  const act = journey.chapters[active];
  const pose = act.camera(states[active].lp, time);
  desiredPos.copy(pose.pos);
  desiredTarget.copy(pose.target);
  const f = 1 - Math.exp(-2.6 * dt);
  camPos.lerp(desiredPos, f);
  camTarget.lerp(desiredTarget, f);
  camera.position.copy(camPos);
  camera.lookAt(camTarget);

  // cosmos drift
  stars.points.rotation.y += dt * 0.005 * MOTION;
  dust.points.rotation.y -= dt * 0.012 * MOTION;
  dust.points.rotation.x += dt * 0.006 * MOTION;

  // progress UI
  const scrollMax = document.documentElement.scrollHeight - innerHeight;
  const prog = scrollMax > 0 ? clamp(window.scrollY / scrollMax) : 0;
  progressFill.style.transform = `scaleX(${prog})`;
  if (chapterLabel) chapterLabel.textContent = ROMAN[active] || '';

  composer.render();
}

// ---------------- resize / visibility ----------------
function onResize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  journey.resize(w, h);
}
window.addEventListener('resize', onResize);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    running = false;
  } else if (!running) {
    running = true;
    clock.getDelta(); // discard the gap
    frame();
  }
});

// kick off
onResize();
frame();

// expose a tiny debug hook
window.__tess = { themeMgr, audio, journey };
