// Apex Helix centreline (Part 1 initial model).
// Segments 2–4 coast, so speed is fixed by height:
//   v(z) = sqrt(56 + 2 g (30 − z))
// Segment 1 is the chain lift (t is real time). Segment 5 brakes to a stop.

export const G = 9.81;
export const G_LIMIT = 4 * G;
const K = [0, 0, 1];

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mag = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => {
  const m = mag(a);
  return m < 1e-12 ? [1, 0, 0] : mul(a, 1 / m);
};
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const lerp = (a, b, f) => a + (b - a) * f;
const lerp3 = (a, b, f) => add(mul(a, 1 - f), mul(b, f));

export function energySpeed(z) {
  return Math.sqrt(Math.max(0, 56 + 2 * G * (30 - z)));
}

const PI = Math.PI;
const BRAKE_LENGTH = Math.sqrt(500);
const BRAKE_A = 56 / (2 * BRAKE_LENGTH);

function curvatureOf(rp, rpp) {
  const T = norm(rp);
  const c = cross(rp, rpp);
  const rpMag = mag(rp);
  const kappa = rpMag < 1e-9 ? 0 : mag(c) / rpMag ** 3;
  const perp = sub(rpp, mul(T, dot(rpp, T)));
  const N = mag(perp) < 1e-8 || kappa < 1e-6 ? [0, 0, 0] : norm(perp);
  return { T, kappa, N };
}

function unbankedFrame(T, prevLat) {
  let lat = cross(T, K);
  if (mag(lat) < 1e-4) {
    lat = prevLat ? prevLat.slice() : [0, 1, 0];
  } else {
    lat = norm(lat);
  }
  if (prevLat && dot(lat, prevLat) < 0) lat = mul(lat, -1);
  const H = norm(cross(lat, T));
  return { lat, H };
}

function telemetry(spec, u, p, rp, rpp, sLocal) {
  const { T, kappa, N } = curvatureOf(rp, rpp);
  const v =
    spec.mode === "lift"
      ? Math.sqrt(20 + 0.36 * u * u)
      : spec.mode === "brake"
        ? Math.sqrt(Math.max(0, 56 - 2 * BRAKE_A * sLocal))
        : energySpeed(p[2]);
  const aT =
    spec.mode === "lift"
      ? dot([0, 0, 0.6], T)
      : spec.mode === "brake"
        ? -BRAKE_A
        : -G * T[2];
  const aN = v * v * kappa;
  const aVec = add(mul(T, aT), mul(N, aN));
  const alpha = add(aVec, mul(K, G));
  return { T, N, kappa, v, aT, aN, aVec, alpha };
}

const A4 = 58 + 12 * PI;
const B4 = 36 + 8 * PI;
const Z4 = 16 - 4 * PI;

