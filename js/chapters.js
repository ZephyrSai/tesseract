// chapters.js — every scene in the journey. Each chapter is a Three.js group with
//   update(localProgress, time, weight, dt)
//   camera(localProgress, time)
//   interactive (optional): { objects:[{id,mesh}], grab(id), drag(id,ndc,d), release(id) }
// Dark = additive glow; light = solid "blueprint on paper".

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { buildTesseract, makeVertices, makeEdges, rot4 } from './tesseract.js';
import { clamp, lerp, smoothstep, smootherstep, TAU } from './utils.js';

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.28)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  return new THREE.CanvasTexture(c);
}
function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0)');
  grd.addColorStop(0.68, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.8, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function buildJourney(palette) {
  const root = new THREE.Group();
  const TEX = glowTexture();
  const RING = ringTexture();
  const themed = [];
  const onResize = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const aspectFit = (s = 1) => {
    const a = window.innerWidth / Math.max(1, window.innerHeight);
    return a < 1 ? 1 + (1 - a) * s : 1;
  };

  function themeMat(m, role, glow) {
    themed.push((p) => {
      if (role) m.color.setHex(p[role]);
      if (glow) {
        m.blending = p.name === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending;
        m.needsUpdate = true;
      }
    });
  }

  // ---------- primitive helpers ----------
  function sprite(role, size, opacity = 1, tex = TEX) {
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity });
    m.userData.baseOpacity = opacity;
    themeMat(m, role, true);
    const s = new THREE.Sprite(m);
    s.scale.set(size, size, 1);
    return s;
  }
  function fatLine(flat, role, width = 3, opacity = 1) {
    const g = new LineGeometry();
    g.setPositions(flat);
    const m = new LineMaterial({ linewidth: width, transparent: true, opacity, depthWrite: false });
    m.userData.baseOpacity = opacity;
    m.resolution.set(window.innerWidth, window.innerHeight);
    themeMat(m, role, true);
    onResize.push((w, h) => m.resolution.set(w, h));
    const l = new Line2(g, m);
    l.frustumCulled = false;
    return l;
  }
  function basicLines(flat, role, opacity = 0.6) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
    const m = new THREE.LineBasicMaterial({ transparent: true, opacity });
    m.userData.baseOpacity = opacity;
    themeMat(m, role, true);
    return new THREE.LineSegments(g, m);
  }
  function gridLines(size, div, role, opacity = 0.5) {
    const half = size / 2,
      step = size / div,
      pos = [];
    for (let i = 0; i <= div; i++) {
      const t = -half + i * step;
      pos.push(t, 0, -half, t, 0, half);
      pos.push(-half, 0, t, half, 0, t);
    }
    return basicLines(pos, role, opacity);
  }
  function circleFlat(r, seg, axis) {
    const a = [];
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * TAU;
      const c = Math.cos(th) * r,
        s = Math.sin(th) * r;
      if (axis === 'xy') a.push(c, s, 0);
      else a.push(c, 0, s);
    }
    return a;
  }
  function cubeEdges(size, role, opacity = 0.95, width = 2.4) {
    const h = size / 2;
    const v = [
      [-h, -h, -h], [h, -h, -h], [h, h, -h], [-h, h, -h],
      [-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h],
    ];
    const E = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    const flat = [];
    E.forEach(([a, b]) => flat.push(...v[a], ...v[b]));
    // use basic lines for many small cubes (cheap); bloom glows them in dark
    return basicLines(flat, role, opacity);
  }
  function appleMesh() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: palette.apple, roughness: 0.4, metalness: 0.05,
      emissive: new THREE.Color(palette.apple), emissiveIntensity: 0.14, transparent: true,
    });
    bodyMat.userData.baseOpacity = 1;
    themed.push((p) => { bodyMat.color.setHex(p.apple); bodyMat.emissive.setHex(p.apple); });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.95, 48, 32), bodyMat);
    body.scale.set(1, 0.9, 1);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.85, transparent: true });
    stemMat.userData.baseOpacity = 1;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.4, 8), stemMat);
    stem.position.set(0, 0.92, 0);
    stem.rotation.z = 0.16;
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.6, transparent: true, side: THREE.DoubleSide });
    leafMat.userData.baseOpacity = 1;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 10), leafMat);
    leaf.scale.set(1.6, 0.16, 0.8);
    leaf.position.set(0.24, 1.02, 0);
    leaf.rotation.z = 0.4;
    g.add(body, stem, leaf);
    g.userData.R = 0.92;
    return g;
  }
  // an invisible raycast proxy + a visible pulsing grab ring
  function hotspot(proxyR = 0.7, ringSize = 1.25) {
    const grp = new THREE.Group();
    const proxy = new THREE.Mesh(
      new THREE.SphereGeometry(proxyR, 10, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false })
    );
    proxy.userData.baseOpacity = 0;
    proxy.renderOrder = 20;
    const ring = sprite('accent', ringSize, 0.85, RING);
    grp.add(proxy, ring);
    grp.userData.proxy = proxy;
    grp.userData.ring = ring;
    return grp;
  }

  // ---------- chapter registry ----------
  const chapters = [];
  function chapter(builder) {
    const c = builder();
    root.add(c.group);
    chapters.push(c);
    return c;
  }

  // ============ CH0 — Pale Blue Dot (intro) ============
  chapter(() => {
    const group = new THREE.Group();
    const dot = sprite('primary', 0.5, 1);
    dot.position.set(2.4, 0.4, -6);
    const beam = sprite('accent', 9, 0);
    beam.material.rotation = -0.6;
    beam.scale.set(0.5, 9, 1);
    beam.position.set(2.4, 0.4, -6.2);
    group.add(beam, dot);
    return {
      group,
      update(lp, t) {
        const p = 0.5 + Math.sin(t * 1.3) * 0.06;
        dot.scale.set(p, p, 1);
        beam.material.opacity = 0.05 + Math.sin(t * 0.5) * 0.02;
      },
      camera(lp, t) {
        const z = lerp(11, 8.5, smootherstep(0, 1, lp));
        return { pos: V(Math.sin(t * 0.04) * 0.6, 0.2, z), target: V(2.4 * lp * 0.3, 0.3, -6) };
      },
    };
  });

  // ============ CH1 — The Point (0D) ============
  chapter(() => {
    const group = new THREE.Group();
    const core = sprite('accent', 0.9, 1);
    const ringA = fatLine(circleFlat(1, 96, 'xy'), 'primary', 2, 0);
    const ringB = fatLine(circleFlat(1, 96, 'xy'), 'secondary', 2, 0);
    group.add(ringA, ringB, core);
    return {
      group,
      update(lp, t) {
        const p = 0.85 + Math.sin(t * 2.0) * 0.12;
        core.scale.set(p, p, 1);
        const r1 = (t * 0.5) % 2;
        ringA.scale.setScalar(0.2 + r1 * 1.6);
        ringA.material.opacity = (1 - r1 / 2) * 0.5;
        const r2 = ((t * 0.5) + 1) % 2;
        ringB.scale.setScalar(0.2 + r2 * 1.6);
        ringB.material.opacity = (1 - r2 / 2) * 0.5;
      },
      camera() { return { pos: V(0, 0, 5), target: V(0, 0, 0) }; },
    };
  });

  // ============ CH2 — The Line (1D) — drag the Linelander ============
  chapter(() => {
    const group = new THREE.Group();
    const L = 6;
    const line = fatLine([-L, 0, 0, L, 0, 0], 'primary', 3.5, 1);
    group.add(line);
    [-4.2, -1.6, 3.0, 4.8].forEach((x) => {
      const n = sprite('secondary', 0.4, 0.9);
      n.position.set(x, 0, 0);
      group.add(n);
    });
    const me = sprite('creature', 0.62, 1);
    const meCore = sprite('accent', 0.28, 1);
    const grab = hotspot(0.7, 1.2);
    group.add(me, meCore, grab);
    let disp = 0, grabbed = false;
    return {
      group,
      update(lp, t, w, dt = 0.016) {
        const grow = smootherstep(0, 0.25, lp);
        line.scale.set(grow, 1, 1);
        const auto = Math.sin(t * 0.6) * 4.6 * grow;
        if (!grabbed) disp += (auto - disp) * (1 - Math.exp(-1.8 * dt));
        const x = clamp(disp, -5.6, 5.6);
        me.position.set(x, 0, 0);
        meCore.position.set(x, 0, 0);
        grab.position.set(x, 0, 0);
        grab.userData.ring.scale.setScalar(1.1 + Math.sin(t * 3) * 0.12);
        const p = 0.6 + Math.sin(t * 3) * 0.05;
        me.scale.set(p, p, 1);
      },
      camera(lp, t) { return { pos: V(Math.sin(t * 0.05) * 0.8, 1.4 - lp * 0.5, 7), target: V(0, 0, 0) }; },
      interactive: {
        objects: [{ id: 'me', mesh: grab.userData.proxy }],
        grab() { grabbed = true; },
        drag(id, ndc, d) { disp = clamp(disp + d.x * 6.5, -5.6, 5.6); },
        release() { grabbed = false; },
      },
    };
  });

  // ============ CH3 — The Plane (2D) — drag the Flatlander ============
  chapter(() => {
    const group = new THREE.Group();
    const grid = gridLines(16, 32, 'gridStrong', 0.5);
    group.add(grid);
    const tri = fatLine([0, 0.01, 0.6, -0.52, 0.01, -0.3, 0.52, 0.01, -0.3, 0, 0.01, 0.6], 'creature', 3, 1);
    const triCore = sprite('accent', 0.35, 0.9);
    const grab = hotspot(0.7, 1.2);
    group.add(tri, triCore, grab);
    let dx = 0, dz = 0, grabbed = false;
    return {
      group,
      update(lp, t, w, dt = 0.016) {
        grid.scale.set(smootherstep(0, 0.3, lp), 1, smootherstep(0, 0.3, lp));
        const ax = Math.sin(t * 0.4) * 5.2, az = Math.cos(t * 0.31) * 4.4;
        if (!grabbed) { dx += (ax - dx) * (1 - Math.exp(-1.6 * dt)); dz += (az - dz) * (1 - Math.exp(-1.6 * dt)); }
        const x = clamp(dx, -6.5, 6.5), z = clamp(dz, -6, 6);
        tri.position.set(x, 0, z);
        tri.rotation.y = -t * 0.4;
        triCore.position.set(x, 0.05, z);
        grab.position.set(x, 0.1, z);
        grab.userData.ring.scale.setScalar(1.1 + Math.sin(t * 3) * 0.12);
      },
      camera(lp, t) {
        const a = t * 0.04;
        return { pos: V(Math.sin(a) * 3, lerp(9, 6.5, lp), Math.cos(a) * 3 + 9), target: V(0, 0, 0) };
      },
      interactive: {
        objects: [{ id: 'tri', mesh: grab.userData.proxy }],
        grab() { grabbed = true; },
        drag(id, ndc, d) { dx = clamp(dx + d.x * 8, -6.5, 6.5); dz = clamp(dz - d.y * 8, -6, 6); },
        release() { grabbed = false; },
      },
    };
  });

  // ============ CH4 — A Visitor From Above (2D->1D) — drag the disc ============
  chapter(() => {
    const group = new THREE.Group();
    const plane = gridLines(14, 28, 'grid', 0.28);
    const lineLand = fatLine([-6, 0.02, 0, 6, 0.02, 0], 'primary', 3.5, 1);
    group.add(plane, lineLand);
    const R = 1.5;
    const disc = fatLine(circleFlat(R, 80, 'xz'), 'creature', 2.5, 0.9);
    const discFill = sprite('creature', R * 2.4, 0.07);
    const p1 = sprite('accent', 0.55, 1);
    const p2 = sprite('accent', 0.55, 1);
    const strip = fatLine([-6, 0.02, -4.5, 6, 0.02, -4.5], 'secondary', 2, 0.45);
    const s1 = sprite('accent', 0.5, 1);
    const s2 = sprite('accent', 0.5, 1);
    const grab = hotspot(1.0, 1.6);
    group.add(discFill, disc, p1, p2, strip, s1, s2, grab);
    let cz = 3.2, cx = 0, grabbed = false;
    return {
      group,
      update(lp, t, w, dt = 0.016) {
        if (!grabbed) {
          const az = Math.cos(t * 0.35) * 3.4;
          const ax = Math.sin(t * 0.2) * 1.2;
          cz += (az - cz) * (1 - Math.exp(-1.6 * dt));
          cx += (ax - cx) * (1 - Math.exp(-1.6 * dt));
        }
        cz = clamp(cz, -4.4, 4.4); cx = clamp(cx, -3, 3);
        disc.position.set(cx, 0.04, cz);
        discFill.position.set(cx, 0.03, cz);
        grab.position.set(cx, 0.2, cz);
        grab.userData.ring.scale.setScalar(1.5 + Math.sin(t * 3) * 0.12);
        const inside = Math.abs(cz) < R;
        const hw = inside ? Math.sqrt(Math.max(0, R * R - cz * cz)) : 0;
        const show = inside ? 1 : 0;
        const ps = 0.35 + hw * 0.18;
        p1.position.set(cx - hw, 0.06, 0); p2.position.set(cx + hw, 0.06, 0);
        p1.material.opacity = show; p2.material.opacity = show;
        p1.scale.set(ps, ps, 1); p2.scale.set(ps, ps, 1);
        s1.position.set(cx - hw, 0.06, -4.5); s2.position.set(cx + hw, 0.06, -4.5);
        s1.material.opacity = show; s2.material.opacity = show;
        s1.scale.set(ps, ps, 1); s2.scale.set(ps, ps, 1);
      },
      camera(lp, t) { return { pos: V(Math.sin(t * 0.05) * 1.5, lerp(6.5, 5, lp), 8.5), target: V(0, 0, -1.2) }; },
      interactive: {
        objects: [{ id: 'disc', mesh: grab.userData.proxy }],
        grab() { grabbed = true; },
        drag(id, ndc, d) { cx = clamp(cx + d.x * 7, -3, 3); cz = clamp(cz - d.y * 7, -4.4, 4.4); },
        release() { grabbed = false; },
      },
    };
  });

  // ============ CH5 — Space (3D) ============
  chapter(() => {
    const group = new THREE.Group();
    const cube = cubeEdges(2, 'primary', 0.9, 2);
    cube.position.set(-2.6, 0.3, 0);
    const sphMat = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.3, metalness: 0.1, emissiveIntensity: 0.15 });
    sphMat.userData.baseOpacity = 1; sphMat.emissive = new THREE.Color();
    themed.push((p) => { sphMat.color.setHex(p.secondary); sphMat.emissive.setHex(p.secondary); });
    const sph = new THREE.Mesh(new THREE.SphereGeometry(1.0, 32, 24), sphMat);
    sph.position.set(2.6, 0.3, 0);
    const apl = appleMesh();
    apl.position.set(0, 0.2, 0);
    const ax = basicLines([0, 0, 0, 1.6, 0, 0, 0, 0, 0, 0, 1.6, 0, 0, 0, 0, 0, 0, 1.6], 'accent', 0.7);
    ax.position.set(0, -2, 0);
    group.add(cube, sph, apl, ax);
    return {
      group,
      update(lp, t) {
        cube.rotation.x = t * 0.4; cube.rotation.y = t * 0.3;
        sph.rotation.y = t * 0.3;
        apl.rotation.y = t * 0.5; apl.position.y = 0.2 + Math.sin(t * 0.8) * 0.12;
      },
      camera(lp, t) {
        const a = t * 0.08 + lp * 0.6;
        const r = 7.5 * aspectFit(0.8);
        return { pos: V(Math.sin(a) * r, 1.5 + Math.sin(t * 0.2) * 0.6, Math.cos(a) * r), target: V(0, 0, 0) };
      },
    };
  });

  // ============ CH6 — The Surgeon from Space (3D sees a 2D being's insides) ============
  chapter(() => {
    const group = new THREE.Group();
    const plane = gridLines(10, 20, 'grid', 0.3);
    group.add(plane);
    // a flat creature lying on the plane (outline + exposed insides)
    const body = fatLine(circleFlat(1.6, 64, 'xz').filter((_, i) => true), 'creature', 2.6, 0.9);
    body.scale.set(1, 1, 0.78);
    const heart = sprite('apple', 0.7, 1);
    heart.position.set(0, 0.02, 0);
    const gut1 = sprite('secondary', 0.3, 0.8); gut1.position.set(-0.7, 0.02, 0.3);
    const gut2 = sprite('secondary', 0.3, 0.8); gut2.position.set(0.6, 0.02, -0.4);
    group.add(body, heart, gut1, gut2);
    // a probe reaching down from "above" (3rd dimension) to the heart
    const probe = fatLine([0, 4, 0, 0, 0.05, 0], 'accent', 2.5, 0.85);
    const tip = sprite('accent', 0.5, 1);
    group.add(probe, tip);
    return {
      group,
      update(lp, t) {
        const reach = (Math.sin(t * 0.6) * 0.5 + 0.5); // 0..1
        const y = lerp(3.4, 0.15, reach);
        probe.geometry.setPositions([0, 4, 0, 0, y, 0]);
        tip.position.set(0, y, 0);
        const hp = 0.65 + Math.sin(t * 2.5) * 0.08 + reach * 0.15;
        heart.scale.set(hp, hp, 1);
        group.rotation.y = Math.sin(t * 0.1) * 0.25;
      },
      camera(lp, t) { return { pos: V(Math.sin(t * 0.05) * 1.5 + 1.5, 3.6, 6.5), target: V(0, 0.4, 0) }; },
    };
  });

  // ============ CH7 — The Apple in Flatland (3D->2D) — drag the apple ============
  chapter(() => {
    const group = new THREE.Group();
    const paper = gridLines(10, 24, 'gridStrong', 0.5);
    const apl = appleMesh();
    const R = apl.userData.R;
    const ring = fatLine(circleFlat(1, 80, 'xz'), 'accent', 3, 1);
    ring.position.y = 0.02;
    const stamp = fatLine(circleFlat(1, 80, 'xz'), 'apple', 2, 0);
    stamp.position.y = 0.01;
    const grab = hotspot(1.0, 1.5);
    group.add(paper, apl, ring, stamp, grab);
    let cy = 2.2, grabbed = false, stampedR = 0;
    return {
      group,
      update(lp, t, w, dt = 0.016) {
        if (!grabbed) {
          const auto = Math.cos(t * 0.45) * 2.2; // bob through the page
          cy += (auto - cy) * (1 - Math.exp(-1.6 * dt));
        }
        cy = clamp(cy, -2.6, 2.6);
        apl.position.set(0, cy, 0);
        apl.rotation.y = t * 0.5;
        grab.position.set(0, cy, 0);
        grab.userData.ring.scale.setScalar(1.4 + Math.sin(t * 3) * 0.12);
        const r = Math.abs(cy) < R ? Math.sqrt(Math.max(0, R * R - cy * cy)) : 0;
        ring.scale.set(r, 1, r);
        ring.material.opacity = r > 0.001 ? 1 : 0;
        if (r > stampedR) stampedR = r;
        stamp.scale.set(stampedR, 1, stampedR);
        stamp.material.opacity = stampedR > 0.01 ? 0.35 : 0;
      },
      camera(lp, t) { return { pos: V(Math.sin(t * 0.06) * 2 + 1.5, 3.4, 7), target: V(0, 0.2, 0) }; },
      interactive: {
        objects: [{ id: 'apple', mesh: grab.userData.proxy }],
        grab() { grabbed = true; },
        drag(id, ndc, d) { cy = clamp(cy + d.y * 5.5, -2.6, 2.6); },
        release() { grabbed = false; },
      },
    };
  });

  // ============ CH8 — Pages of Time — drag to fan ============
  chapter(() => {
    const group = new THREE.Group();
    const N = 17, R = 1.4;
    const pages = [];
    for (let i = 0; i < N; i++) {
      const u = (i / (N - 1)) * 2 - 1;
      const r = Math.sqrt(Math.max(0.0001, 1 - u * u)) * R;
      const circ = fatLine(circleFlat(r, 64, 'xy'), i === Math.floor(N / 2) ? 'accent' : 'apple', 2, 0.85);
      circ.userData.u = u;
      group.add(circ);
      pages.push(circ);
    }
    const grab = hotspot(0.8, 1.4);
    group.add(grab);
    let spread = 0.18, grabbed = false;
    return {
      group,
      update(lp, t, w, dt = 0.016) {
        if (!grabbed) {
          const auto = 0.28 + (Math.sin(t * 0.3) * 0.5 + 0.5) * 0.5;
          spread += (auto - spread) * (1 - Math.exp(-1.4 * dt));
        }
        spread = clamp(spread, 0.02, 1.0);
        pages.forEach((pg) => { pg.position.z = pg.userData.u * spread * (pages.length - 1) * 0.5; });
        group.rotation.y = -0.5 + Math.sin(t * 0.12) * 0.12;
        const front = pages[pages.length - 1];
        grab.position.copy(front.position);
        grab.userData.ring.scale.setScalar(1.3 + Math.sin(t * 3) * 0.12);
      },
      camera(lp, t) { const f = aspectFit(0.7); return { pos: V(6 * f, 1.6, 5.5 * f), target: V(0, 0, 0) }; },
      interactive: {
        objects: [{ id: 'pages', mesh: grab.userData.proxy }],
        grab() { grabbed = true; },
        drag(id, ndc, d) { spread = clamp(spread + d.x * 1.6, 0.02, 1.0); },
        release() { grabbed = false; },
      },
    };
  });

  // ============ CH9 — Smeared Across Time (spacetime) — drag the "now" ============
  chapter(() => {
    const group = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3(
      Array.from({ length: 60 }, (_, i) => {
        const tt = i / 59;
        return V(Math.sin(tt * TAU * 1.4) * 1.9, (tt - 0.5) * 8, Math.cos(tt * TAU * 1.1) * 1.9);
      })
    );
    const tubeMat = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.4, emissiveIntensity: 0.5 });
    tubeMat.userData.baseOpacity = 0.95; tubeMat.emissive = new THREE.Color();
    themed.push((p) => { tubeMat.color.setHex(p.primary); tubeMat.emissive.setHex(p.primary); });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 220, 0.07, 10, false), tubeMat);
    const nowPlane = gridLines(7, 14, 'gridStrong', 0.45);
    const marker = sprite('accent', 0.7, 1);
    const grab = hotspot(0.9, 1.5);
    group.add(tube, nowPlane, marker, grab);
    let phase = 0.5, grabbed = false;
    return {
      group,
      update(lp, t, w, dt = 0.016) {
        if (!grabbed) {
          const auto = Math.sin(t * 0.25) * 0.5 + 0.5;
          phase += (auto - phase) * (1 - Math.exp(-1.4 * dt));
        }
        phase = clamp(phase, 0, 1);
        const y = (phase - 0.5) * 8;
        nowPlane.position.y = y;
        const pt = curve.getPoint(phase);
        marker.position.copy(pt);
        const ps = 0.6 + Math.sin(t * 3) * 0.06;
        marker.scale.set(ps, ps, 1);
        grab.position.copy(pt);
        grab.userData.ring.scale.setScalar(1.4 + Math.sin(t * 3) * 0.12);
        group.rotation.y = t * 0.08;
      },
      camera(lp, t) { return { pos: V(7, 0.5, 7), target: V(0, 0, 0) }; },
      interactive: {
        objects: [{ id: 'now', mesh: grab.userData.proxy }],
        grab() { grabbed = true; },
        drag(id, ndc, d) { phase = clamp(phase + d.y * 0.9, 0, 1); },
        release() { grabbed = false; },
      },
    };
  });

  // ============ CH10 — Perpendicular to Everything (the ladder) ============
  chapter(() => {
    const group = new THREE.Group();
    const xs = [-4.2, -2.1, 0, 2.1, 4.2];
    const pt = sprite('accent', 0.7, 1); pt.position.set(xs[0], 0, 0);
    const ln = fatLine([xs[1], -0.9, 0, xs[1], 0.9, 0], 'primary', 3, 1);
    const sq = fatLine([
      xs[2] - 0.9, -0.9, 0, xs[2] + 0.9, -0.9, 0, xs[2] + 0.9, 0.9, 0, xs[2] - 0.9, 0.9, 0, xs[2] - 0.9, -0.9, 0,
    ], 'secondary', 3, 1);
    const cube = cubeEdges(1.5, 'primary', 0.95, 2.2);
    cube.position.set(xs[3], 0, 0);
    const mini = buildTesseract(palette);
    mini.group.scale.setScalar(0.62);
    mini.group.position.set(xs[4], 0, 0);
    mini.group.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity ?? 1; }); });
    themed.push((p) => mini.recolor(p));
    onResize.push((w, h) => mini.setResolution(w, h));
    group.add(pt, ln, sq, cube, mini.group);
    return {
      group,
      update(lp, t) {
        cube.rotation.x = t * 0.4; cube.rotation.y = t * 0.5;
        mini.update(t, lp);
        mini.group.scale.setScalar(0.62 * smootherstep(0.2, 0.7, lp) + 0.001);
      },
      camera(lp, t) {
        const z = (12.5 - lp * 1.0) * aspectFit(1.05);
        return { pos: V(Math.sin(t * 0.03) * 1.0, 0.4, z), target: V(0, 0, 0) };
      },
    };
  });

  // ============ CH11 — The Tesseract — drag to rotate in 4D ============
  chapter(() => {
    const group = new THREE.Group();
    const tess = buildTesseract(palette);
    tess.group.scale.setScalar(1.8);
    tess.group.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity ?? 1; }); });
    themed.push((p) => tess.recolor(p));
    onResize.push((w, h) => tess.setResolution(w, h));
    const grab = hotspot(2.4, 0); // big invisible grab zone, no visible ring (whole object grabs)
    group.add(tess.group, grab);
    let grabbed = false, vx = 0, vy = 0;
    return {
      group,
      update(lp, t, w, dt = 0.016) {
        tess.update(t, lp);
        if (!grabbed) { // inertia
          if (Math.abs(vx) > 1e-4 || Math.abs(vy) > 1e-4) { tess.addUser(vx, vy); vx *= 0.93; vy *= 0.93; }
        }
      },
      camera(lp, t) {
        const a = t * 0.13 + lp * 1.4;
        const r = (6.2 - lp * 0.6) * aspectFit(1.1);
        return { pos: V(Math.sin(a) * r, Math.sin(t * 0.18) * 1.4, Math.cos(a) * r), target: V(0, 0, 0) };
      },
      interactive: {
        objects: [{ id: 'tess', mesh: grab.userData.proxy }],
        grab() { grabbed = true; vx = vy = 0; },
        drag(id, ndc, d) { vx = d.x * 2.6; vy = -d.y * 2.6; tess.addUser(vx, vy); },
        release() { grabbed = false; },
      },
    };
  });

  // ============ CH12 — The Tesseract Through Our World (4D->3D slices) ============
  chapter(() => {
    const group = new THREE.Group();
    const verts = makeVertices();
    const edges = makeEdges();
    // faint reference tesseract (projected) behind
    const ref = buildTesseract(palette);
    ref.group.scale.setScalar(1.5);
    ref.group.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = (m.opacity ?? 1) * 0.18; m.opacity = m.userData.baseOpacity; }); });
    themed.push((p) => ref.recolor(p));
    onResize.push((w, h) => ref.setResolution(w, h));
    // the cross-section solid (rebuilt each frame)
    const xMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
    xMat.userData.baseOpacity = 0.14;
    themeMat(xMat, 'accent', true);
    const xMesh = new THREE.Mesh(new THREE.BufferGeometry(), xMat);
    xMesh.frustumCulled = false;
    const eMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.95 });
    eMat.userData.baseOpacity = 0.95;
    themeMat(eMat, 'accent', true);
    const xEdges = new THREE.LineSegments(new THREE.BufferGeometry(), eMat);
    xEdges.frustumCulled = false;
    const grab = hotspot(1.4, 1.6);
    group.add(ref.group, xMesh, xEdges, grab);

    const p4 = [0, 0, 0, 0];
    const rotated = new Array(16);
    let sliceS = 0, grabbed = false;
    const SCALE = 1.55;

    function computeSlice(time, s) {
      const aXW = time * 0.22, aYZ = time * 0.15, aZW = time * 0.1, aXY = time * 0.05;
      for (let i = 0; i < 16; i++) {
        p4[0] = verts[i][0]; p4[1] = verts[i][1]; p4[2] = verts[i][2]; p4[3] = verts[i][3];
        rot4(p4, 0, 3, aXW); rot4(p4, 1, 2, aYZ); rot4(p4, 2, 3, aZW); rot4(p4, 0, 1, aXY);
        rotated[i] = [p4[0], p4[1], p4[2], p4[3]];
      }
      const pts = [];
      for (let e = 0; e < edges.length; e++) {
        const A = rotated[edges[e][0]], B = rotated[edges[e][1]];
        const wa = A[3] - s, wb = B[3] - s;
        if ((wa <= 0 && wb > 0) || (wa > 0 && wb <= 0)) {
          const tt = wa / (wa - wb);
          pts.push(new THREE.Vector3(
            (A[0] + (B[0] - A[0]) * tt) * SCALE,
            (A[1] + (B[1] - A[1]) * tt) * SCALE,
            (A[2] + (B[2] - A[2]) * tt) * SCALE
          ));
        }
      }
      return pts;
    }

    return {
      group,
      update(lp, t, w, dt = 0.016) {
        ref.update(t * 0.6, 0);
        if (!grabbed) {
          const auto = Math.sin(t * 0.3) * 1.15;
          sliceS += (auto - sliceS) * (1 - Math.exp(-1.5 * dt));
        }
        sliceS = clamp(sliceS, -1.5, 1.5);
        grab.position.set(0, 0, 0);
        grab.userData.ring.scale.setScalar(1.5 + Math.sin(t * 3) * 0.12);
        const pts = computeSlice(t, sliceS);
        if (pts.length >= 4) {
          try {
            const cg = new ConvexGeometry(pts);
            xMesh.geometry.dispose();
            xMesh.geometry = cg;
            const eg = new THREE.EdgesGeometry(cg, 1);
            xEdges.geometry.dispose();
            xEdges.geometry = eg;
            xMesh.visible = xEdges.visible = true;
          } catch (err) { xMesh.visible = xEdges.visible = false; }
        } else { xMesh.visible = xEdges.visible = false; }
      },
      camera(lp, t) {
        const a = t * 0.12;
        const r = 5.6 * aspectFit(1.0);
        return { pos: V(Math.sin(a) * r, 1.6, Math.cos(a) * r), target: V(0, 0, 0) };
      },
      interactive: {
        objects: [{ id: 'slice', mesh: grab.userData.proxy }],
        grab() { grabbed = true; },
        drag(id, ndc, d) { sliceS = clamp(sliceS + d.x * 3.2, -1.5, 1.5); },
        release() { grabbed = false; },
      },
    };
  });

  // ============ CH13 — Unfolding the Hypercube (the net) — drag to fold ============
  chapter(() => {
    const group = new THREE.Group();
    // tesseract net (Dalí cross): a column of 4 cubes + 4 around the 2nd, = 8 cubes
    const S = 1.0;
    const SP = S * 1.92; // spacing = cube edge, so cubes share faces (a true net)
    const layout = [
      [0, 1.5, 0], [0, 0.5, 0], [0, -0.5, 0], [0, -1.5, 0], // column of 4
      [-1, 0.5, 0], [1, 0.5, 0], [0, 0.5, -1], [0, 0.5, 1], // 4 around 2nd
    ].map((p) => [p[0] * SP, p[1] * SP, p[2] * SP]);
    const cubes = layout.map((pos, i) => {
      const c = cubeEdges(S * 2 * 0.96, i === 1 ? 'accent' : 'primary', 0.9, 2);
      c.userData.home = new THREE.Vector3(pos[0], pos[1], pos[2]);
      group.add(c);
      return c;
    });
    const grab = hotspot(0.9, 1.4);
    grab.position.set(0, -3.4, 0);
    group.add(grab);
    let fold = 0, grabbed = false; // 0 = unfolded net, 1 = collapsed toward tesseract
    return {
      group,
      update(lp, t, w, dt = 0.016) {
        if (!grabbed) {
          const auto = Math.sin(t * 0.25) * 0.5 + 0.5;
          fold += (auto - fold) * (1 - Math.exp(-1.3 * dt));
        }
        fold = clamp(fold, 0, 1);
        const k = smootherstep(0, 1, fold);
        cubes.forEach((c) => {
          c.position.lerpVectors(c.userData.home, new THREE.Vector3(0, 0, 0), k);
          const s = lerp(1, 0.999, 0); // keep size
          c.scale.setScalar(1);
        });
        group.rotation.y = t * 0.22;
        group.rotation.x = Math.sin(t * 0.15) * 0.2;
        grab.userData.ring.scale.setScalar(1.3 + Math.sin(t * 3) * 0.12);
      },
      camera(lp, t) { const r = 11 * aspectFit(1.5); return { pos: V(0, 0.5, r), target: V(0, 0, 0) }; },
      interactive: {
        objects: [{ id: 'fold', mesh: grab.userData.proxy }],
        grab() { grabbed = true; },
        drag(id, ndc, d) { fold = clamp(fold + d.y * 1.4, 0, 1); },
        release() { grabbed = false; },
      },
    };
  });

  // ============ CH14 — Beyond Our Walls (what 4D could do) ============
  chapter(() => {
    const group = new THREE.Group();
    const box = cubeEdges(2.4, 'primary', 0.9, 2.2);
    group.add(box);
    const orb = sprite('accent', 0.9, 1);
    group.add(orb);
    return {
      group,
      update(lp, t) {
        box.rotation.y = t * 0.25; box.rotation.x = Math.sin(t * 0.12) * 0.2;
        // orb teleports "out" of the sealed box through 4D, loops
        const cyc = (t * 0.25) % 1;
        let y, op;
        if (cyc < 0.5) { y = 0; op = 1; }            // inside
        else { y = lerp(0, 3.2, smootherstep(0.5, 0.85, cyc)); op = 1 - smoothstep(0.5, 0.62, cyc) * 0 ; }
        // fade out inside, reappear above
        const inside = cyc < 0.5;
        const phase2 = (cyc - 0.5) / 0.5; // 0..1 when outside-cycle
        if (inside) { orb.position.set(0, 0, 0); orb.material.opacity = 1; }
        else {
          const a = smootherstep(0, 1, phase2);
          orb.position.set(0, lerp(0, 3.0, a), 0);
          orb.material.opacity = 1;
        }
        const p = 0.85 + Math.sin(t * 2.5) * 0.08;
        orb.scale.set(p, p, 1);
        group.rotation.y = Math.sin(t * 0.08) * 0.2;
      },
      camera(lp, t) { const r = 8 * aspectFit(0.9); return { pos: V(Math.sin(t * 0.06) * 1.2, 1.0, r), target: V(0, 0.3, 0) }; },
    };
  });

  // ============ CH15 — Home (outro) ============
  chapter(() => {
    const group = new THREE.Group();
    const tessTiny = buildTesseract(palette);
    tessTiny.group.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity ?? 1; }); });
    themed.push((p) => tessTiny.recolor(p));
    onResize.push((w, h) => tessTiny.setResolution(w, h));
    const dot = sprite('primary', 0.45, 1);
    group.add(tessTiny.group, dot);
    return {
      group,
      update(lp, t) {
        const shrink = lerp(1.6, 0.04, smootherstep(0, 0.7, lp));
        tessTiny.group.scale.setScalar(shrink);
        tessTiny.update(t, 0);
        const dp = 0.45 + Math.sin(t * 1.2) * 0.05;
        const ds = dp * smoothstep(0.5, 0.9, lp);
        dot.scale.set(ds, ds, 1);
      },
      camera(lp, t) {
        const z = lerp(6, 12, smootherstep(0, 1, lp));
        return { pos: V(Math.sin(t * 0.03) * 0.6, 0.2, z), target: V(0, 0, 0) };
      },
    };
  });

  function recolor(p) { themed.forEach((fn) => fn(p)); }
  function resize(w, h) { onResize.forEach((fn) => fn(w, h)); }
  recolor(palette);

  return { root, chapters, recolor, resize };
}
