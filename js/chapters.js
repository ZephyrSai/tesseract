// chapters.js — builds every scene in the journey as a Three.js group with an
// update(localProgress, time, weight) method and a camera(localProgress, time)
// pose. All colour + blending is theme-aware (dark = additive glow, light =
// solid lines on paper).

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { buildTesseract } from './tesseract.js';
import { clamp, lerp, smoothstep, smootherstep, TAU, easeInOutSine } from './utils.js';

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.28)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function buildJourney(palette) {
  const root = new THREE.Group();
  const TEX = glowTexture();
  const themed = []; // (palette) => void
  const onResize = []; // (w,h) => void
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // pull the camera back on narrow/portrait viewports so wide scenes still fit
  const aspectFit = (strength = 1) => {
    const a = window.innerWidth / Math.max(1, window.innerHeight);
    return a < 1 ? 1 + (1 - a) * strength : 1;
  };

  // remember theme name for blending decisions
  let themeName = palette.name;

  function themeMat(m, role, glow) {
    const fn = (p) => {
      themeName = p.name;
      if (role) m.color.setHex(p[role]);
      if (glow) {
        m.blending = p.name === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending;
        m.needsUpdate = true;
      }
    };
    themed.push(fn);
  }

  // ---------- primitive helpers ----------
  function sprite(role, size, opacity = 1) {
    const m = new THREE.SpriteMaterial({ map: TEX, transparent: true, depthWrite: false, opacity });
    m.userData.baseOpacity = opacity;
    themeMat(m, role, true);
    const s = new THREE.Sprite(m);
    s.scale.set(size, size, 1);
    return s;
  }

  function pointCloud(arr, role, size, opacity = 1) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const m = new THREE.PointsMaterial({
      map: TEX, size, transparent: true, depthWrite: false, opacity, sizeAttenuation: true,
    });
    m.userData.baseOpacity = opacity;
    themeMat(m, role, true);
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    return p;
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
    l.userData.geo = g;
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
    const half = size / 2, step = size / div, pos = [];
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
      const c = Math.cos(th) * r, s = Math.sin(th) * r;
      if (axis === 'xy') a.push(c, s, 0);
      else a.push(c, 0, s); // xz
    }
    return a;
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

  // ---------- chapters ----------
  const chapters = [];
  function chapter(builder) {
    const c = builder();
    root.add(c.group);
    chapters.push(c);
    return c;
  }

  // CH0 — Pale Blue Dot (intro)
  chapter(() => {
    const group = new THREE.Group();
    const dot = sprite('primary', 0.5, 1);
    dot.position.set(2.4, 0.4, -6);
    const beam = sprite('accent', 9, 0.0);
    beam.material.rotation = -0.6;
    beam.scale.set(0.5, 9, 1);
    beam.position.set(2.4, 0.4, -6.2);
    group.add(beam, dot);
    return {
      group,
      update(lp, t) {
        const pulse = 0.5 + Math.sin(t * 1.3) * 0.06;
        dot.scale.set(pulse, pulse, 1);
        beam.material.opacity = 0.05 + Math.sin(t * 0.5) * 0.02;
      },
      camera(lp, t) {
        const z = lerp(11, 8.5, smootherstep(0, 1, lp));
        return { pos: V(Math.sin(t * 0.04) * 0.6, 0.2, z), target: V(2.4 * lp * 0.3, 0.3, -6) };
      },
    };
  });

  // CH1 — The Point (0D)
  chapter(() => {
    const group = new THREE.Group();
    const core = sprite('accent', 0.9, 1);
    const ringA = fatLine(circleFlat(1, 96, 'xy'), 'primary', 2, 0.0);
    const ringB = fatLine(circleFlat(1, 96, 'xy'), 'secondary', 2, 0.0);
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
      camera(lp, t) { return { pos: V(0, 0, 5), target: V(0, 0, 0) }; },
    };
  });

  // CH2 — The Line (1D / Lineland)
  chapter(() => {
    const group = new THREE.Group();
    const L = 6;
    const line = fatLine([-L, 0, 0, L, 0, 0], 'primary', 3.5, 1);
    group.add(line);
    // static neighbours (points on the line)
    [-4.2, -1.6, 3.0, 4.8].forEach((x) => {
      const n = sprite('secondary', 0.4, 0.9);
      n.position.set(x, 0, 0);
      group.add(n);
    });
    // the linelander
    const me = sprite('creature', 0.6, 1);
    const meCore = sprite('accent', 0.28, 1);
    group.add(me, meCore);
    return {
      group,
      update(lp, t) {
        // line draws in at the start of the chapter
        const grow = smootherstep(0, 0.25, lp);
        line.scale.set(grow, 1, 1);
        const x = Math.sin(t * 0.6) * 4.6 * grow;
        me.position.set(x, 0, 0);
        meCore.position.set(x, 0, 0);
        const p = 0.55 + Math.sin(t * 3) * 0.05;
        me.scale.set(p, p, 1);
      },
      camera(lp, t) {
        return { pos: V(Math.sin(t * 0.05) * 0.8, 1.4 - lp * 0.5, 7), target: V(0, 0, 0) };
      },
    };
  });

  // CH3 — The Plane (2D / Flatland)
  chapter(() => {
    const group = new THREE.Group();
    const grid = gridLines(16, 32, 'gridStrong', 0.5);
    group.add(grid);
    // a flat creature: a triangle outline gliding on the plane
    const tri = fatLine([0, 0.01, 0.6, -0.52, 0.01, -0.3, 0.52, 0.01, -0.3, 0, 0.01, 0.6], 'creature', 3, 1);
    const triCore = sprite('accent', 0.35, 0.9);
    group.add(tri, triCore);
    return {
      group,
      update(lp, t) {
        const reveal = smootherstep(0, 0.3, lp);
        grid.scale.set(reveal, 1, reveal);
        const x = Math.sin(t * 0.4) * 5.2;
        const z = Math.cos(t * 0.31) * 4.4;
        tri.position.set(x, 0, z);
        tri.rotation.y = -t * 0.4;
        triCore.position.set(x, 0.05, z);
      },
      camera(lp, t) {
        const a = t * 0.04;
        return { pos: V(Math.sin(a) * 3, lerp(9, 6.5, lp), Math.cos(a) * 3 + 9), target: V(0, 0, 0) };
      },
    };
  });

  // CH4 — 2D meets 1D (the cross-section reveal)
  chapter(() => {
    const group = new THREE.Group();
    const plane = gridLines(14, 28, 'grid', 0.28);
    group.add(plane);
    // Lineland: a bright line along x at z=0
    const lineLand = fatLine([-6, 0.02, 0, 6, 0.02, 0], 'primary', 3.5, 1);
    group.add(lineLand);
    // the 2D shape (a glowing disc) that drifts across the line
    const R = 1.5;
    const disc = fatLine(circleFlat(R, 80, 'xz'), 'creature', 2.5, 0.9);
    const discFill = sprite('creature', R * 2.4, 0.07);
    discFill.material.rotation = 0;
    group.add(discFill, disc);
    // perceived points ON the line (what the linelander sees)
    const p1 = sprite('accent', 0.55, 1);
    const p2 = sprite('accent', 0.55, 1);
    group.add(p1, p2);
    // a separate "1D readout" strip toward the camera showing only the two dots
    const strip = fatLine([-6, 0.02, -4.5, 6, 0.02, -4.5], 'secondary', 2, 0.45);
    const s1 = sprite('accent', 0.5, 1);
    const s2 = sprite('accent', 0.5, 1);
    group.add(strip, s1, s2);

    return {
      group,
      update(lp, t) {
        // disc sweeps across the line in z (front to back), looping
        const phase = (t * 0.18) % 1;
        const cz = lerp(4.2, -4.2, phase);
        const cx = Math.sin(t * 0.12) * 1.2;
        disc.position.set(cx, 0.04, cz);
        discFill.position.set(cx, 0.03, cz);

        const inside = Math.abs(cz) < R;
        const hw = inside ? Math.sqrt(Math.max(0, R * R - cz * cz)) : 0;
        const show = inside ? 1 : 0;
        p1.position.set(cx - hw, 0.06, 0);
        p2.position.set(cx + hw, 0.06, 0);
        p1.material.opacity = show; p2.material.opacity = show;
        const ps = 0.35 + hw * 0.18;
        p1.scale.set(ps, ps, 1); p2.scale.set(ps, ps, 1);
        // readout strip mirrors the same two x positions
        s1.position.set(cx - hw, 0.06, -4.5);
        s2.position.set(cx + hw, 0.06, -4.5);
        s1.material.opacity = show; s2.material.opacity = show;
        s1.scale.set(ps, ps, 1); s2.scale.set(ps, ps, 1);
      },
      camera(lp, t) {
        return { pos: V(Math.sin(t * 0.05) * 1.5, lerp(6.5, 5, lp), 8.5), target: V(0, 0, -1.2) };
      },
    };
  });

  // CH5 — Space (3D)
  chapter(() => {
    const group = new THREE.Group();
    const cube = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2)),
      (() => { const m = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9 }); m.userData.baseOpacity = 0.9; themeMat(m, 'primary', true); return m; })()
    );
    cube.position.set(-2.6, 0.3, 0);
    const sph = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 32, 24),
      (() => { const m = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.3, metalness: 0.1, emissiveIntensity: 0.15 }); m.userData.baseOpacity = 1; m.emissive = new THREE.Color(); themed.push((p) => { m.color.setHex(p.secondary); m.emissive.setHex(p.secondary); }); return m; })()
    );
    sph.position.set(2.6, 0.3, 0);
    const apl = appleMesh();
    apl.position.set(0, 0.2, 0);
    // axes
    const ax = basicLines([0, 0, 0, 1.6, 0, 0, 0, 0, 0, 0, 1.6, 0, 0, 0, 0, 0, 0, 1.6], 'accent', 0.7);
    ax.position.set(0, -2, 0);
    group.add(cube, sph, apl, ax);
    return {
      group,
      update(lp, t) {
        cube.rotation.x = t * 0.4; cube.rotation.y = t * 0.3;
        sph.rotation.y = t * 0.3;
        apl.rotation.y = t * 0.5;
        apl.position.y = 0.2 + Math.sin(t * 0.8) * 0.12;
      },
      camera(lp, t) {
        const a = t * 0.08 + lp * 0.6;
        const r = 7.5 * aspectFit(0.8);
        return { pos: V(Math.sin(a) * r, 1.5 + Math.sin(t * 0.2) * 0.6, Math.cos(a) * r), target: V(0, 0, 0) };
      },
    };
  });

  // CH6 — The Apple in Flatland (3D -> 2D, ink stamp + cross-sections)
  chapter(() => {
    const group = new THREE.Group();
    const paper = gridLines(10, 24, 'gridStrong', 0.5);
    group.add(paper);
    const apl = appleMesh();
    const R = apl.userData.R;
    group.add(apl);
    // live cross-section ring on the paper
    const ring = fatLine(circleFlat(1, 80, 'xz'), 'accent', 3, 1);
    ring.position.y = 0.02;
    // persistent faint stamp left behind
    const stamp = fatLine(circleFlat(1, 80, 'xz'), 'apple', 2, 0.0);
    stamp.position.y = 0.01;
    group.add(ring, stamp);
    let stampedR = 0;
    return {
      group,
      update(lp, t) {
        // apple descends through the paper as you scroll the chapter
        const cy = lerp(2.4, -2.4, smootherstep(0, 1, lp));
        apl.position.set(0, cy, 0);
        apl.rotation.y = t * 0.5;
        const r = Math.abs(cy) < R ? Math.sqrt(Math.max(0, R * R - cy * cy)) : 0;
        ring.scale.set(r, 1, r);
        ring.material.opacity = r > 0.001 ? 1 : 0;
        if (r > stampedR) stampedR = r; // record widest print
        stamp.scale.set(stampedR, 1, stampedR);
        stamp.material.opacity = stampedR > 0.01 && lp > 0.5 ? 0.4 : 0.0;
      },
      camera(lp, t) {
        return { pos: V(Math.sin(t * 0.06) * 2 + 1.5, 3.4, 7), target: V(0, 0.2, 0) };
      },
    };
  });

  // CH7 — Pages of Time (stack 2D slices into a 3D form)
  chapter(() => {
    const group = new THREE.Group();
    const N = 17, R = 1.4;
    const pages = [];
    for (let i = 0; i < N; i++) {
      const u = (i / (N - 1)) * 2 - 1; // -1..1
      const r = Math.sqrt(Math.max(0.0001, 1 - u * u)) * R;
      const pg = new THREE.Group();
      const quad = new THREE.Mesh(
        new THREE.PlaneGeometry(3.4, 3.4),
        (() => { const m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide }); m.userData.baseOpacity = 0.05; themeMat(m, 'grid', false); return m; })()
      );
      const circ = fatLine(circleFlat(r, 64, 'xy'), i === Math.floor(N / 2) ? 'accent' : 'apple', 2, 0.85);
      pg.add(quad, circ);
      pg.userData.u = u;
      group.add(pg);
      pages.push(pg);
    }
    return {
      group,
      update(lp, t) {
        const spread = 0.06 + smootherstep(0, 1, lp) * 0.42 + Math.sin(t * 0.4) * 0.015;
        pages.forEach((pg) => {
          pg.position.z = pg.userData.u * spread * (pages.length - 1) * 0.5;
        });
        group.rotation.y = -0.5 + Math.sin(t * 0.12) * 0.12;
      },
      camera(lp, t) {
        const f = aspectFit(0.7);
        return { pos: V(6 * f, 1.6, 5.5 * f), target: V(0, 0, 0) };
      },
    };
  });

  // CH8 — Smeared Across Time (worldline / block universe)
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
    group.add(tube);
    // the "now" plane sweeping along the time axis
    const nowPlane = gridLines(7, 14, 'gridStrong', 0.45);
    const marker = sprite('accent', 0.7, 1);
    group.add(nowPlane, marker);
    return {
      group,
      update(lp, t) {
        const phase = (Math.sin(t * 0.25) * 0.5 + 0.5);
        const y = (phase - 0.5) * 8;
        nowPlane.position.y = y;
        const pt = curve.getPoint(clamp(phase, 0, 1));
        marker.position.copy(pt);
        const ps = 0.6 + Math.sin(t * 3) * 0.06;
        marker.scale.set(ps, ps, 1);
        group.rotation.y = t * 0.08;
      },
      camera(lp, t) {
        return { pos: V(7, 0.5, 7), target: V(0, 0, 0) };
      },
    };
  });

  // CH9 — The Ladder to 4D (point -> line -> square -> cube -> tesseract)
  chapter(() => {
    const group = new THREE.Group();
    const xs = [-4.2, -2.1, 0, 2.1, 4.2];
    // 0D
    const pt = sprite('accent', 0.7, 1); pt.position.set(xs[0], 0, 0);
    // 1D
    const ln = fatLine([xs[1], -0.9, 0, xs[1], 0.9, 0], 'primary', 3, 1);
    // 2D
    const sq = fatLine([
      xs[2] - 0.9, -0.9, 0, xs[2] + 0.9, -0.9, 0, xs[2] + 0.9, 0.9, 0, xs[2] - 0.9, 0.9, 0, xs[2] - 0.9, -0.9, 0,
    ], 'secondary', 3, 1);
    // 3D cube
    const cube = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.5, 1.5, 1.5)),
      (() => { const m = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.95 }); m.userData.baseOpacity = 0.95; themeMat(m, 'primary', true); return m; })()
    );
    cube.position.set(xs[3], 0, 0);
    // 4D mini tesseract
    const mini = buildTesseract(palette);
    mini.group.scale.setScalar(0.62);
    mini.group.position.set(xs[4], 0, 0);
    mini.group.traverse((o) => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity ?? 1; }); } });
    themed.push((p) => mini.recolor(p));
    onResize.push((w, h) => mini.setResolution(w, h));
    group.add(pt, ln, sq, cube, mini.group);
    return {
      group,
      update(lp, t) {
        cube.rotation.x = t * 0.4; cube.rotation.y = t * 0.5;
        mini.update(t, lp);
        const grow = smootherstep(0.2, 0.7, lp);
        mini.group.scale.setScalar(0.62 * grow + 0.001);
      },
      camera(lp, t) {
        const z = (12.5 - lp * 1.0) * aspectFit(1.05);
        return { pos: V(Math.sin(t * 0.03) * 1.0, 0.4, z), target: V(0, 0, 0) };
      },
    };
  });

  // CH10 — The Tesseract (centerpiece)
  chapter(() => {
    const group = new THREE.Group();
    const tess = buildTesseract(palette);
    tess.group.scale.setScalar(1.8);
    tess.group.traverse((o) => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity ?? 1; }); } });
    themed.push((p) => tess.recolor(p));
    onResize.push((w, h) => tess.setResolution(w, h));
    group.add(tess.group);
    return {
      group,
      update(lp, t) { tess.update(t, lp); },
      camera(lp, t) {
        const a = t * 0.13 + lp * 1.4;
        const r = (6.2 - lp * 0.6) * aspectFit(1.1);
        return { pos: V(Math.sin(a) * r, Math.sin(t * 0.18) * 1.4, Math.cos(a) * r), target: V(0, 0, 0) };
      },
    };
  });

  // CH11 — Home (outro / pale blue dot)
  chapter(() => {
    const group = new THREE.Group();
    const tessTiny = buildTesseract(palette);
    tessTiny.group.traverse((o) => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity ?? 1; }); } });
    themed.push((p) => tessTiny.recolor(p));
    onResize.push((w, h) => tessTiny.setResolution(w, h));
    group.add(tessTiny.group);
    const dot = sprite('primary', 0.45, 1);
    dot.position.set(0, 0, 0);
    group.add(dot);
    return {
      group,
      update(lp, t) {
        const shrink = lerp(1.6, 0.04, smootherstep(0, 0.7, lp));
        tessTiny.group.scale.setScalar(shrink);
        tessTiny.update(t, 0);
        const dp = 0.45 + Math.sin(t * 1.2) * 0.05;
        dot.scale.set(dp * smoothstep(0.5, 0.9, lp), dp * smoothstep(0.5, 0.9, lp), 1);
      },
      camera(lp, t) {
        const z = lerp(6, 12, smootherstep(0, 1, lp));
        return { pos: V(Math.sin(t * 0.03) * 0.6, 0.2, z), target: V(0, 0, 0) };
      },
    };
  });

  function recolor(p) {
    themed.forEach((fn) => fn(p));
  }
  function resize(w, h) {
    onResize.forEach((fn) => fn(w, h));
  }

  recolor(palette); // set all colours/blending consistently for the initial theme

  return { root, chapters, recolor, resize };
}
