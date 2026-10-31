// BlockCraft entities: shared physics, dropped items, falling blocks, TNT, arrows, XP orbs and mobs.
const CraftEntities = (() => {
  const D = CraftData, { blocks: DEF, B, I, items: ITEMS, OPAQUE, SOLID, FLUID, DX, DZ } = D;
  const MOBS = {
    pig: { hp: 10, speed: .25, w: .9, h: .9, passive: true, drops: [['porkchop', 1, 3]], cooked: 'cooked_porkchop', xp: [1, 3], say: .004 },
    cow: { hp: 10, speed: .2, w: .9, h: 1.4, passive: true, drops: [['beef', 1, 3], ['leather', 0, 2]], cooked: 'cooked_beef', xp: [1, 3], say: .004 },
    sheep: { hp: 8, speed: .23, w: .9, h: 1.3, passive: true, drops: [['white_wool', 1, 1], ['mutton', 1, 2]], cooked: 'cooked_mutton', xp: [1, 3], say: .004 },
    chicken_mob: { hp: 4, speed: .25, w: .4, h: .7, passive: true, drops: [['feather', 0, 2], ['chicken', 1, 1]], cooked: 'cooked_chicken', xp: [1, 3], say: .006, glide: true },
    zombie: { hp: 20, speed: .23, w: .6, h: 1.95, dmg: [2, 3, 4], drops: [['rotten_flesh', 0, 2]], xp: [5, 5], say: .006, burns: true, sight: 35 },
    skeleton: { hp: 20, speed: .25, w: .6, h: 1.99, ranged: true, drops: [['bone', 0, 2], ['arrow', 0, 2]], xp: [5, 5], say: .005, burns: true, sight: 16 },
    spider: { hp: 16, speed: .3, w: 1.4, h: .9, dmg: [2, 2, 3], drops: [['string', 0, 2]], xp: [5, 5], say: .005, climbs: true, daytimeCalm: true, sight: 16 },
    blastcap: { hp: 20, speed: .25, w: .7, h: 1.6, fuse: true, drops: [['gunpowder', 0, 2]], xp: [5, 5], say: .003, sight: 16 },
  };
  const SHEEP_COLORS = ['white', 'white', 'white', 'white', 'light_gray', 'gray', 'brown', 'black'];
  const SHEEP_RGB = { white: [1, 1, 1], light_gray: [.72, .72, .72], gray: [.42, .42, .44], brown: [.5, .36, .24], black: [.2, .2, .22] };

  function install(G) {
    const list = [];
    let nextId = 1;
    G.entities = list;

    // ---------- Physics ----------
    const bx = [];
    const gather = (x0, y0, z0, x1, y1, z1) => {
      bx.length = 0;
      const W = G.W, ax = Math.floor(x0), ay = Math.floor(y0) - 1, az = Math.floor(z0), cx = Math.floor(x1), cy = Math.floor(y1), cz = Math.floor(z1);
      for (let x = ax; x <= cx; x++) for (let z = az; z <= cz; z++) {
        if (!W.loaded(x, z)) { bx.push(x, -1e3, z, x + 1, 1e3, z + 1); continue; }
        for (let y = ay; y <= cy; y++) {
          const id = W.get(x, y, z);
          if (!SOLID[id]) continue;
          const d = DEF[id];
          if (d.shape === 'cube') { bx.push(x, y, z, x + 1, y + 1, z + 1); continue; }
          const conn = d.shape === 'fence' || d.shape === 'pane' ? G.connMask(x, y, z, d) : 0, parts = D.shape(id, W.getMeta(x, y, z), conn).col;
          for (const b of parts) bx.push(x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]);
        }
      }
      return bx;
    };
    G.connMask = (x, y, z, d) => {
      const W = G.W, ok = i => {
        const n = DEF[W.get(x + DX[i], y, z + DZ[i])];
        return n.opaque || n.shape === d.shape || (d.shape === 'pane' && (n.key === 'glass' || n.key.endsWith('stained_glass')));
      };
      return (ok(0) ? 1 : 0) | (ok(1) ? 2 : 0) | (ok(2) ? 4 : 0) | (ok(3) ? 8 : 0);
    };
    const EPS = 1e-7;
    const clipAxis = (axis, d, e, hw, h) => {
      // Slides the box along one axis until it touches something.
      const x0 = e.x - hw, x1 = e.x + hw, y0 = e.y, y1 = e.y + h, z0 = e.z - hw, z1 = e.z + hw;
      for (let i = 0; i < bx.length; i += 6) {
        const a0 = bx[i], b0 = bx[i + 1], c0 = bx[i + 2], a1 = bx[i + 3], b1 = bx[i + 4], c1 = bx[i + 5];
        if (axis === 1) {
          if (x1 <= a0 + EPS || x0 >= a1 - EPS || z1 <= c0 + EPS || z0 >= c1 - EPS) continue;
          if (d > 0 && y1 <= b0 + EPS) d = Math.min(d, b0 - y1);
          else if (d < 0 && y0 >= b1 - EPS) d = Math.max(d, b1 - y0);
        } else if (axis === 0) {
          if (y1 <= b0 + EPS || y0 >= b1 - EPS || z1 <= c0 + EPS || z0 >= c1 - EPS) continue;
          if (d > 0 && x1 <= a0 + EPS) d = Math.min(d, a0 - x1);
          else if (d < 0 && x0 >= a1 - EPS) d = Math.max(d, a1 - x0);
        } else {
          if (y1 <= b0 + EPS || y0 >= b1 - EPS || x1 <= a0 + EPS || x0 >= a1 - EPS) continue;
          if (d > 0 && z1 <= c0 + EPS) d = Math.min(d, c0 - z1);
          else if (d < 0 && z0 >= c1 - EPS) d = Math.max(d, c1 - z0);
        }
      }
      return d;
    };
    const collides = (x, y, z, hw, h) => {
      gather(x - hw, y, z - hw, x + hw, y + h, z + hw);
      for (let i = 0; i < bx.length; i += 6) {
        if (x + hw > bx[i] + EPS && x - hw < bx[i + 3] - EPS && y + h > bx[i + 1] + EPS && y < bx[i + 4] - EPS && z + hw > bx[i + 2] + EPS && z - hw < bx[i + 5] - EPS) return true;
      }
      return false;
    };
    G.collides = collides;
    const move = (e, dx, dy, dz) => {
      const hw = e.w / 2, h = e.h, odx = dx, ody = dy, odz = dz, wasGround = e.onGround, sx = e.x, sy = e.y, sz = e.z;
      if (e.noclip) { e.x += dx; e.y += dy; e.z += dz; e.onGround = false; return; }
      // Sneaking keeps you on the edge of whatever you stand on.
      if (e.edgeGuard && wasGround) {
        const fits = (ax, az) => collides(e.x + ax, e.y - .6, e.z + az, hw, .55);
        const s = .05;
        while (dx && !fits(dx, 0)) dx = Math.abs(dx) < s ? 0 : dx - Math.sign(dx) * s;
        while (dz && !fits(0, dz)) dz = Math.abs(dz) < s ? 0 : dz - Math.sign(dz) * s;
        while (dx && dz && !fits(dx, dz)) {
          dx = Math.abs(dx) < s ? 0 : dx - Math.sign(dx) * s;
          dz = Math.abs(dz) < s ? 0 : dz - Math.sign(dz) * s;
        }
      }
      const adx = dx, adz = dz;
      gather(e.x - hw + Math.min(dx, 0) - .01, e.y + Math.min(dy, 0) - .01, e.z - hw + Math.min(dz, 0) - .01, e.x + hw + Math.max(dx, 0) + .01, e.y + h + Math.max(dy, 0) + .01, e.z + hw + Math.max(dz, 0) + .01);
      dy = clipAxis(1, dy, e, hw, h); e.y += dy;
      if (Math.abs(dx) > Math.abs(dz)) { dx = clipAxis(0, dx, e, hw, h); e.x += dx; dz = clipAxis(2, dz, e, hw, h); e.z += dz; }
      else { dz = clipAxis(2, dz, e, hw, h); e.z += dz; dx = clipAxis(0, dx, e, hw, h); e.x += dx; }
      let landed = ody < 0 && dy !== ody;
      // Step up low ledges when walking into them.
      if (e.step > 0 && (wasGround || landed) && (dx !== adx || dz !== adz)) {
        const hx = e.x, hy = e.y, hz = e.z, gx = dx, gz = dz;
        e.x = sx; e.y = sy; e.z = sz;
        gather(e.x - hw + Math.min(adx, 0) - .01, e.y - .01, e.z - hw + Math.min(adz, 0) - .01, e.x + hw + Math.max(adx, 0) + .01, e.y + h + e.step + .01, e.z + hw + Math.max(adz, 0) + .01);
        const up = clipAxis(1, e.step, e, hw, h);
        e.y += up;
        const nx = clipAxis(0, adx, e, hw, h); e.x += nx;
        const nz = clipAxis(2, adz, e, hw, h); e.z += nz;
        const down = clipAxis(1, -up, e, hw, h); e.y += down;
        if (nx * nx + nz * nz > gx * gx + gz * gz + 1e-6) { dx = nx; dz = nz; landed = true; e.stepped = (e.stepped || 0) + (e.y - sy); }
        else { e.x = hx; e.y = hy; e.z = hz; }
      }
      e.hitWall = dx !== odx || dz !== odz;
      e.onGround = landed;
      if (dx !== odx && adx === odx) e.vx = 0;
      if (dz !== odz && adz === odz) e.vz = 0;
      if (dy !== ody && !e.stepKeep) e.vy = 0;
    };
    G.move = move;
    const fluidAt = (e, yOff = 0) => FLUID[G.W.get(Math.floor(e.x), Math.floor(e.y + yOff), Math.floor(e.z))] || 0;
    G.fluidAt = fluidAt;

    // ---------- Spawn helpers ----------
    const add = e => { e.id = e.id || nextId++; e.px = e.x; e.py = e.y; e.pz = e.z; e.vx = e.vx || 0; e.vy = e.vy || 0; e.vz = e.vz || 0; e.age = 0; list.push(e); return e; };
    G.spawnItem = (x, y, z, id, count = 1, dmg = 0, o = {}) => {
      if (!id || !ITEMS[id]) return;
      const a = Math.random() * 6.283, s = o.toss === undefined ? .1 : o.toss;
      return add({ kind: 'item', x, y, z, w: .25, h: .25, item: id, count, dmg, step: 0, delay: o.delay === undefined ? 10 : o.delay, bob: Math.random() * 6.28, vx: o.vx === undefined ? Math.cos(a) * s : o.vx, vy: o.vy === undefined ? .2 : o.vy, vz: o.vz === undefined ? Math.sin(a) * s : o.vz, life: 6000 });
    };
    G.spawnFalling = (x, y, z, id) => add({ kind: 'falling', x, y, z, w: .98, h: .98, block: id, step: 0 });
    G.primeTNT = (x, y, z, fuse = 80) => { add({ kind: 'tnt', x: x + .5, y, z: z + .5, w: .98, h: .98, fuse, step: 0, vy: .2 }); G.audio.play('fuse', 1); };
    G.spawnArrow = (x, y, z, vx, vy, vz, dmg, owner) => add({ kind: 'arrow', x, y, z, w: .2, h: .2, vx, vy, vz, dmg, owner, step: 0, life: 1200 });
    G.spawnThrown = (x, y, z, vx, vy, vz, what, owner) => add({ kind: 'thrown', x, y, z, w: .25, h: .25, vx, vy, vz, what, owner, step: 0 });
    G.spawnOrb = (x, y, z, xp) => { if (xp > 0) add({ kind: 'orb', x, y, z, w: .25, h: .25, xp, step: 0, vx: (Math.random() - .5) * .2, vy: .22, vz: (Math.random() - .5) * .2 }); };
    G.spawnMob = (type, x, y, z, o = {}) => {
      const m = MOBS[type];
      if (!m) return null;
      const e = add({ kind: 'mob', type, m, x, y, z, w: m.w, h: m.h, hp: m.hp, step: .6, yaw: Math.random() * 6.283, headYaw: 0, pitch: 0, stride: 0, hurt: 0, cool: 0, wander: 0, ...o });
      if (type === 'sheep' && !e.color) e.color = SHEEP_COLORS[Math.floor(Math.random() * SHEEP_COLORS.length)];
      return e;
    };
    G.anyEntityIn = (x0, y0, z0, x1, y1, z1) => {
      const hit = e => e.x + e.w / 2 > x0 && e.x - e.w / 2 < x1 && e.y + e.h > y0 && e.y < y1 && e.z + e.w / 2 > z0 && e.z - e.w / 2 < z1;
      if (G.player && G.mode() !== 'spectator' && hit(G.player)) return true;
      return list.some(e => e.kind === 'mob' && e.hp > 0 && hit(e)) || (G.net && G.net.playersIn(hit));
    };

    // ---------- Mob brains ----------
    const walkable = (x, y, z, need) => {
      const W = G.W;
      for (let i = 0; i < need; i++) {
        const id = W.get(x, y + i, z), d = DEF[id];
        if (SOLID[id] && !(d.door && W.getMeta(x, y + i, z) & 4)) return false;
        if (d.fluid === 2 || id === B.fire || id === B.cactus) return false;
      }
      return true;
    };
    const standable = (x, y, z) => { const id = G.W.get(x, y - 1, z); return SOLID[id] && id !== B.cactus && FLUID[id] !== 2; };
    const findPath = (e, tx, ty, tz, budget = 160) => {
      // A small A* over walkable cells, with steps up and drops of up to three blocks.
      const need = Math.ceil(e.h), sx = Math.floor(e.x), sy = Math.floor(e.y + .01), sz = Math.floor(e.z);
      const k = (x, y, z) => (x - sx + 64) + (z - sz + 64) * 128 + (y - sy + 64) * 16384;
      const open = [{ x: sx, y: sy, z: sz, g: 0, f: 0, p: null }], best = new Map([[k(sx, sy, sz), 0]]);
      let closest = open[0], cd = 1e9, n = 0;
      while (open.length && n++ < budget) {
        let bi = 0;
        for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
        const c = open.splice(bi, 1)[0], d = Math.abs(c.x - tx) + Math.abs(c.y - ty) * 2 + Math.abs(c.z - tz);
        if (d < cd) { cd = d; closest = c; }
        if (d <= 1) break;
        for (let i = 0; i < 4; i++) {
          const nx = c.x + DX[i], nz = c.z + DZ[i];
          let ny = null;
          if (walkable(nx, c.y, nz, need)) {
            if (standable(nx, c.y, nz) || FLUID[G.W.get(nx, c.y, nz)]) ny = c.y;
            else for (let drop = 1; drop <= 3; drop++) { if (standable(nx, c.y - drop, nz) && walkable(nx, c.y - drop, nz, need)) { ny = c.y - drop; break; } }
          } else if (walkable(nx, c.y + 1, nz, need) && walkable(c.x, c.y + need, c.z, 1) && standable(nx, c.y + 1, nz)) ny = c.y + 1;
          if (ny === null) continue;
          const g = c.g + 1, key = k(nx, ny, nz);
          if (best.has(key) && best.get(key) <= g) continue;
          best.set(key, g);
          open.push({ x: nx, y: ny, z: nz, g, f: g + (Math.abs(nx - tx) + Math.abs(ny - ty) * 2 + Math.abs(nz - tz)) * 1.2, p: c });
        }
      }
      const path = [];
      for (let c = closest; c && c.p; c = c.p) path.unshift([c.x + .5, c.y, c.z + .5]);
      return path;
    };
    const nearestPlayer = (e, range) => {
      let best = null, bd = range * range;
      const test = (p, net) => {
        if (p.dead || p.mode === 'creative' || p.mode === 'spectator') return;
        const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2 + (p.z - e.z) ** 2;
        if (d < bd) { bd = d; best = { p, net }; }
      };
      if (G.player) test(G.player, false);
      if (G.net) G.net.eachPlayer(q => test(q, true));
      return best;
    };
    const sees = (e, t) => {
      // Marches a line from eyes to eyes looking for anything solid.
      const ax = e.x, ay = e.y + e.h * .85, az = e.z, bx2 = t.x, by = t.y + 1.5, bz = t.z, d = Math.hypot(bx2 - ax, by - ay, bz - az), n = Math.ceil(d * 2);
      for (let i = 1; i < n; i++) {
        const k = i / n;
        if (OPAQUE[G.W.get(Math.floor(ax + (bx2 - ax) * k), Math.floor(ay + (by - ay) * k), Math.floor(az + (bz - az) * k))]) return false;
      }
      return true;
    };
    const mobTick = e => {
      const m = e.m, W = G.W;
      if (e.hp <= 0) { e.dying = (e.dying || 0) + 1; if (e.dying > 18) { G.fx.poof(e); e.dead = true; } mobPhysics(e, 0, 0); return; }
      if (e.hurt > 0) e.hurt--;
      if (e.cool > 0) e.cool--;
      const light = W.lightAt(Math.floor(e.x), Math.floor(e.y + e.h * .5), Math.floor(e.z)), day = G.skyDim() < 4;
      // Undead burn up under an open daytime sky.
      if (m.burns && day && light >> 4 >= 14 && !G.weatherRainAt(Math.floor(e.x), Math.floor(e.z))) {
        if (G.tickCount % 20 === 0) { damageMob(e, 1, 0, 0, null); }
        if (G.tickCount % 2 === 0) G.R.addParticle({ tile: 'p_flame', x: e.x + (Math.random() - .5) * e.w, y: e.y + Math.random() * e.h, z: e.z + (Math.random() - .5) * e.w, vy: 1, g: 0, life: .5, size: .22, glow: true, fade: true });
      }
      if (FLUID[W.get(Math.floor(e.x), Math.floor(e.y + .2), Math.floor(e.z))] === 2 && G.tickCount % 10 === 0) damageMob(e, 4, 0, 0, null);
      if (e.fall > 3 && e.onGround) { damageMob(e, Math.ceil(e.fall - 3), 0, 0, null); }
      if (e.onGround) e.fall = 0; else if (e.vy < 0) e.fall = (e.fall || 0) - e.vy;
      if (Math.random() < m.say) G.fx.mobSay(e);

      let mx = 0, mz = 0, speedK = 1, target = null;
      if (!m.passive && G.level.difficulty !== 'peaceful') {
        const range = m.sight || 16, near = nearestPlayer(e, range);
        const calm = m.daytimeCalm && day && !e.angry;
        if (near && !calm && (e.angry || sees(e, near.p))) target = near;
        else if (m.fuse && e.fuseT) e.fuseT = Math.max(0, e.fuseT - 1);
      }
      if (e.fleeing > 0) { e.fleeing--; speedK = 2; }
      if (target) {
        const t = target.p, dx = t.x - e.x, dz = t.z - e.z, dy = t.y - e.y, dist = Math.hypot(dx, dz), d3 = Math.hypot(dist, dy);
        e.lookAt = t;
        if (m.ranged) {
          // Skeletons hold their distance and fire on a timer.
          if (dist > 9 || !sees(e, t)) followTo(e, t);
          else { e.path = null; if (dist < 5) { mx = -dx / dist; mz = -dz / dist; } else { const s = Math.sin(G.tickCount / 40 + e.id); mx = -dz / dist * s * .6; mz = dx / dist * s * .6; } }
          if (e.cool <= 0 && dist < 15 && sees(e, t)) {
            e.cool = G.level.difficulty === 'hard' ? 30 : 50;
            const sy = e.y + 1.5, ty = t.y + 1.2, d = Math.hypot(dx, ty - sy, dz), arc = dist * .0165;
            const sp = 1.6, err = G.level.difficulty === 'easy' ? .1 : .05;
            G.spawnArrow(e.x + dx / d3 * .6, sy, e.z + dz / d3 * .6, (dx / d + (Math.random() - .5) * err) * sp, ((ty - sy) / d + arc + (Math.random() - .5) * err) * sp, (dz / d + (Math.random() - .5) * err) * sp, [2, 3, 4][G.diffIdx()], e);
            G.audio.play('bow', G.fx.falloff(e.x, e.y, e.z));
          }
        } else if (m.fuse) {
          if (d3 < 3.2 && sees(e, t)) {
            e.fuseT = (e.fuseT || 0) + 1;
            if (e.fuseT === 1) G.audio.play('fuse', G.fx.falloff(e.x, e.y, e.z));
            e.path = null;
            if (e.fuseT >= 30) {
              e.dead = true; e.silent = true;
              G.explode(e.x, e.y + .5, e.z, G.level.difficulty === 'hard' ? 4 : 3, 'mob');
              return;
            }
          } else {
            e.fuseT = Math.max(0, (e.fuseT || 0) - 1);
            followTo(e, t);
          }
        } else {
          followTo(e, t);
          if (d3 < 1.5 + e.w * .4 && e.cool <= 0) {
            e.cool = 20; e.swing = 8;
            const dmg = m.dmg[G.diffIdx()];
            G.hitPlayer(target, dmg, dx / (dist || 1), dz / (dist || 1), e);
          }
        }
      } else if (e.lookAt) { e.lookAt = null; e.path = null; }
      if (!target || m.ranged) {
        if (!target) {
          // Wandering
          if (e.wander <= 0) {
            e.wander = 40 + Math.floor(Math.random() * 120);
            e.path = null;
            if (Math.random() < .5) {
              const a = Math.random() * 6.283, r = 3 + Math.random() * 7;
              e.path = findPath(e, Math.floor(e.x + Math.cos(a) * r), Math.floor(e.y), Math.floor(e.z + Math.sin(a) * r), 60);
              e.pathAt = 0;
            }
          }
          e.wander--;
          if (m.passive && Math.random() < .005 && !e.path) { e.lookOff = (Math.random() - .5) * 1.5; }
        }
      }
      if (e.path && e.path.length) {
        const [px, py, pz] = e.path[0], dx = px - e.x, dz = pz - e.z, dist = Math.hypot(dx, dz);
        if (dist < .35 && Math.abs(py - e.y) < 1.2) e.path.shift();
        else { mx = dx / (dist || 1); mz = dz / (dist || 1); if (py > e.y + .4 && e.onGround) e.wantJump = true; }
      }
      if (e.wantJump && e.onGround) { e.vy = .42; e.wantJump = false; }
      else if (e.hitWall && e.onGround && (mx || mz)) { e.vy = .42; }
      if (m.climbs && e.hitWall && (mx || mz)) e.vy = Math.max(e.vy, .2);
      if (e.type === 'chicken_mob' && Math.random() < .0008 && G.host()) G.spawnItem(e.x, e.y + .2, e.z, I.egg, 1);
      if (e.fuseT) { mx = 0; mz = 0; }
      mobPhysics(e, mx * m.speed * speedK * .5, mz * m.speed * speedK * .5);
      // Turn to face where it's going, and look at nearby players.
      if (mx || mz) { const want = Math.atan2(-mx, -mz); let d = want - e.yaw; d = ((d + Math.PI) % 6.283 + 6.283) % 6.283 - Math.PI; e.yaw += d * .3; }
      const near = e.lookAt || (G.player && (G.player.x - e.x) ** 2 + (G.player.z - e.z) ** 2 < 36 ? G.player : null);
      if (near) {
        const want = Math.atan2(-(near.x - e.x), -(near.z - e.z));
        let d = want - e.yaw; d = ((d + Math.PI) % 6.283 + 6.283) % 6.283 - Math.PI;
        e.headYaw = Math.max(-.9, Math.min(.9, d));
        e.pitch = Math.atan2((near.y + 1.5) - (e.y + e.h * .85), Math.hypot(near.x - e.x, near.z - e.z)) * .7;
      } else { e.headYaw *= .85; e.pitch *= .85; }
      if (e.swing > 0) e.swing--;
    };
    const followTo = (e, t) => {
      e.repath = (e.repath || 0) - 1;
      if (e.repath <= 0 || !e.path || !e.path.length) {
        e.repath = 15 + Math.floor(Math.random() * 15);
        e.path = findPath(e, Math.floor(t.x), Math.floor(t.y), Math.floor(t.z), 180);
        // No route at all: head straight there and hope.
        if (!e.path.length) e.path = [[t.x, t.y, t.z]];
      }
    };
    const mobPhysics = (e, wx, wz) => {
      const fluid = fluidAt(e, e.h * .4);
      if (fluid) {
        e.vx = e.vx * .8 + wx * .4; e.vz = e.vz * .8 + wz * .4;
        e.vy = e.vy * .8 - .02;
        if (fluidAt(e, e.h * .85) && e.vy < .1) e.vy += .05;
        if (e.hitWall) e.vy = .2;
      } else if (e.onGround) {
        e.vx = e.vx * .5 + wx * .5 * 1.02; e.vz = e.vz * .5 + wz * .5 * 1.02;
      } else {
        e.vx = e.vx * .96 + wx * .04; e.vz = e.vz * .96 + wz * .04;
      }
      if (!fluid) { e.vy = (e.vy - .08) * .98; if (e.m.glide && e.vy < -.1) e.vy = -.1; }
      const ox = e.x, oz = e.z;
      move(e, e.vx, e.vy, e.vz);
      e.stride += Math.hypot(e.x - ox, e.z - oz) * 5;
    };
    const damageMob = (e, dmg, kx, kz, by) => {
      if (e.hp <= 0 || e.hurt > 10) return false;
      e.hp -= dmg; e.hurt = 20;
      if (kx || kz) { e.vx = kx * .4; e.vz = kz * .4; e.vy = Math.max(e.vy, .3); }
      if (by) { e.angry = true; if (e.m.passive) { e.fleeing = 80; e.wander = 0; const a = Math.atan2(kz, kx) + (Math.random() - .5); e.path = findPath(e, Math.floor(e.x + Math.cos(a) * 12), Math.floor(e.y), Math.floor(e.z + Math.sin(a) * 12), 100); } }
      G.audio.play(e.hp <= 0 ? 'mob_die' : 'mob_hurt', G.fx.falloff(e.x, e.y, e.z), e.m.passive ? 1.3 : .9);
      if (e.hp <= 0) mobKilled(e, by);
      return true;
    };
    G.damageMob = damageMob;
    const mobKilled = (e, by) => {
      G.fx.deathBurst(e);
      if (!G.host()) return;
      const killerNet = by && by.net;
      const out = [];
      for (const [k, a, b] of e.m.drops) {
        let n = a + Math.floor(Math.random() * (b - a + 1));
        let key = k;
        if (k === 'white_wool' && e.shorn) continue;
        if (k === 'white_wool' && e.color) key = e.color + '_wool';
        if (n > 0) out.push([I[key], n]);
      }
      const xp = e.m.xp[0] + Math.floor(Math.random() * (e.m.xp[1] - e.m.xp[0] + 1));
      if (killerNet && G.net) G.net.sendLoot(by.net, e.x, e.y, e.z, out, xp);
      else { for (const [id, n] of out) G.spawnItem(e.x, e.y + .4, e.z, id, n); G.spawnOrb(e.x, e.y + .3, e.z, xp); }
      if (!m0Passive(e) && by && !by.net) G.advance && G.advance('kill');
    };
    const m0Passive = e => e.m.passive;
    G.explode = (x, y, z, power, source) => {
      const griefing = source !== 'mob' || G.level.rules.mobGriefing, W = G.W, rm = new Map();
      // Rays fan out from the blast and spend strength on what they pass through.
      if (griefing && G.host()) for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) for (let k = 0; k < 16; k++) {
        if (i && i < 15 && j && j < 15 && k && k < 15) continue;
        let dx = i / 15 * 2 - 1, dy = j / 15 * 2 - 1, dz = k / 15 * 2 - 1;
        const l = Math.hypot(dx, dy, dz);
        dx /= l; dy /= l; dz /= l;
        let s = power * (.7 + Math.random() * .6), px = x, py = y, pz = z;
        while (s > 0) {
          const a = Math.floor(px), b = Math.floor(py), c = Math.floor(pz), id = W.get(a, b, c);
          if (id) {
            const res = DEF[id].hard < 0 ? 1e4 : DEF[id].fluid ? 100 : Math.max(DEF[id].hard * 3, 0);
            s -= (res / 5 + .3) * .3;
            if (s > 0 && !DEF[id].fluid && DEF[id].hard >= 0) rm.set(a + ',' + b + ',' + c, [a, b, c, id]);
          }
          px += dx * .3; py += dy * .3; pz += dz * .3;
          s -= .225;
        }
      }
      for (const [a, b, c, id] of rm.values()) {
        if (W.get(a, b, c) !== id) continue;
        if (id === B.tnt) { G.setBlock(a, b, c, 0); G.primeTNT(a, b, c, 10 + Math.floor(Math.random() * 20)); continue; }
        const m = W.getMeta(a, b, c);
        G.setBlock(a, b, c, 0, 0, { noUpdate: rm.size > 60 });
        if (Math.random() < 1 / power && DEF[id].shape !== 'door') {
          const drop = DEF[id].drops;
          if (typeof drop === 'function') for (const [k2, n] of drop(m, Math.random)) { if (n > 0) G.spawnItem(a + .5, b + .5, c + .5, I[k2], n); }
          else if (typeof drop === 'string') G.spawnItem(a + .5, b + .5, c + .5, I[drop], 1);
          else if (drop === undefined && !DEF[id].noItem) G.spawnItem(a + .5, b + .5, c + .5, I[DEF[id].key], 1);
        }
      }
      const reach = power * 2;
      const hurtBy = (e, apply) => {
        const dx = e.x - x, dy = e.y + e.h / 2 - y, dz = e.z - z, d = Math.hypot(dx, dy, dz);
        if (d >= reach) return;
        const k = (1 - d / reach);
        apply((k * k + k) * 3.5 * power + 1, dx / (d || 1) * k, Math.max(.15, dy / (d || 1)) * k, dz / (d || 1) * k);
      };
      for (const e of list) {
        if (e.kind === 'mob') hurtBy(e, (dmg, a, b, c) => { damageMob(e, dmg, a, c, null); e.vx += a; e.vy += b * .6; e.vz += c; });
        else if (e.kind === 'item' && Math.random() < .8) hurtBy(e, () => { e.dead = true; });
      }
      if (G.player && G.mode() !== 'creative' && G.mode() !== 'spectator') hurtBy(G.player, (dmg, a, b, c) => { G.hurtPlayer(dmg, 'blast', 0, 0); G.player.vx += a * 1.1; G.player.vy += b * .7; G.player.vz += c * 1.1; });
      if (G.net) G.net.sendFx('explode', x, y, z, power);
      G.fx.explosion(x, y, z, power);
    };

    // ---------- Per-tick update ----------
    const absorb = e => {
      // Stacks lying close together merge so piles stay cheap.
      if (e.age % 20 !== 0) return;
      for (const o of list) {
        if (o === e || o.kind !== 'item' || o.dead || o.item !== e.item || o.dmg || e.dmg) continue;
        if (Math.abs(o.x - e.x) > 1 || Math.abs(o.y - e.y) > .5 || Math.abs(o.z - e.z) > 1) continue;
        if (o.count + e.count > (ITEMS[e.item].stack || 64)) continue;
        e.count += o.count; o.dead = true;
      }
    };
    const stepItem = (e, drag = .98) => {
      const f = fluidAt(e, .1);
      if (f === 2) { e.dead = true; G.audio.play('burn', G.fx.falloff(e.x, e.y, e.z)); return; }
      e.vy = f ? e.vy * .9 + .02 : (e.vy - .04) * drag;
      move(e, e.vx, e.vy, e.vz);
      const fr = e.onGround ? .6 * drag : drag;
      e.vx *= fr; e.vz *= fr;
    };
    const update = () => {
      const p = G.player;
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        e.px = e.x; e.py = e.y; e.pz = e.z; e.age++;
        if (e.kind === 'mob') {
          if (e.remote) { G.net.stepRemote(e); continue; }
          if (!G.W.loaded(Math.floor(e.x), Math.floor(e.z))) { e.dead = true; } else mobTick(e);
          const far = (p.x - e.x) ** 2 + (p.z - e.z) ** 2;
          if (!e.m.passive && !e.persist) { if (far > 128 * 128 || (far > 40 * 40 && Math.random() < .004)) e.dead = true; }
          else if (far > 160 * 160) e.dead = true;
          if (e.y < -32) e.dead = true;
        } else if (e.kind === 'item') {
          stepItem(e);
          if (--e.life <= 0 || e.y < -32) e.dead = true;
          absorb(e);
          if (e.delay > 0) e.delay--;
          else if (!p.dead && G.mode() !== 'spectator') {
            const dx = p.x - e.x, dy = p.y + .9 - e.y, dz = p.z - e.z, d = dx * dx + dy * dy + dz * dz;
            if (d < 3.2 * 3.2 && d > 1.1) { const k = .05 / Math.sqrt(d); e.vx += dx * k; e.vy += dy * k; e.vz += dz * k; }
            if (d <= 1.6) G.pickup(e);
          }
        } else if (e.kind === 'falling') {
          e.vy = (e.vy - .04) * .98;
          move(e, 0, e.vy, 0);
          if (e.onGround || e.age > 600) {
            const x = Math.floor(e.x), y = Math.floor(e.y + .01), z = Math.floor(e.z), cur = G.W.get(x, y, z);
            if (cur === 0 || DEF[cur].replace) { G.setBlock(x, y, z, e.block); G.fx.placeSound(e.block, x, y, z); }
            else G.spawnItem(e.x, e.y + .5, e.z, I[DEF[e.block].key], 1);
            e.dead = true;
          }
        } else if (e.kind === 'tnt') {
          e.vy = (e.vy - .04) * .98;
          move(e, e.vx, e.vy, e.vz);
          e.vx *= .9; e.vz *= .9;
          if (e.age % 2 === 0) G.R.addParticle({ tile: 'p_smoke', x: e.x, y: e.y + 1, z: e.z, vy: .4, g: 0, life: .6, size: .2, grow: .2, r: .5, gc: .5, b: .5, fade: true });
          if (--e.fuse <= 0) { e.dead = true; G.explode(e.x, e.y + .5, e.z, 4, 'tnt'); }
        } else if (e.kind === 'arrow' || e.kind === 'thrown') {
          stepProjectile(e);
        } else if (e.kind === 'orb') {
          stepItem(e, .96);
          if (!p.dead && G.mode() !== 'spectator') {
            const dx = p.x - e.x, dy = p.y + .9 - e.y, dz = p.z - e.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d < 7) { const k = (1 - d / 7) * .08 / (d || 1); e.vx += dx * k; e.vy += dy * k; e.vz += dz * k; }
            if (d < 1.3) { e.dead = true; G.addXP(e.xp); G.audio.play('orb', .8, .8 + Math.random() * .5); }
          }
          if (e.age > 6000) e.dead = true;
        } else if (e.kind === 'ghost') {
          if (e.age > 4) e.dead = true;
        }
        if (e.dead) { list.splice(i, 1); G.fx.removeObject(e); }
      }
    };
    const stepProjectile = e => {
      if (e.stuck) {
        e.life--;
        if (e.life <= 0) e.dead = true;
        if (e.kind === 'arrow' && !e.owner && G.player && !G.player.dead && Math.hypot(G.player.x - e.x, G.player.y + .9 - e.y, G.player.z - e.z) < 1.4 && e.pickable) {
          if (G.give(I.arrow, 1) === 0) { e.dead = true; G.audio.play('pop', .6); }
        }
        return;
      }
      const steps = Math.max(1, Math.ceil(Math.hypot(e.vx, e.vy, e.vz) / .25));
      for (let s = 0; s < steps && !e.dead && !e.stuck; s++) {
        const nx = e.x + e.vx / steps, ny = e.y + e.vy / steps, nz = e.z + e.vz / steps;
        // Living things first.
        const targets = list.filter(m => m.kind === 'mob' && m.hp > 0 && m !== e.owner);
        let hit = null;
        for (const m of targets) if (nx > m.x - m.w / 2 - .1 && nx < m.x + m.w / 2 + .1 && ny > m.y - .1 && ny < m.y + m.h + .1 && nz > m.z - m.w / 2 - .1 && nz < m.z + m.w / 2 + .1) { hit = m; break; }
        const pl = G.player;
        if (!hit && e.owner !== 'player' && pl && !pl.dead && G.mode() !== 'spectator' && nx > pl.x - .4 && nx < pl.x + .4 && ny > pl.y && ny < pl.y + pl.h && nz > pl.z - .4 && nz < pl.z + .4) hit = pl;
        if (hit) {
          if (e.kind === 'arrow') {
            const sp = Math.hypot(e.vx, e.vy, e.vz), dmg = Math.ceil(sp * (e.dmg || 2)), l = Math.hypot(e.vx, e.vz) || 1;
            if (hit === pl) G.hurtPlayer(dmg, 'arrow', e.vx / l, e.vz / l);
            else damageMob(hit, dmg, e.vx / l, e.vz / l, e.owner === 'player' ? { player: true } : null);
            G.audio.play('arrow_hit', G.fx.falloff(e.x, e.y, e.z));
          } else if (hit !== pl) damageMob(hit, 0.01, (e.vx > 0 ? 1 : -1) * .3, (e.vz > 0 ? 1 : -1) * .3, null);
          e.dead = true;
          break;
        }
        const id = G.W.get(Math.floor(nx), Math.floor(ny), Math.floor(nz));
        if (SOLID[id]) {
          if (e.kind === 'arrow') { e.stuck = true; e.life = 1200; e.vx = e.vy = e.vz = 0; e.pickable = e.owner === 'player'; if (e.pickable) e.owner = null; G.audio.play('arrow_hit', G.fx.falloff(e.x, e.y, e.z) * .7); }
          else {
            for (let i = 0; i < 8; i++) G.R.addParticle({ tile: e.what === 'egg' ? 'p_smoke' : 'p_snow', x: e.x, y: e.y, z: e.z, vx: (Math.random() - .5) * 2, vy: Math.random() * 2, vz: (Math.random() - .5) * 2, life: .5, size: .12 });
            if (e.what === 'egg' && Math.random() < .125 && G.host()) G.spawnMob('chicken_mob', e.x, e.y, e.z);
            e.dead = true;
          }
          break;
        }
        e.x = nx; e.y = ny; e.z = nz;
      }
      if (!e.stuck) {
        const f = FLUID[G.W.get(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z))];
        const k = f ? .6 : .99;
        e.vx *= k; e.vy = e.vy * k - (e.kind === 'arrow' ? .05 : .03); e.vz *= k;
      }
    };

    // ---------- Natural spawning ----------
    const spawnTick = () => {
      if (!G.host() || !G.level.rules.doMobSpawning) return;
      const p = G.player, W = G.W, t = G.tickCount;
      if (t % 16 === 0 && G.level.difficulty !== 'peaceful') {
        const hostile = list.reduce((n, e) => n + (e.kind === 'mob' && !e.m.passive ? 1 : 0), 0);
        const cap = 22;
        if (hostile < cap) for (let tries = 0; tries < 4; tries++) {
          const a = Math.random() * 6.283, r = 22 + Math.random() * 36, x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
          if (!W.loaded(x, z)) continue;
          let y = Math.floor(p.y + (Math.random() - .5) * 36);
          // Slide to the floor below this point.
          if (Math.random() < .5) y = W.top(x, z) + 1;
          while (y > 1 && !SOLID[W.get(x, y - 1, z)]) y--;
          if (y < 2 || !walkable(x, y, z, 2) || FLUID[W.get(x, y, z)] || !OPAQUE[W.get(x, y - 1, z)] || W.get(x, y - 1, z) === B.bedrock) continue;
          if (Math.hypot(x - p.x, y - p.y, z - p.z) < 22) continue;
          const l = W.lightAt(x, y, z), lit = Math.max(l & 15, (l >> 4) - G.skyDim());
          if (lit > 7 || l & 15) continue;
          const roll = Math.random(), type = roll < .38 ? 'zombie' : roll < .66 ? 'skeleton' : roll < .84 ? 'blastcap' : 'spider';
          const n = type === 'spider' ? 1 : 1 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) {
            const ox = x + Math.floor(Math.random() * 3) - 1, oz = z + Math.floor(Math.random() * 3) - 1;
            if (walkable(ox, y, oz, 2) && OPAQUE[W.get(ox, y - 1, oz)]) G.spawnMob(type, ox + .5, y, oz + .5);
          }
          break;
        }
      }
      if (t % 200 === 0) {
        const passive = list.reduce((n, e) => n + (e.kind === 'mob' && e.m.passive ? 1 : 0), 0);
        if (passive < 18) for (let tries = 0; tries < 8; tries++) {
          const a = Math.random() * 6.283, r = 24 + Math.random() * 40, x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
          if (!W.loaded(x, z)) continue;
          const y = W.top(x, z);
          if (W.get(x, y, z) !== B.grass_block || W.get(x, y + 1, z) && SOLID[W.get(x, y + 1, z)]) continue;
          const types = ['pig', 'cow', 'sheep', 'chicken_mob'], type = types[Math.floor(Math.random() * 4)], n = 2 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) {
            const ox = x + Math.floor(Math.random() * 5) - 2, oz = z + Math.floor(Math.random() * 5) - 2, oy = W.top(ox, oz);
            if (W.get(ox, oy, oz) === B.grass_block && walkable(ox, oy + 1, oz, 2)) G.spawnMob(type, ox + .5, oy + 1, oz + .5);
          }
          break;
        }
      }
    };

    // ---------- Drawing ----------
    const ORB_GEO = () => orbGeo || (orbGeo = new THREE.BoxGeometry(.14, .14, .14));
    let orbGeo = null;
    const blobTex = (() => {
      const c = CraftTex.canvas2(32, 32), g = c.getContext('2d'), r = g.createRadialGradient(16, 16, 2, 16, 16, 16);
      r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, 32, 32);
      return c;
    })();
    let blobMat = null;
    const shadow = (w) => {
      if (!blobMat) { const t = new THREE.CanvasTexture(blobTex); blobMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); }
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blobMat);
      m.rotation.x = -Math.PI / 2; m.scale.setScalar(Math.max(.5, w * 1.6)); m.renderOrder = 1;
      return m;
    };
    const placeShadow = (s, e, x, y, z) => {
      const W = G.W, ix = Math.floor(x), iz = Math.floor(z);
      let gy = Math.floor(y + .1), n = 0;
      while (n < 4 && gy > 0 && !SOLID[W.get(ix, gy - 1, iz)]) { gy--; n++; }
      s.visible = n < 4;
      s.position.set(x, gy + .02, z);
      s.material.opacity = 1 - n * .25;
    };
    const makeObject = e => {
      const s = G.R.scene;
      if (e.kind === 'mob') {
        const mdl = G.R.makeModel(e.type);
        s.add(mdl.group);
        e.obj = mdl;
        e.shadow = shadow(e.w); s.add(e.shadow);
        if (e.type === 'sheep') {
          const c = SHEEP_RGB[e.color] || SHEEP_RGB.white;
          if (c[0] !== 1) { const wool = mdl.parts.wool.children[0]; wool.material = mdl.mat.clone(); wool.userData.tint = c; }
          mdl.parts.body.visible = false;
        }
        if (e.type === 'skeleton') {
          const bow = G.R.itemObject(I.bow);
          bow.mesh.scale.setScalar(.8); bow.mesh.position.set(0, -.7, -.15); bow.mesh.rotation.set(0, Math.PI / 2, 0);
          mdl.parts.armR.add(bow.mesh);
          e.held = bow;
        }
      } else if (e.kind === 'item') {
        const o = G.R.itemObject(e.item);
        o.mesh.scale.setScalar(o.flat ? .5 : .25);
        s.add(o.mesh);
        e.obj = o;
        e.shadow = shadow(.3); s.add(e.shadow);
      } else if (e.kind === 'falling' || e.kind === 'tnt') {
        const o = G.R.itemObject(e.kind === 'tnt' ? B.tnt : e.block);
        o.mesh.scale.setScalar(1);
        s.add(o.mesh);
        e.obj = o;
      } else if (e.kind === 'arrow') {
        const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: 0x8a6a38 }), tip = new THREE.MeshBasicMaterial({ color: 0x9a9a9a }), fl = new THREE.MeshBasicMaterial({ color: 0xeeeeee });
        const mk = (w, h, d, m, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.z = z; g.add(b); };
        mk(.04, .04, .7, mat, 0); mk(.06, .06, .08, tip, -.38); mk(.14, .02, .12, fl, .3); mk(.02, .14, .12, fl, .3);
        s.add(g);
        e.obj = { mesh: g, setLit() {}, mats: [mat, tip, fl] };
      } else if (e.kind === 'thrown') {
        const o = G.R.itemObject(e.what === 'egg' ? I.egg : I.snowball);
        o.mesh.scale.setScalar(.4);
        s.add(o.mesh);
        e.obj = o;
      } else if (e.kind === 'orb') {
        const m = new THREE.Mesh(ORB_GEO(), new THREE.MeshBasicMaterial({ color: 0x9dff4a }));
        s.add(m);
        e.obj = { mesh: m, setLit() {}, mats: [m.material] };
      }
    };
    const animateMob = (e, x, y, z, alpha) => {
      const mdl = e.obj, g = mdl.group, p = mdl.parts, t = e.stride;
      g.position.set(x, y, z);
      g.rotation.y = e.yaw;
      g.rotation.z = e.dying ? Math.min(1.5, (e.dying + alpha) / 10) : 0;
      if (e.dying) g.position.y += .1;
      const swing = Math.sin(t) * .8, moving = Math.abs(e.vx) + Math.abs(e.vz) > .01;
      const amp = moving ? 1 : 0;
      const legs = (a, b, c, d) => {
        if (p[a]) p[a].rotation.x = swing * amp; if (p[b]) p[b].rotation.x = -swing * amp;
        if (c && p[c]) p[c].rotation.x = -swing * amp; if (d && p[d]) p[d].rotation.x = swing * amp;
      };
      legs('legL', 'legR'); legs('legFL', 'legFR', 'legBL', 'legBR');
      if (p.head) { p.head.rotation.y = e.headYaw; p.head.rotation.x = -e.pitch * -1; }
      if (mdl.def.armsUp) {
        const up = e.lookAt || e.type === 'zombie' ? 1.45 : 0, sw = (e.swing || 0) / 8 * .6;
        p.armL.rotation.x = up - sw + Math.sin(performance.now() * .002 + e.id) * .05;
        p.armR.rotation.x = up - sw - Math.sin(performance.now() * .002 + e.id) * .05;
      }
      if (p.wingL) { const f = e.onGround ? Math.sin(performance.now() * .003 + e.id) * .08 : Math.sin(performance.now() * .05) * .9 + .9; p.wingL.rotation.z = -f; p.wingR.rotation.z = f; }
      if (e.type === 'spider') {
        for (let i = 0; i < 8; i++) {
          const leg = p['leg' + i], side = i < 4 ? -1 : 1, n = i % 4, phase = n % 2 ? Math.PI : 0;
          leg.rotation.z = side * -(.55 + (moving ? Math.sin(t * 1.2 + phase) * .25 : 0));
          leg.rotation.y = side * ((n - 1.5) * .38 + (moving ? Math.cos(t * 1.2 + phase) * .22 : 0));
        }
      }
      if (e.type === 'blastcap') {
        const k = e.fuseT || 0, pulse = k ? 1 + (k / 30) * .3 + Math.sin(k * .9) * .05 : 1;
        g.scale.set(pulse, pulse * (2 - pulse) * 1.0 + (k ? 0 : 0), pulse);
        p.cap.scale.setScalar(1 + (k / 30) * .15);
      }
    };
    const render = alpha => {
      const R = G.R;
      for (const e of list) {
        if (!e.obj) makeObject(e);
        const x = e.px + (e.x - e.px) * alpha, y = e.py + (e.y - e.py) * alpha, z = e.pz + (e.z - e.pz) * alpha;
        const light = G.W.lightAt(Math.floor(x), Math.floor(y + Math.max(.1, e.h * .5)), Math.floor(z)), l = R.litAt(light);
        if (e.kind === 'mob') {
          animateMob(e, x, y, z, alpha);
          const mat = e.obj.mat, hurt = e.hurt > 10, flash = e.fuseT && Math.sin(e.fuseT * .9) > 0;
          if (flash) mat.color.setRGB(1, 1, 1);
          else if (hurt) mat.color.setRGB(l, l * .35, l * .35);
          else mat.color.setRGB(l, l, l);
          if (e.type === 'sheep') {
            const wool = e.obj.parts.wool.children[0], c = wool.userData.tint;
            if (c) wool.material.color.setRGB(c[0] * l * (hurt ? 1 : 1), c[1] * l * (hurt ? .35 : 1), c[2] * l * (hurt ? .35 : 1));
            e.obj.parts.wool.visible = !e.shorn; e.obj.parts.body.visible = !!e.shorn;
          }
          if (e.held) e.held.setLit(l, l, l);
          placeShadow(e.shadow, e, x, y, z);
        } else if (e.kind === 'item') {
          const o = e.obj;
          o.mesh.position.set(x, y + .18 + Math.sin(e.age * .1 + e.bob) * .07, z);
          o.mesh.rotation.y = (e.age + alpha) * .06 + e.bob;
          o.setLit(l, l, l);
          placeShadow(e.shadow, e, x, y, z);
        } else if (e.kind === 'falling') {
          e.obj.mesh.position.set(x, y + .5, z); e.obj.setLit(l, l, l);
        } else if (e.kind === 'tnt') {
          const f = Math.floor(e.fuse / 5) % 2 === 0, k = e.fuse < 10 ? 1 + (10 - e.fuse) * .03 : 1;
          e.obj.mesh.position.set(x, y + .5, z); e.obj.mesh.scale.setScalar(k);
          if (f) e.obj.setLit(1.6, 1.6, 1.6); else e.obj.setLit(l, l, l);
        } else if (e.kind === 'arrow') {
          e.obj.mesh.position.set(x, y, z);
          if (!e.stuck) { const h = Math.hypot(e.vx, e.vz); e.obj.mesh.rotation.set(0, 0, 0); e.obj.mesh.rotation.order = 'YXZ'; e.obj.mesh.rotation.y = Math.atan2(-e.vx, -e.vz); e.obj.mesh.rotation.x = Math.atan2(e.vy, h); }
          e.obj.mats[0].color.setRGB(.54 * l, .42 * l, .22 * l); e.obj.mats[1].color.setRGB(.6 * l, .6 * l, .6 * l); e.obj.mats[2].color.setRGB(.93 * l, .93 * l, .93 * l);
        } else if (e.kind === 'thrown') {
          e.obj.mesh.position.set(x, y, z); e.obj.mesh.rotation.y += .3; e.obj.setLit(l, l, l);
        } else if (e.kind === 'orb') {
          const k = 1 + Math.sin(e.age * .4) * .2;
          e.obj.mesh.position.set(x, y + .1, z); e.obj.mesh.scale.setScalar(k);
          e.obj.mats[0].color.setRGB(.6, .9 + Math.sin(e.age * .3) * .1, .2);
        }
      }
    };
    const removeObject = e => {
      if (e.shadow) { G.R.scene.remove(e.shadow); e.shadow.geometry.dispose(); }
      if (!e.obj) return;
      if (e.kind === 'mob') { G.R.scene.remove(e.obj.group); e.obj.mat.dispose(); if (e.held) e.held.mat.dispose(); }
      else {
        G.R.scene.remove(e.obj.mesh);
        if (e.obj.mat) e.obj.mat.dispose();
        if (e.obj.mats) e.obj.mats.forEach(m => m.dispose());
      }
    };
    const clear = () => { for (const e of list) removeObject(e); list.length = 0; };
    return { update, spawnTick, render, removeObject, clear, MOBS, sees };
  }
  return { install, MOBS };
})();
