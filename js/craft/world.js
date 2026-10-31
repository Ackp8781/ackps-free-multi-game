// BlockCraft world store: chunk streaming through workers, flood-fill lighting, block access and saves.
const CraftDB = (() => {
  // Worlds can outgrow localStorage quickly, so they live in IndexedDB.
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((ok, no) => {
    if (!window.indexedDB) return no(new Error('no indexedDB'));
    const r = indexedDB.open('amg-blockcraft', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('worlds', { keyPath: 'id' }); r.result.createObjectStore('chunks'); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  }));
  const tx = async (store, mode, f) => {
    const db = await open();
    return new Promise((ok, no) => {
      const t = db.transaction(store, mode), req = f(t.objectStore(store));
      t.oncomplete = () => ok(req && req.result);
      t.onerror = () => no(t.error);
      t.onabort = () => no(t.error);
    });
  };
  const memory = new Map();
  const safe = (p, d) => p.catch(() => d);
  return {
    worlds: owner => safe(tx('worlds', 'readonly', s => s.getAll()).then(a => a.filter(w => w.owner === owner).sort((a, b) => b.played - a.played)), [...memory.values()]),
    world: id => safe(tx('worlds', 'readonly', s => s.get(id)), memory.get(id)),
    putWorld: w => safe(tx('worlds', 'readwrite', s => s.put(w)), memory.set(w.id, w)),
    async deleteWorld(id) {
      await safe(tx('worlds', 'readwrite', s => s.delete(id)));
      await safe(tx('chunks', 'readwrite', s => s.delete(IDBKeyRange.bound(id + ':', id + ':￿'))));
      memory.delete(id);
    },
    chunk: (id, cx, cz) => safe(tx('chunks', 'readonly', s => s.get(id + ':' + cx + ',' + cz)), null),
    putChunk: (id, cx, cz, v) => safe(tx('chunks', 'readwrite', s => s.put(v, id + ':' + cx + ',' + cz))),
    async allChunks(id) {
      const out = [];
      await safe(open().then(db => new Promise(ok => {
        const t = db.transaction('chunks', 'readonly'), r = t.objectStore('chunks').openCursor(IDBKeyRange.bound(id + ':', id + ':￿'));
        r.onsuccess = () => { const c = r.result; if (c) { out.push([c.key.slice(id.length + 1), c.value]); c.continue(); } else ok(); };
        r.onerror = () => ok();
      })));
      return out;
    },
  };
})();

