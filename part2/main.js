import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SEGMENT_DEFS, track } from "./track.mjs";

const G = 9.81;
const HOLD = 2.6;

const $ = (id) => document.getElementById(id);

function v3(p) {
  return new THREE.Vector3(p[0], p[2], -p[1]);
}

class PointCurve extends THREE.Curve {
  constructor(points) {
    super();
    this.points = points;
    this.arcLengthDivisions = Math.max(20, points.length);
  }
  getPoint(t, target = new THREE.Vector3()) {
    const pts = this.points;
    const x = THREE.MathUtils.clamp(t, 0, 1) * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(x));
    return target.lerpVectors(pts[i], pts[i + 1], x - i);
  }
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function segmentSamples(id) {
  const pts = track.samples.filter((s) => s.seg === id);
  if (id === 1) return leadIn().concat(pts);
  const prev = [...track.samples].reverse().find((s) => s.seg === id - 1);
  return prev ? [prev, ...pts] : pts;
}

function leadIn() {
  const origin = track.samples[0];
  const out = [];
  for (let i = 8; i >= 1; i--) {
    out.push({
      ...origin,
      aNg: 0,
      p: [
        origin.p[0] - origin.T[0] * i,
        origin.p[1] - origin.T[1] * i,
        origin.p[2] - origin.T[2] * i,
      ],
    });
  }
  return out;
}

function deckColor(sample) {
  const base = hexToRgb(sample.color).map((c) => c * 0.55 + 0.08);
  const danger = THREE.MathUtils.clamp((sample.aNg - 3.55) / 0.9, 0, 1);
  const hot = [1, 0.28, 0.4];
  return base.map((c, i) => c * (1 - danger) + hot[i] * danger);
}

function buildDeck(samples) {
  const n = samples.length;
  const positions = new Float32Array(n * 2 * 3);
  const normals = new Float32Array(n * 2 * 3);
  const colors = new Float32Array(n * 2 * 3);
  const indices = [];
  const half = 0.78;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const p = v3(s.p);
    const h = v3(s.H).normalize();
    const lat = v3(s.lat).normalize();
    const lift = p.addScaledVector(h, 0.06);
    const left = lift.clone().addScaledVector(lat, -half);
    const right = lift.clone().addScaledVector(lat, half);
    const col = deckColor(s);
    const o = i * 6;
    positions.set([left.x, left.y, left.z, right.x, right.y, right.z], o);
    normals.set([h.x, h.y, h.z, h.x, h.y, h.z], o);
    colors.set([...col, ...col], o);
    if (i < n - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.68,
      metalness: 0.12,
      side: THREE.DoubleSide,
    }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

function addRails(samples, color) {
  const meshes = [];
  for (const side of [-1, 1]) {
    const pts = samples.map((s) =>
      v3(s.p)
        .addScaledVector(v3(s.H).normalize(), 0.2)
        .addScaledVector(v3(s.lat).normalize(), side * 0.55),
    );
    const geo = new THREE.TubeGeometry(new PointCurve(pts), pts.length - 1, 0.065, 6, false);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color, metalness: 0.88, roughness: 0.24 }),
    );
    mesh.castShadow = false;
    meshes.push(mesh);
  }
  return meshes;
}

function makeLabel(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(10, 14, 20, 0.88)";
  ctx.beginPath();
  ctx.roundRect(8, 18, 240, 60, 14);
  ctx.fill();
  ctx.fillStyle = "#e2b15a";
  ctx.fillRect(8, 18, 7, 60);
  ctx.fillStyle = "#f4efe6";
  ctx.font = "600 36px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 136, 48);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  sprite.scale.set(8.4, 3.15, 1);
  return sprite;
}

