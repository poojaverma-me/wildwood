/** Deterministic world layout shared by the renderer and the player's collision code. */

export const LAKE = { x: 46, z: -38, r: 26 };
export const CAMPFIRE = { x: 0, z: -6 };
export const CABIN = { x: -16, z: -16, w: 9, d: 7, rot: 0.35 };
export const SPAWN = { x: 2, z: 10 };
export const WATER_Y = -1.2;
/** The walkable area; mountains rise beyond it. */
export const BOUNDS = 150;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
function smooth(t: number) {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
}

function hash2(ix: number, iz: number) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1]. */
export function vnoise(x: number, z: number) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/** Fractal noise in roughly [-1, 1]. */
export function fbm(x: number, z: number, octaves = 4) {
  let amp = 0.5;
  let f = 1;
  let sum = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * (vnoise(x * f + i * 17.3, z * f - i * 9.1) * 2 - 1);
    amp *= 0.5;
    f *= 2.03;
  }
  return sum * 1.6;
}

/** Ridged multifractal for sharp mountain crests, roughly [0, 1]. */
function ridged(x: number, z: number, octaves = 5) {
  let amp = 0.55;
  let f = 1;
  let sum = 0;
  let weight = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(vnoise(x * f + i * 31.7, z * f + i * 11.9) * 2 - 1);
    n *= n * weight;
    weight = clamp01(n * 1.6);
    sum += n * amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return sum;
}

/** Rolling hills, a flat clearing around camp, a dip for the lake and a ring of real mountains. */
export function heightAt(x: number, z: number) {
  let h =
    Math.sin(x * 0.045) * 2.4 +
    Math.cos(z * 0.038) * 2.1 +
    Math.sin((x + z) * 0.021) * 3.2 +
    Math.cos(x * 0.11 - z * 0.07) * 0.7 +
    fbm(x / 34, z / 34, 4) * 1.1;
  const camp = Math.hypot(x - 0, z + 4);
  if (camp < 34) h *= smooth((camp - 14) / 20);
  const lake = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (lake < LAKE.r + 14) {
    const k = smooth((lake - LAKE.r * 0.55) / (LAKE.r * 0.45 + 14));
    h = h * k + -3.2 * (1 - k);
  }
  const d = Math.hypot(x, z * 1.08);
  const m = smooth((d - 120) / 190);
  if (m > 0) h += m * (10 + ridged(x / 120 + 3.1, z / 120 - 1.7) * 135 * (0.4 + 0.6 * m));
  return h;
}

export function slopeAt(x: number, z: number) {
  const e = 0.8;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  const ny = 2 * e / Math.hypot(dx, 2 * e, dz);
  return 1 - ny;
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Worn trails between spawn, the fire, the cabin, the range and the lake. */
export const TRAILS: [number, number][][] = [
  [
    [SPAWN.x, SPAWN.z + 30],
    [SPAWN.x + 1, SPAWN.z + 12],
    [SPAWN.x - 1, SPAWN.z],
    [CAMPFIRE.x + 1, CAMPFIRE.z + 4],
  ],
  [
    [CAMPFIRE.x - 2, CAMPFIRE.z - 2],
    [-8, -10],
    [CABIN.x + 2.4, CABIN.z + 3.6],
  ],
  [
    [CAMPFIRE.x + 3, CAMPFIRE.z - 2],
    [14, -16],
    [26, -26],
    [LAKE.x - LAKE.r + 2, LAKE.z + 6],
  ],
  [
    [CABIN.x + 4, CABIN.z - 3],
    [-8, -22],
    [-4, -26],
  ],
];

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const vx = bx - ax;
  const vz = bz - az;
  const t = clamp01(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz));
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}