export const SEGMENT_DEFS = [
  {
    id: 1,
    key: "lift",
    name: "Parabolic lift",
    short: "Lift",
    color: "#2ec4b6",
    mode: "lift",
    domain: [0, 10],
    steps: 400,
    blurb: "Chain lift. t is real time, so the release speed at P1 is √56 m/s.",
    equation: "x = 4t,   y = 2t,   z = 0.3t²,   0 ≤ t ≤ 10",
    desmos3d: "(4t, 2t, 0.3t^2) {0<=t<=10}",
    desmosPlan: String.raw`\left(4t,2t\right)\left\{0\le t\le10\right\}`,
    desmosElev: String.raw`\left(4t,0.3t^{2}\right)\left\{0\le t\le10\right\}`,
    position: (t) => [4 * t, 2 * t, 0.3 * t * t],
    deriv: (t) => [4, 2, 0.6 * t],
    deriv2: () => [0, 0, 0.6],
  },
  {
    id: 2,
    key: "drop",
    name: "Crest and drop",
    short: "Drop",
    color: "#ff9f1c",
    mode: "coast",
    domain: [0, 1],
    steps: 700,
    blurb: "Cubic Hermite crest, then the first drop. Speed comes from energy, not from the parameter.",
    equation: "x = 40+16u+40u²−32u³,   y = 20+8u−64u²+56u³,   z = 30+24u−82u²+44u³",
    desmos3d: "(40+16u+40u^2-32u^3, 20+8u-64u^2+56u^3, 30+24u-82u^2+44u^3) {0<=u<=1}",
    desmosPlan: String.raw`\left(40+16u+40u^{2}-32u^{3},20+8u-64u^{2}+56u^{3}\right)\left\{0\le u\le1\right\}`,
    desmosElev: String.raw`\left(40+16u+40u^{2}-32u^{3},30+24u-82u^{2}+44u^{3}\right)\left\{0\le u\le1\right\}`,
    position: (u) => [
      40 + 16 * u + 40 * u * u - 32 * u * u * u,
      20 + 8 * u - 64 * u * u + 56 * u * u * u,
      30 + 24 * u - 82 * u * u + 44 * u * u * u,
    ],
    deriv: (u) => [
      16 + 80 * u - 96 * u * u,
      8 - 128 * u + 168 * u * u,
      24 - 164 * u + 132 * u * u,
    ],
    deriv2: (u) => [80 - 192 * u, -128 + 336 * u, -164 + 264 * u],
  },
  {
    id: 3,
    key: "helix",
    name: "Circular helix",
    short: "Helix",
    color: "#c77dff",
    mode: "coast",
    domain: [0, 2 * PI],
    steps: 900,
    blurb: "One full descending turn, radius 12 m, unbanked. Curvature stays at 3/37.",
    equation: "x = 52+12cos θ,   y = 20+12sin θ,   z = 16−2θ,   0 ≤ θ ≤ 2π",
    desmos3d: "(52+12cos(t), 20+12sin(t), 16-2t) {0<=t<=2pi}",
    desmosPlan: String.raw`\left(52+12\cos\theta,20+12\sin\theta\right)\left\{0\le\theta\le2\pi\right\}`,
    desmosElev: String.raw`\left(52+12\cos\theta,16-2\theta\right)\left\{0\le\theta\le2\pi\right\}`,
    position: (th) => [52 + 12 * Math.cos(th), 20 + 12 * Math.sin(th), 16 - 2 * th],
    deriv: (th) => [-12 * Math.sin(th), 12 * Math.cos(th), -2],
    deriv2: (th) => [-12 * Math.cos(th), -12 * Math.sin(th), 0],
  },
  {
    id: 4,
    key: "climb",
    name: "Cubic climb",
    short: "Climb",
    color: "#ff5d8f",
    mode: "coast",
    domain: [0, 1],
    steps: 700,
    blurb: "Hermite pull-out and climb back to 30 m, arriving level at P4.",
    equation: "x = 64+32u²−16u³,   y = 20+48u−44u²+16u³,   z = (16−4π)−8u+(58+12π)u²−(36+8π)u³",
    desmos3d: "(64+32u^2-16u^3, 20+48u-44u^2+16u^3, 16-4pi-8u+(58+12pi)u^2-(36+8pi)u^3) {0<=u<=1}",
    desmosPlan: String.raw`\left(64+32u^{2}-16u^{3},20+48u-44u^{2}+16u^{3}\right)\left\{0\le u\le1\right\}`,
    desmosElev: String.raw`\left(64+32u^{2}-16u^{3},\left(16-4\pi\right)-8u+\left(58+12\pi\right)u^{2}-\left(36+8\pi\right)u^{3}\right)\left\{0\le u\le1\right\}`,
    position: (u) => [
      64 + 32 * u * u - 16 * u * u * u,
      20 + 48 * u - 44 * u * u + 16 * u * u * u,
      Z4 - 8 * u + A4 * u * u - B4 * u * u * u,
    ],
    deriv: (u) => [
      64 * u - 48 * u * u,
      48 - 88 * u + 48 * u * u,
      -8 + 2 * A4 * u - 3 * B4 * u * u,
    ],
    deriv2: (u) => [64 - 96 * u, -88 + 96 * u, 2 * A4 - 6 * B4 * u],
  },
  {
    id: 5,
    key: "brake",
    name: "Brake run",
    short: "Brakes",
    color: "#4cc9f0",
    mode: "brake",
    domain: [0, 1],
    steps: 200,
    blurb: "Straight level run. Constant braking stops the train at H.",
    equation: "x = 80+20w,   y = 40+10w,   z = 30,   0 ≤ w ≤ 1",
    desmos3d: "(80+20w, 40+10w, 30) {0<=w<=1}",
    desmosPlan: String.raw`\left(80+20w,40+10w\right)\left\{0\le w\le1\right\}`,
    desmosElev: String.raw`\left(80+20w,30\right)\left\{0\le w\le1\right\}`,
    position: (w) => [80 + 20 * w, 40 + 10 * w, 30],
    deriv: () => [20, 10, 0],
    deriv2: () => [0, 0, 0],
  },
];