function makeCar(bodyColor) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color: bodyColor,
    metalness: 0.48,
    roughness: 0.32,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x1a242e,
    metalness: 0.2,
    roughness: 0.35,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.15, 0.72, 1.22), paint);
  body.position.y = 0.58;
  body.castShadow = true;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 1.05), paint);
  nose.position.set(1.15, 0.95, 0);
  nose.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.48, 1.02), dark);
  cabin.position.set(-0.25, 1.08, 0);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(3.16, 0.08, 1.24),
    new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.4 }),
  );
  stripe.position.y = 0.9;
  const wheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.16, 14);
  wheelGeo.rotateX(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.7 });
  const wheels = [];
  for (const [x, z] of [
    [1.05, 0.62],
    [1.05, -0.62],
    [-1.05, 0.62],
    [-1.05, -0.62],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(x, 0.22, z);
    wheel.castShadow = true;
    wheels.push(wheel);
    group.add(wheel);
  }
  group.add(body, nose, cabin, stripe);
  group.userData.wheels = wheels;
  return group;
}

function skyTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const grd = ctx.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#24324a");
  grd.addColorStop(0.45, "#3a4a58");
  grd.addColorStop(1, "#1a2420");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function placeObject(object, sample, yLift) {
  const T = v3(sample.T).normalize();
  const H = v3(sample.H).normalize();
  const lat = v3(sample.lat).normalize();
  object.position.copy(v3(sample.p).addScaledVector(H, yLift));
  const basis = new THREE.Matrix4().makeBasis(T, H, lat);
  object.quaternion.setFromRotationMatrix(basis);
}

const scene = new THREE.Scene();
scene.background = skyTexture();
scene.fog = new THREE.Fog("#1a2420", 190, 460);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 800);
camera.position.set(152, 74, 68);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.id = "view";
document.body.prepend(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(50, 13, -28);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 6;
controls.maxDistance = 260;

scene.add(new THREE.HemisphereLight(0xc5d4ea, 0x2a241c, 0.9));
const sun = new THREE.DirectionalLight(0xffe2bf, 2.35);
sun.position.set(80, 140, 46);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -160;
sun.shadow.camera.right = 160;
sun.shadow.camera.top = 160;
sun.shadow.camera.bottom = -160;
sun.shadow.camera.near = 20;
sun.shadow.camera.far = 320;
sun.shadow.bias = -0.00025;
sun.target.position.set(50, 12, -8);
scene.add(sun, sun.target);
scene.add(new THREE.DirectionalLight(0x9eb6d8, 0.55).translateX(-40).translateY(30).translateZ(-20));

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(200, 72),
  new THREE.MeshStandardMaterial({ color: 0x18211c, roughness: 1, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(50, 0, -8);
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(320, 40, 0x355248, 0x24362f);
grid.position.set(50, 0.03, -8);
scene.add(grid);

const ring = new THREE.Mesh(
  new THREE.TorusGeometry(18, 0.045, 8, 120),
  new THREE.MeshBasicMaterial({ color: 0xc77dff, transparent: true, opacity: 0.45 }),
);
ring.rotation.x = Math.PI / 2;
ring.position.set(73.67, 0.08, 17.45);
scene.add(ring);

scene.add(buildDeck(leadIn().concat(track.samples)));
for (const spec of SEGMENT_DEFS) {
  for (const rail of addRails(segmentSamples(spec.id), spec.color)) scene.add(rail);
}

const tieMat = new THREE.MeshStandardMaterial({ color: 0x8a8178, roughness: 0.55, metalness: 0.35 });
const tieSpacing = 2.2;
const tieStart = -8;
const tieCount = Math.floor((track.length - tieStart) / tieSpacing);
const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.07, 1.58), tieMat, tieCount);
const dummy = new THREE.Object3D();
for (let i = 0; i < tieCount; i++) {
  const sample = track.sampleAtS(tieStart + (i + 0.5) * tieSpacing);
  placeObject(dummy, sample, 0.1);
  dummy.updateMatrix();
  ties.setMatrixAt(i, dummy.matrix);
}
ties.castShadow = true;
ties.receiveShadow = true;
scene.add(ties);

const columnMat = new THREE.MeshStandardMaterial({ color: 0x6d6258, metalness: 0.62, roughness: 0.42 });
for (let s = 6; s < track.length - 2; s += 10) {
  const sample = track.sampleAtS(s);
  const top = v3(sample.p);
  const height = top.y - 0.05;
  if (height < 2.4) continue;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, height, 7), columnMat);
  column.position.set(top.x, height / 2, top.z);
  column.castShadow = true;
  scene.add(column);
}