/** Bare earth: trails, the fire ring and the yard around the cabin (0..1). */
export function dirtAt(x: number, z: number) {
  let best = 99;
  for (const t of TRAILS) for (let i = 0; i < t.length - 1; i++) best = Math.min(best, segDist(x, z, t[i][0], t[i][1], t[i + 1][0], t[i + 1][1]));
  const wobble = fbm(x / 3, z / 3, 2) * 0.35;
  let d = 1 - smooth((best - 0.7 - wobble) / 1.1);
  d = Math.max(d, 1 - smooth((Math.hypot(x - CAMPFIRE.x, z - CAMPFIRE.z) - 3.2 - wobble * 2) / 2.2));
  // Cabin yard (in cabin space, so the rectangle follows its rotation).
  const c = Math.cos(-CABIN.rot);
  const s = Math.sin(-CABIN.rot);
  const lx = (x - CABIN.x) * c - (z - CABIN.z) * s;
  const lz = (x - CABIN.x) * s + (z - CABIN.z) * c;
  const yard = Math.max(Math.abs(lx) - CABIN.w / 2, Math.abs(lz) - CABIN.d / 2);
  d = Math.max(d, 1 - smooth((yard - 0.6 - wobble) / 1.6));
  return d;
}

export type Tree = { x: number; z: number; s: number; tint: number; rot: number; v: number };
export type Rock = { x: number; z: number; s: number; rot: number; v: number };
export type Plant = { x: number; z: number; s: number; rot: number; v: number };

function clear(x: number, z: number, pad: number) {
  if (Math.hypot(x - CAMPFIRE.x, z - CAMPFIRE.z) < 13 + pad) return false;
  if (Math.hypot(x - CABIN.x, z - CABIN.z) < 9 + pad) return false;
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 2 + pad) return false;
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 6) return false;
  if (Math.abs(x - -6) < 9 && z > -24 && z < -10 && Math.abs(x) < 20) return false; // shooting range sightline
  return true;
}

export const TREES: Tree[] = (() => {
  const r = rng(7);
  const out: Tree[] = [];
  let tries = 0;
  while (out.length < 520 && tries < 20000) {
    tries++;
    const x = (r() - 0.5) * 300;
    const z = (r() - 0.5) * 300;
    if (!clear(x, z, 2) || dirtAt(x, z) > 0.2) continue;
    // Denser forest further from camp.
    const d = Math.hypot(x, z);
    if (d < 40 && r() > 0.45) continue;
    out.push({ x, z, s: 0.8 + r() * 0.9, tint: r(), rot: r() * Math.PI * 2, v: Math.floor(r() * 3) });
  }
  return out;
})();

/** Distant forest on the lower mountain slopes, drawn as impostors only. */
export const FAR_TREES: Tree[] = (() => {
  const r = rng(23);
  const out: Tree[] = [];
  let tries = 0;
  while (out.length < 4200 && tries < 60000) {
    tries++;
    const a = r() * Math.PI * 2;
    const d = 150 + Math.sqrt(r()) * 330;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (Math.abs(x) < BOUNDS && Math.abs(z) < BOUNDS) continue;
    const h = heightAt(x, z);
    if (h > 52 + fbm(x / 40, z / 40, 2) * 10) continue; // tree line
    if (slopeAt(x, z) > 0.42) continue;
    if (fbm(x / 70, z / 70, 3) < -0.25) continue; // meadows
    out.push({ x, z, s: 0.9 + r() * 0.8, tint: r(), rot: r() * Math.PI * 2, v: Math.floor(r() * 3) });
  }
  return out;
})();

export const ROCKS: Rock[] = (() => {
  const r = rng(11);
  const out: Rock[] = [];
  while (out.length < 110) {
    const x = (r() - 0.5) * 280;
    const z = (r() - 0.5) * 280;
    if (!clear(x, z, 0) || dirtAt(x, z) > 0.3) continue;
    out.push({ x, z, s: 0.4 + Math.pow(r(), 2) * 2.4, rot: r() * 6, v: Math.floor(r() * 10) });
  }
  return out;
})();

