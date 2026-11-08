// The 3D world: dotted globe, moon, stars, the courier game and the finale view.
import * as THREE from 'three';
import { sfx } from './sfx.js';
import { ICONS } from './icons.js';

const R = 10;                // globe radius
const LANE_MIN = 0, LANE_MAX = 2.8, LANE_BASE = R + 1.15, LANE_X = 2.3;
const FLY_SPEED = 6.2, GRACE_DIST = FLY_SPEED * 2; // 2 seconds of flight
const SEG_DIST = FLY_SPEED * 10, FINAL_DIST = FLY_SPEED * 6;  // ~10 s of flight between checkpoints, ~6 s after the last
const SAFE_Z = 4, SAFE_XY = 1.5;                              // stars and clouds keep this much space between them
const SPAWN_Z = -48, KILL_Z = 7;
const DEG = Math.PI / 180;

// ---------- helpers ----------
export function latLonToVec(lat, lon, r = 1) {
  const phi = (90 - lat) * DEG, theta = (lon + 180) * DEG;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

function glowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(190,140,255,0.5)') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner); grd.addColorStop(0.25, mid); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
}

function moonTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#d9d4ea'; g.fillRect(0, 0, 1024, 512);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // maria (dark seas)
  for (let i = 0; i < 14; i++) {
    const x = rnd() * 1024, y = 120 + rnd() * 280, r = 40 + rnd() * 110;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(120,112,150,0.55)'); grd.addColorStop(1, 'rgba(120,112,150,0)');
    g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, r * 1.3, r, 0, 0, Math.PI * 2); g.fill();
  }
  // craters
  for (let i = 0; i < 260; i++) {
    const x = rnd() * 1024, y = rnd() * 512, r = 2 + Math.pow(rnd(), 3) * 30;
    g.fillStyle = 'rgba(95,88,125,0.35)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = Math.max(1, r * 0.15);
    g.beginPath(); g.arc(x - r * 0.12, y - r * 0.12, r, Math.PI * 0.9, Math.PI * 1.9); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function textSprite(lines, { color = '#fbf6ea', sub = '#f3d9a4', scale = 1 } = {}) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(3.2 * scale, 1 * scale, 1);
  sprite.userData.draw = (l) => {
    const g = c.getContext('2d'); g.clearRect(0, 0, 512, 160);
    g.textAlign = 'center'; g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 12;
    g.fillStyle = color; g.font = '700 64px Caveat, "Segoe Script", cursive'; g.fillText(l[0], 256, 64);
    if (l[1]) { g.fillStyle = sub; g.font = '36px "Special Elite", "Courier New", monospace'; g.fillText(l[1], 256, 122); }
    tex.needsUpdate = true;
  };
  sprite.userData.draw(lines);
  return sprite;
}

// Draw a Lucide icon (from icons.js) onto a canvas: flat cream badge with a navy line icon.
function iconTexture(name) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fbf6ea'; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
  g.translate(28, 28); g.scale(3, 3);
  g.strokeStyle = '#1f2a4a'; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
  const svg = ICONS[name] || '';
  for (const m of svg.matchAll(/<(path|line|rect|circle|polygon)\b([^>]*)\/>/g)) {
    const a = Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
    let d = '';
    if (m[1] === 'path') d = a.d;
    else if (m[1] === 'line') d = `M${a.x1} ${a.y1}L${a.x2} ${a.y2}`;
    else if (m[1] === 'rect') { const x = +a.x || 0, y = +a.y || 0; d = `M${x} ${y}h${a.width}v${a.height}h${-a.width}Z`; }
    else if (m[1] === 'circle') { const r = +a.r; d = `M${a.cx - r} ${a.cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`; }
    else if (m[1] === 'polygon') d = 'M' + a.points.trim().split(/\s+/).join(' L') + 'Z';
    g.stroke(new Path2D(d));
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function envelopeTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 336;
  const g = c.getContext('2d');
  g.fillStyle = '#fbf6ea'; g.fillRect(0, 0, 512, 336);
  // airmail border
  g.save(); g.beginPath(); g.rect(0, 0, 512, 336); g.rect(22, 22, 468, 292); g.clip('evenodd');
  for (let i = -40; i < 900; i += 44) {
    g.fillStyle = (i / 44) % 2 ? '#1f4ea3' : '#c8352e';
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 22, 0); g.lineTo(i - 314, 336); g.lineTo(i - 336, 336); g.closePath(); g.fill();
  }
  g.restore();
  // flap
  g.strokeStyle = '#d8c9a8'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(24, 26); g.lineTo(256, 190); g.lineTo(488, 26); g.stroke();
  g.beginPath(); g.moveTo(24, 312); g.lineTo(200, 170); g.moveTo(488, 312); g.lineTo(312, 170); g.stroke();
  // wax seal
  g.fillStyle = '#c8352e'; g.beginPath();
  for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2, r = k % 2 ? 44 : 48; g.lineTo(256 + Math.cos(a) * r, 190 + Math.sin(a) * r); }
  g.closePath(); g.fill();
  g.fillStyle = '#fbf6ea'; g.save(); g.translate(256 - 24, 190 - 22); g.scale(2, 2); g.fill(new Path2D('M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z')); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function airmailStripes() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 32;
  const g = c.getContext('2d'); const cols = ['#c8352e', '#fbf6ea', '#1f4ea3', '#fbf6ea'];
  for (let i = -2; i < 12; i++) { g.fillStyle = cols[((i % 4) + 4) % 4]; g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 32, 0); g.lineTo(i * 32 + 16, 32); g.lineTo(i * 32 - 16, 32); g.closePath(); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 1); return t;
}