const CraftWorld = (() => {
  const D = CraftData, { OP, EMIT, OPAQUE } = D;
  const key = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
  const SIDE = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  function create(o) {
    const chunks = new Map();
    let lastK = -1, lastC = null;
    const chunkAt = (cx, cz) => {
      const k = key(cx, cz);
      if (k === lastK) return lastC;
      const c = chunks.get(k);
      if (c) { lastK = k; lastC = c; }
      return c;
    };
    const get = (x, y, z) => {
      if (y < 0 || y > 255) return 0;
      const c = chunkAt(x >> 4, z >> 4);
      return c ? c.blocks[(y << 8) | ((z & 15) << 4) | (x & 15)] : 0;
    };
    const getMeta = (x, y, z) => {
      if (y < 0 || y > 255) return 0;
      const c = chunkAt(x >> 4, z >> 4);
      return c && c.meta ? c.meta[(y << 8) | ((z & 15) << 4) | (x & 15)] : 0;
    };
    const lightAt = (x, y, z) => {
      if (y > 255) return 0xf0;
      if (y < 0) return 0;
      const c = chunkAt(x >> 4, z >> 4);
      return c ? c.light[(y << 8) | ((z & 15) << 4) | (x & 15)] : 0xf0;
    };
    const loaded = (x, z) => !!chunkAt(x >> 4, z >> 4);
    const top = (x, z) => { const c = chunkAt(x >> 4, z >> 4); return c ? c.top[(x & 15) | ((z & 15) << 4)] : 0; };
    const biome = (x, z) => { const c = chunkAt(x >> 4, z >> 4); return c ? c.biome[(x & 15) | ((z & 15) << 4)] : 0; };

    // ---------- Sections ----------
    const queue = [];
    const allMeshed = [];
    const dirtySec = s => { s.dirty = true; if (!s.queued) { s.queued = true; queue.push(s); } };
    const markDirty = (x, y, z) => {
      const lx = x & 15, ly = y & 15, lz = z & 15;
      const x0 = lx === 0 ? -1 : 0, x1 = lx === 15 ? 1 : 0, z0 = lz === 0 ? -1 : 0, z1 = lz === 15 ? 1 : 0, y0 = ly === 0 ? -1 : 0, y1 = ly === 15 ? 1 : 0;
      for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) {
        const c = chunkAt((x + a) >> 4, (z + b) >> 4);
        if (!c) continue;
        for (let e = y0; e <= y1; e++) { const sy = (y + e) >> 4; if (sy >= 0 && sy < 16) dirtySec(c.sec[sy]); }
      }
    };

    // ---------- Lighting ----------
    const Q = new Int32Array(1 << 21), RQ = new Int32Array(1 << 19);
    let qh = 0, qt = 0;
    const pushQ = (x, y, z) => { if (qt + 3 > Q.length) return; Q[qt++] = x; Q[qt++] = y; Q[qt++] = z; };
    const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];
    const flood = sky => {
      const shift = sky ? 4 : 0, mask = sky ? 0xf0 : 0x0f, keep = sky ? 0x0f : 0xf0;
      while (qh < qt) {
        const x = Q[qh++], y = Q[qh++], z = Q[qh++];
        const c = chunkAt(x >> 4, z >> 4);
        if (!c) continue;
        const L = (c.light[(y << 8) | ((z & 15) << 4) | (x & 15)] & mask) >> shift;
        if (L < 2) continue;
        for (let f = 0; f < 6; f++) {
          const d = DIRS[f], nx = x + d[0], ny = y + d[1], nz = z + d[2];
          if (ny < 0 || ny > 255) continue;
          const nc = chunkAt(nx >> 4, nz >> 4);
          if (!nc) continue;
          const i = (ny << 8) | ((nz & 15) << 4) | (nx & 15), op = OP[nc.blocks[i]];
          if (op >= 15) continue;
          const nl = sky && f === 5 && !op ? L : L - Math.max(1, op);
          if (nl > (nc.light[i] & mask) >> shift) {
            nc.light[i] = (nc.light[i] & keep) | (nl << shift);
            markDirty(nx, ny, nz);
            if (nl > 1) pushQ(nx, ny, nz);
          }
        }
      }
      qh = qt = 0;
    };
    const unflood = (x0, y0, z0, sky) => {
      // Darkens everything that drew its light from this cell, and re-seeds from whatever is left.
      const shift = sky ? 4 : 0, mask = sky ? 0xf0 : 0x0f, keep = sky ? 0x0f : 0xf0;
      let rh = 0, rt = 0;
      const start = chunkAt(x0 >> 4, z0 >> 4);
      if (!start) return;
      const si = (y0 << 8) | ((z0 & 15) << 4) | (x0 & 15), L0 = (start.light[si] & mask) >> shift;
      start.light[si] &= keep;
      markDirty(x0, y0, z0);
      RQ[rt++] = x0; RQ[rt++] = y0; RQ[rt++] = z0; RQ[rt++] = L0;
      while (rh < rt) {
        const x = RQ[rh++], y = RQ[rh++], z = RQ[rh++], L = RQ[rh++];
        for (let f = 0; f < 6; f++) {
          const d = DIRS[f], nx = x + d[0], ny = y + d[1], nz = z + d[2];
          if (ny < 0 || ny > 255) continue;
          const nc = chunkAt(nx >> 4, nz >> 4);
          if (!nc) continue;
          const i = (ny << 8) | ((nz & 15) << 4) | (nx & 15), nl = (nc.light[i] & mask) >> shift;
          if (!nl) continue;
          if (nl < L || (sky && f === 5 && nl === L)) {
            nc.light[i] &= keep;
            markDirty(nx, ny, nz);
            if (rt + 4 <= RQ.length) { RQ[rt++] = nx; RQ[rt++] = ny; RQ[rt++] = nz; RQ[rt++] = nl; }
            const e = !sky && EMIT[nc.blocks[i]];
            if (e) { nc.light[i] = (nc.light[i] & keep) | e; pushQ(nx, ny, nz); }
          } else pushQ(nx, ny, nz);
        }
      }
    };
    const relight = (c, x, y, z, i, oldId, newId) => {
      if (OP[oldId] === OP[newId] && EMIT[oldId] === EMIT[newId]) return;
      // Block light
      qh = qt = 0;
      unflood(x, y, z, false);
      if (EMIT[newId]) { c.light[i] = (c.light[i] & 0xf0) | EMIT[newId]; pushQ(x, y, z); }
      if (OP[newId] < 15) for (const d of DIRS) { const ny = y + d[1]; if (ny >= 0 && ny <= 255 && lightAt(x + d[0], ny, z + d[2]) & 15) pushQ(x + d[0], ny, z + d[2]); }
      flood(false);
      // Skylight
      if (OP[oldId] !== OP[newId]) {
        qh = qt = 0;
        unflood(x, y, z, true);
        if (OP[newId] < 15) {
          const above = y >= 255 ? 15 : lightAt(x, y + 1, z) >> 4;
          if (above && !OP[newId]) { c.light[i] = (c.light[i] & 0x0f) | (above << 4); pushQ(x, y, z); }
          for (const d of DIRS) { const ny = y + d[1]; if (ny >= 0 && ny <= 255 && lightAt(x + d[0], ny, z + d[2]) >> 4) pushQ(x + d[0], ny, z + d[2]); }
        }
        flood(true);
      }
    };
    const mergeBorder = (a, b, xAxis, sky) => {
      // a sits on the low side of b. Pushes light across the shared wall in both directions.
      const mask = sky ? 0xf0 : 0x0f, shift = sky ? 4 : 0;
      for (let y = 0; y < 256; y++) for (let t = 0; t < 16; t++) {
        const ia = xAxis ? (y << 8) | (t << 4) | 15 : (y << 8) | (15 << 4) | t;
        const ib = xAxis ? (y << 8) | (t << 4) : (y << 8) | t;
        const la = (a.light[ia] & mask) >> shift, lb = (b.light[ib] & mask) >> shift;
        if (la === lb) continue;
        if (la > lb) { if (la > 1 && OP[b.blocks[ib]] < 15 && la - Math.max(1, OP[b.blocks[ib]]) > lb) pushQ(a.cx * 16 + (xAxis ? 15 : t), y, a.cz * 16 + (xAxis ? t : 15)); }
        else if (lb > 1 && OP[a.blocks[ia]] < 15 && lb - Math.max(1, OP[a.blocks[ia]]) > la) pushQ(b.cx * 16 + (xAxis ? 0 : t), y, b.cz * 16 + (xAxis ? t : 0));
      }
    };

    // ---------- Blocks ----------
    const setMeta = (c, i, m) => { if (m) { if (!c.meta) c.meta = new Uint8Array(65536); c.meta[i] = m; } else if (c.meta) c.meta[i] = 0; };
    // Returns true when the world changed. Unloaded chunks keep the edit until they load.
    const set = (x, y, z, id, m = 0) => {
      if (y < 0 || y > 255) return false;
      const c = chunkAt(x >> 4, z >> 4), i = (y << 8) | ((z & 15) << 4) | (x & 15);
      if (!c) {
        const k = key(x >> 4, z >> 4);
        (pendingEdits.get(k) || pendingEdits.set(k, new Map()).get(k)).set(i, id | (m << 8));
        return false;
      }
      const old = c.blocks[i], oldM = c.meta ? c.meta[i] : 0;
      if (old === id && oldM === m) return false;
      c.blocks[i] = id; setMeta(c, i, m);
      c.edits.set(i, id | (m << 8)); c.changed = true;
      const sec = c.sec[y >> 4];
      sec.count += (id ? 1 : 0) - (old ? 1 : 0);
      markDirty(x, y, z);
      if (old !== id) {
        const col = (x & 15) | ((z & 15) << 4);
        if (OP[id] && y > c.top[col]) c.top[col] = y;
        else if (!OP[id] && y === c.top[col]) { let t = y; while (t > 0 && !OP[c.blocks[(t << 8) | ((z & 15) << 4) | (x & 15)]]) t--; c.top[col] = t; }
        relight(c, x, y, z, i, old, id);
      }
      return true;
    };
    const beAt = (x, y, z) => { const c = chunkAt(x >> 4, z >> 4); return c ? c.be.get((y << 8) | ((z & 15) << 4) | (x & 15)) : null; };
    const setBE = (x, y, z, v) => {
      const c = chunkAt(x >> 4, z >> 4);
      if (!c) return;
      const i = (y << 8) | ((z & 15) << 4) | (x & 15);
      if (v) c.be.set(i, v); else c.be.delete(i);
      if (!c.beDirty) c.beDirty = new Set();
      c.beDirty.add(i); c.changed = true;
    };
    const touchBE = (x, y, z) => { const c = chunkAt(x >> 4, z >> 4); if (!c) return; const i = (y << 8) | ((z & 15) << 4) | (x & 15); if (!c.beDirty) c.beDirty = new Set(); c.beDirty.add(i); c.changed = true; };

    // ---------- Streaming ----------
    const pendingEdits = new Map();
    const inflight = new Set();
    const workers = [];
    let useWorkers = true, gen = null, jobId = 1;
    const resolvers = new Map();
    const startWorkers = () => {
      const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
      try {
        for (let i = 0; i < n; i++) {
          const w = new Worker('js/craft/genworker.js?v=' + (o.version || 1));
          w.busy = 0;
          w.onmessage = ({ data: m }) => {
            if (m.t === 'chunk') { w.busy--; received(m.c); }
            else { const f = resolvers.get(m.id); resolvers.delete(m.id); if (f) f(m.p); }
          };
          w.onerror = () => { useWorkers = false; };
          w.postMessage({ t: 'init', settings: o.settings });
          workers.push(w);
        }
      } catch (e) { useWorkers = false; }
    };
    startWorkers();
    const localGen = () => gen || (gen = CraftGen.create(o.settings));
    const ask = (t, data) => new Promise(ok => {
      if (useWorkers && workers.length) { const id = jobId++; resolvers.set(id, ok); workers[0].postMessage({ t, id, ...data }); }
      else ok(t === 'spawn' ? localGen().spawnPoint(data.village) : localGen().locate(data.what, data.x, data.z));
    });
    const stored = new Map(); // Results waiting for their saved edits to load.
    const received = c => {
      const k = key(c.cx, c.cz);
      if (!inflight.has(k)) return;
      if (o.loadChunk) o.loadChunk(c.cx, c.cz).then(saved => { if (inflight.has(k)) integrate(c, saved, k); });
      else integrate(c, null, k);
    };
    const nbKeys = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    const makeSection = (c, sy) => ({ c, sy, opaque: null, trans: null, vis: 0x7fff, dirty: false, queued: false, count: 0, stamp: 0, enter: 0, listIndex: -1, x: c.cx * 16, y: sy * 16, z: c.cz * 16 });
    function integrate(raw, saved, k) {
      inflight.delete(k);
      const c = { cx: raw.cx, cz: raw.cz, blocks: raw.blocks, meta: raw.meta, light: raw.light, top: raw.top, biome: raw.biome, tint: raw.tint, edits: new Map(), be: new Map(), beDirty: null, sec: [], changed: false, nb: [null, null, null, null], ready: false, dead: false };
      for (const e of raw.be) { const { i, ...rest } = e; c.be.set(i, rest); }
      let touched = false;
      if (saved) {
        const e = saved.e;
        if (e) for (let n = 0; n < e.length; n += 2) {
          const v = e[n + 1], i = e[n], id = v & 255, m = v >> 8;
          c.blocks[i] = id;
          if (m || c.meta) setMeta(c, i, m);
          c.edits.set(i, v);
          touched = true;
        }
        if (saved.b) for (const [i, v] of saved.b) {
          if (v) c.be.set(i, v); else c.be.delete(i);
          if (!c.beDirty) c.beDirty = new Set();
          c.beDirty.add(i);
        }
      }
      const pend = pendingEdits.get(k);
      if (pend) {
        for (const [i, v] of pend) { c.blocks[i] = v & 255; const m = v >> 8; if (m || c.meta) setMeta(c, i, m); c.edits.set(i, v); }
        pendingEdits.delete(k);
        touched = true; c.changed = true;
      }
      if (touched) { c.light.fill(0); CraftGen.computeLight(c.blocks, c.light, c.top); }
      for (let sy = 0; sy < 16; sy++) c.sec.push(makeSection(c, sy));
      for (let y = 0; y < 256; y++) {
        let n = 0;
        const row = y << 8;
        for (let i = 0; i < 256; i++) if (c.blocks[row | i]) n++;
        c.sec[y >> 4].count += n;
      }
      chunks.set(k, c);
      if (lastK === k) lastK = -1;
      // Stitch into the neighbours and let light cross the borders.
      SIDE.forEach(([dx, dz], f) => {
        const n = chunkAt(c.cx + dx, c.cz + dz);
        if (!n) return;
        c.nb[f] = n; n.nb[(f + 2) % 4] = c;
      });
      for (let pass = 0; pass < 2; pass++) {
        qh = qt = 0;
        SIDE.forEach(([dx, dz], f) => {
          const n = c.nb[f];
          if (!n) return;
          if (f === 0) mergeBorder(c, n, true, pass === 0);
          else if (f === 1) mergeBorder(c, n, false, pass === 0);
          else if (f === 2) mergeBorder(n, c, true, pass === 0);
          else mergeBorder(n, c, false, pass === 0);
        });
        flood(pass === 0);
      }
      const check = q => {
        if (q.ready) return;
        for (const [dx, dz] of nbKeys) if (!chunkAt(q.cx + dx, q.cz + dz)) return;
        q.ready = true;
        for (const s of q.sec) if (s.count) dirtySec(s);
      };
      check(c);
      for (const [dx, dz] of nbKeys) { const n = chunkAt(c.cx + dx, c.cz + dz); if (n) check(n); }
      // Sections touching the new chunk may need new faces or light along the seam.
      SIDE.forEach((_, f) => { const n = c.nb[f]; if (n && n.ready) for (const s of n.sec) if (s.count) dirtySec(s); });
      if (o.onChunk) o.onChunk(c);
      version++;
    }
    const encode = c => {
      const e = [];
      for (const [i, v] of c.edits) e.push(i, v);
      let b = null;
      if (c.beDirty && c.beDirty.size) { b = []; for (const i of c.beDirty) b.push([i, c.be.get(i) || null]); }
      return { e, b };
    };
    const saveChunk = c => { if (c.changed && o.saveChunk) { o.saveChunk(c.cx, c.cz, encode(c)); c.changed = false; } };
    const saveAll = () => { for (const c of chunks.values()) saveChunk(c); };
    const unload = (c, k) => {
      saveChunk(c);
      for (const s of c.sec) { if (s.opaque || s.trans) o.freeSection(s); removeList(s); s.dirty = false; }
      SIDE.forEach((_, f) => { const n = c.nb[f]; if (n) n.nb[(f + 2) % 4] = null; });
      c.dead = true;
      chunks.delete(k);
      if (lastK === k) lastK = -1;
      for (const [dx, dz] of nbKeys) { const n = chunkAt(c.cx + dx, c.cz + dz); if (n) n.ready = false; }
      version++;
    };
    let version = 0, center = null, wanted = [], wantAt = 0;
    const setCenter = (cx, cz, r) => {
      if (center && center.cx === cx && center.cz === cz && center.r === r) return;
      center = { cx, cz, r };
      wanted = [];
      for (let dx = -r - 1; dx <= r + 1; dx++) for (let dz = -r - 1; dz <= r + 1; dz++) wanted.push([dx * dx + dz * dz, cx + dx, cz + dz]);
      wanted.sort((a, b) => a[0] - b[0]);
      wantAt = 0;
      for (const [k, c] of [...chunks]) if (Math.max(Math.abs(c.cx - cx), Math.abs(c.cz - cz)) > r + 2) unload(c, k);
      for (const k of [...inflight]) { const ccx = Math.floor(k / 65536) - 32768, ccz = (k % 65536) - 32768; if (Math.max(Math.abs(ccx - cx), Math.abs(ccz - cz)) > r + 2) inflight.delete(k); }
    };
    const pump = () => {
      if (!center) return;
      const limit = useWorkers && workers.length ? workers.length * 2 : 1;
      let free = useWorkers && workers.length ? limit - workers.reduce((a, w) => a + w.busy, 0) : 1;
      while (free > 0 && wantAt < wanted.length) {
        const [, cx, cz] = wanted[wantAt++], k = key(cx, cz);
        if (chunks.has(k) || inflight.has(k)) continue;
        inflight.add(k);
        if (useWorkers && workers.length) {
          const w = workers.reduce((a, b) => (b.busy < a.busy ? b : a));
          w.busy++;
          w.postMessage({ t: 'chunk', id: 0, cx, cz });
        } else received(localGen().chunk(cx, cz));
        free--;
      }
      if (wantAt >= wanted.length && inflight.size === 0) {
        // Chunks that failed or were dropped get another chance.
        for (let i = 0; i < wanted.length; i++) if (!chunks.has(key(wanted[i][1], wanted[i][2]))) { wantAt = i; break; }
      }
    };

    // ---------- Meshing and culling ----------
    const removeList = s => {
      if (s.listIndex < 0) return;
      const last = allMeshed.pop();
      if (last !== s) { allMeshed[s.listIndex] = last; last.listIndex = s.listIndex; }
      s.listIndex = -1;
    };
    const meshQueue = (budget, px, py, pz) => {
      if (!queue.length) return 0;
      const t0 = performance.now();
      if (queue.length > 1) queue.sort((a, b) => {
        const ax = a.x + 8 - px, ay = a.y + 8 - py, az = a.z + 8 - pz, bx = b.x + 8 - px, by = b.y + 8 - py, bz = b.z + 8 - pz;
        return (bx * bx + by * by + bz * bz) - (ax * ax + ay * ay + az * az);
      });
      let done = 0;
      while (queue.length) {
        const s = queue.pop();
        s.queued = false;
        // Sections of unfinished chunks get queued again when their neighbours arrive.
        if (!s.dirty || s.c.dead || !s.c.ready) continue;
        s.dirty = false;
        if (s.count === 0) {
          s.vis = 0x7fff;
          if (s.opaque || s.trans) { o.freeSection(s); removeList(s); }
        } else {
          const data = CraftMesher.build(api, s.c, s.sy);
          s.vis = data.vis;
          o.uploadSection(s, data);
          if (s.opaque || s.trans) { if (s.listIndex < 0) { s.listIndex = allMeshed.length; allMeshed.push(s); } } else removeList(s);
        }
        done++;
        if (performance.now() - t0 > budget) break;
      }
      return done;
    };
    let stamp = 0;
    const cq = [];
    const OPP = [1, 0, 3, 2, 5, 4];
    const cull = (cam, planes, enabled) => {
      stamp++;
      const px = cam.x, py = cam.y, pz = cam.z, ccx = Math.floor(px / 16), ccz = Math.floor(pz / 16), csy = Math.max(0, Math.min(15, Math.floor(py / 16)));
      const inView = s => {
        for (let i = 0; i < 6; i++) {
          const p = planes[i], n = p.normal;
          const vx = n.x > 0 ? s.x + 16 : s.x, vy = n.y > 0 ? s.y + 16 : s.y, vz = n.z > 0 ? s.z + 16 : s.z;
          if (n.x * vx + n.y * vy + n.z * vz + p.constant < 0) return false;
        }
        return true;
      };
      const startC = chunkAt(ccx, ccz);
      let drawn = 0;
      if (startC && enabled) {
        const start = startC.sec[csy];
        let qh2 = 0, qt2 = 0;
        cq[qt2++] = start; cq[qt2++] = -1;
        start.stamp = stamp; start.enter = 0;
        while (qh2 < qt2) {
          const s = cq[qh2++], from = cq[qh2++], c = s.c, sx = c.cx, sz = c.cz, sy = s.sy;
          for (let f = 0; f < 6; f++) {
            if (f === from) continue;
            if (f === 0 && sx < ccx) continue; if (f === 1 && sx > ccx) continue;
            if (f === 2 && sy < csy) continue; if (f === 3 && sy > csy) continue;
            if (f === 4 && sz < ccz) continue; if (f === 5 && sz > ccz) continue;
            if (from >= 0 && !(s.vis & (1 << CraftMesher.PAIR[from][f]))) continue;
            let n = null;
            if (f === 0) n = c.nb[0] && c.nb[0].sec[sy];
            else if (f === 1) n = c.nb[2] && c.nb[2].sec[sy];
            else if (f === 2) n = sy < 15 ? c.sec[sy + 1] : null;
            else if (f === 3) n = sy > 0 ? c.sec[sy - 1] : null;
            else if (f === 4) n = c.nb[1] && c.nb[1].sec[sy];
            else n = c.nb[3] && c.nb[3].sec[sy];
            if (!n) continue;
            const back = OPP[f];
            if (n.stamp === stamp) { if (n.enter & (1 << back)) continue; }
            else { if (!inView(n)) continue; n.stamp = stamp; n.enter = 0; }
            n.enter |= 1 << back;
            cq[qt2++] = n; cq[qt2++] = back;
          }
        }
      }
      for (let i = 0; i < allMeshed.length; i++) {
        const s = allMeshed[i], on = enabled ? (s.stamp === stamp) : inView(s);
        if (s.opaque) s.opaque.visible = on;
        if (s.trans) s.trans.visible = on;
        if (on) drawn++;
      }
      return drawn;
    };
    const stats = () => ({ chunks: chunks.size, pending: inflight.size, queue: queue.length, meshed: allMeshed.length });
    // The share of the wanted area ready to draw, for the loading screen.
    const progress = (cx, cz, r) => {
      let have = 0, want = 0;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { want++; const c = chunkAt(cx + dx, cz + dz); if (c && c.ready) have++; }
      return have / want;
    };
    const destroy = () => {
      for (const w of workers) w.terminate();
      workers.length = 0;
      for (const [k, c] of [...chunks]) unload(c, k);
      resolvers.clear();
    };
    const api = {
      chunks, chunkAt, get, getMeta, lightAt, loaded, top, biome, set, beAt, setBE, touchBE, setCenter, pump, meshQueue, cull, saveAll, saveChunk, stats, progress, destroy, ask,
      markDirty, encode,
      forEachBE(f) { for (const c of chunks.values()) if (c.be.size) for (const [i, v] of c.be) f(c.cx * 16 + (i & 15), i >> 8, c.cz * 16 + ((i >> 4) & 15), v, c); },
      rebuildAll() { for (const c of chunks.values()) if (c.ready) for (const s of c.sec) if (s.count) dirtySec(s); },
      get version() { return version; },
    };
    return api;
  }
  return { create, key };
})();