function pushSample(samples, spec, u, s, time, sLocal, prevLat) {
  const p = spec.position(u);
  const rp = spec.deriv(u);
  const rpp = spec.deriv2(u);
  const base = telemetry(spec, u, p, rp, rpp, sLocal);
  const frame = unbankedFrame(base.T, prevLat);
  const seatG = dot(base.alpha, frame.H) / G;
  const lateralG = dot(base.alpha, frame.lat) / G;
  const totalG = mag(base.alpha) / G;
  const sample = {
    seg: spec.id,
    name: spec.name,
    color: spec.color,
    mode: spec.mode,
    u,
    s,
    time,
    p,
    z: p[2],
    T: base.T,
    N: base.N,
    H: frame.H,
    lat: frame.lat,
    v: base.v,
    kappa: base.kappa,
    rho: base.kappa > 1e-6 ? 1 / base.kappa : Infinity,
    aT: base.aT,
    aN: base.aN,
    aNg: base.aN / G,
    seatG,
    lateralG,
    totalG,
    grade: (Math.asin(Math.max(-1, Math.min(1, base.T[2]))) * 180) / PI,
  };
  samples.push(sample);
  return frame.lat;
}

export function buildTrack() {
  const samples = [];
  let s = 0;
  let time = 0;
  let prevLat = null;
  const segmentStats = [];

  SEGMENT_DEFS.forEach((spec, specIndex) => {
    const [a, b] = spec.domain;
    const n = spec.steps;
    const du = (b - a) / n;
    const s0 = s;
    const t0 = time;
    let prevRp = spec.deriv(a);

    for (let i = 0; i <= n; i++) {
      const u = a + du * i;
      if (i === 0 && specIndex > 0) continue;
      if (i > 0) {
        const rp = spec.deriv(u);
        const ds = 0.5 * (mag(prevRp) + mag(rp)) * du;
        s += ds;
        prevRp = rp;
        if (spec.mode === "lift") time = u;
        else if (spec.mode === "brake") {
          const sLocal = s - s0;
          const v = Math.sqrt(Math.max(0, 56 - 2 * BRAKE_A * sLocal));
          time = t0 + (Math.sqrt(56) - v) / BRAKE_A;
        } else {
          const z0 = spec.position(u - du)[2];
          const z1 = spec.position(u)[2];
          const vAvg = Math.max(0.2, 0.5 * (energySpeed(z0) + energySpeed(z1)));
          time += ds / vAvg;
        }
      }
      const sLocal = s - s0;
      prevLat = pushSample(samples, spec, u, s, time, sLocal, prevLat);
    }

    segmentStats.push({
      id: spec.id,
      name: spec.name,
      color: spec.color,
      length: s - s0,
      time: time - t0,
      s0,
      s1: s,
      t0,
      t1: time,
    });
  });

  const duration = samples[samples.length - 1].time;
  const length = samples[samples.length - 1].s;

  function bracket(key, value) {
    let lo = 0;
    let hi = samples.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid][key] <= value) lo = mid;
      else hi = mid;
    }
    return [lo, hi];
  }

  function blend(i0, i1, f) {
    const a = samples[i0];
    const b = samples[i1];
    if (f <= 0 || a.time === b.time) return a;
    const T = norm(lerp3(a.T, b.T, f));
    let H = lerp3(a.H, b.H, f);
    H = norm(sub(H, mul(T, dot(H, T))));
    let lat = cross(T, K);
    lat = mag(lat) < 1e-4 ? a.lat : norm(lat);
    if (dot(lat, a.lat) < 0) lat = mul(lat, -1);
    H = norm(cross(lat, T));
    const p = lerp3(a.p, b.p, f);
    return {
      ...a,
      seg: f < 0.5 ? a.seg : b.seg,
      name: f < 0.5 ? a.name : b.name,
      color: f < 0.5 ? a.color : b.color,
      mode: f < 0.5 ? a.mode : b.mode,
      s: lerp(a.s, b.s, f),
      time: lerp(a.time, b.time, f),
      p,
      z: p[2],
      T,
      H,
      lat,
      N: mag(lerp3(a.N, b.N, f)) > 1e-6 ? norm(lerp3(a.N, b.N, f)) : [0, 0, 0],
      v: lerp(a.v, b.v, f),
      kappa: lerp(a.kappa, b.kappa, f),
      aT: lerp(a.aT, b.aT, f),
      aN: lerp(a.aN, b.aN, f),
      aNg: lerp(a.aNg, b.aNg, f),
      seatG: lerp(a.seatG, b.seatG, f),
      lateralG: lerp(a.lateralG, b.lateralG, f),
      totalG: lerp(a.totalG, b.totalG, f),
      grade: lerp(a.grade, b.grade, f),
      rho: lerp(a.aNg, b.aNg, f) > 0.01 ? lerp(a.v, b.v, f) ** 2 / (lerp(a.aN, b.aN, f) || 1e-9) : Infinity,
    };
  }

  function sampleAt(t) {
    if (t <= samples[0].time) return samples[0];
    if (t >= duration) return samples[samples.length - 1];
    const [i0, i1] = bracket("time", t);
    const span = samples[i1].time - samples[i0].time;
    const f = span < 1e-8 ? 0 : (t - samples[i0].time) / span;
    return blend(i0, i1, f);
  }

  function sampleAtS(dist) {
    if (dist <= 0) {
      const a = samples[0];
      return { ...a, s: dist, p: add(a.p, mul(a.T, dist)), time: 0 };
    }
    if (dist >= length) return samples[samples.length - 1];
    const [i0, i1] = bracket("s", dist);
    const span = samples[i1].s - samples[i0].s;
    const f = span < 1e-8 ? 0 : (dist - samples[i0].s) / span;
    return blend(i0, i1, f);
  }

  let peak = samples[0];
  for (const sample of samples) {
    if (sample.aNg > peak.aNg) peak = sample;
  }

  const markers = [
    { id: "L", label: "L", s: 0 },
    { id: "P1", label: "P1", s: segmentStats[0].s1 },
    { id: "P2", label: "P2", s: segmentStats[1].s1 },
    { id: "P3", label: "P3", s: segmentStats[2].s1 },
    { id: "P4", label: "P4", s: segmentStats[3].s1 },
    { id: "H", label: "H", s: length },
  ].map((m) => ({ ...m, sample: sampleAtS(m.s) }));

  return {
    samples,
    segmentStats,
    duration,
    length,
    peak,
    markers,
    sampleAt,
    sampleAtS,
    brakeA: BRAKE_A,
  };
}

