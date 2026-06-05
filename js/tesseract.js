// tesseract.js — a 4D hypercube: 4D rotation, perspective projection 4D->3D,
// rendered as glowing fat lines + node sprites. Three.js then projects 3D->2D.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// 16 vertices: every (+-1, +-1, +-1, +-1)
function makeVertices() {
  const v = [];
  for (let i = 0; i < 16; i++) {
    v.push([
      i & 1 ? 1 : -1,
      i & 2 ? 1 : -1,
      i & 4 ? 1 : -1,
      i & 8 ? 1 : -1,
    ]);
  }
  return v;
}

// edges connect vertices differing in exactly one coordinate (32 edges)
function makeEdges() {
  const e = [];
  for (let i = 0; i < 16; i++) {
    for (let j = i + 1; j < 16; j++) {
      let diff = i ^ j;
      if (diff && (diff & (diff - 1)) === 0) e.push([i, j]); // power of two -> 1 bit
    }
  }
  return e;
}

function rot(p, i, j, ang) {
  const c = Math.cos(ang),
    s = Math.sin(ang);
  const a = p[i],
    b = p[j];
  p[i] = a * c - b * s;
  p[j] = a * s + b * c;
}

function glowSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.25)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function buildTesseract(palette) {
  const group = new THREE.Group();
  const verts = makeVertices();
  const edges = makeEdges();
  const N = edges.length;

  const positions = new Float32Array(N * 2 * 3);
  const colors = new Float32Array(N * 2 * 3);

  const geo = new LineSegmentsGeometry();
  geo.setPositions(positions);
  geo.setColors(colors);

  const mat = new LineMaterial({
    linewidth: 3.2,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    worldUnits: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  mat.resolution.set(window.innerWidth, window.innerHeight);
  mat.userData.baseOpacity = 1;
  const lines = new LineSegments2(geo, mat);
  lines.frustumCulled = false;
  group.add(lines);

  // node points
  const nodeGeo = new THREE.BufferGeometry();
  const nodePos = new Float32Array(16 * 3);
  const nodeCol = new Float32Array(16 * 3);
  nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePos, 3));
  nodeGeo.setAttribute('color', new THREE.BufferAttribute(nodeCol, 3));
  const nodeMat = new THREE.PointsMaterial({
    size: 0.34,
    map: glowSprite(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  nodeMat.userData.baseOpacity = 1;
  const nodes = new THREE.Points(nodeGeo, nodeMat);
  nodes.frustumCulled = false;
  group.add(nodes);

  const cNear = new THREE.Color();
  const cFar = new THREE.Color();
  const cTmp = new THREE.Color();

  function applyPalette(p) {
    cFar.setHex(p.primary);
    cNear.setHex(p.accent);
    // additive glow in the dark; solid ink on light paper
    const add = p.name === 'dark';
    mat.blending = add ? THREE.AdditiveBlending : THREE.NormalBlending;
    nodeMat.blending = add ? THREE.AdditiveBlending : THREE.NormalBlending;
    mat.needsUpdate = true;
    nodeMat.needsUpdate = true;
  }
  applyPalette(palette);

  const W_DIST = 2.7; // 4D camera distance along w
  const SCALE = 1.55;

  const p4 = [0, 0, 0, 0];

  function update(time, lp, opacity = 1) {
    mat.opacity = opacity;
    nodeMat.opacity = opacity;

    // angles — a layered double rotation, with extra spin driven by scroll.
    const spin = 1 + lp * 0.6;
    const aXW = time * 0.28 * spin + lp * Math.PI;
    const aYZ = time * 0.17 * spin;
    const aZW = time * 0.12 * spin + lp * 0.6;
    const aXY = time * 0.05;

    let pi = 0;
    let ci = 0;
    const proj = new Array(16);

    for (let i = 0; i < 16; i++) {
      p4[0] = verts[i][0];
      p4[1] = verts[i][1];
      p4[2] = verts[i][2];
      p4[3] = verts[i][3];
      rot(p4, 0, 3, aXW);
      rot(p4, 1, 2, aYZ);
      rot(p4, 2, 3, aZW);
      rot(p4, 0, 1, aXY);

      const f = (1 / (W_DIST - p4[3])) * SCALE;
      const x = p4[0] * f;
      const y = p4[1] * f;
      const z = p4[2] * f;
      proj[i] = { x, y, z, w: p4[3] };

      // node buffers
      nodePos[i * 3] = x;
      nodePos[i * 3 + 1] = y;
      nodePos[i * 3 + 2] = z;
      const tcol = THREE.MathUtils.clamp((p4[3] + 1.4) / 2.8, 0, 1);
      cTmp.copy(cFar).lerp(cNear, tcol);
      nodeCol[i * 3] = cTmp.r;
      nodeCol[i * 3 + 1] = cTmp.g;
      nodeCol[i * 3 + 2] = cTmp.b;
    }

    for (let e = 0; e < N; e++) {
      const [a, b] = edges[e];
      const A = proj[a];
      const B = proj[b];
      positions[pi++] = A.x;
      positions[pi++] = A.y;
      positions[pi++] = A.z;
      positions[pi++] = B.x;
      positions[pi++] = B.y;
      positions[pi++] = B.z;

      const ta = THREE.MathUtils.clamp((A.w + 1.4) / 2.8, 0, 1);
      const tb = THREE.MathUtils.clamp((B.w + 1.4) / 2.8, 0, 1);
      cTmp.copy(cFar).lerp(cNear, ta);
      colors[ci++] = cTmp.r;
      colors[ci++] = cTmp.g;
      colors[ci++] = cTmp.b;
      cTmp.copy(cFar).lerp(cNear, tb);
      colors[ci++] = cTmp.r;
      colors[ci++] = cTmp.g;
      colors[ci++] = cTmp.b;
    }

    geo.setPositions(positions);
    geo.setColors(colors);
    nodeGeo.attributes.position.needsUpdate = true;
    nodeGeo.attributes.color.needsUpdate = true;

    group.rotation.y = time * 0.05;
  }

  function setResolution(w, h) {
    mat.resolution.set(w, h);
  }

  function recolor(p) {
    applyPalette(p);
  }

  return { group, update, setResolution, recolor };
}
