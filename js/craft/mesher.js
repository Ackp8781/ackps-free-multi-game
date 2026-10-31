// Turns one 16 x 16 x 16 section of blocks into vertex arrays, with smooth lighting and corner shading.
const CraftMesher = (() => {
  const D = CraftData, { blocks: DEF, OPAQUE, FLUID } = D;
  const P1 = 1, PZ = 18, PY = 324;
  const padB = new Uint8Array(5832), padL = new Uint8Array(5832), padM = new Uint8Array(5832);
  const MAX_QUADS = 24576;
  const bucket = () => ({ pos: new Int16Array(MAX_QUADS * 12), uv: new Uint16Array(MAX_QUADS * 8), tint: new Uint8Array(MAX_QUADS * 16), light: new Uint8Array(MAX_QUADS * 16), n: 0 });
  let O = null, T = null;
  const FACES = [
    { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 153 },
    { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 153 },
    { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 255 },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 128 },
    { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 204 },
    { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 204 },
  ];
  const UVC = [[0, 1], [1, 1], [1, 0], [0, 0]];
  const NOFF = FACES.map(f => f.n[0] * P1 + f.n[2] * PZ + f.n[1] * PY);
  // For each face and corner: pad offsets of the two side cells and the diagonal, relative to the block.
  const AOOFF = FACES.map(f => f.c.map(c => {
    const axes = [0, 1, 2].filter(a => !f.n[a]), W = [P1, PY, PZ];
    const a = (c[axes[0]] ? 1 : -1) * W[axes[0]], b = (c[axes[1]] ? 1 : -1) * W[axes[1]], o = f.n[0] * P1 + f.n[2] * PZ + f.n[1] * PY;
    return [o + a, o + b, o + a + b];
  }));
  const AOK = [.42, .6, .78, 1];
  const SHAPE = new Uint8Array(256), TILE = new Int16Array(256 * 6), SLOW = new Uint8Array(256), CUTLEAF = new Uint8Array(256), TINTK = new Uint8Array(256), WAVE = new Uint8Array(256), CONN_F = new Uint8Array(256), CONN_P = new Uint8Array(256);
  const S_CUBE = 1, S_CROSS = 2, S_CROP = 3, S_FLUID = 4, S_BOX = 5, S_FIRE = 6;
  let inited = false, TW = 2048, fancy = true;
  const tileCache = new Map();
  const name2 = n => CraftTex.tileIndex(n);
  const FRONT_FACE = [0, 4, 1, 5];
  const tileName = (d, m, f) => {
    const t = d.tex;
    if (d.door) return t + (m & 8 ? '_top' : '_bottom');
    if (d.stages) return t + '_' + Math.min(d.stages - 1, m);
    if (d.key === 'farmland' && f === 2 && m) return d.wetTex;
    if (d.shape === 'bed' && f === 2) return m & 4 ? 'bed_head' : 'bed_foot';
    if (typeof t === 'string') return t;
    if (d.axis) {
      const a = m & 3;
      if (a === 1) return f < 2 ? t.top : t.side;
      if (a === 2) return f >= 4 ? t.top : t.side;
      return f === 2 || f === 3 ? t.top : t.side;
    }
    if (f === 2) return t.top;
    if (f === 3) return t.bottom;
    if (t.front && FRONT_FACE[m & 3] === f) return t.front;
    return t.side;
  };
  const tileFor = (id, m, f) => {
    if (!SLOW[id]) return TILE[id * 6 + f];
    const k = id * 65536 + m * 8 + f;
    let v = tileCache.get(k);
    if (v === undefined) tileCache.set(k, v = name2(tileName(DEF[id], m, f)));
    return v;
  };
  function init() {
    if (inited) return;
    inited = true;
    O = bucket(); T = bucket();
    TW = Math.round(65536 / CraftTex.build().COLS);
    for (const d of DEF) {
      const id = d.id, s = d.shape;
      SHAPE[id] = s === 'none' ? 0 : s === 'cube' ? S_CUBE : s === 'cross' ? S_CROSS : s === 'crop' ? S_CROP : s === 'fluid' ? S_FLUID : s === 'fire' ? S_FIRE : S_BOX;
      SLOW[id] = d.door || d.stages || d.axis || d.facing || d.key === 'farmland' || s === 'bed' ? 1 : 0;
      CUTLEAF[id] = d.decay ? 1 : 0;
      TINTK[id] = d.tint === 'grass' ? 1 : d.tint === 'foliage' ? 2 : d.tint === 'water' ? 3 : 0;
      WAVE[id] = d.wave || 0;
      if (s === 'fence') CONN_F[id] = 1;
      if (s === 'pane') CONN_P[id] = 1;
      if (d.key === 'glass' || d.key.endsWith('stained_glass')) CONN_P[id] = 1;
      if (id && !SLOW[id] && s !== 'none') for (let f = 0; f < 6; f++) TILE[id * 6 + f] = name2(tileName(d, 0, f));
    }
    for (let i = 0; i < 256; i++) if (OPAQUE[i]) { CONN_F[i] = 1; CONN_P[i] = 1; }
  }
  const setFancy = v => { fancy = v; };
  const conn = (table, p) => (table[padB[p + P1]] ? 1 : 0) | (table[padB[p + PZ]] ? 2 : 0) | (table[padB[p - P1]] ? 4 : 0) | (table[padB[p - PZ]] ? 8 : 0);

  function vert(b, x, y, z, u, v, tr, tg, tb, sh, sky, blk, anim, wave) {
    const n = b.n, i = n * 3, pos = b.pos;
    pos[i] = x * 64; pos[i + 1] = y * 64; pos[i + 2] = z * 64;
    b.uv[n * 2] = u; b.uv[n * 2 + 1] = v;
    const j = n * 4, t = b.tint, l = b.light;
    t[j] = tr; t[j + 1] = tg; t[j + 2] = tb; t[j + 3] = sh;
    l[j] = sky; l[j + 1] = blk; l[j + 2] = anim; l[j + 3] = wave;
    b.n = n + 1;
  }
  const uvOf = (tile, a, c) => [(tile % 32) * TW + 3 + Math.round(a * (TW - 6)), (tile >> 5) * TW + 3 + Math.round(c * (TW - 6))];

  function build(world, chunk, sy) {
    init();
    const cx = chunk.cx, cz = chunk.cz, y0 = sy * 16, nb = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) nb.push(world.chunkAt(cx + dx, cz + dz));
    // Copy the section plus a one block rim, so every neighbour lookup below is a plain array read.
    for (let y = -1; y <= 16; y++) {
      const wy = y0 + y, py = (y + 1) * PY;
      if (wy < 0 || wy > 255) {
        const sky = wy > 255 ? 0xf0 : 0;
        for (let i = 0; i < PY; i++) { padB[py + i] = 0; padL[py + i] = sky; padM[py + i] = 0; }
        continue;
      }
      for (let z = -1; z <= 16; z++) {
        const iz = z < 0 ? 0 : z > 15 ? 2 : 1, lz = z & 15, row = py + (z + 1) * PZ;
        for (let x = -1; x <= 16; x++) {
          const ix = x < 0 ? 0 : x > 15 ? 2 : 1, c = nb[iz * 3 + ix], p = row + x + 1;
          if (!c) { padB[p] = 0; padL[p] = 0xf0; padM[p] = 0; continue; }
          const i = (wy << 8) | (lz << 4) | (x & 15);
          padB[p] = c.blocks[i]; padL[p] = c.light[i]; padM[p] = c.meta ? c.meta[i] : 0;
        }
      }
    }
    O.n = 0; T.n = 0;
    const tintArr = chunk.tint;
    for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) {
      const row = (y + 1) * PY + (z + 1) * PZ + 1;
      for (let x = 0; x < 16; x++) {
        const p = row + x, id = padB[p];
        if (!id) continue;
        const sh = SHAPE[id];
        let tr = 255, tg = 255, tb = 255;
        const tk = TINTK[id];
        if (tk) {
          const o = (x | (z << 4)) * 6;
          if (tk === 1) { tr = tintArr[o]; tg = tintArr[o + 1]; tb = tintArr[o + 2]; }
          else if (tk === 2) { tr = tintArr[o] * .82; tg = tintArr[o + 1] * .92; tb = tintArr[o + 2] * .72; }
          else { tr = tintArr[o + 3]; tg = tintArr[o + 4]; tb = tintArr[o + 5]; }
        }
        if (sh === S_CUBE) cube(p, id, x, y, z, tr, tg, tb);
        else if (sh === S_CROSS) cross(p, id, x, y, z, tr, tg, tb, y0, cx, cz);
        else if (sh === S_CROP) crop(p, id, x, y, z, tr, tg, tb);
        else if (sh === S_FLUID) fluid(p, id, x, y, z, tr, tg, tb);
        else if (sh === S_BOX) box(p, id, x, y, z, tr, tg, tb);
        else if (sh === S_FIRE) fire(p, id, x, y, z);
      }
    }
    return { O: take(O), T: take(T), vis: visibility() };
  }
  const take = b => b.n ? { pos: b.pos.slice(0, b.n * 3), uv: b.uv.slice(0, b.n * 2), tint: b.tint.slice(0, b.n * 4), light: b.light.slice(0, b.n * 4), quads: b.n >> 2 } : null;

  const shadeAt = new Float32Array(4), skyAt = new Float32Array(4), blkAt = new Float32Array(4), aoAt = new Uint8Array(4);
  function cube(p, id, x, y, z, tr, tg, tb) {
    const d = DEF[id], b = d.trans ? T : O, m = padM[p], wave = WAVE[id] === 2 ? 2 : 0, leaf = CUTLEAF[id], same = d.cullSame;
    for (let f = 0; f < 6; f++) {
      const q = p + NOFF[f], nid = padB[q];
      if (OPAQUE[nid] || (same && nid === id) || (leaf && !fancy && CUTLEAF[nid])) continue;
      const face = FACES[f], tile = tileFor(id, m, f), offs = AOOFF[f];
      const baseL = padL[q], e = d.light > 12 ? 15 : 0;
      for (let c = 0; c < 4; c++) {
        const o = offs[c], a = p + o[0], e2 = p + o[1], g = p + o[2], s1 = OPAQUE[padB[a]], s2 = OPAQUE[padB[e2]], cc = OPAQUE[padB[g]];
        let sky = baseL >> 4, blk = baseL & 15, cnt = 1;
        if (!s1) { const l = padL[a]; sky += l >> 4; blk += l & 15; cnt++; }
        if (!s2) { const l = padL[e2]; sky += l >> 4; blk += l & 15; cnt++; }
        if (!cc && !(s1 && s2)) { const l = padL[g]; sky += l >> 4; blk += l & 15; cnt++; }
        const ao = s1 && s2 ? 0 : 3 - s1 - s2 - cc;
        aoAt[c] = ao; skyAt[c] = sky / cnt * 17; blkAt[c] = Math.max(blk / cnt * 17, e * 17); shadeAt[c] = face.shade * AOK[ao];
      }
      // Rotate the diagonal so corner shading never shows a crease.
      const start = aoAt[0] + aoAt[2] < aoAt[1] + aoAt[3] ? 1 : 0;
      const rot = d.axis ? (((m & 3) === 1 && f >= 2) || ((m & 3) === 2 && f < 4) ? 1 : 0) : 0;
      const tu = (tile % 32) * TW + 3, tv = (tile >> 5) * TW + 3, ts = TW - 6;
      for (let k = 0; k < 4; k++) {
        const c = (k + start) & 3, v = face.c[c], uv = UVC[(c + rot) & 3];
        vert(b, x + v[0], y + v[1], z + v[2], tu + uv[0] * ts, tv + uv[1] * ts, tr, tg, tb, shadeAt[c], skyAt[c], blkAt[c], 0, wave);
      }
    }
  }
  function quad(b, a, c, e, g, tile, tr, tg, tb, sh, sky, blk, anim, wv, top) {
    // Corners run bottom left, bottom right, top right, top left. Plants sway only at the top.
    const t = tile, u0 = (t % 32) * TW + 3, v0 = (t >> 5) * TW + 3, s = TW - 6;
    vert(b, a[0], a[1], a[2], u0, v0 + s, tr, tg, tb, sh, sky, blk, anim, top ? 0 : wv);
    vert(b, c[0], c[1], c[2], u0 + s, v0 + s, tr, tg, tb, sh, sky, blk, anim, top ? 0 : wv);
    vert(b, e[0], e[1], e[2], u0 + s, v0, tr, tg, tb, sh, sky, blk, anim, wv);
    vert(b, g[0], g[1], g[2], u0, v0, tr, tg, tb, sh, sky, blk, anim, wv);
  }
  function plane(b, x0, y0, z0, x1, y1, z1, tile, tr, tg, tb, sh, sky, blk, anim, wv) {
    // A flat upright card, visible from both sides.
    const a = [x0, y0, z0], c = [x1, y0, z1], e = [x1, y1, z1], g = [x0, y1, z0];
    quad(b, a, c, e, g, tile, tr, tg, tb, sh, sky, blk, anim, wv, true);
    quad(b, c, a, g, e, tile, tr, tg, tb, sh, sky, blk, anim, wv, true);
  }
  function cross(p, id, x, y, z, tr, tg, tb, y0, cx, cz) {
    const l = padL[p], sky = (l >> 4) * 17, blk = (l & 15) * 17, tile = tileFor(id, padM[p], 2), w = WAVE[id];
    let ox = 0, oz = 0;
    if (w && DEF[id].replace) {
      const h = Math.imul((cx * 16 + x) * 3129871 ^ (cz * 16 + z) * 116129781, 0x2d2d) >>> 8;
      ox = ((h & 15) / 15 - .5) * .28; oz = (((h >> 4) & 15) / 15 - .5) * .28;
    }
    const a = .15, e = .85;
    plane(O, x + a + ox, y, z + a + oz, x + e + ox, y + .95, z + e + oz, tile, tr, tg, tb, 225, sky, blk, 0, w);
    plane(O, x + a + ox, y, z + e + oz, x + e + ox, y + .95, z + a + oz, tile, tr, tg, tb, 225, sky, blk, 0, w);
  }
  function crop(p, id, x, y, z, tr, tg, tb) {
    const l = padL[p], sky = (l >> 4) * 17, blk = (l & 15) * 17, tile = tileFor(id, padM[p], 2), w = WAVE[id], h = -1 / 16;
    for (const a of [.25, .75]) {
      plane(O, x + a, y + h, z, x + a, y + 1 + h, z + 1, tile, tr, tg, tb, 225, sky, blk, 0, w);
      plane(O, x, y + h, z + a, x + 1, y + 1 + h, z + a, tile, tr, tg, tb, 225, sky, blk, 0, w);
    }
  }
  function fire(p, id, x, y, z) {
    const tile = CraftTex.tileIndex('fire');
    for (const a of [.12, .88]) {
      plane(O, x + a, y, z, x + a, y + 1.1, z + 1, tile, 255, 255, 255, 255, 255, 255, 1, 0);
      plane(O, x, y, z + a, x + 1, y + 1.1, z + a, tile, 255, 255, 255, 255, 255, 255, 1, 0);
    }
  }
  const fluidKind = id => FLUID[id];
  function heightOf(p, kind) {
    const id = padB[p];
    if (fluidKind(id) !== kind) return -1;
    if (fluidKind(padB[p + PY]) === kind) return 1;
    const l = padM[p] & 7;
    if (padM[p] >= 8) return .889;
    return DEF[id].waterlogged || !l ? .889 : (8 - l) / 9;
  }
  function corner(p, kind, dx, dz) {
    // Averages the heights of the four fluid columns that meet at this corner.
    let sum = 0, n = 0;
    for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) {
      const q = p + (a ? dx : 0) * P1 + (c ? dz : 0) * PZ, h = heightOf(q, kind);
      if (h === 1) return 1;
      if (h >= 0) { const w = h >= .889 ? 4 : 1; sum += h * w; n += w; }
      else if (!OPAQUE[padB[q]]) n++;
    }
    return n ? sum / n : .889;
  }
  function fluid(p, id, x, y, z, tr, tg, tb) {
    const kind = FLUID[id], b = kind === 1 ? T : O, tile = CraftTex.tileIndex(kind === 1 ? 'water' : 'lava');
    const up = padB[p + PY], hasAbove = fluidKind(up) === kind;
    const h00 = hasAbove ? 1 : corner(p, kind, -1, -1), h10 = hasAbove ? 1 : corner(p, kind, 1, -1), h11 = hasAbove ? 1 : corner(p, kind, 1, 1), h01 = hasAbove ? 1 : corner(p, kind, -1, 1);
    const lit = q => { const l = padL[q], own = padL[p]; return [Math.max(l >> 4, own >> 4) * 17, kind === 2 ? 255 : Math.max(l & 15, own & 15) * 17]; };
    const u0 = (tile % 32) * TW + 3, v0 = (tile >> 5) * TW + 3, s = TW - 6, wv = kind === 1 ? 3 : 0;
    if (!hasAbove && !OPAQUE[up]) {
      const [sky, blk] = lit(p + PY);
      const wave = h00 >= .85 && h10 >= .85 && h11 >= .85 && h01 >= .85 ? wv : 0;
      vert(b, x, y + h01, z + 1, u0, v0 + s, tr, tg, tb, 255, sky, blk, 1, wave);
      vert(b, x + 1, y + h11, z + 1, u0 + s, v0 + s, tr, tg, tb, 255, sky, blk, 1, wave);
      vert(b, x + 1, y + h10, z, u0 + s, v0, tr, tg, tb, 255, sky, blk, 1, wave);
      vert(b, x, y + h00, z, u0, v0, tr, tg, tb, 255, sky, blk, 1, wave);
      if (kind === 1) {
        vert(b, x, y + h00, z, u0, v0, tr, tg, tb, 200, sky, blk, 1, wave);
        vert(b, x + 1, y + h10, z, u0 + s, v0, tr, tg, tb, 200, sky, blk, 1, wave);
        vert(b, x + 1, y + h11, z + 1, u0 + s, v0 + s, tr, tg, tb, 200, sky, blk, 1, wave);
        vert(b, x, y + h01, z + 1, u0, v0 + s, tr, tg, tb, 200, sky, blk, 1, wave);
      }
    }
    const below = padB[p - PY];
    if (fluidKind(below) !== kind && !OPAQUE[below]) {
      const [sky, blk] = lit(p - PY);
      vert(b, x, y, z, u0, v0 + s, tr, tg, tb, 128, sky, blk, 1, 0);
      vert(b, x + 1, y, z, u0 + s, v0 + s, tr, tg, tb, 128, sky, blk, 1, 0);
      vert(b, x + 1, y, z + 1, u0 + s, v0, tr, tg, tb, 128, sky, blk, 1, 0);
      vert(b, x, y, z + 1, u0, v0, tr, tg, tb, 128, sky, blk, 1, 0);
    }
    const sides = [
      [NOFF[0], x + 1, z + 1, x + 1, z, h11, h10, 153], [NOFF[1], x, z, x, z + 1, h00, h01, 153],
      [NOFF[4], x, z + 1, x + 1, z + 1, h01, h11, 204], [NOFF[5], x + 1, z, x, z, h10, h00, 204],
    ];
    for (const [off, ax, az, bx, bz, ha, hb, shade] of sides) {
      const q = p + off, n = padB[q];
      if (fluidKind(n) === kind || OPAQUE[n]) continue;
      const [sky, blk] = lit(q);
      vert(b, ax, y, az, u0, v0 + s, tr, tg, tb, shade, sky, blk, 1, 0);
      vert(b, bx, y, bz, u0 + s, v0 + s, tr, tg, tb, shade, sky, blk, 1, 0);
      vert(b, bx, y + hb, bz, u0 + s, v0 + s * (1 - hb), tr, tg, tb, shade, sky, blk, 1, 0);
      vert(b, ax, y + ha, az, u0, v0 + s * (1 - ha), tr, tg, tb, shade, sky, blk, 1, 0);
    }
  }
  function box(p, id, x, y, z, tr, tg, tb) {
    const d = DEF[id], m = padM[p], b = d.trans ? T : O;
    const cn = d.shape === 'fence' ? conn(CONN_F, p) : d.shape === 'pane' ? conn(CONN_P, p) : 0;
    const parts = D.shape(id, m, cn).vis, l = padL[p];
    const sky = (l >> 4) * 17, blk = (l & 15) * 17, wv = WAVE[id];
    for (let bi = 0; bi < parts.length; bi++) {
      const B = parts[bi], sx = B[6] || 0, sz = B[7] || 0;
      for (let f = 0; f < 6; f++) {
        const face = FACES[f], n = face.n;
        // Skip faces pressed flat against a solid neighbour.
        const edge = (n[0] > 0 && B[3] >= 1) || (n[0] < 0 && B[0] <= 0) || (n[1] > 0 && B[4] >= 1) || (n[1] < 0 && B[1] <= 0) || (n[2] > 0 && B[5] >= 1) || (n[2] < 0 && B[2] <= 0);
        const q = p + NOFF[f];
        if (edge && OPAQUE[padB[q]]) continue;
        const tile = tileFor(id, m, f), tu = (tile % 32) * TW + 3, tv = (tile >> 5) * TW + 3, ts = TW - 6;
        const lq = edge ? padL[q] : l;
        const sk = Math.max(sky, (lq >> 4) * 17), bl = Math.max(blk, (lq & 15) * 17);
        for (let c = 0; c < 4; c++) {
          const v = face.c[c], vx = v[0] ? B[3] : B[0], vy = v[1] ? B[4] : B[1], vz = v[2] ? B[5] : B[2];
          let u, w;
          if (f === 0) { u = 1 - vz; w = 1 - vy; }
          else if (f === 1) { u = vz; w = 1 - vy; }
          else if (f === 2) { u = vx; w = vz; }
          else if (f === 3) { u = vx; w = 1 - vz; }
          else if (f === 4) { u = vx; w = 1 - vy; }
          else { u = 1 - vx; w = 1 - vy; }
          const off = sx || sz ? B[4] - vy : 0;
          vert(b, x + vx + sx * off, y + vy, z + vz + sz * off, tu + u * ts, tv + w * ts, tr, tg, tb, face.shade, sk, bl, 0, wv && v[1] ? wv : 0);
        }
      }
    }
  }

  // Which pairs of section faces can see each other through non-opaque cells.
  const seen = new Uint8Array(4096), stack = new Int16Array(4096);
  const PAIR = [];
  { let n = 0; for (let a = 0; a < 6; a++) { PAIR[a] = []; for (let b = 0; b < 6; b++) { if (a === b) PAIR[a][b] = -1; else if (a < b) PAIR[a][b] = n++; else PAIR[a][b] = PAIR[b][a]; } } }
  function visibility() {
    seen.fill(0);
    let out = 0;
    for (let start = 0; start < 4096; start++) {
      if (seen[start]) continue;
      const sx = start & 15, sz = (start >> 4) & 15, sy = start >> 8;
      if (OPAQUE[padB[(sy + 1) * PY + (sz + 1) * PZ + sx + 1]]) { seen[start] = 1; continue; }
      let top = 0, mask = 0;
      stack[top++] = start; seen[start] = 1;
      while (top) {
        const i = stack[--top], x = i & 15, z = (i >> 4) & 15, y = i >> 8;
        if (x === 15) mask |= 1; if (x === 0) mask |= 2; if (y === 15) mask |= 4; if (y === 0) mask |= 8; if (z === 15) mask |= 16; if (z === 0) mask |= 32;
        const visit = (j, a, c, e) => {
          if (seen[j]) return;
          seen[j] = 1;
          if (!OPAQUE[padB[(c + 1) * PY + (e + 1) * PZ + a + 1]]) stack[top++] = j;
        };
        if (x < 15) visit(i + 1, x + 1, y, z);
        if (x > 0) visit(i - 1, x - 1, y, z);
        if (z < 15) visit(i + 16, x, y, z + 1);
        if (z > 0) visit(i - 16, x, y, z - 1);
        if (y < 15) visit(i + 256, x, y + 1, z);
        if (y > 0) visit(i - 256, x, y - 1, z);
      }
      for (let a = 0; a < 6; a++) if (mask & (1 << a)) for (let b = a + 1; b < 6; b++) if (mask & (1 << b)) out |= 1 << PAIR[a][b];
    }
    return out;
  }
  return { build, PAIR, FACES, setFancy, tileFor, init };
})();