export const track = buildTrack();

const isDirect =
  typeof process !== "undefined" &&
  process.argv?.[1] &&
  process.argv[1].replaceAll("\\", "/").endsWith("track.mjs");

if (isDirect) {
  const t = track;
  const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "inf");
  console.log("length", fmt(t.length, 2), "duration", fmt(t.duration, 2));
  for (const seg of t.segmentStats) {
    console.log(`seg ${seg.id}  L=${fmt(seg.length)}  T=${fmt(seg.time)}`);
  }
  const at = (s) => t.sampleAtS(s);
  const watch = [
    ["L", 0],
    ["P1", t.segmentStats[0].s1],
    ["crest-ish", t.samples.filter((p) => p.seg === 2).reduce((a, b) => (a.z > b.z ? a : b)).s],
    ["P2", t.segmentStats[1].s1],
    ["P3", t.segmentStats[2].s1],
    ["P4", t.segmentStats[3].s1],
    ["H", t.length],
    ["peak", t.peak.s],
  ];
  for (const [name, s] of watch) {
    const p = name === "peak" ? t.peak : at(s);
    console.log(
      name.padEnd(10),
      "s",
      fmt(p.s, 1),
      "z",
      fmt(p.z),
      "v",
      fmt(p.v),
      "aN",
      fmt(p.aNg),
      "seat",
      fmt(p.seatG),
      "lat",
      fmt(p.lateralG),
      "tot",
      fmt(p.totalG),
      "ρ",
      fmt(p.rho, 1),
      "seg",
      p.seg,
    );
  }
  const seg2 = t.samples.filter((p) => p.seg === 2);
  const seg4 = t.samples.filter((p) => p.seg === 4);
  const max2 = seg2.reduce((a, b) => (a.aNg > b.aNg ? a : b));
  const max4 = seg4.reduce((a, b) => (a.aNg > b.aNg ? a : b));
  const crest = seg2.reduce((a, b) => (a.z > b.z ? a : b));
  const p4 = t.sampleAtS(t.segmentStats[3].s1);
  const p3 = t.samples.filter((p) => p.seg === 3).at(-1);
  console.log("crest z", fmt(crest.z), "v", fmt(crest.v));
  console.log(
    "max seg2",
    fmt(max2.aNg),
    "at s",
    fmt(max2.s, 1),
    "z",
    fmt(max2.z),
    "v",
    fmt(max2.v),
    "seat",
    fmt(max2.seatG),
    "tot",
    fmt(max2.totalG),
  );
  console.log("helix exit aN", fmt(p3.aNg), "v", fmt(p3.v), "z", fmt(p3.z), "seat", fmt(p3.seatG));
  console.log("max seg4", fmt(max4.aNg), "at s", fmt(max4.s, 1), "seat", fmt(max4.seatG));
  console.log("P4 aN", fmt(p4.aNg), "seat", fmt(p4.seatG), "v", fmt(p4.v));
}