function addStation(sample, along, sideOffset) {
  const T = v3(sample.T).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const lat = new THREE.Vector3().crossVectors(T, up).normalize();
  const deckY = v3(sample.p).y;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(11, 0.28, 3.2),
    new THREE.MeshStandardMaterial({ color: 0x314054, roughness: 0.7, metalness: 0.22 }),
  );
  slab.position.copy(v3(sample.p).addScaledVector(T, along).addScaledVector(lat, sideOffset));
  slab.position.y = Math.max(0.16, deckY - 0.55);
  slab.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(T, up, lat));
  slab.castShadow = true;
  slab.receiveShadow = true;
  scene.add(slab);

  const roofY = slab.position.y + 3.4;
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(11.4, 0.16, 3.6),
    new THREE.MeshStandardMaterial({ color: 0xc4b8a4, roughness: 0.55, metalness: 0.08 }),
  );
  roof.position.copy(slab.position);
  roof.position.y = roofY;
  roof.quaternion.copy(slab.quaternion);
  roof.castShadow = true;
  scene.add(roof);
  const postGeo = new THREE.CylinderGeometry(0.08, 0.08, roofY - slab.position.y, 6);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x6d6258, metalness: 0.5, roughness: 0.4 });
  for (const [x, z] of [
    [4.6, 1.3],
    [4.6, -1.3],
    [-4.6, 1.3],
    [-4.6, -1.3],
  ]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(x, 0, z);
    post.position.applyQuaternion(slab.quaternion).add(slab.position);
    post.position.y = (slab.position.y + roofY) / 2;
    post.castShadow = true;
    scene.add(post);
  }
}

addStation(track.samples[0], -6, 3.4);
addStation(track.samples.at(-1), 3, 3.6);

const markerSprites = [];
for (const marker of track.markers) {
  const label = makeLabel(marker.label);
  label.position.copy(v3(marker.sample.p)).add(new THREE.Vector3(0, marker.id === "H" || marker.id === "L" ? 4.2 : 3.3, 0));
  scene.add(label);
  markerSprites.push(label);
}

scene.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.4, 0), 16, 0xff6b6b, 1.1, 0.55));
scene.add(new THREE.ArrowHelper(v3([0, 1, 0]).normalize(), new THREE.Vector3(0, 0.4, 0), 16, 0x7dce7a, 1.1, 0.55));
scene.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0.4, 0), 16, 0x7eb6ff, 1.1, 0.55));
for (const [text, pos] of [
  ["X", new THREE.Vector3(18, 1.4, 0)],
  ["Y", v3([0, 18, 0]).add(new THREE.Vector3(0, 1.2, 0))],
  ["Z", new THREE.Vector3(1.5, 17.2, 0)],
]) {
  const label = makeLabel(text);
  label.position.copy(pos);
  label.scale.set(5.2, 1.95, 1);
  scene.add(label);
}

const cars = [
  makeCar(0xf25c54),
  makeCar(0xf4a261),
  makeCar(0xe9c46a),
].map((car, i) => {
  car.userData.offset = i * 3.55;
  scene.add(car);
  return car;
});

let playing = true;
let rate = 1;
let clock = 0;
let cameraMode = "overview";
let snapCamera = true;
const chasePos = new THREE.Vector3();
const lookPos = new THREE.Vector3();
let wasPlaying = true;
let scrubbing = false;
let wheelSpin = 0;