/** Ferns and shrubs gather near trunks and avoid trails. */
export const FERNS: Plant[] = (() => {
  const r = rng(31);
  const out: Plant[] = [];
  let tries = 0;
  while (out.length < 2200 && tries < 40000) {
    tries++;
    const t = TREES[Math.floor(r() * TREES.length)];
    const a = r() * Math.PI * 2;
    const d = 1.2 + r() * 6;
    const x = t.x + Math.cos(a) * d;
    const z = t.z + Math.sin(a) * d;
    if (!clear(x, z, -3) || dirtAt(x, z) > 0.1 || heightAt(x, z) < WATER_Y + 0.6) continue;
    out.push({ x, z, s: 0.8 + r() * 1.1, rot: r() * Math.PI * 2, v: Math.floor(r() * 4) });
  }
  return out;
})();

export const SHRUBS: Plant[] = (() => {
  const r = rng(43);
  const out: Plant[] = [];
  while (out.length < 160) {
    const x = (r() - 0.5) * 290;
    const z = (r() - 0.5) * 290;
    if (!clear(x, z, 1) || dirtAt(x, z) > 0.05 || heightAt(x, z) < WATER_Y + 0.8) continue;
    out.push({ x, z, s: 0.6 + r() * 0.7, rot: r() * Math.PI * 2, v: Math.floor(r() * 4) });
  }
  return out;
})();

/** Six bottles on a fence rail beside the cabin. */
export const TARGETS = Array.from({ length: 6 }, (_, i) => ({ id: i, x: -9 + i * 1.1, z: -24.5 }));
export const FENCE = { x: -6.25, z: -24.5, w: 8 };

export type Collider = { x: number; z: number; r: number };
export const COLLIDERS: Collider[] = [
  ...TREES.map((t) => ({ x: t.x, z: t.z, r: 0.45 * t.s })),
  ...ROCKS.filter((r) => r.s > 0.9).map((r) => ({ x: r.x, z: r.z, r: r.s * 0.8 })),
  { x: CAMPFIRE.x, z: CAMPFIRE.z, r: 1.3 },
];

/**
 * Baked ground data for the shaders: R height, G grass density, B bare earth, A forest floor.
 * Covers the walkable area at ~0.6 m per texel.
 */
export const MASK = { min: -165, size: 330, res: 512 };

export function buildMask() {
  const { min, size, res } = MASK;
  const data = new Float32Array(res * res * 4);
  const canopy = new Float32Array(res * res);
  const px = size / res;
  for (const t of TREES) {
    const rad = 3.2 * t.s;
    const cx = (t.x - min) / px;
    const cz = (t.z - min) / px;
    const rp = Math.ceil(rad / px);
    for (let j = Math.max(0, Math.floor(cz - rp)); j <= Math.min(res - 1, Math.ceil(cz + rp)); j++)
      for (let i = Math.max(0, Math.floor(cx - rp)); i <= Math.min(res - 1, Math.ceil(cx + rp)); i++) {
        const d = Math.hypot(i - cx, j - cz) * px;
        canopy[j * res + i] = Math.max(canopy[j * res + i], 1 - smooth((d - rad * 0.35) / (rad * 0.65)));
      }
  }
  for (let j = 0; j < res; j++)
    for (let i = 0; i < res; i++) {
      const x = min + (i + 0.5) * px;
      const z = min + (j + 0.5) * px;
      const h = heightAt(x, z);
      const dirt = dirtAt(x, z);
      const slope = slopeAt(x, z);
      const shore = smooth((h - (WATER_Y + 0.15)) / 0.8);
      const patches = smooth(0.5 + fbm(x / 16, z / 16, 3) * 0.9);
      const forest = canopy[j * res + i];
      const grass = (1 - dirt) * shore * (1 - smooth((slope - 0.3) / 0.2)) * (0.35 + 0.65 * patches) * (1 - forest * 0.75);
      const o = (j * res + i) * 4;
      data[o] = h;
      data[o + 1] = grass;
      data[o + 2] = dirt;
      data[o + 3] = forest;
    }
  return data;
}
