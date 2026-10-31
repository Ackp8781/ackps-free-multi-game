// BlockCraft procedural world generator. Every chunk is a pure function of the seed, so workers can build
// chunks in any order and neighbouring chunks always agree about trees and buildings that cross their borders.
const CraftGen = (() => {
  const D = typeof CraftData !== 'undefined' ? CraftData : require('./data.js');
  const { B, OP, EMIT, OPAQUE, REPLACE, rollLoot, WOODS } = D;
  const SEA = 63, W = 16, HEIGHT = 256;
  const idx = (x, y, z) => (y << 8) | (z << 4) | x;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mix32 = (a, b) => { a = Math.imul(a ^ b, 0x5bd1e995); return a ^ (a >>> 15); };
  const hash = (...v) => { let h = 0x811c9dc5 | 0; for (const n of v) h = mix32(h, n | 0); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) | 0; };
  const rngOf = seed => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rint = (r, a, b) => a + Math.floor(r() * (b - a + 1));

  class Perlin {
    constructor(seed) {
      const r = rngOf(seed), p = new Uint8Array(256);
      for (let i = 0; i < 256; i++) p[i] = i;
      for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)), t = p[i]; p[i] = p[j]; p[j] = t; }
      this.p = new Uint8Array(512);
      for (let i = 0; i < 512; i++) this.p[i] = p[i & 255];
    }
    n2(x, y) {
      const p = this.p, X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y, A = X & 255, Bb = Y & 255;
      const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
      const g = (h, a, b) => { h &= 7; const s = h < 4 ? a : b, t = h < 4 ? b : a; return ((h & 1) ? -s : s) + ((h & 2) ? -2 * t : 2 * t); };
      const a = g(p[p[A] + Bb], fx, fy), b = g(p[p[A + 1] + Bb], fx - 1, fy), c = g(p[p[A] + Bb + 1], fx, fy - 1), d = g(p[p[A + 1] + Bb + 1], fx - 1, fy - 1);
      return (a + (b - a) * u + (c - a + (a - b + d - c) * u) * v) * .45;
    }
    n3(x, y, z) {
      const p = this.p, X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
      x -= X; y -= Y; z -= Z;
      const xi = X & 255, yi = Y & 255, zi = Z & 255;
      const u = x * x * x * (x * (x * 6 - 15) + 10), v = y * y * y * (y * (y * 6 - 15) + 10), w = z * z * z * (z * (z * 6 - 15) + 10);
      const g = (h, a, b, c) => {
        h &= 15;
        const s = h < 8 ? a : b, t = h < 4 ? b : h === 12 || h === 14 ? a : c;
        return ((h & 1) ? -s : s) + ((h & 2) ? -t : t);
      };
      const A = p[xi] + yi, AA = p[A] + zi, AB = p[A + 1] + zi, Bq = p[xi + 1] + yi, BA = p[Bq] + zi, BB = p[Bq + 1] + zi;
      const l1 = g(p[AA], x, y, z), l2 = g(p[BA], x - 1, y, z), l3 = g(p[AB], x, y - 1, z), l4 = g(p[BB], x - 1, y - 1, z);
      const l5 = g(p[AA + 1], x, y, z - 1), l6 = g(p[BA + 1], x - 1, y, z - 1), l7 = g(p[AB + 1], x, y - 1, z - 1), l8 = g(p[BB + 1], x - 1, y - 1, z - 1);
      const a = l1 + u * (l2 - l1), b = l3 + u * (l4 - l3), c = l5 + u * (l6 - l5), d = l7 + u * (l8 - l7);
      const e = a + v * (b - a), f = c + v * (d - c);
      return e + w * (f - e);
    }
    fbm2(x, y, oct) { let a = 1, s = 0, t = 0; for (let i = 0; i < oct; i++) { s += this.n2(x, y) * a; t += a; a *= .5; x = x * 2.03 + 17.3; y = y * 2.03 + 9.1; } return s / t; }
    fbm3(x, y, z, oct) { let a = 1, s = 0, t = 0; for (let i = 0; i < oct; i++) { s += this.n3(x, y, z) * a; t += a; a *= .5; x = x * 2.03 + 3.7; y = y * 2.03 + 11.1; z = z * 2.03 + 5.3; } return s / t; }
  }

  // Biomes. density is trees per chunk; trees lists [type, weight].
  const BIOMES = [];
  const biome = (key, name, o = {}) => { const b = { id: BIOMES.length, key, name, top: B.grass_block, fill: B.dirt, density: 0, trees: [], grass: 0, flowers: null, ...o }; BIOMES.push(b); return b.id; };
  const flowers = ['dandelion', 'poppy'].map(k => B[k]);
  const Bi = {
    ocean: biome('ocean', 'Ocean', { top: B.gravel, fill: B.gravel, sea: 1 }),
    deep_ocean: biome('deep_ocean', 'Deep Ocean', { top: B.gravel, fill: B.gravel, sea: 2 }),
    frozen_ocean: biome('frozen_ocean', 'Frozen Ocean', { top: B.gravel, fill: B.gravel, sea: 1, cold: true }),
    warm_ocean: biome('warm_ocean', 'Warm Ocean', { top: B.sand, fill: B.sand, sea: 1 }),
    beach: biome('beach', 'Beach', { top: B.sand, fill: B.sand }),
    snowy_beach: biome('snowy_beach', 'Snowy Beach', { top: B.sand, fill: B.sand, cold: true }),
    stony_shore: biome('stony_shore', 'Stony Shore', { top: B.stone, fill: B.stone }),
    river: biome('river', 'River', { top: B.sand, fill: B.dirt, river: true }),
    frozen_river: biome('frozen_river', 'Frozen River', { top: B.gravel, fill: B.dirt, river: true, cold: true }),
    plains: biome('plains', 'Plains', { density: .08, trees: [['oak', 5], ['fancy_oak', 1]], grass: 34, flowers, flowerChance: .35, village: 'oak' }),
    forest: biome('forest', 'Forest', { density: 8, trees: [['oak', 7], ['fancy_oak', 1], ['birch', 2]], grass: 5, flowers, flowerChance: .25 }),
    birch_forest: biome('birch_forest', 'Birch Forest', { density: 8, trees: [['birch', 5], ['tall_birch', 2]], grass: 6, flowers, flowerChance: .3 }),
    flower_forest: biome('flower_forest', 'Flower Forest', { density: 5, trees: [['oak', 3], ['birch', 2]], grass: 6, flowers: ['dandelion', 'poppy', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'oxeye_daisy', 'cornflower'].map(k => B[k]), flowerChance: 1, flowerTries: 24 }),
    dark_forest: biome('dark_forest', 'Dark Forest', { density: 13, trees: [['dark_oak', 8], ['oak', 2], ['huge_red', 1], ['huge_brown', 1]], grass: 4, mushrooms: .3 }),
    taiga: biome('taiga', 'Taiga', { density: 8, trees: [['spruce', 3], ['pine', 2]], grass: 6, ferns: true, podzol: true, village: 'spruce' }),
    snowy_taiga: biome('snowy_taiga', 'Snowy Taiga', { density: 6, trees: [['spruce', 3], ['pine', 2]], grass: 3, ferns: true, cold: true }),
    snowy_plains: biome('snowy_plains', 'Snowy Plains', { density: .12, trees: [['spruce', 1]], grass: 1, cold: true, village: 'spruce' }),
    savanna: biome('savanna', 'Savanna', { density: 1, trees: [['acacia', 6], ['oak', 1]], grass: 30, village: 'acacia' }),
    desert: biome('desert', 'Desert', { top: B.sand, fill: B.sand, under: B.sandstone, cactus: 3, dead: 2, village: 'desert', temple: true }),
    badlands: biome('badlands', 'Badlands', { top: B.red_sand, fill: B.terracotta, badlands: true, cactus: 1, dead: 4 }),
    jungle: biome('jungle', 'Jungle', { density: 16, trees: [['jungle', 6], ['mega_jungle', 2], ['bush', 5]], grass: 20, ferns: true, flowers, flowerChance: .2, melons: .35, vines: true }),
    swamp: biome('swamp', 'Swamp', { density: 2, trees: [['swamp_oak', 1]], grass: 8, lily: 4, mushrooms: .4, flowers: [B.blue_orchid], flowerChance: .4, cane: 6, clayFloor: true }),
    mushroom_fields: biome('mushroom_fields', 'Mushroom Fields', { top: B.mycelium, density: .8, trees: [['huge_red', 1], ['huge_brown', 1]], mushrooms: 1 }),
    windswept: biome('windswept', 'Windswept Hills', { density: .6, trees: [['spruce', 2], ['oak', 1]], grass: 6, emerald: true, stonePatches: true }),
    stony_peaks: biome('stony_peaks', 'Stony Peaks', { top: B.stone, fill: B.stone, emerald: true }),
    snowy_peaks: biome('snowy_peaks', 'Snowy Peaks', { top: B.snow_block, fill: B.snow_block, emerald: true, cold: true }),
    meadow: biome('meadow', 'Meadow', { density: .03, trees: [['oak', 1]], grass: 34, flowers: ['allium', 'azure_bluet', 'dandelion', 'cornflower', 'oxeye_daisy'].map(k => B[k]), flowerChance: 1, flowerTries: 12, village: 'oak' }),
    cherry_grove: biome('cherry_grove', 'Cherry Grove', { density: 3, trees: [['cherry', 1]], grass: 12, flowers: [B.azure_bluet, B.oxeye_daisy], flowerChance: .8, flowerTries: 8 }),
  };

  const SOIL = new Uint8Array(256);
  for (const k of ['grass_block', 'dirt', 'podzol', 'coarse_dirt', 'mycelium', 'farmland']) SOIL[B[k]] = 1;
  const TREE_OK = new Uint8Array(256);
  TREE_OK[0] = 1;
  D.blocks.forEach(d => { if (d.replace && !d.fluid) TREE_OK[d.id] = 1; if (d.key.endsWith('_leaves') || d.shape === 'cross') TREE_OK[d.id] = 1; });
  const STRATA = ['terracotta', 'orange_terracotta', 'terracotta', 'yellow_terracotta', 'brown_terracotta', 'terracotta', 'red_terracotta', 'white_terracotta', 'orange_terracotta', 'light_gray_terracotta', 'terracotta', 'brown_terracotta'].map(k => B[k]);
  const SPLINE = [[-1, 26], [-.55, 34], [-.32, 46], [-.17, 57], [-.09, 62], [-.03, 65], [.1, 68], [.3, 72], [.55, 78], [.8, 86], [1, 92]];
  const spline = v => {
    if (v <= SPLINE[0][0]) return SPLINE[0][1];
    for (let i = 1; i < SPLINE.length; i++) if (v < SPLINE[i][0]) { const a = SPLINE[i - 1], b = SPLINE[i], t = (v - a[0]) / (b[0] - a[0]); return lerp(a[1], b[1], t * t * (3 - 2 * t)); }
    return SPLINE[SPLINE.length - 1][1];
  };
  // Grass and water colours are smooth across biome edges because they are mixed from the climate noise.
  const COLD = [128, 180, 151], MILD = [125, 190, 88], HOT = [191, 183, 85], WET = [68, 204, 54];
  const grassRGB = (t, w) => {
    const tt = clamp((t + .75) / 1.5, 0, 1), ww = clamp((w + .6) / 1.2, 0, 1), out = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const dry = tt < .5 ? lerp(COLD[i], MILD[i], tt * 2) : lerp(MILD[i], HOT[i], tt * 2 - 1);
      const lush = tt < .5 ? lerp(COLD[i], MILD[i] * .85 + WET[i] * .15, tt * 2) : lerp(MILD[i] * .7 + WET[i] * .3, WET[i], tt * 2 - 1);
      out[i] = lerp(dry, lush, ww);
    }
    return out;
  };

  function create(settings) {
    const seed = settings.seed | 0, type = settings.type || 'default', structures = settings.structures !== false;
    const flat = type === 'flat', scale = type === 'large' ? .25 : 1, amp = type === 'amplified' ? 2 : 1;
    const nC = new Perlin(hash(seed, 1)), nE = new Perlin(hash(seed, 2)), nP = new Perlin(hash(seed, 3)), nH = new Perlin(hash(seed, 4));
    const nT = new Perlin(hash(seed, 5)), nW = new Perlin(hash(seed, 6)), nR = new Perlin(hash(seed, 7)), n3 = new Perlin(hash(seed, 8));
    const cA = new Perlin(hash(seed, 9)), cB = new Perlin(hash(seed, 10)), cC = new Perlin(hash(seed, 11)), nS = new Perlin(hash(seed, 12)), cE = new Perlin(hash(seed, 13));
    const grids = new Map();
    const GRID_MAX = 400;

    // Climate and shape at one map point, sampled on a coarse grid and interpolated in between.
    const params = (x, z) => {
      const wx = x + nS.n2(x / 90, z / 90) * 26, wz = z + nS.n2(x / 90 + 40, z / 90 + 40) * 26;
      let c = nC.fbm2(wx * scale / 1000 + 7.1, wz * scale / 1000 - 3.3, 4) * 1.75 + .16;
      // Keep the area around the origin on land so new worlds never start in open ocean.
      const home = 1 - smooth(120, 420, Math.hypot(x, z));
      c = lerp(c, Math.max(c, .16), home);
      const e = nE.fbm2(wx * scale / 620 - 11.7, wz * scale / 620 + 4.9, 3) * 1.55;
      const pv = nP.fbm2(wx / 230 + 2.3, wz / 230 + 8.8, 4);
      const t = nT.fbm2(x * scale / 760 + 31.2, z * scale / 760 - 17.5, 3) * 2.2 + nS.n2(x / 34, z / 34) * .025;
      const w = nW.fbm2(x * scale / 620 - 41.3, z * scale / 620 + 23.6, 3) * 2.1 + nS.n2(x / 29 + 9, z / 29 + 9) * .025;
      const riv = Math.abs(nR.fbm2(wx * scale / 560 + 50.5, wz * scale / 560 - 60.5, 3));
      const land = smooth(-.12, .02, c);
      const mount = smooth(.02, .42, c) * smooth(.18, -.42, e);
      const ridge = 1 - Math.min(1, Math.abs(pv) * 2.1);
      const flatness = smooth(-.2, .55, e);
      const roll = nH.fbm2(wx / 95, wz / 95, 3);
      let h = spline(c) + roll * (2.5 + land * lerp(13, 4.5, flatness)) + nH.n2(wx / 31 + 3, wz / 31 + 3) * land * 1.6;
      h += mount * (18 + 112 * amp * Math.pow(ridge, 1.5) * lerp(.5, 1, mount));
      // Badlands stack into flat mesas.
      const mesa = smooth(.4, .54, t) * smooth(-.16, -.3, w) * land;
      if (mesa > 0) {
        const top = 78 + nH.fbm2(wx / 70 + 9, wz / 70 - 9, 2) * 44, step = Math.floor(top / 7) * 7;
        h = lerp(h, Math.max(h, step), smooth(.25, .6, mesa));
      }
      // Rivers cut channels through everything except high ground.
      const rw = .024 * land * (1 - smooth(.12, .35, mount)) * (1 - mesa);
      let river = 0;
      if (rw > .002 && riv < rw) { river = 1 - riv / rw; h = lerp(h, Math.min(h, SEA - 2 - river * 3), smooth(0, .75, river)); }
      else if (rw > .002 && riv < rw * 1.9) { const k = (riv - rw) / (rw * .9); h = lerp(Math.min(h, SEA + 2), h, k * k * (3 - 2 * k)); }
      return { c, e, t, w, h, mount, land, river, mesa, ridge };
    };

    const biomeOf = (p, h) => {
      const { t, w, c, mount, river, mesa } = p;
      if (flat) return Bi.plains;
      if (river > .15 && h <= SEA + 1) return t < -.42 ? Bi.frozen_river : Bi.river;
      if (c < -.1 || h < SEA - 3) {
        if (t < -.38) return Bi.frozen_ocean;
        if (c < -.42) return Bi.deep_ocean;
        return t > .42 ? Bi.warm_ocean : Bi.ocean;
      }
      if (c > -.14 && c < -.005 && h <= SEA + 3) {
        if (mount > .05 || h > SEA + 5) return Bi.stony_shore;
        return t < -.38 ? Bi.snowy_beach : Bi.beach;
      }
      if (mesa > .4) return Bi.badlands;
      if (mount > .35) {
        const line = 138 - t * 34;
        if (h > line) return t < .25 ? Bi.snowy_peaks : Bi.stony_peaks;
        if (h > 108) return t < -.1 ? Bi.snowy_peaks : Bi.stony_peaks;
        return Bi.windswept;
      }
      if (c < -.32 + .1 && w > .3 && t > -.1) return Bi.mushroom_fields;
      if (t < -.42) return w > .05 ? Bi.snowy_taiga : Bi.snowy_plains;
      if (t < -.14) return w > -.12 ? Bi.taiga : Bi.plains;
      if (t < .2) {
        if (w < -.22) return mount > .1 ? Bi.meadow : Bi.plains;
        if (w < .02) return Bi.forest;
        if (w < .15) return p.e > .25 ? Bi.flower_forest : Bi.birch_forest;
        if (w < .34) return Bi.birch_forest;
        return h < SEA + 5 ? Bi.swamp : Bi.dark_forest;
      }
      if (t < .42) {
        if (w < -.28) return Bi.savanna;
        if (w < -.04) return Bi.plains;
        if (w < .12) return p.e > .1 ? Bi.cherry_grove : Bi.forest;
        return h < SEA + 4 ? Bi.swamp : Bi.jungle;
      }
      if (w < -.05) return Bi.desert;
      if (w < .12) return Bi.savanna;
      return Bi.jungle;
    };

    // Coarse density and climate for one chunk: 5x5 columns, one sample every 8 blocks of height.
    function grid(cx, cz) {
      const key = cx * 100003 + cz;
      let g = grids.get(key);
      if (g) return g;
      const ox = cx * W, oz = cz * W, P = [];
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) P.push(flat ? { t: .1, w: -.3, h: 3, c: .4, e: 1, mount: 0, land: 1, river: 0, mesa: 0, ridge: 0 } : params(ox + i * 4, oz + j * 4));
      g = { P, dens: null, height: new Uint8Array(256), biome: new Uint8Array(256) };
      if (flat) { g.height.fill(3); g.biome.fill(Bi.plains); }
      else {
        const dens = new Float32Array(5 * 5 * 33);
        let maxY = 0;
        for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
          const p = P[i * 5 + j], wx = ox + i * 4, wz = oz + j * 4;
          const squash = lerp(9, 34, p.mount) + p.mesa * 10, a = lerp(.09, .85, p.mount) + p.mesa * .12;
          for (let k = 0; k < 33; k++) {
            const y = k * 8;
            let d = (p.h - y) / squash;
            if (Math.abs(d) < a * 1.8) d += n3.fbm3(wx / 62, y / 44, wz / 62, 3) * a;
            if (y > 232) d -= (y - 232) * .2;
            if (d > 0 && y > maxY) maxY = y;
            dens[(i * 5 + j) * 33 + k] = d;
          }
        }
        g.dens = dens;
        // Find the top solid block in every column by walking the interpolated density down.
        const startK = Math.min(31, (maxY >> 3) + 1);
        for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) {
          const ix = x >> 2, iz = z >> 2, fx = (x & 3) / 4, fz = (z & 3) / 4;
          const a0 = (ix * 5 + iz) * 33, a1 = (ix * 5 + iz + 1) * 33, b0 = ((ix + 1) * 5 + iz) * 33, b1 = ((ix + 1) * 5 + iz + 1) * 33;
          let top = 1;
          for (let k = startK; k >= 0 && top === 1; k--) {
            const lo = lerp(lerp(dens[a0 + k], dens[a1 + k], fz), lerp(dens[b0 + k], dens[b1 + k], fz), fx);
            const hi = lerp(lerp(dens[a0 + k + 1], dens[a1 + k + 1], fz), lerp(dens[b0 + k + 1], dens[b1 + k + 1], fz), fx);
            if (hi > 0 || lo > 0) for (let s = 7; s >= 0; s--) if (lerp(lo, hi, s / 8) > 0) { top = k * 8 + s; break; }
          }
          g.height[x | (z << 4)] = top;
          const q = lerp2(P, ix, iz, fx, fz);
          g.biome[x | (z << 4)] = biomeOf(q, top);
        }
      }
      if (grids.size > GRID_MAX) grids.delete(grids.keys().next().value);
      grids.set(key, g);
      return g;
    }
    const lerp2 = (P, ix, iz, fx, fz) => {
      const a = P[ix * 5 + iz], b = P[ix * 5 + iz + 1], c = P[(ix + 1) * 5 + iz], d = P[(ix + 1) * 5 + iz + 1], out = {};
      for (const k of ['c', 'e', 't', 'w', 'h', 'mount', 'land', 'river', 'mesa']) out[k] = lerp(lerp(a[k], b[k], fz), lerp(c[k], d[k], fz), fx);
      return out;
    };
    const cell = v => Math.floor(v / W);
    const heightAt = (x, z) => grid(cell(x), cell(z)).height[(x & 15) | ((z & 15) << 4)];
    const biomeAt = (x, z) => BIOMES[grid(cell(x), cell(z)).biome[(x & 15) | ((z & 15) << 4)]];

    // ---------- Structures ----------
    const PIECE_REGION = 18;
    const villages = new Map(), singles = new Map();
    const style = {
      oak: { wall: B.oak_planks, post: B.oak_log, roof: B.oak_stairs, roofFlat: B.oak_slab, floor: B.cobblestone, base: B.cobblestone, door: B.oak_door, fence: B.oak_fence, path: B.dirt_path },
      spruce: { wall: B.spruce_planks, post: B.spruce_log, roof: B.spruce_stairs, roofFlat: B.spruce_slab, floor: B.cobblestone, base: B.cobblestone, door: B.spruce_door, fence: B.spruce_fence, path: B.dirt_path },
      acacia: { wall: B.acacia_planks, post: B.acacia_log, roof: B.acacia_stairs, roofFlat: B.acacia_slab, floor: B.terracotta, base: B.orange_terracotta, door: B.acacia_door, fence: B.acacia_fence, path: B.dirt_path },
      desert: { wall: B.sandstone, post: B.sandstone, roof: B.sandstone_stairs, roofFlat: B.sandstone_slab, floor: B.sandstone, base: B.sandstone, door: B.jungle_door, fence: B.acacia_fence, path: B.sandstone },
    };
    const footprint = (x, z, rot, w, d) => {
      // World bounds of a w x d piece after rotating around its origin.
      const a = rotXZ(rot, 0, 0), b = rotXZ(rot, w - 1, d - 1);
      return { x0: x + Math.min(a[0], b[0]), x1: x + Math.max(a[0], b[0]), z0: z + Math.min(a[1], b[1]), z1: z + Math.max(a[1], b[1]) };
    };
    const rotXZ = (r, dx, dz) => r === 0 ? [dx, dz] : r === 1 ? [-dz, dx] : r === 2 ? [-dx, -dz] : [dz, -dx];

    function villageIn(rx, rz) {
      const key = rx * 100003 + rz;
      if (villages.has(key)) return villages.get(key);
      let v = null;
      const r = rngOf(hash(seed, rx, rz, 77));
      const vx = (rx + .25 + r() * .5) * PIECE_REGION * W | 0, vz = (rz + .25 + r() * .5) * PIECE_REGION * W | 0;
      const roll = r();
      if (structures && roll < .62) {
        const b = biomeAt(vx, vz);
        const h = heightAt(vx, vz);
        if (b.village && h > SEA && h < 110 && slopeAt(vx, vz, 12) <= 7) v = layoutVillage(vx, vz, h, b, r);
      }
      villages.set(key, v);
      return v;
    }
    const slopeAt = (x, z, s) => {
      const hs = [heightAt(x - s, z), heightAt(x + s, z), heightAt(x, z - s), heightAt(x, z + s), heightAt(x, z)];
      return Math.max(...hs) - Math.min(...hs);
    };
    function layoutVillage(vx, vz, h, b, r) {
      const st = style[b.village], pieces = [], roads = [];
      const clash = f => pieces.some(p => f.x0 - 1 <= p.f.x1 && f.x1 + 1 >= p.f.x0 && f.z0 - 1 <= p.f.z1 && f.z1 + 1 >= p.f.z0);
      const add = (type, x, z, rot, w, dp) => {
        const f = footprint(x, z, rot, w, dp);
        if (clash(f)) return false;
        let lo = 999, hi = 0, wet = false;
        for (const [a, c] of [[f.x0, f.z0], [f.x1, f.z0], [f.x0, f.z1], [f.x1, f.z1], [(f.x0 + f.x1) >> 1, (f.z0 + f.z1) >> 1]]) {
          const y = heightAt(a, c);
          lo = Math.min(lo, y); hi = Math.max(hi, y);
          if (y < SEA) wet = true;
        }
        if (wet || hi - lo > 6) return false;
        pieces.push({ type, x, z, y: heightAt((f.x0 + f.x1) >> 1, (f.z0 + f.z1) >> 1), rot, w, d: dp, f, seed: Math.floor(r() * 1e9) });
        return true;
      };
      add('well', vx - 2, vz - 2, 0, 5, 5);
      const types = [['small', 5, 5, 5], ['small', 5, 5, 5], ['long', 7, 5, 4], ['smith', 7, 6, 2], ['farm', 9, 7, 3], ['chapel', 5, 7, 1], ['lamp', 1, 1, 2]];
      const total = types.reduce((a, t) => a + t[3], 0);
      for (let dir = 0; dir < 4; dir++) {
        const dx = D.DX[dir], dz = D.DZ[dir], len = rint(r, 22, 40);
        roads.push({ x: vx, z: vz, dx, dz, len });
        for (let s = 7; s < len;) {
          for (const side of [-1, 1]) {
            if (r() > .85) continue;
            let w = r() * total, t = types[0];
            for (const c of types) { w -= c[3]; if (w <= 0) { t = c; break; } }
            // The piece's front (local z = 0) faces the road. Local x runs along the road.
            const px = vx + dx * s - dz * side * 2, pz = vz + dz * s + dx * side * 2;
            const rot = dx !== 0 ? (side * dx > 0 ? 0 : 2) : (side * dz > 0 ? 1 : 3);
            add(t[0], px, pz, rot, t[1], t[2]);
          }
          s += rint(r, 9, 12);
        }
      }
      const f = pieces.reduce((a, p) => ({ x0: Math.min(a.x0, p.f.x0), x1: Math.max(a.x1, p.f.x1), z0: Math.min(a.z0, p.f.z0), z1: Math.max(a.z1, p.f.z1) }), { x0: vx - 42, x1: vx + 42, z0: vz - 42, z1: vz + 42 });
      return { x: vx, z: vz, y: h, st, pieces, roads, f, biome: b };
    }

    function singleIn(rx, rz) {
      const key = rx * 100003 + rz;
      if (singles.has(key)) return singles.get(key);
      let s = null;
      const r = rngOf(hash(seed, rx, rz, 131));
      const x = (rx + .15 + r() * .7) * 11 * W | 0, z = (rz + .15 + r() * .7) * 11 * W | 0, roll = r();
      if (structures && !flat) {
        const b = biomeAt(x, z), h = heightAt(x, z);
        if (b.temple && roll < .5 && h > SEA) {
          const f = { x0: x - 10, x1: x + 10, z0: z - 10, z1: z + 10 };
          s = { type: 'temple', x, z, y: h, f, seed: Math.floor(r() * 1e9) };
        } else if (roll < .42 && h > SEA + 1 && !b.sea && !b.river && h < 150) {
          const f = { x0: x - 3, x1: x + 3, z0: z - 3, z1: z + 3 };
          s = { type: 'tower', x, z, y: h, f, seed: Math.floor(r() * 1e9) };
        }
      }
      singles.set(key, s);
      return s;
    }

    function nearbyVillages(x0, z0, x1, z1) {
      const out = [], S = PIECE_REGION * W;
      for (let rx = Math.floor((x0 - 64) / S); rx <= Math.floor((x1 + 64) / S); rx++) for (let rz = Math.floor((z0 - 64) / S); rz <= Math.floor((z1 + 64) / S); rz++) {
        const v = villageIn(rx, rz);
        if (v && v.f.x0 <= x1 && v.f.x1 >= x0 && v.f.z0 <= z1 && v.f.z1 >= z0) out.push(v);
      }
      return out;
    }

    // ---------- Chunk assembly ----------
    function chunk(cx, cz) {
      const ox = cx * W, oz = cz * W, g = grid(cx, cz);
      const blocks = new Uint8Array(65536);
      let meta = null;
      const be = [];
      const height = g.height;
      const setMeta = (i, m) => { if (m) { if (!meta) meta = new Uint8Array(65536); meta[i] = m; } else if (meta) meta[i] = 0; };

      if (flat) {
        for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) {
          blocks[idx(x, 0, z)] = B.bedrock; blocks[idx(x, 1, z)] = B.dirt; blocks[idx(x, 2, z)] = B.dirt; blocks[idx(x, 3, z)] = B.grass_block;
        }
      } else {
        // Trilinear fill: stone wherever density is positive, water below sea level.
        const dens = g.dens;
        for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 4; iz++) {
          const a0 = (ix * 5 + iz) * 33, a1 = (ix * 5 + iz + 1) * 33, b0 = ((ix + 1) * 5 + iz) * 33, b1 = ((ix + 1) * 5 + iz + 1) * 33;
          for (let k = 0; k < 32; k++) {
            const d00 = dens[a0 + k], d01 = dens[a1 + k], d10 = dens[b0 + k], d11 = dens[b1 + k];
            const e00 = dens[a0 + k + 1], e01 = dens[a1 + k + 1], e10 = dens[b0 + k + 1], e11 = dens[b1 + k + 1];
            const y0 = k * 8;
            if (d00 <= 0 && d01 <= 0 && d10 <= 0 && d11 <= 0 && e00 <= 0 && e01 <= 0 && e10 <= 0 && e11 <= 0 && y0 > SEA) continue;
            for (let s = 0; s < 8; s++) {
              const fy = s / 8, y = y0 + s, v00 = d00 + (e00 - d00) * fy, v01 = d01 + (e01 - d01) * fy, v10 = d10 + (e10 - d10) * fy, v11 = d11 + (e11 - d11) * fy;
              for (let i = 0; i < 4; i++) {
                const fx = i / 4, l0 = v00 + (v10 - v00) * fx, l1 = v01 + (v11 - v01) * fx;
                for (let j = 0; j < 4; j++) {
                  const v = l0 + (l1 - l0) * (j / 4), t = idx(ix * 4 + i, y, iz * 4 + j);
                  if (v > 0) blocks[t] = B.stone;
                  else if (y <= SEA) blocks[t] = B.water;
                }
              }
            }
          }
        }
        surface(blocks, g, ox, oz, setMeta);
        ores(blocks, cx, cz, g);
        caves(blocks, g, ox, oz);
        // Bedrock floor
        const r = rngOf(hash(seed, cx, cz, 5));
        for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) {
          blocks[idx(x, 0, z)] = B.bedrock;
          for (let y = 1; y < 5; y++) if (r() < 1 - y * .22) blocks[idx(x, y, z)] = B.bedrock;
        }
      }

      const put = (x, y, z, id, m = 0, force = true) => {
        const lx = x - ox, lz = z - oz;
        if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y > 255) return;
        const i = idx(lx, y, lz);
        if (!force && !TREE_OK[blocks[i]]) return;
        blocks[i] = id; setMeta(i, m);
      };
      const inside = (x, z) => x >= ox && x < ox + 16 && z >= oz && z < oz + 16;
      const addBE = (x, y, z, data) => { if (inside(x, z)) be.push({ i: idx(x - ox, y, z - oz), ...data }); };
      const topOf = (lx, lz) => { let y = Math.min(255, height[lx | (lz << 4)] + 12); while (y > 0 && !blocks[idx(lx, y, lz)]) y--; return y; };

      const near = structures ? nearbyVillages(ox, oz, ox + 15, oz + 15) : [];
      const zones = [];
      for (const v of near) for (const p of v.pieces) zones.push(p.f);
      const blockedByVillage = (x, z) => zones.some(f => x >= f.x0 - 2 && x <= f.x1 + 2 && z >= f.z0 - 2 && z <= f.z1 + 2);

      if (!flat) {
        lakes(blocks, cx, cz, g, ox, oz, setMeta);
        // Trees rooted up to one chunk away can overlap this one, so all nine chunks are replayed.
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) trees(cx + dx, cz + dz, put, blockedByVillage);
        plants(blocks, g, cx, cz, ox, oz, put, topOf, blockedByVillage, setMeta);
        if (structures) {
          dungeon(blocks, cx, cz, ox, oz, put, addBE, g);
          const S = 11 * W;
          for (let rx = Math.floor((ox - 24) / S); rx <= Math.floor((ox + 40) / S); rx++) for (let rz = Math.floor((oz - 24) / S); rz <= Math.floor((oz + 40) / S); rz++) {
            const s = singleIn(rx, rz);
            if (s && s.f.x0 <= ox + 15 && s.f.x1 >= ox && s.f.z0 <= oz + 15 && s.f.z1 >= oz) {
              if (near.some(v => v.f.x0 <= s.f.x1 && v.f.x1 >= s.f.x0 && v.f.z0 <= s.f.z1 && v.f.z1 >= s.f.z0)) continue;
              if (s.type === 'temple') temple(s, put, addBE);
              else tower(s, put, addBE, ox, oz);
            }
          }
        }
      }
      for (const v of near) buildVillage(v, ox, oz, put, addBE, blocks);
      if (!flat) snowCover(blocks, g, ox, oz, setMeta);

      const light = new Uint8Array(65536), top = new Uint8Array(256);
      computeLight(blocks, light, top);
      return { cx, cz, blocks, meta, light, top, biome: g.biome.slice(), tint: tints(g), be };
    }

    function surface(blocks, g, ox, oz) {
      for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) {
        const wx = ox + x, wz = oz + z, b = BIOMES[g.biome[x | (z << 4)]], h = g.height[x | (z << 4)];
        const patch = nH.n2(wx / 13 + 90, wz / 13 - 90);
        let run = 0, depth = 3 + Math.floor((patch + 1) * 1.6);
        const steep = !flat && b.id !== Bi.badlands && (b.stonePatches || b.id === Bi.windswept) && (Math.abs(heightAt(wx + 2, wz) - heightAt(wx - 2, wz)) > 5 || Math.abs(heightAt(wx, wz + 2) - heightAt(wx, wz - 2)) > 5);
        for (let y = Math.min(h + 2, 255); y > 2; y--) {
          const i = idx(x, y, z), id = blocks[i];
          if (id !== B.stone) { run = 0; continue; }
          run++;
          if (run > depth + 8) { if (y < h - 40) break; continue; }
          const wet = y < SEA;
          if (b.badlands) {
            if (run === 1 && y < 88) blocks[i] = B.red_sand;
            else if (y > 60) blocks[i] = STRATA[((y + Math.floor(nH.n2(wx / 40, wz / 40) * 3)) & 0xffff) % STRATA.length];
            continue;
          }
          if (wet) {
            if (run > depth) continue;
            if (b.river) blocks[i] = run === 1 && patch > .22 ? B.clay : patch < -.15 ? B.gravel : B.sand;
            else if (b.sea === 2) blocks[i] = patch > .3 ? B.sand : B.gravel;
            else if (b.clayFloor) blocks[i] = run === 1 && patch > .1 ? B.clay : B.dirt;
            else if (b.id === Bi.warm_ocean) blocks[i] = B.sand;
            else blocks[i] = patch > .12 ? B.sand : patch < -.25 ? B.dirt : B.gravel;
            continue;
          }
          if (steep && patch > -.25) continue;
          if (run === 1) {
            let t = b.top;
            if (b.podzol && patch > .22) t = B.podzol;
            if (b.podzol && patch < -.3) t = B.coarse_dirt;
            blocks[i] = t;
          } else if (run <= depth) blocks[i] = b.fill;
          else if (run <= depth + 4 && b.under) blocks[i] = b.under;
        }
      }
    }

    const VEINS = [
      ['coal_ore', 18, 5, 128, 13], ['iron_ore', 12, 5, 64, 8], ['copper_ore', 6, 20, 72, 9], ['gold_ore', 2, 5, 32, 6], ['ruby_ore', 4, 5, 16, 6], ['lapis_ore', 1, 5, 30, 5], ['diamond_ore', .7, 5, 16, 5],
      ['granite', 7, 8, 120, 30], ['diorite', 7, 8, 120, 30], ['andesite', 7, 8, 120, 30], ['gravel', 5, 8, 90, 24], ['dirt', 6, 20, 110, 24],
    ];
    function ores(blocks, cx, cz, g) {
      const r = rngOf(hash(seed, cx, cz, 9));
      const deep = d => { const c = d; return c === B.stone || c === B.deepslate; };
      for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) for (let y = 5; y < 18; y++) {
        const i = idx(x, y, z);
        if (blocks[i] === B.stone && (y < 9 || r() < (18 - y) / 9)) blocks[i] = B.deepslate;
      }
      for (const [k, per, y0, y1, size] of VEINS) {
        const id = B[k];
        const n = Math.floor(per) + (r() < per % 1 ? 1 : 0);
        for (let v = 0; v < n; v++) {
          let x = r() * 16, y = y0 + r() * (y1 - y0), z = r() * 16;
          const a = r() * 6.283, sl = r() * .6 - .3, rad = Math.cbrt(size) * (size > 20 ? .62 : .5), steps = size > 20 ? 4 : 2;
          for (let s = 0; s < steps; s++) {
            const cx0 = Math.round(x), cy0 = Math.round(y), cz0 = Math.round(z), rr = Math.ceil(rad), rr2 = rad * rad;
            for (let dx = -rr; dx <= rr; dx++) for (let dy = -rr; dy <= rr; dy++) for (let dz = -rr; dz <= rr; dz++) {
              const px = cx0 + dx, py = cy0 + dy, pz = cz0 + dz;
              if (px < 0 || px > 15 || pz < 0 || pz > 15 || py < 1 || py > 255) continue;
              if (dx * dx + dy * dy + dz * dz > rr2 + r() * .8) continue;
              const i = idx(px, py, pz);
              if (deep(blocks[i])) blocks[i] = id;
            }
            x += Math.cos(a) * rad * .8; z += Math.sin(a) * rad * .8; y += sl * rad;
          }
        }
      }
      if (BIOMES[g.biome[8 | (8 << 4)]].emerald) for (let n = 0; n < 5; n++) {
        const i = idx(Math.floor(r() * 16), 8 + Math.floor(r() * 60), Math.floor(r() * 16));
        if (blocks[i] === B.stone) blocks[i] = B.emerald_ore;
      }
    }

    // Spaghetti tunnels and cheese caverns share one field sampled every 4 blocks.
    function caves(blocks, g, ox, oz) {
      const top = Math.min(250, Math.max(...g.height) + 8), ny = (top >> 2) + 2, F = new Float32Array(25 * ny);
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
        const wx = ox + i * 4, wz = oz + j * 4;
        for (let k = 0; k < ny; k++) {
          const y = k * 4;
          const a = cA.n3(wx / 44, y / 26, wz / 44), b = cB.n3(wx / 44 + 31, y / 26 + 17, wz / 44 - 23);
          const size = .0058 + (cE.n3(wx / 150, y / 90, wz / 150) + .4) * .0105;
          const spa = (size - (a * a + b * b)) * 42;
          const cheese = cC.fbm3(wx / 82, y / 46, wz / 82, 2) - (.4 + smooth(18, 62, y) * .2);
          F[(i * 5 + j) * ny + k] = Math.max(spa, cheese * 1.4);
        }
      }
      for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 4; iz++) {
        const a0 = (ix * 5 + iz) * ny, a1 = (ix * 5 + iz + 1) * ny, b0 = ((ix + 1) * 5 + iz) * ny, b1 = ((ix + 1) * 5 + iz + 1) * ny;
        for (let k = 0; k < ny - 1; k++) {
          const d00 = F[a0 + k], d01 = F[a1 + k], d10 = F[b0 + k], d11 = F[b1 + k], e00 = F[a0 + k + 1], e01 = F[a1 + k + 1], e10 = F[b0 + k + 1], e11 = F[b1 + k + 1];
          if (d00 <= 0 && d01 <= 0 && d10 <= 0 && d11 <= 0 && e00 <= 0 && e01 <= 0 && e10 <= 0 && e11 <= 0) continue;
          for (let s = 0; s < 4; s++) {
            const fy = s / 4, y = k * 4 + s;
            if (y < 5) continue;
            const v00 = d00 + (e00 - d00) * fy, v01 = d01 + (e01 - d01) * fy, v10 = d10 + (e10 - d10) * fy, v11 = d11 + (e11 - d11) * fy;
            for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
              const fx = i / 4, fz = j / 4, l0 = v00 + (v10 - v00) * fx, l1 = v01 + (v11 - v01) * fx;
              if (l0 + (l1 - l0) * fz <= 0) continue;
              const lx = ix * 4 + i, lz = iz * 4 + j, h = g.height[lx | (lz << 4)], t = idx(lx, y, lz), c = blocks[t];
              if (!c || c === B.water || c === B.bedrock) continue;
              // Keep a roof under seas and most ground, leaving occasional cave mouths.
              const roof = h <= SEA ? 7 : nS.n2((ox + lx) / 61 + 5, (oz + lz) / 61 + 5) > .34 ? 0 : 5;
              if (y > h - roof) continue;
              if (blocks[t + 256] === B.water || (y > SEA - 8 && h <= SEA + 2)) continue;
              blocks[t] = y <= 10 ? B.lava : 0;
            }
          }
        }
      }
    }

    function lakes(blocks, cx, cz, g, ox, oz, setMeta) {
      const r = rngOf(hash(seed, cx, cz, 21));
      if (r() > .05) return;
      const lx = 5 + Math.floor(r() * 6), lz = 5 + Math.floor(r() * 6), h = g.height[lx | (lz << 4)], b = BIOMES[g.biome[lx | (lz << 4)]];
      if (h <= SEA + 1 || h > 110 || b.sea || b.river) return;
      const liquid = r() < .12 && b.id !== Bi.jungle ? B.lava : B.water;
      const rx = 3 + r() * 2, rz = 3 + r() * 2, dp = 2 + Math.floor(r() * 2);
      for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) {
        const d = (x - lx) * (x - lx) / (rx * rx) + (z - lz) * (z - lz) / (rz * rz);
        if (d > 1) continue;
        const dd = Math.ceil(dp * Math.sqrt(1 - d));
        for (let y = h + 3; y > h - dd; y--) {
          const i = idx(x, y, z);
          if (y > h) blocks[i] = 0;
          else if (blocks[i] !== B.bedrock) blocks[i] = y > h - 1 && liquid === B.water ? 0 : liquid;
          setMeta(i, 0);
        }
        const fl = idx(x, h - dd, z);
        if (blocks[fl] && blocks[fl] !== liquid) blocks[fl] = liquid === B.lava ? B.stone : b.top === B.sand ? B.sand : d > .6 ? B.dirt : B.gravel;
      }
    }

    // ---------- Trees ----------
    function trees(cx, cz, put, blocked) {
      const g = grid(cx, cz), mid = BIOMES[g.biome[8 | (8 << 4)]];
      const r = rngOf(hash(seed, cx, cz, 33));
      const dense = nT.n2((cx * 16) / 70 + 3, (cz * 16) / 70 - 8);
      const count = mid.density * (1 + dense * .8);
      const n = Math.floor(count) + (r() < count % 1 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const lx = Math.floor(r() * 16), lz = Math.floor(r() * 16), s = Math.floor(r() * 1e9), pick = r();
        const b = BIOMES[g.biome[lx | (lz << 4)]], h = g.height[lx | (lz << 4)];
        if (!b.trees.length || h <= SEA || h > 200) continue;
        const wx = cx * 16 + lx, wz = cz * 16 + lz;
        if (blocked(wx, wz)) continue;
        if (b.top === B.stone || b.top === B.sand) continue;
        let w = pick * b.trees.reduce((a, t) => a + t[1], 0), type = b.trees[0][0];
        for (const t of b.trees) { w -= t[1]; if (w <= 0) { type = t[0]; break; } }
        const q = rngOf(s);
        put(wx, h, wz, b.top === B.mycelium ? B.mycelium : B.dirt);
        growTree(type, wx, h + 1, wz, q, (x, y, z, id, m = 0) => put(x, y, z, id, m, false), b);
      }
    }

    function growTree(type, x, y, z, r, put, b) {
      const leaf = (species, ax, ay, az, rad, h, cut = .25) => {
        for (let dy = 0; dy < h; dy++) {
          const rr = dy >= h - 1 ? Math.max(1, rad - 1) : rad;
          for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
            if (Math.abs(dx) === rr && Math.abs(dz) === rr && (dy === h - 1 || r() < .5 + cut)) continue;
            put(ax + dx, ay + dy, az + dz, species);
          }
        }
      };
      const trunk = (id, h) => { for (let i = 0; i < h; i++) put(x, y + i, z, id); };
      const blob = (species, ax, ay, az, rx, ry, rz) => {
        const R = Math.ceil(Math.max(rx, ry, rz));
        for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) {
          const d = dx * dx / (rx * rx) + dy * dy / (ry * ry) + dz * dz / (rz * rz);
          if (d <= 1 && (d < .72 || r() > .35)) put(ax + dx, ay + dy, az + dz, species);
        }
      };
      if (type === 'oak' || type === 'swamp_oak') {
        const h = rint(r, 4, 6);
        leaf(B.oak_leaves, x, y + h - 3, z, type === 'swamp_oak' ? 3 : 2, 2);
        leaf(B.oak_leaves, x, y + h - 1, z, 1, 2, -1);
        trunk(B.oak_log, h);
        if (type === 'swamp_oak') vines(x, y + h - 3, z, 4, r, put);
      } else if (type === 'fancy_oak') {
        const h = rint(r, 7, 11);
        trunk(B.oak_log, h);
        blob(B.oak_leaves, x, y + h - 1, z, 4, 3, 4);
        for (let i = 0; i < 4; i++) {
          const a = r() * 6.28, ly = y + 3 + Math.floor(r() * (h - 4)), l = 2 + Math.floor(r() * 2);
          const ex = Math.round(Math.cos(a) * l), ez = Math.round(Math.sin(a) * l);
          blob(B.oak_leaves, x + ex, ly + 1, z + ez, 2.4, 1.7, 2.4);
          for (let s = 1; s <= l; s++) put(x + Math.round(Math.cos(a) * s), ly, z + Math.round(Math.sin(a) * s), B.oak_log, Math.abs(Math.cos(a)) > .7 ? 1 : 2);
        }
      } else if (type === 'birch' || type === 'tall_birch') {
        const h = type === 'birch' ? rint(r, 5, 7) : rint(r, 9, 13);
        leaf(B.birch_leaves, x, y + h - 3, z, 2, 2);
        leaf(B.birch_leaves, x, y + h - 1, z, 1, 2, -1);
        trunk(B.birch_log, h);
      } else if (type === 'cherry') {
        const h = rint(r, 5, 7);
        trunk(B.cherry_log, h);
        blob(B.cherry_leaves, x, y + h, z, 4.2, 2.6, 4.2);
        for (let i = 0; i < 3; i++) {
          const a = i * 2.1 + r(), l = 3;
          for (let s = 1; s <= l; s++) put(x + Math.round(Math.cos(a) * s), y + h - 2 + (s >> 1), z + Math.round(Math.sin(a) * s), B.cherry_log, Math.abs(Math.cos(a)) > .7 ? 1 : 2);
          blob(B.cherry_leaves, x + Math.round(Math.cos(a) * l), y + h, z + Math.round(Math.sin(a) * l), 2.6, 1.6, 2.6);
        }
      } else if (type === 'spruce') {
        const h = rint(r, 7, 11), base = rint(r, 1, 3);
        trunk(B.spruce_log, h);
        let rad = 0, grow = 1;
        for (let ay = y + h + 1; ay >= y + base; ay--) {
          for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
            if (rad && Math.abs(dx) === rad && Math.abs(dz) === rad) continue;
            if (dx || dz || ay >= y + h) put(x + dx, ay, z + dz, B.spruce_leaves);
          }
          if (rad >= grow) { rad = 0; grow = Math.min(3, grow + 1); } else rad++;
        }
      } else if (type === 'pine') {
        const h = rint(r, 9, 13), bare = rint(r, 4, 6);
        trunk(B.spruce_log, h);
        for (let ay = y + bare, i = 0; ay <= y + h + 1; ay++, i++) {
          const rad = Math.max(0, Math.min(2, Math.floor((y + h + 1 - ay) / 2)) - (i % 2 ? 1 : 0));
          for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
            if (rad && Math.abs(dx) === rad && Math.abs(dz) === rad) continue;
            if (dx || dz || ay >= y + h) put(x + dx, ay, z + dz, B.spruce_leaves);
          }
        }
      } else if (type === 'jungle') {
        const h = rint(r, 6, 11);
        trunk(B.jungle_log, h);
        leaf(B.jungle_leaves, x, y + h - 3, z, 3, 2);
        leaf(B.jungle_leaves, x, y + h - 1, z, 2, 2, -1);
        vines(x, y + h - 3, z, 5, r, put);
      } else if (type === 'mega_jungle') {
        const h = rint(r, 14, 24);
        for (let i = 0; i < h; i++) for (const [a, c] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(x + a, y + i, z + c, B.jungle_log);
        blob(B.jungle_leaves, x, y + h, z, 6, 3, 6);
        for (let i = 0; i < 3; i++) {
          const a = r() * 6.28, l = 3 + Math.floor(r() * 3), ly = y + h - 4 - Math.floor(r() * (h >> 1));
          for (let s = 1; s <= l; s++) put(x + Math.round(Math.cos(a) * s), ly + (s >> 1), z + Math.round(Math.sin(a) * s), B.jungle_log, Math.abs(Math.cos(a)) > .7 ? 1 : 2);
          blob(B.jungle_leaves, x + Math.round(Math.cos(a) * l), ly + (l >> 1) + 1, z + Math.round(Math.sin(a) * l), 3, 1.6, 3);
        }
        vines(x, y + h - 6, z, 7, r, put);
      } else if (type === 'bush') {
        put(x, y, z, B.jungle_log);
        blob(B.jungle_leaves, x, y + 1, z, 2.4, 1.6, 2.4);
      } else if (type === 'acacia') {
        const h = rint(r, 4, 6), a = Math.floor(r() * 4), dx = D.DX[a], dz = D.DZ[a], bend = rint(r, 1, 3);
        let ax = x, az = z, ay = y;
        for (let i = 0; i < h; i++) {
          put(ax, ay, az, B.acacia_log);
          if (i >= h - bend - 1) { ax += dx; az += dz; }
          ay++;
        }
        put(ax, ay - 1, az, B.acacia_log);
        leaf(B.acacia_leaves, ax, ay, az, 3, 1);
        leaf(B.acacia_leaves, ax, ay + 1, az, 1, 1, -1);
        if (r() < .6) {
          const a2 = (a + 2) % 4; let bx = x, bz = z, by = y + h - 3;
          for (let i = 0; i < 3; i++) { bx += D.DX[a2]; bz += D.DZ[a2]; by += i & 1; put(bx, by, bz, B.acacia_log); }
          leaf(B.acacia_leaves, bx, by + 1, bz, 2, 1);
        }
      } else if (type === 'dark_oak') {
        const h = rint(r, 6, 9);
        for (let i = 0; i < h; i++) for (const [a, c] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(x + a, y + i, z + c, B.dark_oak_log);
        blob(B.dark_oak_leaves, x, y + h, z, 5, 2.4, 5);
        blob(B.dark_oak_leaves, x + 1, y + h + 1, z + 1, 3.4, 2, 3.4);
      } else if (type === 'huge_red' || type === 'huge_brown') {
        const h = rint(r, 5, 8), red = type === 'huge_red';
        trunk(B.mushroom_stem, h);
        const cap = red ? B.red_mushroom_block : B.brown_mushroom_block;
        if (red) {
          for (let ay = y + h - 3; ay <= y + h; ay++) {
            const rad = ay === y + h ? 1 : 2;
            for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
              if (ay < y + h && Math.abs(dx) < rad && Math.abs(dz) < rad) continue;
              if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
              put(x + dx, ay, z + dz, cap);
            }
          }
        } else {
          for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (Math.abs(dx) + Math.abs(dz) < 6) put(x + dx, y + h, z + dz, cap);
        }
      }
      if (b && b.vines && type === 'oak') vines(x, y + 2, z, 3, r, put);
    }
    function vines(x, y, z, rad, r, put) {
      for (let n = 0; n < rad * 2; n++) {
        const a = Math.floor(r() * 4), off = 1 + Math.floor(r() * rad), side = Math.floor(r() * (rad * 2 + 1)) - rad;
        const vx = x + D.DX[a] * off + D.DZ[a] * side, vz = z + D.DZ[a] * off + D.DX[a] * side, len = 2 + Math.floor(r() * 5);
        for (let i = 0; i < len; i++) put(vx, y + 1 - i, vz, B.vine, (a + 2) % 4);
      }
    }

    function plants(blocks, g, cx, cz, ox, oz, put, topOf, blocked) {
      const r = rngOf(hash(seed, cx, cz, 41));
      const b0 = BIOMES[g.biome[8 | (8 << 4)]];
      const empty = i => !blocks[i];
      const onSoil = (lx, lz, fn) => {
        const y = topOf(lx, lz), i = idx(lx, y, lz);
        if (y < 1 || y > 250 || !SOIL[blocks[i]] || !empty(i + 256)) return;
        fn(y + 1, BIOMES[g.biome[lx | (lz << 4)]]);
      };
      for (let n = 0; n < b0.grass; n++) {
        const lx = Math.floor(r() * 16), lz = Math.floor(r() * 16);
        onSoil(lx, lz, (y, b) => { if (b.grass) blocks[idx(lx, y, lz)] = b.ferns && r() < .35 ? B.fern : B.short_grass; });
      }
      if (b0.flowers && r() < b0.flowerChance) {
        const px = Math.floor(r() * 16), pz = Math.floor(r() * 16), kind = b0.flowers[Math.floor(r() * b0.flowers.length)];
        for (let n = 0; n < (b0.flowerTries || 7); n++) {
          const lx = clamp(px + Math.floor(r() * 8) - 4, 0, 15), lz = clamp(pz + Math.floor(r() * 8) - 4, 0, 15);
          const id = b0.flowerTries ? b0.flowers[Math.floor(r() * b0.flowers.length)] : kind;
          onSoil(lx, lz, y => { blocks[idx(lx, y, lz)] = id; });
        }
      }
      if (b0.mushrooms && r() < b0.mushrooms) {
        const id = r() < .5 ? B.red_mushroom : B.brown_mushroom;
        for (let n = 0; n < 5; n++) { const lx = Math.floor(r() * 16), lz = Math.floor(r() * 16); onSoil(lx, lz, y => { blocks[idx(lx, y, lz)] = id; }); }
      }
      if (r() < .012 && !b0.sea) { const lx = Math.floor(r() * 16), lz = Math.floor(r() * 16); onSoil(lx, lz, y => { blocks[idx(lx, y, lz)] = B.pumpkin; }); }
      if (b0.melons && r() < b0.melons) for (let n = 0; n < 4; n++) { const lx = Math.floor(r() * 16), lz = Math.floor(r() * 16); onSoil(lx, lz, y => { blocks[idx(lx, y, lz)] = B.melon; }); }
      for (let n = 0; n < (b0.cactus || 0); n++) {
        const lx = 1 + Math.floor(r() * 14), lz = 1 + Math.floor(r() * 14), y = topOf(lx, lz), i = idx(lx, y, lz);
        if (blocks[i] !== B.sand && blocks[i] !== B.red_sand) continue;
        const tall = 1 + Math.floor(r() * 3);
        for (let k = 1; k <= tall; k++) {
          const c = idx(lx, y + k, lz);
          if (blocks[c] || blocks[c + 1] || blocks[c - 1] || blocks[c + 16] || blocks[c - 16]) break;
          blocks[c] = B.cactus;
        }
      }
      for (let n = 0; n < (b0.dead || 0); n++) {
        const lx = Math.floor(r() * 16), lz = Math.floor(r() * 16), y = topOf(lx, lz), i = idx(lx, y, lz);
        if ((blocks[i] === B.sand || blocks[i] === B.red_sand || blocks[i] === B.terracotta) && empty(i + 256)) blocks[i + 256] = B.dead_bush;
      }
      // Sugar cane grows on banks right next to water.
      for (let n = 0; n < (b0.cane || 3); n++) {
        const lx = 1 + Math.floor(r() * 14), lz = 1 + Math.floor(r() * 14), y = topOf(lx, lz), i = idx(lx, y, lz);
        if (y !== SEA && y !== SEA + 1) continue;
        if (!(SOIL[blocks[i]] || blocks[i] === B.sand) || !empty(i + 256)) continue;
        if (blocks[i + 1] !== B.water && blocks[i - 1] !== B.water && blocks[i + 16] !== B.water && blocks[i - 16] !== B.water) continue;
        const tall = 2 + Math.floor(r() * 3);
        for (let k = 1; k <= tall; k++) blocks[idx(lx, y + k, lz)] = B.sugar_cane;
      }
      // Water plants
      if (b0.lily) for (let n = 0; n < b0.lily; n++) {
        const lx = Math.floor(r() * 16), lz = Math.floor(r() * 16), y = topOf(lx, lz);
        if (blocks[idx(lx, y, lz)] === B.water) blocks[idx(lx, y + 1, lz)] = B.lily_pad;
      }
      const waterPlants = b0.sea && b0.id !== Bi.frozen_ocean ? 26 : b0.river ? 8 : 0;
      for (let n = 0; n < waterPlants; n++) {
        const lx = Math.floor(r() * 16), lz = Math.floor(r() * 16);
        let y = SEA;
        while (y > 1 && blocks[idx(lx, y, lz)] === B.water) y--;
        if (blocks[idx(lx, y + 1, lz)] !== B.water || !blocks[idx(lx, y, lz)] || SEA - y < 3) continue;
        if (b0.sea && r() < .32 && SEA - y > 5) {
          const tall = 2 + Math.floor(r() * Math.min(10, SEA - y - 2));
          for (let k = 1; k <= tall; k++) blocks[idx(lx, y + k, lz)] = B.kelp;
        } else blocks[idx(lx, y + 1, lz)] = B.seagrass;
      }
    }

    function snowCover(blocks, g, ox, oz, setMeta) {
      for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) {
        const b = BIOMES[g.biome[x | (z << 4)]], h = g.height[x | (z << 4)];
        const cold = b.cold || (h > 132 && b.emerald && b.id !== Bi.stony_peaks);
        if (!cold) continue;
        let y = Math.min(254, h + 30);
        while (y > 1 && !blocks[idx(x, y, z)]) y--;
        const i = idx(x, y, z), id = blocks[i];
        if (id === B.water) {
          if (nS.n2((ox + x) / 12, (oz + z) / 12) > -.35) blocks[i] = B.ice;
        } else if (id !== B.lava && id !== B.snow && (OPAQUE[id] || D.blocks[id].decay) && !D.blocks[id].waterlogged && id !== B.snow_block) {
          blocks[i + 256] = B.snow; setMeta(i + 256, 0);
        }
      }
    }

    function dungeon(blocks, cx, cz, ox, oz, put, addBE, g) {
      const r = rngOf(hash(seed, cx, cz, 61));
      if (r() > .1) return;
      const y = 10 + Math.floor(r() * 38), lx = 4 + Math.floor(r() * 8), lz = 4 + Math.floor(r() * 8);
      if (y > g.height[lx | (lz << 4)] - 8) return;
      for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = -1; dy <= 4; dy++) {
        const i = idx(lx + dx, y + dy, lz + dz), edge = Math.abs(dx) === 4 || Math.abs(dz) === 4 || dy === -1 || dy === 4;
        if (lx + dx < 0 || lx + dx > 15 || lz + dz < 0 || lz + dz > 15) continue;
        if (blocks[i] === B.water || blocks[i] === B.lava) { blocks[i] = B.cobblestone; continue; }
        if (edge) { if (blocks[i]) blocks[i] = r() < .35 ? B.mossy_cobblestone : B.cobblestone; }
        else blocks[i] = 0;
      }
      const mob = ['zombie', 'zombie', 'skeleton', 'spider'][Math.floor(r() * 4)];
      blocks[idx(lx, y, lz)] = B.spawner;
      addBE(ox + lx, y, oz + lz, { type: 'spawner', mob, delay: 200 });
      const chests = 1 + Math.floor(r() * 2);
      for (let n = 0; n < chests; n++) {
        const a = n ? 1 : -1, cxz = idx(lx + a * 3, y, lz - a * 3);
        blocks[cxz] = B.chest;
        addBE(ox + lx + a * 3, y, oz + lz - a * 3, { type: 'chest', items: rollLoot('dungeon', r) });
      }
    }

    function temple(s, put, addBE) {
      const r = rngOf(s.seed), sb = B.sandstone, { x, y, z } = s;
      const fl = y;
      for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) {
        for (let dy = fl - 6; dy <= fl; dy++) put(x + dx, dy, z + dz, sb);
        const d = Math.max(Math.abs(dx), Math.abs(dz));
        for (let dy = 1; dy <= 12; dy++) {
          const layer = 11 - d;
          put(x + dx, fl + dy, z + dz, dy <= layer ? sb : 0);
        }
      }
      for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) for (let dy = 1; dy <= 4; dy++) put(x + dx, fl + dy, z + dz, 0);
      for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) if (Math.abs(dx) === Math.abs(dz) && Math.abs(dx) <= 4) put(x + dx, fl, z + dz, B.orange_terracotta);
      for (let dz = -10; dz <= -5; dz++) for (let dy = 1; dy <= 3; dy++) for (const dx of [0, 1]) put(x + dx, fl + dy, z + dz, 0);
      for (const dx of [-4, 4]) for (const dz of [-4, 4]) for (let dy = 1; dy <= 4; dy++) put(x + dx, fl + dy, z + dz, B.red_sandstone);
      for (const dx of [-3, 3]) {
        put(x + dx, fl + 1, z + 4, B.chest);
        addBE(x + dx, fl + 1, z + 4, { type: 'chest', items: rollLoot('temple', r) });
      }
      put(x, fl + 1, z + 3, B.spawner);
      addBE(x, fl + 1, z + 3, { type: 'spawner', mob: 'zombie', delay: 200 });
      put(x - 2, fl + 3, z - 2, B.torch); put(x + 2, fl + 3, z - 2, B.torch);
      put(x - 4, fl + 2, z, B.lantern); put(x + 4, fl + 2, z, B.lantern);
    }

    function tower(s, put, addBE) {
      const r = rngOf(s.seed), { x, y, z } = s, tall = 8 + Math.floor(r() * 6);
      const wr = (a, b, c) => { const k = hash(a, b, c, s.seed); return ((k >>> 0) % 100); };
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
        const d = Math.max(Math.abs(dx), Math.abs(dz));
        for (let dy = -4; dy <= 0; dy++) if (d <= 2 || Math.abs(dx) + Math.abs(dz) <= 4) put(x + dx, y + dy, z + dz, B.cobblestone);
        for (let dy = 1; dy <= tall + 3; dy++) {
          if (Math.abs(dx) + Math.abs(dz) > 4 || d > 3) continue;
          const wall = d === 3 || Math.abs(dx) + Math.abs(dz) === 4;
          if (!wall) { put(x + dx, y + dy, z + dz, dy % 5 === 0 && dy < tall && !(dx === 1 && dz === 1) ? B.oak_planks : 0); continue; }
          // Upper wall crumbles away.
          const gone = (dy - tall * .55) * 9;
          const k = wr(x + dx, y + dy, z + dz);
          if (dy > tall) { put(x + dx, y + dy, z + dz, 0); continue; }
          if (k < gone) { put(x + dx, y + dy, z + dz, 0); continue; }
          put(x + dx, y + dy, z + dz, k % 3 === 0 ? B.mossy_cobblestone : k % 7 === 0 ? B.cracked_stone_bricks : B.cobblestone);
        }
      }
      for (let dy = 1; dy <= 2; dy++) put(x, y + dy, z - 3, 0);
      for (let dy = 1; dy <= tall; dy++) put(x + 1, y + dy, z + 2, B.ladder, 1);
      put(x - 1, y + 1, z + 1, B.chest);
      addBE(x - 1, y + 1, z + 1, { type: 'chest', items: rollLoot('tower', r) });
      if (r() < .6) {
        put(x + 1, y + 11 < y + tall ? y + 11 : y + 6, z - 1, B.chest);
        addBE(x + 1, y + 11 < y + tall ? y + 11 : y + 6, z - 1, { type: 'chest', items: rollLoot('tower', r) });
      }
      put(x - 1, y + 3, z - 1, B.torch);
    }

    function buildVillage(v, ox, oz, put, addBE, blocks) {
      const st = v.st;
      // Roads follow the ground; water gets a plank walkway.
      for (const rd of v.roads) for (let s = -2; s <= rd.len; s++) for (let w = -1; w <= 1; w++) {
        const x = rd.x + rd.dx * s - rd.dz * w, z = rd.z + rd.dz * s + rd.dx * w;
        if (x < ox || x >= ox + 16 || z < oz || z >= oz + 16) continue;
        const h = heightAt(x, z);
        if (h < SEA) put(x, SEA, z, st.wall);
        else {
          for (let y = h + 1; y < h + 8; y++) { const i = idx(x - ox, y, z - oz); if (D.blocks[blocks[i]].shape === 'cross' || D.blocks[blocks[i]].decay || blocks[i] === B.snow) blocks[i] = 0; }
          put(x, h, z, st.path);
        }
      }
      for (const p of v.pieces) if (p.f.x0 - 2 <= ox + 15 && p.f.x1 + 2 >= ox && p.f.z0 - 2 <= oz + 15 && p.f.z1 + 2 >= oz) piece(p, st, put, addBE, v);
    }

    function piece(p, st, put, addBE) {
      const r = rngOf(p.seed), y0 = p.y;
      const P = (dx, dy, dz, id, m = 0) => { const [a, c] = rotXZ(p.rot, dx, dz); put(p.x + a, y0 + dy, p.z + c, id, m); };
      const be = (dx, dy, dz, data) => { const [a, c] = rotXZ(p.rot, dx, dz); addBE(p.x + a, y0 + dy, p.z + c, data); };
      const F = f => (f + p.rot) % 4;
      const ground = (w, d, floor) => {
        for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < d; dz++) {
          for (let dy = -6; dy < 0; dy++) P(dx, dy, dz, st.base);
          P(dx, 0, dz, floor);
          for (let dy = 1; dy < 14; dy++) P(dx, dy, dz, 0);
        }
      };
      const door = (dx, dz, f) => { P(dx, 1, dz, st.door, f); P(dx, 2, dz, st.door, f | 8); };
      const walls = (w, d, h) => {
        for (let dy = 1; dy <= h; dy++) for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < d; dz++) {
          const ex = dx === 0 || dx === w - 1, ez = dz === 0 || dz === d - 1;
          if (ex && ez) P(dx, dy, dz, st.post);
          else if (ex || ez) P(dx, dy, dz, st.wall);
        }
      };
      const roof = (w, d, h) => {
        // A pitched roof whose ridge runs along local z. Rafters step up from both long sides.
        const half = (w + 1) >> 1;
        for (let i = 0; i < half; i++) for (let dz = -1; dz <= d; dz++) {
          const y = h + 1 + i;
          P(i - 1 + 0, y, dz, st.roof, F(0));
          P(w - i, y, dz, st.roof, F(2));
          if (dz === -1 || dz === d) continue;
          if (dz === 0 || dz === d - 1) for (let dx = i; dx < w - i; dx++) P(dx, y, dz, st.wall);
        }
        if (w % 2) for (let dz = -1; dz <= d; dz++) P(w >> 1, h + half + 0, dz, st.roofFlat);
      };
      if (p.type === 'well') {
        ground(5, 5, st.base);
        for (let dx = 1; dx <= 3; dx++) for (let dz = 1; dz <= 3; dz++) { P(dx, 0, dz, B.water); P(dx, -1, dz, B.water); P(dx, -2, dz, B.water); }
        for (let dx = 0; dx < 5; dx++) for (let dz = 0; dz < 5; dz++) if (dx === 0 || dz === 0 || dx === 4 || dz === 4) { P(dx, 0, dz, st.base); P(dx, 1, dz, st.base); }
        for (const [a, c] of [[1, 1], [3, 1], [1, 3], [3, 3]]) for (let dy = 1; dy <= 3; dy++) P(a, dy, c, st.fence);
        for (let dx = 1; dx <= 3; dx++) for (let dz = 1; dz <= 3; dz++) P(dx, 4, dz, st.roofFlat);
      } else if (p.type === 'lamp') {
        P(0, 0, 0, st.base);
        for (let dy = 1; dy <= 3; dy++) P(0, dy, 0, st.fence);
        P(0, 4, 0, B.lantern);
      } else if (p.type === 'small') {
        ground(5, 5, st.floor);
        walls(5, 5, 3);
        door(2, 0, F(1));
        P(0, 2, 2, B.glass_pane); P(4, 2, 2, B.glass_pane); P(2, 2, 4, B.glass_pane);
        roof(5, 5, 3);
        P(1, 1, 3, B.bed, F(3)); P(1, 1, 2, B.bed, F(3) | 4);
        P(3, 1, 3, B.chest, F(3));
        be(3, 1, 3, { type: 'chest', items: rollLoot('house', r) });
        P(2, 3, 1, B.torch, 0 + 1 + F(3));
      } else if (p.type === 'long') {
        ground(7, 5, st.wall);
        walls(7, 5, 3);
        door(3, 0, F(1));
        P(1, 2, 0, B.glass_pane); P(5, 2, 0, B.glass_pane); P(0, 2, 2, B.glass_pane); P(6, 2, 2, B.glass_pane); P(3, 2, 4, B.glass_pane);
        roof(7, 5, 3);
        P(1, 1, 3, B.bed, F(3)); P(1, 1, 2, B.bed, F(3) | 4);
        P(5, 1, 3, B.crafting_table);
        P(4, 1, 3, B.chest, F(3));
        be(4, 1, 3, { type: 'chest', items: rollLoot('house', r) });
        P(5, 1, 1, st.fence); P(5, 2, 1, st.roofFlat);
        P(3, 3, 3, B.torch, 1 + F(1));
      } else if (p.type === 'smith') {
        ground(7, 6, B.cobblestone);
        for (let dy = 1; dy <= 3; dy++) for (let dx = 0; dx < 7; dx++) for (let dz = 2; dz < 6; dz++) {
          const ex = dx === 0 || dx === 6, ez = dz === 2 || dz === 5;
          if (ex && ez) P(dx, dy, dz, st.post);
          else if (ex || ez) P(dx, dy, dz, B.cobblestone);
        }
        for (let dx = 0; dx < 7; dx++) for (let dz = 0; dz < 6; dz++) P(dx, 4, dz, st.roofFlat);
        for (const dx of [0, 6]) for (let dy = 1; dy <= 3; dy++) P(dx, dy, 0, st.fence);
        door(3, 2, F(1));
        P(1, 1, 1, B.furnace, F(1)); P(5, 1, 1, B.lava); P(5, 0, 1, B.cobblestone); P(4, 1, 1, B.cobblestone); P(6, 1, 1, B.cobblestone); P(5, 1, 0, B.cobblestone);
        P(2, 1, 1, B.iron_block);
        P(1, 1, 4, B.chest, F(3));
        be(1, 1, 4, { type: 'chest', items: rollLoot('smith', r) });
        P(5, 1, 4, B.crafting_table);
        P(3, 3, 4, B.torch, 1 + F(1));
      } else if (p.type === 'farm') {
        ground(9, 7, B.dirt);
        const crop = [B.wheat, B.wheat, B.carrots, B.potatoes][Math.floor(r() * 4)], top = crop === B.wheat ? 7 : 3;
        for (let dx = 0; dx < 9; dx++) for (let dz = 0; dz < 7; dz++) {
          if (dx === 0 || dz === 0 || dx === 8 || dz === 6) P(dx, 0, dz, st.post, dx === 0 || dx === 8 ? 2 : 1);
          else if (dx === 4) P(dx, 0, dz, B.water);
          else { P(dx, 0, dz, B.farmland, 1); P(dx, 1, dz, crop, Math.floor(r() * (top + 1))); }
        }
      } else if (p.type === 'chapel') {
        ground(5, 7, st.floor);
        walls(5, 7, 4);
        door(2, 0, F(1));
        for (let dy = 5; dy <= 10; dy++) for (let dx = 0; dx < 5; dx++) for (let dz = 2; dz < 7; dz++) {
          const ex = dx === 0 || dx === 4, ez = dz === 2 || dz === 6;
          if (ex && ez) P(dx, dy, dz, st.post);
          else if (ex || ez) P(dx, dy, dz, dy >= 8 && dy <= 9 && (dx === 2 || dz === 4) ? B.iron_bars : st.wall);
          else if (dy === 5) P(dx, dy, dz, st.wall);
        }
        for (let dx = 0; dx < 5; dx++) for (let dz = 2; dz < 7; dz++) P(dx, 11, dz, st.roofFlat);
        for (let dx = 0; dx < 5; dx++) for (let dz = 0; dz < 2; dz++) P(dx, 5, dz, st.roofFlat);
        for (let dy = 1; dy <= 9; dy++) P(2, dy, 5, B.ladder, F(1));
        P(2, 5, 5, B.ladder, F(1));
        P(0, 2, 3, B.glass_pane); P(4, 2, 3, B.glass_pane);
        P(1, 1, 5, B.chest, F(3));
        be(1, 1, 5, { type: 'chest', items: rollLoot('house', r) });
        P(3, 3, 3, B.torch, 1 + F(2));
      }
    }

    function tints(g) {
      // grass rgb then water rgb for every column, blended from the 5 x 5 climate grid.
      const out = new Uint8Array(256 * 6), cols = [];
      for (let i = 0; i < 25; i++) {
        const p = g.P[i], b = biomeOf(p, p.h);
        const c = grassRGB(p.t, p.w);
        if (b === Bi.swamp) { c[0] = 96; c[1] = 112; c[2] = 56; }
        if (b === Bi.badlands) { c[0] = 144; c[1] = 129; c[2] = 77; }
        if (b === Bi.mushroom_fields) { c[0] = 85; c[1] = 201; c[2] = 63; }
        if (b === Bi.cherry_grove) { c[0] = 144; c[1] = 208; c[2] = 124; }
        const w = BIOMES[b].sea && p.t > .42 ? [67, 213, 238] : BIOMES[b].cold ? [57, 96, 201] : b === Bi.swamp ? [97, 123, 100] : [63, 118, 228];
        cols.push(c, w);
      }
      for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) {
        const ix = x >> 2, iz = z >> 2, fx = (x & 3) / 4, fz = (z & 3) / 4, o = (x | (z << 4)) * 6;
        for (let k = 0; k < 2; k++) for (let c = 0; c < 3; c++) {
          const a = cols[(ix * 5 + iz) * 2 + k][c], b = cols[(ix * 5 + iz + 1) * 2 + k][c], d = cols[((ix + 1) * 5 + iz) * 2 + k][c], e = cols[((ix + 1) * 5 + iz + 1) * 2 + k][c];
          out[o + k * 3 + c] = lerp(lerp(a, b, fz), lerp(d, e, fz), fx);
        }
      }
      return out;
    }

    // A dry, reasonably flat place near the origin.
    function spawnPoint(preferVillage) {
      if (flat) return { x: 8, y: 5, z: 8 };
      if (preferVillage && structures) {
        const S = PIECE_REGION * W;
        let best = null;
        for (let rx = -3; rx <= 3; rx++) for (let rz = -3; rz <= 3; rz++) {
          const v = villageIn(rx, rz);
          if (!v) continue;
          const d = v.x * v.x + v.z * v.z;
          if (!best || d < best.d) best = { d, v };
        }
        if (best && best.d < S * S * 16) return { x: best.v.x + 5, y: heightAt(best.v.x + 5, best.v.z + 5) + 2, z: best.v.z + 5, village: true };
      }
      for (let ring = 0; ring < 40; ring++) {
        const steps = Math.max(1, ring * 8);
        for (let i = 0; i < steps; i++) {
          const a = i / steps * 6.283, x = Math.round(Math.cos(a) * ring * 12), z = Math.round(Math.sin(a) * ring * 12);
          const h = heightAt(x, z), b = biomeAt(x, z);
          if (h <= SEA + 1 || h > 100 || b.sea || b.river || b.top === B.stone) continue;
          if (slopeAt(x, z, 3) > 2) continue;
          return { x: x + .5, y: h + 2, z: z + .5 };
        }
      }
      return { x: .5, y: Math.max(heightAt(0, 0), SEA) + 2, z: .5 };
    }

    // Nearest structure of a type, for the /locate command.
    function locate(what, x, z) {
      if (what !== 'village') {
        const S = 11 * W;
        let best = null;
        const rx0 = Math.floor(x / S), rz0 = Math.floor(z / S);
        for (let rx = rx0 - 12; rx <= rx0 + 12; rx++) for (let rz = rz0 - 12; rz <= rz0 + 12; rz++) {
          const s = singleIn(rx, rz);
          if (!s || s.type !== what) continue;
          const d = Math.hypot(s.x - x, s.z - z);
          if (!best || d < best.d) best = { d, x: s.x, y: s.y, z: s.z };
        }
        return best;
      }
      const S = PIECE_REGION * W;
      let best = null;
      const rx0 = Math.floor(x / S), rz0 = Math.floor(z / S);
      for (let rx = rx0 - 8; rx <= rx0 + 8; rx++) for (let rz = rz0 - 8; rz <= rz0 + 8; rz++) {
        const v = villageIn(rx, rz);
        if (!v) continue;
        const d = Math.hypot(v.x - x, v.z - z);
        if (!best || d < best.d) best = { d, x: v.x, y: v.y, z: v.z };
      }
      return best;
    }

    return { chunk, spawnPoint, locate, growTree, heightAt, biomeAt };
  }

  // Skylight falls straight down, block light floods from emitters. Packed as sky << 4 | block.
  const lightQ = new Int32Array(65536 * 4), lowest = new Uint8Array(256);
  function computeLight(blocks, light, top) {
    let qh = 0, qt = 0;
    const Q = lightQ;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      let lvl = 15, t = -1, low = 0;
      for (let y = 255; y >= 0; y--) {
        const i = (y << 8) | (z << 4) | x, id = blocks[i], o = OP[id];
        if (o) { lvl -= o; if (t < 0) t = y; }
        if (lvl <= 0) { low = y; break; }
        light[i] = lvl << 4;
      }
      top[x | (z << 4)] = t < 0 ? 0 : t;
      lowest[x | (z << 4)] = low;
    }
    // Sunlit cells beside a taller column leak sideways under its overhang, including light filtered by leaves.
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      const h = lowest[x | (z << 4)];
      let m = h;
      if (x > 0) m = Math.max(m, top[(x - 1) | (z << 4)]);
      if (x < 15) m = Math.max(m, top[(x + 1) | (z << 4)]);
      if (z > 0) m = Math.max(m, top[x | ((z - 1) << 4)]);
      if (z < 15) m = Math.max(m, top[x | ((z + 1) << 4)]);
      for (let y = h; y <= m; y++) { const i = (y << 8) | (z << 4) | x; if (light[i] >> 4 > 1) Q[qt++] = i; }
    }
    for (let n = 0; n < 2; n++) {
      if (n === 1) {
        qh = qt = 0;
        for (let i = 0; i < 65536; i++) { const e = EMIT[blocks[i]]; if (e) { light[i] = (light[i] & 0xf0) | e; Q[qt++] = i; } }
      }
      const shift = n ? 0 : 4, mask = n ? 0x0f : 0xf0, keep = n ? 0xf0 : 0x0f;
      while (qh < qt) {
        const i = Q[qh++], L = (light[i] & mask) >> shift;
        if (L < 2) continue;
        const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
        for (let f = 0; f < 6; f++) {
          let j;
          if (f === 0) { if (x === 15) continue; j = i + 1; }
          else if (f === 1) { if (x === 0) continue; j = i - 1; }
          else if (f === 2) { if (z === 15) continue; j = i + 16; }
          else if (f === 3) { if (z === 0) continue; j = i - 16; }
          else if (f === 4) { if (y === 255) continue; j = i + 256; }
          else { if (y === 0) continue; j = i - 256; }
          const o = OP[blocks[j]];
          if (o >= 15) continue;
          const nl = !n && f === 5 && !o ? L : L - Math.max(1, o);
          if (nl > (light[j] & mask) >> shift) {
            light[j] = (light[j] & keep) | (nl << shift);
            if (nl > 1) { if (qt >= Q.length) { if (qh > 0) { Q.copyWithin(0, qh, qt); qt -= qh; qh = 0; } else continue; } Q[qt++] = j; }
          }
        }
      }
    }
  }

  return { create, BIOMES, SEA, HEIGHT, computeLight, hash, rngOf };
})();
if (typeof module !== 'undefined') module.exports = CraftGen;