const specById = Object.fromEntries(SEGMENT_DEFS.map((s) => [s.id, s]));

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

function setCamera(mode) {
  cameraMode = mode;
  for (const button of document.querySelectorAll("#cameras button")) {
    button.classList.toggle("on", button.dataset.cam === mode);
  }
  cars[0].visible = mode !== "rider";
  for (const sprite of markerSprites) sprite.visible = mode === "overview";
  if (mode === "overview") {
    camera.up.set(0, 1, 0);
    camera.position.set(155, 86, 92);
    controls.target.set(52, 14, -8);
    controls.enabled = true;
    controls.update();
  } else {
    controls.enabled = false;
    snapCamera = true;
  }
}

function updateCamera(sample, dt) {
  if (cameraMode === "overview") return;
  const T = v3(sample.T).normalize();
  const H = v3(sample.H).normalize();
  const origin = v3(sample.p);
  const desired = origin.clone();
  const look = origin.clone();
  if (cameraMode === "chase") {
    desired.addScaledVector(T, -22).addScaledVector(H, 8);
    look.addScaledVector(T, 12).addScaledVector(H, 1.6);
  } else {
    desired.addScaledVector(H, 1.15).addScaledVector(T, 0.2);
    look.copy(desired).addScaledVector(T, 28).addScaledVector(H, -0.15);
  }
  if (snapCamera) {
    chasePos.copy(desired);
    lookPos.copy(look);
    snapCamera = false;
  } else {
    const k = 1 - Math.exp(-(cameraMode === "rider" ? 10 : 4.5) * dt);
    chasePos.lerp(desired, k);
    lookPos.lerp(look, k);
  }
  camera.up.copy(H);
  camera.position.copy(chasePos);
  camera.lookAt(lookPos);
}

function updateTrain(sample) {
  const moved = sample.s;
  for (const car of cars) {
    const at = track.sampleAtS(moved - car.userData.offset);
    placeObject(car, at, 0.02);
    for (const wheel of car.userData.wheels) wheel.rotation.z = -moved / 0.22;
  }
  wheelSpin = moved;
}

const readout = $("readout");
const fields = [
  ["time", "Time"],
  ["dist", "Distance"],
  ["height", "Height"],
  ["speed", "Speed"],
  ["grade", "Grade"],
  ["at", "aT"],
  ["an", "aN"],
  ["rho", "Radius ρ"],
  ["seat", "Seat"],
  ["lat", "Lateral"],
  ["tot", "Total"],
];
for (const [key, label] of fields) {
  const wrap = document.createElement("div");
  wrap.id = `f-${key}`;
  wrap.innerHTML = `<dt>${label}</dt><dd>—</dd>`;
  readout.append(wrap);
}

function fmt(n, d = 2) {
  if (!Number.isFinite(n)) return "∞";
  return n.toFixed(d);
}