// Soft painted cloud for sprites. storm = darker obstacle cloud, otherwise a pale background cloud.
function cloudTexture(seed, storm) {
  const c = document.createElement('canvas'); c.width = 384; c.height = 224;
  const g = c.getContext('2d');
  let s = seed * 9301 + 49297; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const puffs = [];
  for (let i = 0; i < 11; i++) {
    const t = i / 10, r = 34 + rnd() * 30 + Math.sin(t * Math.PI) * 30;
    puffs.push([60 + t * 264 + (rnd() - 0.5) * 20, 150 - Math.sin(t * Math.PI) * 48 - rnd() * 22, r]);
  }
  for (let i = 0; i < 4; i++) puffs.push([110 + rnd() * 160, 100 + rnd() * 20, 40 + rnd() * 26]);
  for (const [x, y, r] of puffs) {
    const grd = g.createRadialGradient(x, y - r * 0.2, r * 0.1, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.65, 'rgba(255,255,255,0.92)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // flat-ish bottom
  g.globalCompositeOperation = 'destination-out';
  const cut = g.createLinearGradient(0, 168, 0, 200); cut.addColorStop(0, 'rgba(0,0,0,0)'); cut.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = cut; g.fillRect(0, 160, 384, 64);
  // shading: light top, tinted underside
  g.globalCompositeOperation = 'source-atop';
  const sh = g.createLinearGradient(0, 40, 0, 190);
  if (storm) { sh.addColorStop(0, '#e9e6f4'); sh.addColorStop(0.55, '#a7aacb'); sh.addColorStop(1, '#5d6390'); }
  else { sh.addColorStop(0, '#ffffff'); sh.addColorStop(0.6, '#f1ecfa'); sh.addColorStop(1, '#c9c9e4'); }
  g.fillStyle = sh; g.fillRect(0, 0, 384, 224);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function heartGeometry() {
  const h = new THREE.Shape();
  h.moveTo(0, -0.35);
  h.bezierCurveTo(-0.05, -0.3, -0.42, -0.05, -0.42, 0.14);
  h.bezierCurveTo(-0.42, 0.32, -0.28, 0.42, -0.16, 0.42);
  h.bezierCurveTo(-0.06, 0.42, 0, 0.35, 0, 0.28);
  h.bezierCurveTo(0, 0.35, 0.06, 0.42, 0.16, 0.42);
  h.bezierCurveTo(0.28, 0.42, 0.42, 0.32, 0.42, 0.14);
  h.bezierCurveTo(0.42, -0.05, 0.05, -0.3, 0, -0.35);
  const geo = new THREE.ExtrudeGeometry(h, { depth: 0.12, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 3 });
  geo.center(); return geo;
}

function starGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.16 : 0.36, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    i ? s.lineTo(px, py) : s.moveTo(px, py);
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  geo.center(); return geo;
}


// ---------- the world ----------
export class World {
  constructor(canvas, content) {
    this.content = content;
    this.canvas = canvas;
    this.sfx = sfx;
    this.combo = 0; this.lastStarAt = -9;
    this.mode = 'idle';          // idle | toGame | game | toFinale | finale
    this.paused = false;
    this.holding = false;
    this.progress = 0;
    this.starsCollected = 0;
    this.listeners = {};
    this.objects = [];
    this.nextCheckpoint = 0;
    this.clock = new THREE.Clock();
    this.time = 0;

    const s = content.settings;
    this.cityA = latLonToVec(s.cityA.lat, s.cityA.lon).normalize();
    this.cityB = latLonToVec(s.cityB.lat, s.cityB.lon).normalize();
    this.omega = Math.acos(THREE.MathUtils.clamp(this.cityA.dot(this.cityB), -1, 1));
    this.distanceKm = Math.round(6371 * this.omega);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b1430');
    this.scene.fog = new THREE.FogExp2('#0e1a3a', 0.006);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 600);

    this.tex = { glow: glowTexture(), dot: dotTexture(), pinkGlow: glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.45)'), warm: glowTexture('rgba(255,250,235,1)', 'rgba(255,210,150,0.5)') };
    this.buildLights(); this.buildSky(); this.buildGlobe(); this.buildMoon(); this.buildCourier(); this.buildPools();

    this.idleQuat = new THREE.Quaternion();
    this.finaleQuat = this.orientFinale();
    this.camFrom = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.camLook = new THREE.Vector3();
    this.transition = 0;

    this.resize(); window.addEventListener('resize', () => this.resize());
    this.bindInput();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); }
  emit(evt, ...a) { (this.listeners[evt] || []).forEach((f) => f(...a)); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = h > w;
    this.camera.fov = this.portrait ? 68 : 55;
    this.camera.updateProjectionMatrix();
  }

  // ---------- build ----------
  buildLights() {
    this.scene.add(new THREE.AmbientLight('#9fb0d8', 0.95));
    const sun = new THREE.DirectionalLight('#fff4e8', 2.2); sun.position.set(-6, 4, 8); this.scene.add(sun);
    const rim = new THREE.DirectionalLight('#7fa6ff', 1.1); rim.position.set(5, -2, -6); this.scene.add(rim);
  }

  buildSky() {
    const n = 2600, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const palette = [new THREE.Color('#ffffff'), new THREE.Color('#fff1d6'), new THREE.Color('#ffd9c2'), new THREE.Color('#c9dbff')];
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(220 + Math.random() * 120);
      pos.set([v.x, v.y, v.z], i * 3);
      const c = palette[(Math.random() * palette.length) | 0]; col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.sky = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, map: this.tex.glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.scene.add(this.sky);

    // soft nebula blobs
    const neb = new THREE.Group();
    [['#1f4ea3', -120, 60, -200, 170], ['#8a2c3a', 140, -40, -220, 140], ['#2a4f8f', 30, 120, -260, 180]].forEach(([c, x, y, z, s]) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(c, c + '55'), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      sp.position.set(x, y, z); sp.scale.set(s, s, 1); neb.add(sp);
    });
    this.nebula = neb; this.scene.add(neb);
  }

  buildGlobe() {
    this.globe = new THREE.Group();
    this.scene.add(this.globe);

    const ocean = new THREE.Mesh(new THREE.SphereGeometry(R * 0.995, 96, 64), new THREE.MeshStandardMaterial({ color: '#13224a', roughness: 0.85, metalness: 0.1, emissive: '#0a1430' }));
    this.globe.add(ocean);

    // atmosphere glow (fresnel)
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 64, 48), new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { c: { value: new THREE.Color('#7fa6ff') } },
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 c; varying vec3 vN; varying vec3 vP; void main(){ float d = clamp(-dot(vN, normalize(-vP)), 0.0, 1.0); float f = pow(d, 1.6) * 1.6; gl_FragColor = vec4(c, clamp(f, 0.0, 0.9)); }',
    }));
    this.atmo = atmo; this.scene.add(atmo);

    // land dots (loaded later)
    this.landReady = fetch('assets/land-dots.bin').then((r) => r.arrayBuffer()).then((buf) => {
      const arr = new Int16Array(buf), n = arr.length / 2, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      const c1 = new THREE.Color('#f6e7c1'), c2 = new THREE.Color('#ffc98a'), tmp = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const v = latLonToVec(arr[i * 2] / 100, arr[i * 2 + 1] / 100, R * 1.002);
        pos.set([v.x, v.y, v.z], i * 3);
        tmp.copy(c1).lerp(c2, Math.random() * 0.5); col.set([tmp.r, tmp.g, tmp.b], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.globe.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.11, map: this.tex.dot, vertexColors: true, transparent: true, alphaTest: 0.4 })));
    }).catch(() => {});

    // city beacons + labels
    const s = this.content.settings;
    this.cityLabels = [];
    [[this.cityA, s.cityA, '#ff5a4f'], [this.cityB, s.cityB, '#6b9bff']].forEach(([v, info, color]) => {
      const g = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.12, 2.6, 12, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 1.3; g.add(beam);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.pinkGlow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(1.4, 1.4, 1); glow.position.y = 0.05; g.add(glow);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.32, 48), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring); g.userData.ring = ring;
      const label = textSprite([info.name, ''], { scale: 2.1 }); label.position.y = 3.6; g.add(label);
      label.userData.info = info; this.cityLabels.push(label);
      g.position.copy(v).multiplyScalar(R);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      this.globe.add(g);
      (this.beacons ||= []).push(g);
    });
    this.updateCityClocks();
    setInterval(() => this.updateCityClocks(), 20000);

    // the arc of light between the two cities (drawn progressively)
    const pts = [];
    for (let i = 0; i <= 200; i++) { const t = i / 200; pts.push(this.pathPoint(t).multiplyScalar(R + 0.12 + Math.sin(Math.PI * t) * 1.6)); }
    this.arcSegments = 240; this.arcRadial = 8;
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), this.arcSegments, 0.045, this.arcRadial, false);
    this.arc = new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color: '#ffe2b0', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.arc.geometry.setDrawRange(0, 0);
    this.globe.add(this.arc);
    this.arcGhost = new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color: '#8aa6e8', transparent: true, opacity: 0.2, depthWrite: false }));
    this.globe.add(this.arcGhost);
  }

  updateCityClocks() {
    this.cityLabels?.forEach((l) => {
      const info = l.userData.info;
      let time = '';
      try { time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: info.timeZone }).format(new Date()); } catch { /* ignore */ }
      l.userData.draw([info.name, time]);
    });
  }

  buildMoon() {
    const moon = new THREE.Mesh(new THREE.SphereGeometry(5, 64, 48), new THREE.MeshStandardMaterial({ map: moonTexture(), roughness: 1, metalness: 0, emissive: '#3a2f63', emissiveIntensity: 0.35 }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,255,255,0.9)', 'rgba(200,170,255,0.35)'), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    halo.scale.set(26, 26, 1);
    this.moon = new THREE.Group(); this.moon.add(halo); this.moon.add(moon); this.moonMesh = moon;
    moon.material.fog = false;
    this.scene.add(this.moon);
  }

  buildCourier() {
    const g = new THREE.Group();
    const envTex = envelopeTexture();
    const face = new THREE.MeshStandardMaterial({ map: envTex, emissiveMap: envTex, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.8 });
    const edge = new THREE.MeshStandardMaterial({ color: '#efe4cc', roughness: 0.9 });
    const env = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.62, 0.04), [edge, edge, edge, edge, face, face]);
    env.scale.setScalar(1.25); g.add(env); this.envelope = env;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.warm, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(2.0, 2.0, 1); glow.position.z = -0.1; g.add(glow); this.courierGlow = glow;
    const light = new THREE.PointLight('#ffd9a0', 6, 6, 1.6); g.add(light);
    g.visible = false;
    this.courier = g; this.scene.add(g);
    this.courierY = 1.2; this.courierVy = 0; this.hitTimer = 0;

    // trail particles
    this.trail = [];
    const tm = new THREE.SpriteMaterial({ map: this.tex.warm, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 40; i++) { const s = new THREE.Sprite(tm.clone()); s.visible = false; this.scene.add(s); this.trail.push({ s, life: 0 }); }
    this.trailIdx = 0; this.trailTimer = 0;
  }

  buildPools() {
    this.geo = { star: starGeometry(), heart: heartGeometry(), ring: new THREE.TorusGeometry(2.1, 0.11, 12, 96) };
    this.cloudTex = { storm: [1, 2, 3].map((k) => cloudTexture(k, true)), soft: [4, 5, 6].map((k) => cloudTexture(k, false)) };
    this.mat = {
      star: new THREE.MeshStandardMaterial({ color: '#ffe08a', emissive: '#e9a23b', emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.4 }),
      heart: new THREE.MeshStandardMaterial({ color: '#ff6f86', emissive: '#e0405c', emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.2 }),
      ring: new THREE.MeshBasicMaterial({ map: airmailStripes(), fog: false }),
    };
    this.lane = new THREE.Group(); this.scene.add(this.lane);
    // speed dust
    const n = 160, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 16, LANE_BASE - 1 + Math.random() * 7, SPAWN_Z + Math.random() * (KILL_Z - SPAWN_Z)], i * 3);
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.08, map: this.tex.glow, color: '#fff1d6', transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.dust.visible = false; this.scene.add(this.dust);
    // sparkle bursts + lost stars
    this.bursts = [];
    for (let i = 0; i < 60; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.warm, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.visible = false; this.scene.add(sp); this.bursts.push({ sp, life: 0, v: new THREE.Vector3() });
    }
    this.burstIdx = 0;
    this.lost = [];
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(this.geo.star, this.mat.star); m.visible = false; this.scene.add(m); this.lost.push({ m, life: 0, v: new THREE.Vector3() }); }
  }

  burst(pos, color = '#ffe08a', n = 10, speed = 3) {
    for (let i = 0; i < n; i++) {
      const b = this.bursts[this.burstIdx++ % this.bursts.length];
      b.sp.visible = true; b.life = 1; b.sp.position.copy(pos); b.sp.material.color.set(color);
      b.v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()));
    }
  }

  // screen position of the courier (for floating texts in the DOM)
  courierScreen() {
    const v = this.courier.position.clone().project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  makeCloud(storm) {
    const list = storm ? this.cloudTex.storm : this.cloudTex.soft;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: list[(Math.random() * list.length) | 0], transparent: true, depthWrite: false, opacity: storm ? 0.97 : 0.4 }));
    const w = storm ? 1.9 + Math.random() * 0.4 : 4 + Math.random() * 3;
    sp.scale.set(w, w * 0.58, 1);
    return sp;
  }

  // ---------- path math ----------
  pathPoint(t) {
    const a = this.cityA, b = this.cityB, w = this.omega, s = Math.sin(w);
    return a.clone().multiplyScalar(Math.sin((1 - t) * w) / s).add(b.clone().multiplyScalar(Math.sin(t * w) / s)).normalize();
  }
  pathTangent(t) {
    const a = this.cityA, b = this.cityB, w = this.omega, s = Math.sin(w);
    const d = a.clone().multiplyScalar(-w * Math.cos((1 - t) * w) / s).add(b.clone().multiplyScalar(w * Math.cos(t * w) / s));
    const p = this.pathPoint(t); d.sub(p.clone().multiplyScalar(d.dot(p))); return d.normalize();
  }
  orientGame(t) {
    const up = this.pathPoint(t), fwd = this.pathTangent(t);
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const back = fwd.clone().negate();
    const m = new THREE.Matrix4().makeBasis(right, up, back);
    return new THREE.Quaternion().setFromRotationMatrix(m).invert();
  }
  orientFinale() {
    const p = this.pathPoint(0.5), tan = this.pathTangent(0.5);
    const y = new THREE.Vector3().crossVectors(p, tan).normalize();
    const m = new THREE.Matrix4().makeBasis(tan, y, p);
    const q = new THREE.Quaternion().setFromRotationMatrix(m).invert();
    // tilt a little so we see the arc from slightly above
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.32).multiply(q);
  }

  // ---------- input ----------
  bindInput() {
    this.target = { x: 0, y: 1.2 }; this.keys = new Set(); this.dragging = false; this.last = null;
    const blocked = (e) => this.mode !== 'game' || this.paused || (e.target.closest && e.target.closest('button, input, .modal, a'));
    const clampT = () => {
      this.target.x = THREE.MathUtils.clamp(this.target.x, -LANE_X, LANE_X);
      this.target.y = THREE.MathUtils.clamp(this.target.y, LANE_MIN, LANE_MAX);
    };
    window.addEventListener('pointerdown', (e) => {
      if (blocked(e)) return;
      this.dragging = true; this.last = { x: e.clientX, y: e.clientY }; this.emit('firstInput');
    });
    window.addEventListener('pointermove', (e) => {
      if (this.mode !== 'game' || this.paused) return;
      const w = window.innerWidth, h = window.innerHeight;
      if (e.pointerType === 'mouse') {
        // desktop: the envelope follows the mouse
        this.target.x = ((e.clientX / w) * 2 - 1) * LANE_X * 1.25;
        this.target.y = LANE_MIN + (1 - (e.clientY - h * 0.25) / (h * 0.6)) * (LANE_MAX - LANE_MIN);
        clampT(); this.emit('firstInput');
      } else if (this.dragging && this.last) {
        // touch: relative drag, so the finger never covers the envelope
        this.target.x += ((e.clientX - this.last.x) / w) * LANE_X * 2 * 1.05;
        this.target.y -= ((e.clientY - this.last.y) / h) * (LANE_MAX - LANE_MIN) * 2.7;
        this.last = { x: e.clientX, y: e.clientY }; clampT();
      }
    });
    const up = () => { this.dragging = false; this.last = null; };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); window.addEventListener('blur', () => { up(); this.keys.clear(); });
    const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'];
    window.addEventListener('keydown', (e) => { if (KEYS.includes(e.code) && this.mode === 'game' && !this.paused) { this.keys.add(e.code); this.emit('firstInput'); e.preventDefault(); } });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  // ---------- modes ----------
  startGame() {
    this.sfx.ensure();
    this.progress = 0; this.travel = 0; this.starsCollected = 0; this.nextCheckpoint = 0;
    this.objects.forEach((o) => this.lane.remove(o.mesh)); this.objects = [];
    this.courierX = 0; this.courierY = 1.2; this.courierVx = 0; this.courierVy = 0; this.target.x = 0; this.target.y = 1.2;
    this.spawnClock = 0; this.starClock = 0; this.heartClock = 12; this.hits = 0; this.combo = 0; this.bestCombo = 0; this.invuln = 0; this.spin = 0; this.hitTimer = 0;
    this.camFrom.pos.copy(this.camera.position); this.camFrom.look.copy(this.camLook);
    this.quatFrom = this.globe.quaternion.clone();
    this.transition = 0; this.mode = 'toGame'; this.paused = false;
    this.arc.geometry.setDrawRange(0, 0);
  }

  pause(v) {
    this.paused = v;
    if (v) { this.dragging = false; this.keys?.clear(); }
  }

  toFinale() {
    this.mode = 'toFinale'; this.transition = 0;
    this.camFrom.pos.copy(this.camera.position); this.camFrom.look.copy(this.camLook);
    this.quatFrom = this.globe.quaternion.clone();
    this.courier.visible = false; this.dust.visible = false;
    this.objects.forEach((o) => this.lane.remove(o.mesh)); this.objects = [];
  }

  showFinaleDirect() {
    this.mode = 'finale'; this.transition = 1; this.progress = 1;
    this.globe.quaternion.copy(this.finaleQuat); this.courier.visible = false;
    this.arc.geometry.setDrawRange(0, Infinity);
  }

  // camera targets per mode
  gameCam() { return { pos: new THREE.Vector3(0, LANE_BASE + (this.portrait ? 3.1 : 2.4), this.portrait ? 6.2 : 4.6), look: new THREE.Vector3(0, LANE_BASE + 1.0, -8) }; }
  overviewCam() { return this.portrait ? { pos: new THREE.Vector3(0, -6, 50), look: new THREE.Vector3(0, 10, 0) } : { pos: new THREE.Vector3(0, -1, 36), look: new THREE.Vector3(0, 5.5, 0) }; }
  overviewMoon() { return this.portrait ? new THREE.Vector3(9, -15, -12) : new THREE.Vector3(22, 3, -24); }

  // ---------- game update ----------
  spawn(kind, x, y, extra = {}) {
    let mesh;
    if (kind === 'star') {
      mesh = new THREE.Mesh(this.geo.star, this.mat.star); mesh.scale.setScalar(1.15);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.warm, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })); gl.scale.set(1.1, 1.1, 1); mesh.add(gl);
    } else if (kind === 'heart') {
      mesh = new THREE.Mesh(this.geo.heart, this.mat.heart); mesh.scale.setScalar(1.3);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.warm, color: '#ff9fb2', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); gl.scale.set(2.2, 2.2, 1); mesh.add(gl);
    } else if (kind === 'cloud') mesh = this.makeCloud(true);
    else if (kind === 'deco') mesh = this.makeCloud(false);
    else if (kind === 'ring') {
      mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(this.geo.ring, this.mat.ring));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.warm, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })); glow.scale.set(6, 6, 1); mesh.add(glow);
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(extra.icon), transparent: true, depthWrite: false })); icon.scale.set(1.2, 1.2, 1); mesh.add(icon);
    }
    mesh.position.set(x, LANE_BASE + y, SPAWN_Z);
    this.lane.add(mesh);
    const o = { kind, x, y, mesh, alive: true, ...extra };
    this.objects.push(o); return o;
  }

  // true if any object of these kinds sits near (x, y) at depth z
  crowded(x, y, z, kinds, dz = SAFE_Z, dxy = SAFE_XY) {
    return this.objects.some((o) => o.alive && kinds.includes(o.kind) && Math.abs(o.mesh.position.z - z) < dz && Math.hypot(o.x - x, o.y - y) < dxy);
  }

  starPattern() {
    const rx = () => (Math.random() * 2 - 1) * (LANE_X - 0.3), ry = () => 0.3 + Math.random() * (LANE_MAX - 0.6);
    const pattern = Math.random(), pts = [];
    if (pattern < 0.3) { const x = rx(), y = ry(); for (let i = 0; i < 5; i++) pts.push([x, y, i]); }                         // straight line
    else if (pattern < 0.55) { const y = ry(); for (let i = 0; i < 6; i++) pts.push([-LANE_X + 0.4 + i * ((LANE_X * 2 - 0.8) / 5), y, i]); } // sweep across
    else if (pattern < 0.8) { const x = rx(); for (let i = 0; i < 6; i++) pts.push([x, 0.25 + Math.sin(i / 5 * Math.PI) * (LANE_MAX - 0.5), i]); } // arc
    else { const x = THREE.MathUtils.clamp(rx(), -1.4, 1.4), y = THREE.MathUtils.clamp(ry(), 0.9, LANE_MAX - 0.9); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; pts.push([x + Math.cos(a) * 0.8, y + Math.sin(a) * 0.8, 0]); } } // ring
    return pts.map(([x, y, k]) => [x, y, SPAWN_Z - k * 1.1]);
  }

  spawnStars() {
    for (let tries = 0; tries < 8; tries++) {
      const pts = this.starPattern();
      if (pts.some(([x, y, z]) => this.crowded(x, y, z, ['cloud']))) continue; // never place stars next to a cloud
      for (const [x, y, z] of pts) { const o = this.spawn('star', x, y); o.mesh.position.z = z; }
      return;
    }
  }

  spawnCloud() {
    for (let tries = 0; tries < 10; tries++) {
      const x = (Math.random() * 2 - 1) * LANE_X, y = LANE_MIN + 0.2 + Math.random() * (LANE_MAX - 0.4);
      if (this.crowded(x, y, SPAWN_Z, ['star', 'heart']) || this.crowded(x, y, SPAWN_Z, ['cloud'], 3, 1.2)) continue;
      return this.spawn('cloud', x, y);
    }
    return null;
  }

  updateGame(dt) {
    const speedFactor = this.hitTimer > 0 ? 0.6 : 1;
    const v = FLY_SPEED * speedFactor;
    const cps = this.content.checkpoints, n = cps.length, total = n * SEG_DIST + FINAL_DIST;
    this.travel += v * dt;
    this.progress = Math.min(1, this.travel / total);

    // steering: keys nudge the target, the envelope eases toward it
    const kx = (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0);
    const ky = (this.keys.has('ArrowUp') || this.keys.has('KeyW') || this.keys.has('Space') ? 1 : 0) - (this.keys.has('ArrowDown') || this.keys.has('KeyS') ? 1 : 0);
    if (kx || ky) {
      this.target.x = THREE.MathUtils.clamp(this.target.x + kx * 2.8 * dt, -LANE_X, LANE_X);
      this.target.y = THREE.MathUtils.clamp(this.target.y + ky * 3.8 * dt, LANE_MIN, LANE_MAX);
    }
    const kx2 = 1 - Math.exp(-dt * 4.5), ky2 = 1 - Math.exp(-dt * 9); // left/right glides, up/down responds faster
    const nx = this.courierX + (this.target.x - this.courierX) * kx2, ny = this.courierY + (this.target.y - this.courierY) * ky2;
    this.courierVx = (nx - this.courierX) / Math.max(dt, 1e-3); this.courierVy = (ny - this.courierY) / Math.max(dt, 1e-3);
    this.courierX = nx; this.courierY = ny;
    this.hitTimer = Math.max(0, this.hitTimer - dt); this.invuln = Math.max(0, this.invuln - dt);
    if (this.combo && this.time - this.lastStarAt > 2.2) this.combo = 0;

    // checkpoints are placed by distance: ring i reaches her after (i + 1) * SEG_DIST of flight
    const spawnLead = -SPAWN_Z;                       // distance from spawn point to the envelope
    if (this.nextCheckpoint < n && this.travel >= (this.nextCheckpoint + 1) * SEG_DIST - spawnLead) {
      const cp = cps[this.nextCheckpoint];
      this.spawn('ring', 0, 1.4, { index: this.nextCheckpoint, icon: { memory: 'mail', song: 'music', number: 'hash', choice: 'help' }[cp.type] || 'mail' });
      this.nextCheckpoint++;
    }

    // spawning
    this.spawnClock -= dt * speedFactor; this.starClock -= dt * speedFactor; this.heartClock -= dt * speedFactor;
    // what is spawned now reaches her after spawnLead more distance; keep that clear of rings and the landing
    const arriveAt = this.travel + spawnLead;
    const nearRing = (before, after) => { for (let i = 0; i < n; i++) { const d = (i + 1) * SEG_DIST - arriveAt; if (d < before && d > -after) return true; } return false; };
    const arriving = arriveAt > total - 3;
    const quietZone = nearRing(8, 4);                 // no clouds/hearts just before or right after a ring
    if (!quietZone && !arriving && this.spawnClock <= 0) {
      this.spawnClock = 1.2 + Math.random() * 0.9;
      const count = Math.random() < 0.2 ? 2 : 1;
      for (let i = 0; i < count; i++) this.spawnCloud();
      if (Math.random() < 0.45) { const side = Math.random() < 0.5 ? -1 : 1; this.spawn('deco', side * (6 + Math.random() * 5), -2.2 + Math.random() * 2); }
    }
    if (!arriving && !nearRing(4, 3) && this.starClock <= 0) { this.starClock = 2.4 + Math.random() * 1.0; this.spawnStars(); }
    if (!quietZone && !arriving && this.heartClock <= 0) {
      this.heartClock = 13 + Math.random() * 8;
      const hx = (Math.random() * 2 - 1) * (LANE_X - 0.4), hy = 0.4 + Math.random() * (LANE_MAX - 0.8);
      if (!this.crowded(hx, hy, SPAWN_Z, ['cloud'])) this.spawn('heart', hx, hy); else this.heartClock = 1;
    }

    // move + collide
    const cpos = new THREE.Vector3(this.courierX, LANE_BASE + this.courierY, 0);
    for (const o of this.objects) {
      o.mesh.position.z += v * dt;
      if (o.kind === 'star') o.mesh.rotation.y += dt * 3;
      if (o.kind === 'heart') { o.mesh.rotation.y += dt * 2.2; o.mesh.position.y = LANE_BASE + o.y + Math.sin(this.time * 4) * 0.08; }
      if (o.kind === 'ring') o.mesh.children[0].rotation.z += dt;
      if (o.kind === 'cloud') o.mesh.material.rotation = Math.sin(this.time + o.x) * 0.04;
      if (!o.alive) continue;
      const z = o.mesh.position.z;
      // magnet: nearby stars and hearts drift into the envelope
      if ((o.kind === 'star' || o.kind === 'heart') && z > -5 && z < 1) {
        const d = Math.hypot(o.x - this.courierX, o.y - this.courierY);
        if (d < 1.05) { const m = 1 - Math.exp(-dt * 8); o.x += (this.courierX - o.x) * m; o.y += (this.courierY - o.y) * m; o.mesh.position.x = o.x; if (o.kind === 'star') o.mesh.position.y = LANE_BASE + o.y; }
      }
      const dz = Math.abs(z), d2 = Math.hypot(o.x - this.courierX, o.y - this.courierY);
      if (o.kind === 'star' && dz < 0.7 && d2 < 0.65) {
        o.alive = false; this.lane.remove(o.mesh); this.collectStar(cpos);
      } else if (o.kind === 'heart' && dz < 0.8 && d2 < 0.9) {
        o.alive = false; this.lane.remove(o.mesh); this.collectHeart(cpos);
      } else if (o.kind === 'cloud' && dz < 0.55 && Math.abs(o.x - this.courierX) < 0.75 && Math.abs(o.y - this.courierY) < 0.45 && this.invuln <= 0) {
        o.alive = false; this.hitCloud(cpos);
      } else if (o.kind === 'ring' && z > -0.1) {
        o.alive = false; this.lane.remove(o.mesh); this.sfx.play('ring'); this.clearLane = true; this.emit('checkpoint', o.index);
      }
    }
    this.objects = this.objects.filter((o) => {
      // after a checkpoint, clear only what would reach her in the next ~2 s, so she can find her pace again
      if (this.clearLane && o.kind !== 'deco' && o.mesh.position.z > -GRACE_DIST) { this.lane.remove(o.mesh); return false; }
      if (o.mesh.position.z > KILL_Z) { this.lane.remove(o.mesh); return false; }
      return o.alive || o.kind === 'cloud';
    });

    this.clearLane = false;

    // dust
    const dp = this.dust.geometry.attributes.position;
    for (let i = 0; i < dp.count; i++) { let z = dp.getZ(i) + v * 1.4 * dt; if (z > KILL_Z) z = SPAWN_Z; dp.setZ(i, z); }
    dp.needsUpdate = true;

    if (this.travel >= total && this.nextCheckpoint >= n && !this.objects.some((o) => o.kind === 'ring')) {
      this.mode = 'arrived'; this.emit('arrived');
    }
  }

  collectStar(pos) {
    this.starsCollected++; this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo); this.lastStarAt = this.time;
    this.sfx.play('star', { rate: 1 + Math.min(this.combo, 10) * 0.05, jitter: 0 });
    this.burst(pos, '#ffe08a', 8, 2.5);
    if (this.combo % 10 === 0) {
      this.starsCollected += 5; this.sfx.play('correct');
      this.burst(pos, '#ffd36b', 22, 4.5);
      this.emit('float', { text: `${this.combo} combo! +5`, kind: 'combo' });
    } else this.emit('float', { text: '+1', kind: 'star' });
    this.emit('stars', this.starsCollected);
  }

  collectHeart(pos) {
    this.starsCollected += 5; this.sfx.play('correct'); this.sfx.play('star', { rate: 1.5, jitter: 0 });
    this.burst(pos, '#ff8fa6', 26, 5);
    const words = ['Seni seviyorum', 'Aku cinta kamu', 'I love you'];
    this.emit('float', { text: `${words[(Math.random() * words.length) | 0]} +5`, kind: 'heart' });
    this.emit('stars', this.starsCollected);
  }

  hitCloud(pos) {
    const lost = Math.min(3, this.starsCollected);
    this.starsCollected -= lost; this.hits++; this.combo = 0;
    this.hitTimer = 0.9; this.invuln = 1.4; this.spin = 1;
    this.sfx.play('bump');
    for (let i = 0; i < lost; i++) {
      const l = this.lost[i]; l.m.visible = true; l.life = 1; l.m.position.copy(pos);
      l.v.set((i - 1) * 1.6 + (Math.random() - 0.5), 2.5 + Math.random(), 2 + Math.random() * 2);
    }
    this.burst(pos, '#c9cde8', 14, 3);
    this.emit('float', { text: lost ? `-${lost}` : 'oof', kind: 'hit' });
    this.emit('stars', this.starsCollected); this.emit('bump');
  }

  setArcProgress(t) {
    const segs = Math.floor(t * this.arcSegments);
    this.arc.geometry.setDrawRange(0, segs * this.arcRadial * 6);
  }

  // ---------- main loop ----------
  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    const t = this.time;

    this.sky.rotation.y += dt * 0.004;
    this.beacons?.forEach((b, i) => { const s = 1 + ((t * 0.8 + i * 0.5) % 1) * 2.2; b.userData.ring.scale.setScalar(s); b.userData.ring.material.opacity = 1 - ((t * 0.8 + i * 0.5) % 1); });
    this.moonMesh.rotation.y += dt * 0.02;

    const ov = this.overviewCam(), gc = this.gameCam();
    let camPos, camLook;
    const ease = (x) => x * x * (3 - 2 * x);

    if (this.mode === 'idle') {
      this.idleQuat.setFromAxisAngle(new THREE.Vector3(0.2, 1, 0).normalize(), t * 0.06);
      this.globe.quaternion.copy(this.finaleQuat).premultiply(this.idleQuat);
      camPos = ov.pos; camLook = ov.look;
      this.setArcProgress(0.5 + 0.5 * Math.sin(t * 0.5));
      this.moon.position.copy(this.overviewMoon());
    } else if (this.mode === 'toGame') {
      this.transition = Math.min(1, this.transition + dt / 3.2);
      const e = ease(this.transition);
      this.globe.quaternion.slerpQuaternions(this.quatFrom, this.orientGame(0), e);
      camPos = this.camFrom.pos.clone().lerp(gc.pos, e); camLook = this.camFrom.look.clone().lerp(gc.look, e);
      this.setArcProgress(0);
      this.moon.position.lerp(new THREE.Vector3(7, LANE_BASE + 13, -70), 0.03);
      if (this.transition >= 1) { this.mode = 'game'; this.courier.visible = true; this.dust.visible = true; this.emit('gameStarted'); }
    } else if (this.mode === 'game' || this.mode === 'arrived') {
      if (!this.paused && this.mode === 'game') this.updateGame(dt);
      this.globe.quaternion.copy(this.orientGame(this.progress));
      this.setArcProgress(this.progress);
      camPos = gc.pos.clone(); camLook = gc.look.clone();
      camPos.x += this.courierX * 0.5; camLook.x += this.courierX * 0.65;
      camPos.y += (this.courierY - 1.2) * 0.35; camLook.y += (this.courierY - 1.2) * 0.25;
      if (this.hitTimer > 0) { camPos.x += Math.sin(t * 55) * 0.09 * this.hitTimer; camPos.y += Math.cos(t * 47) * 0.06 * this.hitTimer; }
      this.moon.position.set(7, LANE_BASE + 13, -70);
      // courier: banks into turns, spins when hit
      const cy = LANE_BASE + this.courierY + Math.sin(t * 3) * 0.04;
      this.courier.position.set(this.courierX, cy, 0);
      if (!this.paused) this.spin = Math.max(0, this.spin - dt * 1.8);
      const vx = THREE.MathUtils.clamp(this.courierVx || 0, -6, 6), vy = THREE.MathUtils.clamp(this.courierVy || 0, -6, 6);
      this.courier.rotation.set(-vy * 0.06, -vx * 0.05 + Math.sin(t * 1.5) * 0.12, -vx * 0.09 + (1 - this.spin) * 0 + this.spin * Math.PI * 2);
      this.envelope.visible = !(this.invuln > 0 && Math.sin(t * 30) > 0.4);
      this.courierGlow.material.opacity = 0.45 + Math.sin(t * 4) * 0.12;
      // trail
      this.trailTimer -= dt;
      if (!this.paused && this.trailTimer <= 0) {
        this.trailTimer = 0.03; const p = this.trail[this.trailIdx++ % this.trail.length];
        p.s.visible = true; p.life = 1; p.s.position.set(this.courierX + (Math.random() - 0.5) * 0.15, cy + (Math.random() - 0.5) * 0.15, 0.2);
      }
      for (const p of this.trail) {
        if (!p.s.visible) continue;
        if (!this.paused) { p.life -= dt * 1.6; p.s.position.z += dt * 6; }
        p.s.material.opacity = Math.max(0, p.life) * 0.6; const sc = 0.15 + p.life * 0.35; p.s.scale.set(sc, sc, 1);
        if (p.life <= 0) p.s.visible = false;
      }
    } else if (this.mode === 'toFinale' || this.mode === 'finale') {
      if (this.mode === 'toFinale') {
        this.transition = Math.min(1, this.transition + dt / 4);
        if (this.transition >= 1) this.mode = 'finale';
      }
      const e = ease(this.transition);
      const sway = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(t * 0.15) * 0.12 * e);
      this.globe.quaternion.slerpQuaternions(this.quatFrom || this.finaleQuat, this.finaleQuat, e).premultiply(sway);
      camPos = this.camFrom.pos.clone().lerp(ov.pos, e); camLook = this.camFrom.look.clone().lerp(ov.look, e);
      if (this.mode === 'finale' && this.transition >= 1 && !this.camFrom.pos.lengthSq()) { camPos = ov.pos; camLook = ov.look; }
      this.setArcProgress(1);
      this.arc.material.opacity = 0.75 + Math.sin(t * 2) * 0.25;
      this.moon.position.lerp(this.overviewMoon(), 0.03);
      this.trail.forEach((p) => (p.s.visible = false));
    }

    // sparkle bursts + lost stars (always animate so they finish even when paused)
    for (const b of this.bursts) {
      if (!b.sp.visible) continue;
      b.life -= dt * 1.8; b.sp.position.addScaledVector(b.v, dt); b.v.multiplyScalar(1 - dt * 2.5);
      b.sp.material.opacity = Math.max(0, b.life); const sc = 0.12 + b.life * 0.3; b.sp.scale.set(sc, sc, 1);
      if (b.life <= 0) b.sp.visible = false;
    }
    for (const l of this.lost) {
      if (!l.m.visible) continue;
      l.life -= dt * 0.9; l.v.y -= 9 * dt; l.m.position.addScaledVector(l.v, dt); l.m.rotation.x += dt * 8; l.m.rotation.y += dt * 5;
      if (l.life <= 0) l.m.visible = false;
    }

    const showLabels = this.mode === 'idle' || this.mode === 'finale' || this.mode === 'toFinale';
    this.cityLabels.forEach((l) => (l.visible = showLabels));
    this.camera.position.copy(camPos);
    this.camLook.copy(camLook);
    this.camera.lookAt(camLook);
    this.atmo.quaternion.copy(this.globe.quaternion);
    this.renderer.render(this.scene, this.camera);
  }
}
