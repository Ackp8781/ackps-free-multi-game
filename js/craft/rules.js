// BlockCraft world rules: what blocks do when placed, broken, updated or randomly ticked.
const CraftRules = (() => {
  const D = CraftData, { blocks: DEF, B, I, items: ITEMS, OPAQUE, SOLID, FLUID, DX, DZ } = D;
  const SOILS = new Set(['grass_block', 'dirt', 'podzol', 'coarse_dirt', 'mycelium', 'farmland'].map(k => B[k]));
  const SLAB_FULL = { stone_slab: 'smooth_stone', cobblestone_slab: 'cobblestone', brick_slab: 'bricks', stone_brick_slab: 'stone_bricks', sandstone_slab: 'sandstone' };
  for (const s of D.WOODS) SLAB_FULL[s + '_slab'] = s + '_planks';

  function install(G) {
    const worldGet = (x, y, z) => G.W.get(x, y, z);
    const metaGet = (x, y, z) => G.W.getMeta(x, y, z);
    const def = (x, y, z) => DEF[worldGet(x, y, z)];

    // ---------- Scheduled ticks ----------
    const ticks = new Map();
    const schedule = (x, y, z, delay) => {
      const at = G.tickCount + Math.max(1, delay), k = x + ',' + y + ',' + z;
      let list = ticks.get(at);
      if (!list) ticks.set(at, list = new Map());
      list.set(k, [x, y, z]);
    };
    const runScheduled = () => {
      const list = ticks.get(G.tickCount);
      if (!list) return;
      ticks.delete(G.tickCount);
      let n = 0;
      for (const [x, y, z] of list.values()) {
        if (n++ > 500) { schedule(x, y, z, 1); continue; }
        if (G.W.loaded(x, z)) tickBlock(x, y, z);
      }
    };
    const clearTicks = () => ticks.clear();

    // ---------- Setting blocks ----------
    // The single door every world change goes through. "sync" tells the other players.
    const setBlock = (x, y, z, id, m = 0, o = {}) => {
      const old = worldGet(x, y, z);
      if (!G.W.set(x, y, z, id, m)) return false;
      if (old !== id && DEF[old].use && DEF[old].use !== 'craft' && DEF[old].use !== 'bed' && DEF[old].use !== 'tnt') G.removeContainer && G.removeContainer(x, y, z, old, id);
      if (old === B.spawner && id !== B.spawner) G.W.setBE(x, y, z, null);
      if (!o.quiet && G.net) G.net.sendBlock(x, y, z, id, m);
      if (!o.noUpdate) neighbors(x, y, z);
      return true;
    };
    const neighbors = (x, y, z) => {
      schedule(x, y, z, 1);
      schedule(x + 1, y, z, 1); schedule(x - 1, y, z, 1); schedule(x, y, z + 1, 1); schedule(x, y, z - 1, 1);
      if (y < 255) schedule(x, y + 1, z, 1);
      if (y > 0) schedule(x, y - 1, z, 1);
    };

    // ---------- Support ----------
    const opaqueAt = (x, y, z) => OPAQUE[worldGet(x, y, z)] === 1;
    const canStay = (id, m, x, y, z) => {
      const d = DEF[id], s = d.support;
      if (!s) return true;
      const below = worldGet(x, y - 1, z), bd = DEF[below];
      if (s === 'soil') return SOILS.has(below);
      if (s === 'farmland') return below === B.farmland;
      if (s === 'solid') return OPAQUE[below] === 1 || (bd.decay && id === B.snow);
      if (s === 'dry') return below === B.sand || below === B.red_sand || below === B.terracotta || SOILS.has(below);
      if (s === 'mushroom') return OPAQUE[below] === 1;
      if (s === 'sand') {
        if (below !== B.sand && below !== B.red_sand && below !== B.cactus) return false;
        for (let i = 0; i < 4; i++) if (SOLID[worldGet(x + DX[i], y, z + DZ[i])]) return false;
        return true;
      }
      if (s === 'cane') {
        if (below === B.sugar_cane) return true;
        if (!SOILS.has(below) && below !== B.sand && below !== B.red_sand) return false;
        for (let i = 0; i < 4; i++) if (FLUID[worldGet(x + DX[i], y - 1, z + DZ[i])] === 1) return true;
        return false;
      }
      if (s === 'torch') {
        if (!m) return OPAQUE[below] === 1 || bd.shape === 'fence' || bd.shape === 'slab' || bd.shape === 'stairs' || bd.key === 'cobblestone_wall';
        const dir = m - 1;
        return opaqueAt(x + DX[dir], y, z + DZ[dir]);
      }
      if (s === 'wall') {
        const dir = m & 3;
        if (opaqueAt(x + DX[dir], y, z + DZ[dir])) return true;
        return id === B.vine && (worldGet(x, y + 1, z) === B.vine || DEF[worldGet(x + DX[dir], y + 1, z + DZ[dir])].decay === true);
      }
      if (s === 'water') return FLUID[below] === 1;
      if (s === 'kelp') return below === B.kelp || OPAQUE[below] === 1;
      if (s === 'seabed') return OPAQUE[below] === 1;
      if (s === 'fire') return OPAQUE[below] === 1 || !!flammableNear(x, y, z);
      return true;
    };
    const flammableNear = (x, y, z) => {
      for (const [a, b, c] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]) if (DEF[worldGet(x + a, y + b, z + c)].flam) return [x + a, y + b, z + c];
      return null;
    };

    // ---------- Drops ----------
    const dropsFor = (id, m, tool) => {
      const d = DEF[id];
      if (tool && tool.shears && (d.decay || d.key === 'vine' || d.key === 'short_grass' || d.key === 'fern' || d.key === 'cobweb')) return d.key === 'cobweb' ? [['string', 1]] : d.noItem ? [] : [[d.key, 1]];
      if (typeof d.drops === 'function') return d.drops(m, Math.random);
      if (d.drops === null) return [];
      if (typeof d.drops === 'string') return [[d.drops, 1]];
      return d.noItem ? [] : [[d.key, 1]];
    };
    const breakDrops = (x, y, z, id, m, tool) => {
      for (const [k, n] of dropsFor(id, m, tool)) if (n > 0) G.spawnItem(x + .5, y + .5, z + .5, I[k], n);
    };
    // Mined or pushed out of existence, with its drops if allowed. Doors and beds take their other half too.
    const destroy = (x, y, z, drops, tool) => {
      const id = worldGet(x, y, z), m = metaGet(x, y, z), d = DEF[id];
      if (!id) return;
      G.fx.breakBlock(x, y, z, id, m);
      if (d.door) {
        const oy = m & 8 ? y - 1 : y + 1;
        if (DEF[worldGet(x, oy, z)].door) setBlock(x, oy, z, 0, 0, { noUpdate: true });
      }
      if (d.shape === 'bed') {
        const f = m & 3, s = m & 4 ? -1 : 1, ox = x + DX[f] * s, oz = z + DZ[f] * s;
        if (DEF[worldGet(ox, y, oz)].shape === 'bed') setBlock(ox, y, oz, 0, 0, { noUpdate: true });
      }
      const fill = d.waterlogged ? B.water : 0;
      setBlock(x, y, z, fill);
      if (drops && d.shape !== 'door') breakDrops(x, y, z, id, m, tool);
      if (drops && d.door) G.spawnItem(x + .5, y + .5, z + .5, I[d.key], 1);
    };

    // ---------- Fluids ----------
    const isKind = (id, k) => FLUID[id] === k;
    const levelOf = (id, m) => (DEF[id].waterlogged ? 0 : m >= 8 ? 0 : m);
    const isSource = (id, m) => DEF[id].waterlogged || (DEF[id].fluid && m === 0);
    const passable = id => !SOLID[id] && !DEF[id].fluid && !DEF[id].waterlogged && id !== B.ladder && id !== B.torch && id !== B.lantern;
    const flowInto = (x, y, z, kind, m) => {
      const id = worldGet(x, y, z);
      if (FLUID[id] && FLUID[id] !== kind) {
        // Water and lava meeting hardens into stone of some kind.
        const hisM = metaGet(x, y, z);
        if (kind === 1) setBlock(x, y, z, isSource(id, hisM) ? B.obsidian : B.cobblestone);
        else setBlock(x, y, z, B.stone);
        G.fx.hiss(x, y, z);
        return false;
      }
      if (!passable(id)) return false;
      if (id && DEF[id].shape !== 'none') { if (DEF[id].flam || DEF[id].shape === 'cross' || DEF[id].shape === 'crop' || id === B.snow || id === B.fire) destroy(x, y, z, kind === 1); }
      setBlock(x, y, z, kind === 1 ? B.water : B.lava, m);
      return true;
    };
    const dropDistance = (x, y, z, from, depth, kind) => {
      // How far to the nearest place the fluid could pour down, up to four blocks.
      let best = 99;
      for (let i = 0; i < 4; i++) {
        if (i === from) continue;
        const nx = x + DX[i], nz = z + DZ[i], id = worldGet(nx, y, nz);
        if (!passable(id) && !isKind(id, kind)) continue;
        if (isKind(id, kind) && isSource(id, metaGet(nx, y, nz))) continue;
        if (passable(worldGet(nx, y - 1, nz)) || isKind(worldGet(nx, y - 1, nz), kind)) return depth;
        if (depth < 4) best = Math.min(best, dropDistance(nx, y, nz, (i + 2) % 4, depth + 1, kind));
      }
      return best;
    };
    const tickFluid = (x, y, z, id, m) => {
      const kind = FLUID[id], step = kind === 1 ? 1 : 2, rate = kind === 1 ? 5 : 30, source = isSource(id, m);
      if (!source) {
        let best = 99, srcs = 0;
        for (let i = 0; i < 4; i++) {
          const nid = worldGet(x + DX[i], y, z + DZ[i]);
          if (!isKind(nid, kind)) continue;
          const nm = metaGet(x + DX[i], y, z + DZ[i]);
          if (isSource(nid, nm)) srcs++;
          best = Math.min(best, levelOf(nid, nm));
        }
        const above = isKind(worldGet(x, y + 1, z), kind);
        const under = worldGet(x, y - 1, z);
        let next;
        if (kind === 1 && srcs >= 2 && (OPAQUE[under] || (isKind(under, 1) && isSource(under, metaGet(x, y - 1, z))))) next = 0;
        else if (above) next = 8;
        else next = best + step < 8 ? best + step : -1;
        if (next < 0) { setBlock(x, y, z, 0); return; }
        if (next !== m) { setBlock(x, y, z, id, next); schedule(x, y, z, rate); return; }
      }
      const under = worldGet(x, y - 1, z);
      if (y > 0 && (passable(under) || (FLUID[under] && FLUID[under] !== kind))) { flowInto(x, y - 1, z, kind, 8); return; }
      if (isKind(under, kind) && !source) return;
      const lvl = levelOf(id, m), nl = source ? step : lvl + step;
      if (nl >= 8) return;
      const dist = [];
      let min = Infinity;
      for (let i = 0; i < 4; i++) {
        const nx = x + DX[i], nz = z + DZ[i], nid = worldGet(nx, y, nz);
        if (!passable(nid) && !(FLUID[nid] && FLUID[nid] !== kind)) { dist[i] = Infinity; continue; }
        const v = passable(worldGet(nx, y - 1, nz)) || isKind(worldGet(nx, y - 1, nz), kind) ? 0 : dropDistance(nx, y, nz, (i + 2) % 4, 1, kind);
        dist[i] = v; min = Math.min(min, v);
      }
      // Fluid heads for the nearest drop; with none in reach it spreads evenly.
      if (min !== Infinity) for (let i = 0; i < 4; i++) if (dist[i] === min) flowInto(x + DX[i], y, z + DZ[i], kind, nl);
    };

    // ---------- Scheduled and random behaviour ----------
    const tickBlock = (x, y, z) => {
      if (y < 0 || y > 255) return;
      const id = worldGet(x, y, z);
      if (!id) return;
      const d = DEF[id], m = metaGet(x, y, z);
      if (d.waterlogged || d.fluid) {
        if (d.fluid) {
          if (G.host()) { if (m !== 0 || neighborOpen(x, y, z, FLUID[id])) tickFluid(x, y, z, id, m); }
          if (d.fluid === 2 && G.host()) for (let i = 0; i < 4; i++) if (isKind(worldGet(x + DX[i], y, z + DZ[i]), 1)) { setBlock(x, y, z, m === 0 ? B.obsidian : B.cobblestone); G.fx.hiss(x, y, z); break; }
        }
        if (d.waterlogged && !canStay(id, m, x, y, z)) destroy(x, y, z, true);
        return;
      }
      if (d.fall && G.host()) {
        const under = worldGet(x, y - 1, z);
        if (y > 0 && (under === 0 || DEF[under].fluid || (DEF[under].replace && !SOLID[under]))) {
          setBlock(x, y, z, 0);
          G.spawnFalling(x + .5, y, z + .5, id);
          return;
        }
      }
      if (d.support && !canStay(id, m, x, y, z)) { destroy(x, y, z, id !== B.fire); return; }
      if (d.door) {
        // A door half without its partner falls apart.
        const other = m & 8 ? worldGet(x, y - 1, z) : worldGet(x, y + 1, z);
        if (other !== id) { destroy(x, y, z, !(m & 8)); return; }
        if (!(m & 8) && !OPAQUE[worldGet(x, y - 1, z)]) destroy(x, y, z, true);
      }
    };
    const neighborOpen = (x, y, z, kind) => {
      if (passable(worldGet(x, y - 1, z)) || (FLUID[worldGet(x, y - 1, z)] && FLUID[worldGet(x, y - 1, z)] !== kind)) return true;
      for (let i = 0; i < 4; i++) { const n = worldGet(x + DX[i], y, z + DZ[i]); if (passable(n) || (FLUID[n] && FLUID[n] !== kind)) return true; }
      return false;
    };
    const skyAt = (x, y, z) => {
      const l = G.W.lightAt(x, y, z);
      return Math.max(l & 15, (l >> 4) - G.skyDim());
    };
    const randomTick = (x, y, z, id) => {
      const d = DEF[id], m = metaGet(x, y, z);
      if (id === B.grass_block || id === B.mycelium) {
        const above = worldGet(x, y + 1, z);
        if (OPAQUE[above] || DEF[above].fluid) { if (skyAt(x, y + 1, z) < 4) setBlock(x, y, z, B.dirt); return; }
        if (skyAt(x, y + 1, z) >= 9) for (let n = 0; n < 4; n++) {
          const a = x + Math.floor(Math.random() * 3) - 1, b = y + Math.floor(Math.random() * 5) - 3, c = z + Math.floor(Math.random() * 3) - 1;
          if (worldGet(a, b, c) === B.dirt && !metaGet(a, b, c) && !OPAQUE[worldGet(a, b + 1, c)] && !DEF[worldGet(a, b + 1, c)].fluid && skyAt(a, b + 1, c) >= 4) setBlock(a, b, c, id);
        }
      } else if (d.stages) {
        if (m < d.stages - 1 && skyAt(x, y + 1, z) >= 9 && Math.random() < (metaGet(x, y - 1, z) ? .36 : .18)) setBlock(x, y, z, id, m + 1);
      } else if (id === B.farmland) {
        let wet = false;
        for (let a = -4; a <= 4 && !wet; a++) for (let c = -4; c <= 4 && !wet; c++) for (let b = 0; b <= 1; b++) if (FLUID[worldGet(x + a, y + b, z + c)] === 1) { wet = true; break; }
        if (wet && !m) setBlock(x, y, z, id, 1);
        else if (!wet && m) setBlock(x, y, z, id, 0);
        else if (!wet && !DEF[worldGet(x, y + 1, z)].stages && Math.random() < .2) setBlock(x, y, z, B.dirt);
      } else if (d.sapling) {
        if (skyAt(x, y + 1, z) >= 9 && Math.random() < .14) growSapling(x, y, z, d.sapling);
      } else if (id === B.sugar_cane || id === B.cactus) {
        if (worldGet(x, y + 1, z)) return;
        let h = 1;
        while (h < 4 && worldGet(x, y - h, z) === id) h++;
        if (h < 3 && Math.random() < .25 && canStay(id, 0, x, y + 1, z)) setBlock(x, y + 1, z, id);
      } else if (id === B.ice || id === B.snow) {
        if ((G.W.lightAt(x, y, z) & 15) > 11) { setBlock(x, y, z, id === B.ice ? B.water : 0); }
      } else if (id === B.fire) {
        if (!G.level.rules.doFireTick) return;
        const it = flammableNear(x, y, z);
        if (Math.random() < .3 || G.weatherRainAt(x, z) || !it) { setBlock(x, y, z, 0); return; }
        if (Math.random() < .3) {
          const f = DEF[worldGet(it[0], it[1], it[2])];
          if (f.flam && Math.random() < f.flam * .1) {
            if (worldGet(it[0], it[1], it[2]) === B.tnt) { setBlock(it[0], it[1], it[2], 0); G.primeTNT(it[0], it[1], it[2]); }
            else setBlock(it[0], it[1], it[2], 0);
          }
        }
        for (let n = 0; n < 3; n++) {
          const a = x + Math.floor(Math.random() * 3) - 1, b = y + Math.floor(Math.random() * 3) - 1, c = z + Math.floor(Math.random() * 3) - 1;
          if (!worldGet(a, b, c) && (flammableNear(a, b, c)) && Math.random() < .3) setBlock(a, b, c, B.fire);
        }
      } else if (id === B.lava && !m && G.level.rules.doFireTick && Math.random() < .08) {
        const a = x + Math.floor(Math.random() * 5) - 2, b = y + 1 + Math.floor(Math.random() * 2), c = z + Math.floor(Math.random() * 5) - 2;
        if (!worldGet(a, b, c) && flammableNear(a, b, c)) setBlock(a, b, c, B.fire);
      }
    };
    const SPECIES_TREE = { oak: r => (r() < .1 ? 'fancy_oak' : 'oak'), birch: () => 'birch', spruce: r => (r() < .4 ? 'pine' : 'spruce'), jungle: () => 'jungle', acacia: () => 'acacia', dark_oak: () => 'dark_oak', cherry: () => 'cherry' };
    const growSapling = (x, y, z, species) => {
      const type = SPECIES_TREE[species](Math.random);
      setBlock(x, y, z, 0, 0, { noUpdate: true });
      const put = (a, b, c, id, m = 0) => {
        const cur = worldGet(a, b, c);
        if (cur === 0 || DEF[cur].replace || DEF[cur].decay || DEF[cur].shape === 'cross') setBlock(a, b, c, id, m, { noUpdate: true });
      };
      G.localGen().growTree(type, x, y, z, CraftGen.rngOf(Math.floor(Math.random() * 1e9)), put);
    };
    const boneMeal = (x, y, z) => {
      const id = worldGet(x, y, z), d = DEF[id], m = metaGet(x, y, z);
      const sparkle = () => { for (let i = 0; i < 12; i++) G.R.addParticle({ tile: 'p_spark', x: x + Math.random(), y: y + .6 + Math.random() * .6, z: z + Math.random(), vy: .6, g: 0, life: .9, size: .13, r: .4, gc: 1, b: .4, glow: true, fade: true }); };
      if (d.stages && m < d.stages - 1) { setBlock(x, y, z, id, Math.min(d.stages - 1, m + 2 + Math.floor(Math.random() * 3))); sparkle(); return true; }
      if (d.sapling) { if (Math.random() < .45) growSapling(x, y, z, d.sapling); sparkle(); return true; }
      if (id === B.grass_block && !worldGet(x, y + 1, z)) {
        for (let n = 0; n < 40; n++) {
          const a = x + Math.floor(Math.random() * 7) - 3, c = z + Math.floor(Math.random() * 7) - 3;
          if (worldGet(a, y, c) === B.grass_block && !worldGet(a, y + 1, c)) setBlock(a, y + 1, c, Math.random() < .85 ? B.short_grass : Math.random() < .5 ? B.dandelion : B.poppy);
        }
        sparkle(); return true;
      }
      return false;
    };

    // ---------- Placing ----------
    // Works out the id and state a held block item should become when placed against a clicked face.
    const placeState = (id, hit) => {
      const d = DEF[id], p = G.player, nx = hit.nx, ny = hit.ny, nz = hit.nz, x = hit.px, y = hit.py, z = hit.pz;
      const fy = hit.hy - Math.floor(hit.hy);
      const look = ((Math.round(-p.yaw / (Math.PI / 2) - 1) % 4) + 4) % 4; // 0 east, 1 south, 2 west, 3 north
      const away = look, toward = (look + 2) % 4;
      let m = 0;
      if (d.shape === 'slab') m = ny < 0 || (!ny && fy > .5) ? 1 : 0;
      else if (d.shape === 'stairs') m = away | (ny < 0 || (!ny && fy > .5) ? 4 : 0);
      else if (d.axis) m = nx ? 1 : nz ? 2 : 0;
      else if (d.facing) m = toward;
      else if (d.shape === 'torch') {
        if (ny > 0 || (!nx && !nz)) m = 0;
        else if (nx) m = nx < 0 ? 1 : 3;
        else m = nz < 0 ? 2 : 4;
        if (ny < 0) return null;
        if (!canStay(id, m, x, y, z)) {
          // A wall click may still fit on the floor, and the reverse.
          if (m && canStay(id, 0, x, y, z)) m = 0; else return null;
        }
        return { id, m };
      } else if (d.shape === 'ladder' || d.shape === 'vine') {
        if (!nx && !nz) return null;
        m = nx ? (nx < 0 ? 0 : 2) : (nz < 0 ? 1 : 3);
      } else if (d.decay) m = 1;
      if (!canStay(id, m, x, y, z)) return null;
      return { id, m };
    };

    // Attempts every use of a right click on the world. Returns true when something happened.
    const useItemOn = (hit, stack, mode) => {
      const p = G.player, t = hit.id, td = DEF[t], it = stack ? ITEMS[stack.id] : null, sneaking = p.sneaking;
      const adventure = mode === 'adventure';
      if (td.use && !(sneaking && it)) {
        if (td.use === 'tnt') {
          if (it && it.igniter && !adventure) { setBlock(hit.x, hit.y, hit.z, 0); G.primeTNT(hit.x, hit.y, hit.z); G.useDurability(stack); return true; }
        } else { G.openBlock(td.use, hit.x, hit.y, hit.z); return true; }
      }
      if (td.door && !(sneaking && it)) {
        const m = metaGet(hit.x, hit.y, hit.z), oy = m & 8 ? hit.y - 1 : hit.y + 1;
        setBlock(hit.x, hit.y, hit.z, t, m ^ 4, { noUpdate: true });
        if (DEF[worldGet(hit.x, oy, hit.z)].door) setBlock(hit.x, oy, hit.z, t, metaGet(hit.x, oy, hit.z) ^ 4, { noUpdate: true });
        G.fx.sound(m & 4 ? 'door_close' : 'door_open', hit.x, hit.y, hit.z);
        return true;
      }
      if (!it) return false;
      if (it.boneMeal && !adventure) {
        if (boneMeal(hit.x, hit.y, hit.z)) { G.consume(stack); G.swing(); return true; }
        return false;
      }
      if (it.spawns && !adventure) {
        G.spawnMob(it.spawns, hit.x + hit.nx + .5, hit.y + hit.ny + (hit.ny < 0 ? -1 : 0), hit.z + hit.nz + .5);
        G.consume(stack); G.swing();
        return true;
      }
      if (adventure) return false;
      if (it.tool === 'hoe' && (t === B.grass_block || t === B.dirt || t === B.dirt_path) && !worldGet(hit.x, hit.y + 1, hit.z)) {
        setBlock(hit.x, hit.y, hit.z, B.farmland); G.fx.sound('dig_gravel', hit.x, hit.y, hit.z); G.useDurability(stack); G.swing();
        return true;
      }
      if (it.tool === 'shovel' && t === B.grass_block && !worldGet(hit.x, hit.y + 1, hit.z)) {
        setBlock(hit.x, hit.y, hit.z, B.dirt_path); G.fx.sound('dig_gravel', hit.x, hit.y, hit.z); G.useDurability(stack); G.swing();
        return true;
      }
      if (it.igniter) {
        const a = hit.x + hit.nx, b = hit.y + hit.ny, c = hit.z + hit.nz;
        if (!worldGet(a, b, c)) { setBlock(a, b, c, B.fire); G.fx.sound('ignite', a, b, c); G.useDurability(stack); G.swing(); return true; }
        return false;
      }
      if (it.plants && t === B.farmland && hit.ny > 0 && !worldGet(hit.x, hit.y + 1, hit.z)) {
        setBlock(hit.x, hit.y + 1, hit.z, B[it.plants]); G.fx.sound('place_grass', hit.x, hit.y + 1, hit.z); G.consume(stack); G.swing();
        return true;
      }
      // Everything left places a block in the free cell against the clicked face.
      let placeId = it.block !== undefined ? it.block : it.places ? B[it.places] : null;
      if (placeId === null || placeId === undefined) return false;
      if (t === B.snow && placeId === B.snow) {
        const m = metaGet(hit.x, hit.y, hit.z);
        if (m < 7) { setBlock(hit.x, hit.y, hit.z, B.snow, m + 1); G.consume(stack); G.swing(); return true; }
      }
      // Stacking a slab on its twin makes the full block.
      if (DEF[placeId].shape === 'slab' && t === placeId) {
        const m = metaGet(hit.x, hit.y, hit.z);
        if ((hit.ny > 0 && !(m & 1)) || (hit.ny < 0 && m & 1)) {
          setBlock(hit.x, hit.y, hit.z, B[SLAB_FULL[DEF[placeId].key]]);
          G.fx.placeSound(placeId, hit.x, hit.y, hit.z); G.consume(stack); G.swing();
          return true;
        }
      }
      let a = hit.x, b = hit.y, c = hit.z;
      const replaceable = id => id === 0 || DEF[id].replace;
      if (!replaceable(t) || (placeId === t)) { a += hit.nx; b += hit.ny; c += hit.nz; }
      if (b < 0 || b > 255) return false;
      const cur = worldGet(a, b, c);
      if (!replaceable(cur)) return false;
      if (placeId === B.lily_pad && FLUID[worldGet(a, b - 1, c)] !== 1) return false;
      const h2 = { ...hit, px: a, py: b, pz: c };
      const st = placeState(placeId, h2);
      if (!st) return false;
      const col = DEF[st.id].solid ? D.shape(st.id, st.m, 0).col : [];
      for (const box of col) if (G.anyEntityIn(a + box[0], b + box[1], c + box[2], a + box[3], b + box[4], c + box[5])) return false;
      if (DEF[st.id].door) {
        if (b > 254 || !replaceable(worldGet(a, b + 1, c)) || !OPAQUE[worldGet(a, b - 1, c)]) return false;
        const look = ((Math.round(-p.yaw / (Math.PI / 2) - 1) % 4) + 4) % 4;
        const leftSide = DEF[worldGet(a + DZ[look], b, c - DX[look])].door;
        const hinge = leftSide ? 16 : 0;
        setBlock(a, b, c, st.id, look | hinge, { noUpdate: true });
        setBlock(a, b + 1, c, st.id, look | hinge | 8, { noUpdate: true });
      } else if (DEF[st.id].shape === 'bed') {
        const look = ((Math.round(-p.yaw / (Math.PI / 2) - 1) % 4) + 4) % 4, ha = a + DX[look], hc = c + DZ[look];
        if (!replaceable(worldGet(ha, b, hc)) || !OPAQUE[worldGet(a, b - 1, c)] || !OPAQUE[worldGet(ha, b - 1, hc)]) return false;
        setBlock(a, b, c, st.id, look, { noUpdate: true });
        setBlock(ha, b, hc, st.id, look | 4, { noUpdate: true });
      } else {
        setBlock(a, b, c, st.id, st.m);
        if (DEF[st.id].use === 'chest') G.W.setBE(a, b, c, { type: 'chest', items: [] });
        if (DEF[st.id].use === 'furnace') G.placeFurnace(a, b, c);
        if (st.id === B.spawner) G.placeSpawner(a, b, c);
      }
      G.fx.placeSound(st.id, a, b, c);
      G.consume(stack); G.swing();
      G.afterPlace && G.afterPlace(st.id);
      return true;
    };
    const useBucket = (stack, it) => {
      // Buckets aim at fluid surfaces as well as solid blocks, so they run their own ray.
      const hit = G.raycast(true);
      if (!hit) return false;
      const adventure = G.mode() === 'adventure';
      if (adventure) return false;
      if (it.bucket === 0) {
        if (DEF[hit.id].fluid && isSource(hit.id, metaGet(hit.x, hit.y, hit.z))) {
          const k = hit.id === B.water ? 'water_bucket' : 'lava_bucket';
          setBlock(hit.x, hit.y, hit.z, 0);
          G.fx.sound('bucket', hit.x, hit.y, hit.z);
          G.replaceStack(stack, I[k]);
          G.swing();
          return true;
        }
        return false;
      }
      const placeKey = it.bucket, fid = B[placeKey];
      let a = hit.x, b = hit.y, c = hit.z;
      if (!DEF[hit.id].replace || DEF[hit.id].fluid) { a += hit.nx; b += hit.ny; c += hit.nz; }
      if (DEF[worldGet(a, b, c)].fluid === DEF[fid].fluid && !metaGet(a, b, c)) return false;
      const cur = worldGet(a, b, c);
      if (cur && !DEF[cur].replace) return false;
      setBlock(a, b, c, fid, 0);
      schedule(a, b, c, 2);
      G.fx.sound('bucket', a, b, c);
      if (G.mode() !== 'creative') G.replaceStack(stack, I.bucket);
      G.swing();
      return true;
    };

    // Random ticks: a few blocks per section around the player each game tick.
    const randomTicks = (px, pz) => {
      const speed = G.level.rules.randomTickSpeed;
      if (!speed) return;
      const cx0 = px >> 4, cz0 = pz >> 4, R2 = 7;
      for (let dx = -R2; dx <= R2; dx++) for (let dz = -R2; dz <= R2; dz++) {
        const c = G.W.chunkAt(cx0 + dx, cz0 + dz);
        if (!c) continue;
        for (let s = 0; s < 16; s++) {
          if (!c.sec[s].count) continue;
          for (let n = 0; n < speed; n++) {
            const i = Math.floor(Math.random() * 4096), id = c.blocks[(s << 12) | i];
            if (!id || !RANDOM[id]) continue;
            randomTick(c.cx * 16 + (i & 15), (s << 4) | (i >> 8), c.cz * 16 + ((i >> 4) & 15), id);
          }
        }
      }
    };
    const RANDOM = new Uint8Array(256);
    for (const d of DEF) if (d.stages || d.sapling || d.key === 'grass_block' || d.key === 'mycelium' || d.key === 'farmland' || d.key === 'sugar_cane' || d.key === 'cactus' || d.key === 'ice' || d.key === 'snow' || d.key === 'fire' || d.key === 'lava') RANDOM[d.id] = 1;

    Object.assign(G, { setBlock, destroy, canStay, schedule, runScheduled, clearTicks, randomTicks, useItemOn, useBucket, boneMeal, skyAt, neighbors });
    return { def };
  }
  return { install };
})();
