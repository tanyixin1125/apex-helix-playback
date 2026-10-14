// Apex Helix centreline (Part 2 refinement).
// Segment 1 is a constant-speed chain lift. Segments 2–4 coast:
//   v² = 636.84 − 19.62 z
// Segment 5 brakes to a stop at H.

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

const TWO_E = 636.84;
const TWO_G = 19.62;
const VC = 3;
const D = 57.2;
const H_LIFT = 32;
const DX = (2 * D) / Math.sqrt(5);
const DY = D / Math.sqrt(5);
const XC = 73.67;
const YC = -17.45;
const PHI0 = -0.9609;
const R = 18;
const Z0 = 16;
const BRAKE_LENGTH = 10 * Math.sqrt(5);
const BRAKE_V2 = TWO_E - TWO_G * 30;
const BRAKE_A = BRAKE_V2 / (2 * BRAKE_LENGTH);

export function energySpeed(z) {
  return Math.sqrt(Math.max(0, TWO_E - TWO_G * z));
}

const PI = Math.PI;

const C2 = [
  [51.161235325195186, 25.580617662597593, 32],
  [52.0309763257235, 26.01548816286175, 0],
  [-51.67284767844714, -25.83642383922357, -99.29174399999998],
  [-230.872708433728, -698.7370029753022, 157.52323199999987],
  [503.9624894893432, 1033.939265472057, -92.51023199999983],
  [-240.62906036135786, -393.1666777630226, 18.278743999999932],
];
const C4 = [
  [83.9800846667289, -32.204733280031924, 3.4336293856408275],
  [78.40665265008965, 54.78778991899737, -5.314],
  [-117.11665468423446, 228.2094743710749, -1.9285],
  [-364.6675985151234, -394.19622982688975, 303.3332061435918],
  [695.8781271489472, 219.99654326472483, -446.79305921538764],
  [-296.48061126640783, -36.59284444787548, 177.26872368615506],
];

function polyAt(C, u) {
  const p = [0, 0, 0];
  const rp = [0, 0, 0];
  const rpp = [0, 0, 0];
  if (u === 0) {
    for (let i = 0; i < 3; i++) {
      p[i] = C[0][i];
      rp[i] = C[1][i];
      rpp[i] = 2 * C[2][i];
    }
    return { p, rp, rpp };
  }
  let up = 1;
  for (let k = 0; k < 6; k++) {
    for (let i = 0; i < 3; i++) {
      p[i] += C[k][i] * up;
      if (k >= 1) rp[i] += (C[k][i] * k * up) / u;
      if (k >= 2) rpp[i] += (C[k][i] * k * (k - 1) * up) / (u * u);
    }
    up *= u;
  }
  return { p, rp, rpp };
}

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

function telemetry(spec, p, rp, rpp, sLocal) {
  const { T, kappa, N } = curvatureOf(rp, rpp);
  const v =
    spec.mode === "lift"
      ? VC
      : spec.mode === "brake"
        ? Math.sqrt(Math.max(0, BRAKE_V2 - 2 * BRAKE_A * sLocal))
        : energySpeed(p[2]);
  const aT = spec.mode === "lift" ? 0 : spec.mode === "brake" ? -BRAKE_A : -G * T[2];
  const aN = v * v * kappa;
  const aVec = add(mul(T, aT), mul(N, aN));
  const alpha = add(aVec, mul(K, G));
  return { T, N, kappa, v, aT, aN, aVec, alpha };
}