function updateHud(sample, stopped) {
  const spec = specById[sample.seg];
  $("seg-name").textContent = spec.name;
  $("seg-swatch").style.background = spec.color;
  $("equation").textContent = spec.equation;
  $("blurb").textContent = spec.blurb;
  const mode =
    spec.mode === "lift" ? "Chain lift · t is real time" : spec.mode === "brake" ? "Brakes on · energy leaves the train" : "Coasting · speed from energy";
  $("seg-mode").textContent = stopped ? "Stopped at H" : mode;
  const over = sample.aNg > 4.01;
  const airborne = sample.seatG < -0.05;
  $("warn").hidden = !(over || airborne);
  $("warn").textContent = over
    ? "Normal acceleration is above the 4g limit on this stretch."
    : "Seat load is negative, so riders would lift out of their seats.";
  const values = {
    time: `${fmt(Math.min(clock, track.duration))} s`,
    dist: `${fmt(sample.s, 1)} m`,
    height: `${fmt(sample.z)} m`,
    speed: `${fmt(sample.v)} m/s`,
    grade: `${fmt(sample.grade, 1)}°`,
    at: `${fmt(sample.aT)} m/s²`,
    an: `${fmt(sample.aNg)} g`,
    rho: `${fmt(sample.rho, 1)} m`,
    seat: `${fmt(sample.seatG)} g`,
    lat: `${fmt(sample.lateralG)} g`,
    tot: `${fmt(sample.totalG)} g`,
  };
  for (const [key, text] of Object.entries(values)) {
    const row = $(`f-${key}`);
    row.querySelector("dd").textContent = text;
    row.classList.toggle("hot", (key === "an" && over) || (key === "seat" && airborne));
  }
  const anRow = $("f-an").querySelector("dd");
  const sub = document.createElement("small");
  sub.textContent = `${fmt(sample.aN, 1)} m/s²`;
  anRow.append(sub);
  for (const button of document.querySelectorAll("#legend button")) {
    button.classList.toggle("active", Number(button.dataset.seg) === sample.seg);
  }
  if (!scrubbing) $("scrub").value = String(Math.min(clock, track.duration));
}

function drawChart(sNow) {
  const canvas = $("chart");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w < 4 || h < 4) return;
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const pad = chartPad();
  const plot = chartPlot(w, h, pad);
  const yMax = 5;
  const X = (s) => plot.x + (s / track.length) * plot.w;
  const Y = (g) => plot.y + (1 - g / yMax) * plot.h;

  for (const seg of track.segmentStats) {
    ctx.fillStyle = `${seg.color}33`;
    ctx.fillRect(X(seg.s0), plot.y, Math.max(1, X(seg.s1) - X(seg.s0)), plot.h);
  }
  ctx.strokeStyle = "rgba(244,239,230,0.12)";
  ctx.lineWidth = 1;
  ctx.font = "11px IBM Plex Mono, ui-monospace, monospace";
  ctx.fillStyle = "#b7b0a4";
  for (const g of [0, 2, 4]) {
    const y = Y(g);
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.w, y);
    ctx.stroke();
    ctx.fillText(String(g), 2, y + 3);
  }
  for (let s = 0; s <= track.length + 1; s += 100) {
    ctx.fillText(String(s), X(s) - 8, plot.y + plot.h + 14);
  }

  const strokeSamples = (pred, color, width) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    let pen = false;
    track.samples.forEach((sample, index) => {
      const keep = pred(sample);
      const x = X(sample.s);
      const y = Y(Math.min(yMax, sample.aNg));
      if (!keep) {
        pen = false;
        return;
      }
      if (!pen) {
        const prev = track.samples[index - 1];
        if (prev) ctx.moveTo(X(prev.s), Y(Math.min(yMax, prev.aNg)));
        else ctx.moveTo(x, y);
        pen = true;
      }
      ctx.lineTo(x, y);
    });
    ctx.stroke();
  };
  strokeSamples(() => true, "#f3e6c8", 1.7);
  strokeSamples((sample) => sample.aNg >= 4, "#ff4d6a", 2.2);

  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(255,77,106,0.9)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plot.x, Y(4));
  ctx.lineTo(plot.x + plot.w, Y(4));
  ctx.stroke();
  ctx.setLineDash([]);

  const px = X(sNow);
  ctx.strokeStyle = "#f4efe6";
  ctx.beginPath();
  ctx.moveTo(px, plot.y);
  ctx.lineTo(px, plot.y + plot.h);
  ctx.stroke();
}

function chartPad() {
  return { l: 28, r: 8, t: 8, b: 18 };
}
function chartPlot(w, h, pad) {
  return { x: pad.l, y: pad.t, w: w - pad.l - pad.r, h: h - pad.t - pad.b };
}