export const SEGMENT_DEFS = [
  {
    id: 1,
    key: "lift",
    name: "Refined lift",
    short: "Lift",
    color: "#2ec4b6",
    mode: "lift",
    domain: [0, 1],
    steps: 500,
    blurb: "Chain lift at a constant 3 m/s. The steepest grade is 40° at the midpoint.",
    equation: "x = (114.4/√5)σ,  y = (57.20/√5)σ,  z = 32(3σ²−2σ³)",
    desmos3d: "((114.4/sqrt(5))t, (57.20/sqrt(5))t, 32(3t^2-2t^3)) {0<=t<=1}",
    desmosPlan: String.raw`\left(\frac{114.4}{\sqrt{5}}t,\frac{57.20}{\sqrt{5}}t\right)\left\{0\le t\le1\right\}`,
    desmosElev: String.raw`\left(\frac{114.4}{\sqrt{5}}t,32\left(3t^{2}-2t^{3}\right)\right)\left\{0\le t\le1\right\}`,
    position: (s) => [DX * s, DY * s, H_LIFT * (3 * s * s - 2 * s * s * s)],
    deriv: (s) => [DX, DY, H_LIFT * (6 * s - 6 * s * s)],
    deriv2: (s) => [0, 0, H_LIFT * (6 - 12 * s)],
  },
  {
    id: 2,
    key: "drop",
    name: "Quintic drop",
    short: "Drop",
    color: "#ff9f1c",
    mode: "coast",
    domain: [0, 1],
    steps: 800,
    blurb: "Quintic Hermite from P1 to the helix. Speed comes from energy, not from the parameter.",
    equation: "x = 51.16+52.03u−51.67u²−230.9u³+504.0u⁴−240.6u⁵",
    desmos3d:
      "(51.1612+52.0310u-51.6728u^2-230.873u^3+503.962u^4-240.629u^5, 25.5806+26.0155u-25.8364u^2-698.737u^3+1033.94u^4-393.167u^5, 32-99.2917u^2+157.523u^3-92.5102u^4+18.2787u^5) {0<=u<=1}",
    desmosPlan: String.raw`\left(51.1612+52.0310u-51.6728u^{2}-230.873u^{3}+503.962u^{4}-240.629u^{5},25.5806+26.0155u-25.8364u^{2}-698.737u^{3}+1033.94u^{4}-393.167u^{5}\right)\left\{0\le u\le1\right\}`,
    desmosElev: String.raw`\left(51.1612+52.0310u-51.6728u^{2}-230.873u^{3}+503.962u^{4}-240.629u^{5},32-99.2917u^{2}+157.523u^{3}-92.5102u^{4}+18.2787u^{5}\right)\left\{0\le u\le1\right\}`,
    position: (u) => polyAt(C2, u).p,
    deriv: (u) => polyAt(C2, u).rp,
    deriv2: (u) => polyAt(C2, u).rpp,
  },
  {
    id: 3,
    key: "helix",
    name: "Double helix",
    short: "Helix",
    color: "#c77dff",
    mode: "coast",
    domain: [0, 4 * PI],
    steps: 1600,
    blurb: "Two descending turns, radius 18 m. Curvature stays at 18/325.",
    equation: "x = 73.67+18 cos(θ−0.9609),  y = −17.45+18 sin(θ−0.9609),  z = 16−θ",
    desmos3d: "(73.67+18cos(-0.9609+t), -17.45+18sin(-0.9609+t), 16-t) {0<=t<=4pi}",
    desmosPlan: String.raw`\left(73.67+18\cos\left(-0.9609+t\right),-17.45+18\sin\left(-0.9609+t\right)\right)\left\{0\le t\le4\pi\right\}`,
    desmosElev: String.raw`\left(73.67+18\cos\left(-0.9609+t\right),16-t\right)\left\{0\le t\le4\pi\right\}`,
    position: (th) => {
      const phi = PHI0 + th;
      return [XC + R * Math.cos(phi), YC + R * Math.sin(phi), Z0 - th];
    },
    deriv: (th) => {
      const phi = PHI0 + th;
      return [-R * Math.sin(phi), R * Math.cos(phi), -1];
    },
    deriv2: (th) => {
      const phi = PHI0 + th;
      return [-R * Math.cos(phi), -R * Math.sin(phi), 0];
    },
  },
  {
    id: 4,
    key: "climb",
    name: "Quintic climb",
    short: "Climb",
    color: "#ff5d8f",
    mode: "coast",
    domain: [0, 1],
    steps: 800,
    blurb: "Quintic pull-out and climb back to 30 m, arriving level at P4.",
    equation: "x = 83.98+78.41u−117.1u²−364.7u³+695.9u⁴−296.5u⁵",
    desmos3d:
      "(83.9801+78.4067u-117.117u^2-364.668u^3+695.878u^4-296.481u^5, -32.2047+54.7878u+228.209u^2-394.196u^3+219.997u^4-36.5928u^5, 3.43363-5.314u-1.9285u^2+303.333u^3-446.793u^4+177.269u^5) {0<=u<=1}",
    desmosPlan: String.raw`\left(83.9801+78.4067u-117.117u^{2}-364.668u^{3}+695.878u^{4}-296.481u^{5},-32.2047+54.7878u+228.209u^{2}-394.196u^{3}+219.997u^{4}-36.5928u^{5}\right)\left\{0\le u\le1\right\}`,
    desmosElev: String.raw`\left(83.9801+78.4067u-117.117u^{2}-364.668u^{3}+695.878u^{4}-296.481u^{5},3.43363-5.314u-1.9285u^{2}+303.333u^{3}-446.793u^{4}+177.269u^{5}\right)\left\{0\le u\le1\right\}`,
    position: (u) => polyAt(C4, u).p,
    deriv: (u) => polyAt(C4, u).rp,
    deriv2: (u) => polyAt(C4, u).rpp,
  },
  {
    id: 5,
    key: "brake",
    name: "Brake run",
    short: "Brakes",
    color: "#4cc9f0",
    mode: "brake",
    domain: [0, 1],
    steps: 240,
    blurb: "Straight level run. Constant braking stops the train at H.",
    equation: "x = 80+20w,  y = 40+10w,  z = 30",
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
  const base = telemetry(spec, p, rp, rpp, sLocal);
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
        if (spec.mode === "lift") time += ds / VC;
        else if (spec.mode === "brake") {
          const sLocal = s - s0;
          const v = Math.sqrt(Math.max(0, BRAKE_V2 - 2 * BRAKE_A * sLocal));
          time = t0 + (Math.sqrt(BRAKE_V2) - v) / BRAKE_A;
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
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxG = 0, minSeat = Infinity;
  for (const p of t.samples) {
    minX = Math.min(minX, p.p[0]);
    maxX = Math.max(maxX, p.p[0]);
    minY = Math.min(minY, p.p[1]);
    maxY = Math.max(maxY, p.p[1]);
    maxG = Math.max(maxG, p.aNg, p.totalG);
    minSeat = Math.min(minSeat, p.seatG);
  }
  console.log("bounds", fmt(minX), fmt(maxX), fmt(minY), fmt(maxY), "maxG", fmt(maxG), "minSeat", fmt(minSeat));
  console.log("peak aN", fmt(t.peak.aNg), "total", fmt(t.peak.totalG), "seg", t.peak.seg);
}