function seekFromChart(event) {
  const canvas = $("chart");
  const rect = canvas.getBoundingClientRect();
  const pad = chartPad();
  const plot = chartPlot(rect.width, rect.height, pad);
  const ratio = (event.clientX - rect.left - plot.x) / plot.w;
  const dist = THREE.MathUtils.clamp(ratio, 0, 1) * track.length;
  clock = track.sampleAtS(dist).time;
}

function buildLegend() {
  const list = $("legend");
  for (const seg of track.segmentStats) {
    const pts = track.samples.filter((s) => s.seg === seg.id);
    const maxG = Math.max(...pts.map((s) => s.aNg));
    const bad = maxG > 4.01 || Math.min(...pts.map((s) => s.seatG)) < -0.05;
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.seg = String(seg.id);
    button.innerHTML = `<span class="swatch" style="background:${seg.color}"></span><span><span class="name">${seg.name}</span><span class="meta">${seg.length.toFixed(1)} m · ${seg.time.toFixed(2)} s</span></span><span class="flag${bad ? " bad" : ""}">${bad ? "Exceeds 4g" : "Within 4g"}</span>`;
    const first = track.samples.find((sample) => sample.seg === seg.id);
    button.addEventListener("click", () => {
      clock = first.time;
    });
    item.append(button);
    list.append(item);
  }
  const note = document.createElement("p");
  note.className = "lead";
  note.style.marginTop = "10px";
  note.textContent = `${track.length.toFixed(2)} m in ${track.duration.toFixed(2)} s. Peak normal acceleration ${track.peak.aNg.toFixed(2)} g. g = ${G} m/s².`;
  list.after(note);
}

function togglePlay() {
  playing = !playing;
  $("play").textContent = playing ? "Pause" : "Play";
}

function wireControls() {
  $("play").addEventListener("click", togglePlay);
  $("restart").addEventListener("click", () => {
    clock = 0;
    playing = true;
    $("play").textContent = "Pause";
  });
  for (const button of document.querySelectorAll("#rates button")) {
    button.addEventListener("click", () => {
      rate = Number(button.dataset.rate);
      for (const other of document.querySelectorAll("#rates button")) other.classList.toggle("on", other === button);
    });
  }
  for (const button of document.querySelectorAll("#cameras button")) {
    button.addEventListener("click", () => setCamera(button.dataset.cam));
  }
  const scrub = $("scrub");
  scrub.max = String(track.duration);
  scrub.addEventListener("pointerdown", () => {
    scrubbing = true;
    wasPlaying = playing;
    playing = false;
    $("play").textContent = "Play";
  });
  window.addEventListener("pointerup", () => {
    if (!scrubbing) return;
    scrubbing = false;
    playing = wasPlaying;
    $("play").textContent = playing ? "Pause" : "Play";
  });
  scrub.addEventListener("input", () => {
    clock = Number(scrub.value);
  });
  $("chart").addEventListener("pointerdown", seekFromChart);
  window.addEventListener("keydown", (event) => {
    if (event.target.matches("input, textarea")) return;
    if (event.code === "Space") {
      event.preventDefault();
      togglePlay();
    } else if (event.key === "1") setCamera("overview");
    else if (event.key === "2") setCamera("chase");
    else if (event.key === "3") setCamera("rider");
  });
  window.addEventListener("resize", resize);
}

let desmosReady = false;
const calculators = {};

function copyExpression(text, button) {
  navigator.clipboard.writeText(text).then(
    () => {
      const old = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = old;
      }, 1200);
    },
    () => {
      button.textContent = "Select the line and copy";
    },
  );
}

function buildExpressionList() {
  const list = $("expr-list");
  const rows = [
    ...SEGMENT_DEFS.map((spec) => ({ name: spec.short, text: spec.desmos3d })),
    { name: "L", text: "(0, 0, 0)" },
    { name: "P1", text: "(51.16, 25.58, 32)" },
    { name: "P2", text: "(83.98, -32.20, 16)" },
    { name: "P3", text: "(83.98, -32.20, 3.434)" },
    { name: "P4", text: "(80, 40, 30)" },
    { name: "H", text: "(100, 50, 30)" },
    { name: "v(z)", text: "v(z)=sqrt(636.84-19.62*z)" },
  ];
  for (const row of rows) {
    const wrap = document.createElement("div");
    wrap.className = "expr";
    const name = document.createElement("strong");
    name.textContent = row.name;
    const code = document.createElement("code");
    code.textContent = row.text;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Copy";
    button.addEventListener("click", () => copyExpression(row.text, button));
    wrap.append(name, code, button);
    list.append(wrap);
  }
}

const desmosBounds = {
  plan: { left: -12, right: 118, bottom: -48, top: 66 },
  elev: { left: -12, right: 118, bottom: -6, top: 42 },
  an: { left: -10, right: 520, bottom: -0.4, top: 5 },
  energy: { left: -1, right: 34, bottom: -1, top: 28 },
};

function showDesmosTab(id) {
  for (const button of document.querySelectorAll("#desmos-tabs button")) {
    button.classList.toggle("on", button.dataset.tab === id);
  }
  for (const key of Object.keys(calculators)) {
    $(`calc-${key}`).classList.toggle("on", key === id);
  }
  const calc = calculators[id];
  if (!calc) return;
  requestAnimationFrame(() => {
    calc.resize();
    calc.setMathBounds(desmosBounds[id]);
  });
}

function initDesmos() {
  if (desmosReady) return;
  if (!window.Desmos) {
    $("expr-list").insertAdjacentHTML(
      "beforebegin",
      "<p class='paste-note'>The Desmos calculator did not load. The expressions above can still be pasted into desmos.com/3d.</p>",
    );
    return;
  }
  desmosReady = true;
  const common = {
    keypad: false,
    expressions: true,
    settingsMenu: false,
    zoomButtons: true,
    border: false,
    trace: true,
  };
  calculators.plan = Desmos.GraphingCalculator($("calc-plan"), common);
  calculators.elev = Desmos.GraphingCalculator($("calc-elev"), common);
  calculators.an = Desmos.GraphingCalculator($("calc-an"), { ...common, expressions: false });
  calculators.energy = Desmos.GraphingCalculator($("calc-energy"), common);

  const curveLatex = [
    {
      plan: String.raw`\left(\frac{114.4}{\sqrt{5}}t,\frac{57.20}{\sqrt{5}}t\right)`,
      elev: String.raw`\left(\frac{114.4}{\sqrt{5}}t,32\left(3t^{2}-2t^{3}\right)\right)`,
      max: "1",
    },
    {
      plan: String.raw`\left(51.1612+52.0310t-51.6728t^{2}-230.873t^{3}+503.962t^{4}-240.629t^{5},25.5806+26.0155t-25.8364t^{2}-698.737t^{3}+1033.94t^{4}-393.167t^{5}\right)`,
      elev: String.raw`\left(51.1612+52.0310t-51.6728t^{2}-230.873t^{3}+503.962t^{4}-240.629t^{5},32-99.2917t^{2}+157.523t^{3}-92.5102t^{4}+18.2787t^{5}\right)`,
      max: "1",
    },
    {
      plan: String.raw`\left(73.67+18\cos\left(-0.9609+t\right),-17.45+18\sin\left(-0.9609+t\right)\right)`,
      elev: String.raw`\left(73.67+18\cos\left(-0.9609+t\right),16-t\right)`,
      max: "4\\pi",
    },
    {
      plan: String.raw`\left(83.9801+78.4067t-117.117t^{2}-364.668t^{3}+695.878t^{4}-296.481t^{5},-32.2047+54.7878t+228.209t^{2}-394.196t^{3}+219.997t^{4}-36.5928t^{5}\right)`,
      elev: String.raw`\left(83.9801+78.4067t-117.117t^{2}-364.668t^{3}+695.878t^{4}-296.481t^{5},3.43363-5.314t-1.9285t^{2}+303.333t^{3}-446.793t^{4}+177.269t^{5}\right)`,
      max: "1",
    },
    {
      plan: String.raw`\left(80+20t,40+10t\right)`,
      elev: String.raw`\left(80+20t,30\right)`,
      max: "1",
    },
  ];
  curveLatex.forEach((curve, index) => {
    const domain = { min: "0", max: curve.max };
    const color = SEGMENT_DEFS[index].color;
    calculators.plan.setExpression({
      id: `p${index}`,
      latex: curve.plan,
      color,
      parametricDomain: domain,
    });
    calculators.elev.setExpression({
      id: `e${index}`,
      latex: curve.elev,
      color,
      parametricDomain: domain,
    });
  });
  const planPoints = [
    ["L", "(0,0)"],
    ["P1", "(51.16,25.58)"],
    ["P2 / P3", "(83.98,-32.20)"],
    ["P4", "(80,40)"],
    ["H", "(100,50)"],
  ];
  planPoints.forEach(([label, latex], index) => {
    calculators.plan.setExpression({ id: `pp${index}`, latex, label, showLabel: true, pointSize: 12, color: "#1c1915" });
  });
  const elevPoints = [
    ["L", "(0,0)"],
    ["P1", "(51.16,32)"],
    ["P2", "(83.98,16)"],
    ["P3", "(83.98,3.434)"],
    ["P4", "(80,30)"],
    ["H", "(100,30)"],
  ];
  elevPoints.forEach(([label, latex], index) => {
    calculators.elev.setExpression({ id: `ep${index}`, latex, label, showLabel: true, pointSize: 12, color: "#1c1915" });
  });
  calculators.plan.setMathBounds(desmosBounds.plan);
  calculators.elev.setMathBounds(desmosBounds.elev);

  const count = 180;
  const ss = [];
  const aa = [];
  for (let i = 0; i <= count; i++) {
    const sample = track.sampleAtS((track.length * i) / count);
    ss.push(sample.s.toFixed(3));
    aa.push(sample.aNg.toFixed(4));
  }
  calculators.an.setExpression({
    id: "antable",
    type: "table",
    columns: [
      { latex: "s_1", values: ss, hidden: true, points: false, lines: false },
      { latex: "a_1", values: aa, color: "#c0392b", points: false, lines: true },
    ],
  });
  calculators.an.setExpression({ id: "limit", latex: "y=4", color: "#c0392b", lineStyle: "DASHED" });
  calculators.an.setMathBounds(desmosBounds.an);

  calculators.energy.setExpression({
    id: "vz",
    latex: String.raw`y=\sqrt{636.84-19.62x}`,
    color: "#c0392b",
  });
  calculators.energy.setMathBounds(desmosBounds.energy);
  showDesmosTab("plan");
}

function wireDesmos() {
  buildExpressionList();
  $("open-desmos").addEventListener("click", () => {
    $("desmos-dialog").showModal();
    initDesmos();
    showDesmosTab("plan");
  });
  $("close-desmos").addEventListener("click", () => $("desmos-dialog").close());
  for (const button of document.querySelectorAll("#desmos-tabs button")) {
    button.addEventListener("click", () => showDesmosTab(button.dataset.tab));
  }
}

buildLegend();
wireControls();
wireDesmos();
resize();
$("boot").classList.add("done");

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (playing) {
    clock += dt * rate;
    if (clock > track.duration + HOLD) clock = 0;
  }
  const stopped = clock >= track.duration;
  const sample = track.sampleAt(Math.min(clock, track.duration));
  updateTrain(sample);
  updateCamera(sample, dt);
  updateHud(sample, stopped);
  drawChart(sample.s);
  if (cameraMode === "overview") controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
