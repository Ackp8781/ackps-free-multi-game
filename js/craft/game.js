// BlockCraft game: the fixed 20 Hz simulation, the player, input, saving and online play.
const CraftGame = (() => {
  const D = CraftData, { blocks: DEF, B, I, items: ITEMS, OPAQUE, SOLID, FLUID, DX, DZ } = D;
  const VERSION = '1.0';
  const RULES = { keepInventory: false, doDaylightCycle: true, doMobSpawning: true, mobGriefing: true, naturalRegeneration: true, doFireTick: true, randomTickSpeed: 3, showCoordinates: false };
  const coarse = () => matchMedia('(pointer:coarse)').matches;
  const DEFAULTS = { fov: 70, render: 8, sens: .5, music: .5, sound: 1, bob: true, fancy: true, clouds: true, gui: 0, invert: false, scale: 1, waves: true, shirt: 0 };
  const KEYS = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sneak: 'ShiftLeft', sprint: 'KeyR', inventory: 'KeyE', drop: 'KeyQ', chat: 'KeyT', command: 'Slash', perspective: 'F5', debug: 'F3', hud: 'F1', screenshot: 'F2', players: 'Tab' };

  function start(ctx) {
    const opt = { ...DEFAULTS, render: coarse() ? 4 : 8, ...Store.get('craft.options', {}) };
    const binds = { ...KEYS, ...Store.get('craft.keys', {}) };
    document.body.classList.add('bc-lock');
    const root = el('div', { class: 'bc-root' }), view = el('div', { class: 'bc-view' }), layer = el('div', { class: 'bc-ui' });
    root.append(view, layer);
    ctx.stage.append(root);
    const R = CraftRender.create(view, { scale: opt.scale });
    R.setClouds(opt.clouds); R.setWaves(opt.waves); CraftMesher.setFancy(opt.fancy);
    CraftAudio.volume = opt.sound; CraftAudio.music = opt.music;
    const G = { ctx, R, opt, binds, audio: CraftAudio, W: null, level: null, player: null, net: null, tickCount: 0, paused: false, ready: false, root, layer, VERSION, RULES, coarse };
    const keys = new Set();
    G.keys = keys;
    const mouse = { left: false, right: false, leftEdge: false, rightEdge: false };
    G.mouse = mouse;
    G.mode = () => (G.player ? G.player.mode : 'survival');
    G.host = () => !G.net || G.net.isHost;
    G.diffIdx = () => ({ easy: 0, normal: 1, hard: 2 }[G.level.difficulty] ?? 0);
    let localGenerator = null;
    G.localGen = () => localGenerator || (localGenerator = CraftGen.create({ seed: G.level.seed, type: G.level.type, structures: false }));

    // ---------- Effects ----------
    const falloff = (x, y, z) => { const p = G.camera || { x: 0, y: 0, z: 0 }; return Math.max(0, 1 - Math.hypot(x - p.x, y - p.y, z - p.z) / 24); };
    const mat = id => DEF[id].sound || 'stone';
    const tileOf = (id, m = 0) => { CraftMesher.init(); return CraftMesher.tileFor(id, m, DEF[id].shape === 'cube' || DEF[id].shape === 'farmland' ? 4 : 2); };
    const blockBits = (x, y, z, id, m, n = 18, power = 1) => {
      const t = tileOf(id, m), d = DEF[id], tint = d.tint === 'grass' ? [.55, .78, .35] : d.tint === 'foliage' ? [.45, .7, .3] : d.tint === 'water' ? [.3, .5, .9] : [1, 1, 1];
      const name = TILE_NAME(t);
      for (let i = 0; i < n; i++) {
        const px = x + .15 + Math.random() * .7, py = y + .15 + Math.random() * .7, pz = z + .15 + Math.random() * .7;
        R.addParticle({ tile: name, cut: 4, ou: Math.random() * .75, ov: Math.random() * .75, x: px, y: py, z: pz, vx: (px - x - .5) * 4 * power, vy: (py - y - .3) * 4 * power + 1, vz: (pz - z - .5) * 4 * power, g: 16, life: .35 + Math.random() * .6, size: .08 + Math.random() * .08, r: tint[0], gc: tint[1], b: tint[2], collide: true });
      }
    };
    const TILE_MAP = new Map();
    const TILE_NAME = t => {
      if (!TILE_MAP.size) for (const [k, v] of CraftTex.build().index) TILE_MAP.set(v, k);
      return TILE_MAP.get(t) || 'stone';
    };
    G.fx = {
      falloff,
      sound: (k, x, y, z) => CraftAudio.play(k, falloff(x, y, z)),
      placeSound: (id, x, y, z) => CraftAudio.block('place', mat(id), falloff(x + .5, y + .5, z + .5)),
      breakBlock(x, y, z, id, m) { CraftAudio.block('dig', mat(id), falloff(x + .5, y + .5, z + .5)); blockBits(x, y, z, id, m); },
      hiss(x, y, z) {
        CraftAudio.play('hiss', falloff(x, y, z));
        for (let i = 0; i < 8; i++) R.addParticle({ tile: 'p_smoke', x: x + Math.random(), y: y + 1, z: z + Math.random(), vy: 1.2, g: 0, life: 1, size: .25, grow: .3, r: .8, gc: .8, b: .8, fade: true });
      },
      poof(e) { for (let i = 0; i < 14; i++) R.addParticle({ tile: 'p_smoke', x: e.x + (Math.random() - .5) * e.w, y: e.y + Math.random() * e.h, z: e.z + (Math.random() - .5) * e.w, vx: (Math.random() - .5), vy: Math.random() * 1.4, vz: (Math.random() - .5), g: 0, life: .7, size: .3, grow: .3, r: .9, gc: .9, b: .9, fade: true }); },
      deathBurst() {},
      mobSay(e) { CraftAudio.play(e.type, falloff(e.x, e.y, e.z) * .8); },
      removeObject: e => G.ents.removeObject(e),
      explosion(x, y, z, power) {
        CraftAudio.play('explode', Math.max(.25, falloff(x, y, z)));
        const d = Math.hypot(x - G.player.x, y - G.player.y, z - G.player.z);
        if (d < 24) G.shake = Math.max(G.shake, (1 - d / 24) * 1.1);
        G.flash(`rgba(255,240,200,${Math.max(.1, .75 - d / 40)})`);
        for (let i = 0; i < 70; i++) {
          const a = Math.random() * 6.283, b = Math.random() * 3.14, s = Math.random() * power * 1.8;
          R.addParticle({ tile: i % 3 ? 'p_smoke' : 'p_flame', x, y, z, vx: Math.cos(a) * Math.sin(b) * s, vy: Math.cos(b) * s, vz: Math.sin(a) * Math.sin(b) * s, g: i % 3 ? -.6 : 1, drag: .94, life: .5 + Math.random() * .9, size: .4 + Math.random() * .4, grow: .7, r: i % 3 ? .35 : 1, gc: i % 3 ? .35 : 1, b: i % 3 ? .35 : 1, fade: true, glow: !(i % 3) });
        }
      },
    };
    G.flash = color => G.ui && G.ui.flash(color);
    G.shake = 0;

    CraftRules.install(G);
    G.ents = CraftEntities.install(G);

    // ---------- Inventory ----------
    const stackMax = id => ITEMS[id].stack || 64;
    G.stackMax = stackMax;
    G.held = () => G.player.inv[G.player.sel];
    G.give = (id, count, dmg = 0) => {
      const inv = G.player.inv, max = stackMax(id);
      const merge = i => { const s = inv[i]; if (s && s.id === id && !s.dmg && !dmg && s.count < max) { const n = Math.min(count, max - s.count); s.count += n; count -= n; } };
      for (let i = 0; i < 36 && count > 0; i++) merge(i);
      for (let i = 0; i < 36 && count > 0; i++) if (!inv[i]) { const n = Math.min(count, max); inv[i] = { id, count: n, dmg }; count -= n; }
      G.ui.dirty();
      return count;
    };
    const removeStack = s => {
      const p = G.player, i = p.inv.indexOf(s);
      if (i >= 0) p.inv[i] = null;
      const a = p.armor.indexOf(s);
      if (a >= 0) p.armor[a] = null;
    };
    G.consume = (s, n = 1) => {
      if (!s || G.mode() === 'creative') return;
      s.count -= n;
      if (s.count <= 0) removeStack(s);
      G.ui.dirty();
    };
    G.replaceStack = (s, id) => {
      if (G.mode() === 'creative') return;
      if (s.count > 1) { s.count--; if (G.give(id, 1) > 0) G.spawnItem(G.player.x, G.player.y + 1, G.player.z, id, 1); }
      else { s.id = id; s.dmg = 0; }
      G.ui.dirty();
    };
    G.useDurability = (s, n = 1) => {
      if (!s || G.mode() === 'creative') return;
      const it = ITEMS[s.id];
      if (!it.dur) return;
      s.dmg = (s.dmg || 0) + n;
      if (s.dmg >= it.dur) { removeStack(s); CraftAudio.play('break_tool', 1); }
      G.ui.dirty();
    };
    G.pickup = e => {
      const left = G.give(e.item, e.count, e.dmg);
      if (left === e.count) return;
      CraftAudio.play('pop', .55, .9 + Math.random() * .5);
      e.count = left;
      if (!left) e.dead = true;
      hookItem(e.item);
    };
    const ADVANCES = {
      wood: ['Timber!', 'Punch a tree until a log pops out'], bench: ['Bench Pressed', 'Craft a crafting table'], pick: ['Time to Dig', 'Craft a pickaxe'], stone: ['Solid Rock', 'Mine some cobblestone'], smelt: ['Hot Stuff', 'Smelt something in a furnace'],
      iron: ['Metal Head', 'Collect raw iron'], diamond: ['Sparkling!', 'Find a diamond'], kill: ['Monster Hunter', 'Defeat a hostile creature'], bread: ['Fresh Baked', 'Bake some bread'], sleep: ['Sweet Dreams', 'Sleep through the night'], armor: ['Suit Up', 'Wear a piece of armor'],
    };
    G.advance = k => {
      const lvl = G.level;
      if (!lvl || (lvl.done = lvl.done || {})[k] || !ADVANCES[k]) return;
      lvl.done[k] = 1;
      G.ui.toast('Advancement Made!', ADVANCES[k][0], ADVANCES[k][1]);
      CraftAudio.play('advance', .9);
    };
    const hookItem = id => {
      const it = ITEMS[id];
      if (it.key.endsWith('_log')) G.advance('wood');
      else if (it.key === 'cobblestone') G.advance('stone');
      else if (it.key === 'raw_iron') G.advance('iron');
      else if (it.key === 'diamond') G.advance('diamond');
    };
    G.hookCraft = id => {
      const it = ITEMS[id];
      if (it.key === 'crafting_table') G.advance('bench');
      else if (it.tool === 'pickaxe') G.advance('pick');
      else if (it.key === 'bread') G.advance('bread');
    };
    G.addXP = n => {
      const p = G.player;
      p.xp += n;
      for (;;) {
        const need = p.level < 16 ? 2 * p.level + 7 : p.level < 31 ? 5 * p.level - 38 : 9 * p.level - 158;
        if (p.xp < need) break;
        p.xp -= need; p.level++;
        if (p.level % 5 === 0) CraftAudio.play('level', .8);
      }
      G.ui.dirty();
    };
    G.dropHeld = all => {
      const s = G.held();
      if (!s) return;
      const n = all ? s.count : 1;
      tossItem(s.id, n, s.dmg);
      if (G.mode() !== 'creative') { s.count -= n; if (s.count <= 0) G.player.inv[G.player.sel] = null; }
      G.ui.dirty();
      G.swing();
    };
    const tossItem = (id, n, dmg) => {
      const p = G.player, f = dirOf(p.yaw, p.pitch);
      G.spawnItem(p.x + f[0] * .3, p.y + p.eyeNow - .3, p.z + f[2] * .3, id, n, dmg, { vx: f[0] * .32, vy: f[1] * .32 + .12, vz: f[2] * .32, delay: 40 });
    };
    G.tossItem = tossItem;
    const dirOf = (yaw, pitch) => { const c = Math.cos(pitch); return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c]; };
    G.swing = () => { G.swingT = 1; };

    // ---------- Sky helpers ----------
    G.skyDim = () => {
      const k = R.state.dayK;
      return Math.round((1 - k) * 11) + (G.level && G.level.rainK > .5 ? 3 : 0);
    };
    const biomeDef = (x, z) => CraftGen.BIOMES[G.W.biome(x, z)];
    G.biomeDef = biomeDef;
    const dryBiome = b => b.key === 'desert' || b.key === 'savanna' || b.key === 'badlands';
    G.weatherRainAt = (x, z) => {
      if (!G.level || G.level.rainK < .4) return false;
      if (dryBiome(biomeDef(x, z))) return false;
      return true;
    };

    // ---------- Raycast ----------
    const eyePos = () => { const p = G.player; return [p.x, p.y + p.eyeNow, p.z]; };
    G.raycast = (fluids = false, reachIn) => {
      const p = G.player, [ox, oy, oz] = eyePos(), [dx, dy, dz] = dirOf(p.yaw, p.pitch), W = G.W;
      const reach = reachIn || (p.mode === 'creative' ? 5 : 4.5);
      let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
      const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
      const tdx = dx ? Math.abs(1 / dx) : 1e9, tdy = dy ? Math.abs(1 / dy) : 1e9, tdz = dz ? Math.abs(1 / dz) : 1e9;
      let tx = dx ? (dx > 0 ? x + 1 - ox : ox - x) * tdx : 1e9, ty = dy ? (dy > 0 ? y + 1 - oy : oy - y) * tdy : 1e9, tz = dz ? (dz > 0 ? z + 1 - oz : oz - z) * tdz : 1e9;
      let t = 0, nx = 0, ny = 0, nz = 0;
      for (let steps = 0; steps < 32 && t <= reach; steps++) {
        const id = W.get(x, y, z);
        if (id) {
          const d = DEF[id];
          if (d.fluid) {
            if (fluids && t > 0) return { x, y, z, id, nx, ny, nz, hx: ox + dx * t, hy: oy + dy * t, hz: oz + dz * t, t };
          } else {
            const conn = d.shape === 'fence' || d.shape === 'pane' ? G.connMask(x, y, z, d) : 0;
            const m = W.getMeta(x, y, z), boxes = D.shape(id, m, conn).sel;
            let best = 1e9, bn = null;
            for (const b of boxes) {
              const h = rayBox(ox, oy, oz, dx, dy, dz, x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]);
              if (h && h[0] < best) { best = h[0]; bn = h; }
            }
            if (bn && best <= reach) return { x, y, z, id, m, nx: bn[1], ny: bn[2], nz: bn[3], hx: ox + dx * best, hy: oy + dy * best, hz: oz + dz * best, t: best, boxes, conn };
          }
        }
        if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
        else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
        else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
      }
      return null;
    };
    const rayBox = (ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) => {
      let tmin = -1e9, tmax = 1e9, nx = 0, ny = 0, nz = 0;
      const test = (o, d, a, b, ax) => {
        if (Math.abs(d) < 1e-9) return o >= a && o <= b;
        let t0 = (a - o) / d, t1 = (b - o) / d, n = -1;
        if (t0 > t1) { const q = t0; t0 = t1; t1 = q; n = 1; }
        if (t0 > tmin) { tmin = t0; nx = ax === 0 ? n : 0; ny = ax === 1 ? n : 0; nz = ax === 2 ? n : 0; }
        if (t1 < tmax) tmax = t1;
        return tmin <= tmax;
      };
      if (!test(ox, dx, x0, x1, 0) || !test(oy, dy, y0, y1, 1) || !test(oz, dz, z0, z1, 2) || tmax < 0) return null;
      return [Math.max(tmin, 0), nx, ny, nz];
    };
    const rayEntity = reach => {
      const [ox, oy, oz] = eyePos(), p = G.player, [dx, dy, dz] = dirOf(p.yaw, p.pitch);
      let best = null, bt = reach;
      for (const e of G.entities) {
        if (e.kind !== 'mob' || e.hp <= 0) continue;
        const h = rayBox(ox, oy, oz, dx, dy, dz, e.x - e.w / 2 - .1, e.y - .1, e.z - e.w / 2 - .1, e.x + e.w / 2 + .1, e.y + e.h + .1, e.z + e.w / 2 + .1);
        if (h && h[0] < bt) { bt = h[0]; best = e; }
      }
      return best ? { e: best, t: bt } : null;
    };
    G.rayEntity = rayEntity;

    // ---------- Player ----------
    const newPlayer = (spawn, mode) => ({
      x: spawn.x, y: spawn.y, z: spawn.z, px: spawn.x, py: spawn.y, pz: spawn.z, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, w: .6, h: 1.8, step: .6, onGround: false, eyeNow: 1.62,
      hp: 20, food: 20, sat: 5, exh: 0, air: 300, xp: 0, level: 0, inv: new Array(36).fill(null), armor: [null, null, null, null], sel: 0, mode, flying: mode === 'spectator', sneaking: false, sprinting: false, fall: 0, fire: 0, hurt: 0, invul: 0, dead: false, regen: 0, starve: 0, jumpCd: 0, atk: 40,
    });
    const armorPts = p => p.armor.reduce((a, s) => a + (s ? ITEMS[s.id].pts || 0 : 0), 0);
    G.armorPts = () => armorPts(G.player);
    G.exhaust = n => { if (G.mode() === 'survival' || G.mode() === 'adventure') G.player.exh += n; };
    G.hurtPlayer = (dmg, source, kx = 0, kz = 0) => {
      const p = G.player, m = p.mode;
      if (p.dead || m === 'creative' || m === 'spectator' || G.level.difficulty === 'peaceful' && source === 'mob') return false;
      if (p.invul > 0) return false;
      p.invul = 10;
      if (source !== 'void' && source !== 'starve' && source !== 'drown' && source !== 'fall' && source !== 'fire') {
        dmg *= 1 - Math.min(20, armorPts(p)) / 25;
        for (const s of p.armor) if (s) G.useDurability(s, 1);
      }
      p.hp -= dmg;
      p.hurt = 10;
      if (kx || kz) { p.vx += kx * .4; p.vz += kz * .4; p.vy = Math.max(p.vy, .36); p.flying = false; }
      G.exhaust(.1);
      CraftAudio.play('hurt', 1);
      G.tilt = (Math.random() < .5 ? -1 : 1) * .14;
      G.ui.dirty(); G.ui.hurtFlash();
      if (p.hp <= 0) die(source);
      return true;
    };
    G.hitPlayer = (target, dmg, kx, kz) => {
      if (target.net) G.net.sendDamage(target.p.id, dmg, kx, kz);
      else G.hurtPlayer(dmg, 'mob', kx, kz);
    };
    const DEATHS = { void: 'fell out of the world', fall: 'hit the ground too hard', drown: 'drowned', fire: 'burned to death', lava: 'tried to swim in lava', starve: 'starved to death', arrow: 'was shot by a Skeleton', blast: 'blew up', mob: 'was slain', cactus: 'was pricked to death', suffocate: 'suffocated in a wall' };
    const die = source => {
      const p = G.player;
      p.dead = true; p.hp = 0;
      if (!G.level.rules.keepInventory) {
        for (const list of [p.inv, p.armor]) list.forEach((s, i) => {
          if (!s) return;
          const a = Math.random() * 6.283, r = Math.random() * .4;
          G.spawnItem(p.x, p.y + 1, p.z, s.id, s.count, s.dmg || 0, { vx: Math.cos(a) * r, vy: .25, vz: Math.sin(a) * r, delay: 40 });
          list[i] = null;
        });
        const orbs = Math.min(7 * p.level, 100);
        G.spawnOrb(p.x, p.y + .5, p.z, orbs);
        p.level = 0; p.xp = 0;
      }
      G.mouse.left = G.mouse.right = false;
      releaseCapture();
      const text = DEATHS[source] || 'died';
      G.ui.death(text, p.level);
      if (G.net) G.net.chat(`${ctx.user.name} ${text}`);
    };
    G.respawn = () => {
      const p = G.player, s = G.level.spawn;
      Object.assign(p, { x: s.x, y: s.y, z: s.z, px: s.x, py: s.y, pz: s.z, vx: 0, vy: 0, vz: 0, hp: 20, food: 20, sat: 5, exh: 0, air: 300, fire: 0, fall: 0, dead: false, hurt: 0, invul: 60 });
      placeOnGround(p);
      G.ui.dirty();
      capture();
    };
    const placeOnGround = p => {
      const x = Math.floor(p.x), z = Math.floor(p.z);
      if (!G.W.loaded(x, z)) return;
      let y = Math.floor(p.y);
      // Walk up out of anything solid and down onto the first floor.
      while (y < 254 && (SOLID[G.W.get(x, y, z)] || SOLID[G.W.get(x, y + 1, z)])) y++;
      while (y > 1 && !SOLID[G.W.get(x, y - 1, z)] && !FLUID[G.W.get(x, y - 1, z)]) y--;
      p.y = y + .001; p.py = p.y;
    };
    let wTap = -99, spaceTap = -99, rightCd = 0, dig = null, breakCd = 0, stepDist = 0, wasWater = false, leftWas = false, rightWas = false;
    const down = name => keys.has(binds[name]) || (name === 'sneak' && keys.has('ShiftRight')) || (G.touch && G.touch[name]);
    G.keyDown = down;
    const noInput = () => G.ui.isOpen() || G.paused;
    const playerTick = () => {
      const p = G.player, W = G.W, spec = p.mode === 'spectator', creative = p.mode === 'creative' || spec;
      p.px = p.x; p.py = p.y; p.pz = p.z;
      if (p.dead) return;
      if (p.invul > 0) p.invul--;
      if (p.hurt > 0) p.hurt--;
      p.atk++;
      if (p.jumpCd > 0) p.jumpCd--;
      const blocked = noInput();
      let fw = 0, st = 0;
      if (!blocked) {
        fw = (down('forward') ? 1 : 0) - (down('back') ? 1 : 0);
        st = (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
        if (G.touch && G.touch.stick) { fw += G.touch.stick[1]; st += G.touch.stick[0]; }
      }
      const jump = !blocked && down('jump');
      const sneak = !blocked && down('sneak');
      if (!p.flying) {
        const was = p.sneaking;
        p.sneaking = sneak;
        if (was && !sneak && G.collides(p.x, p.y, p.z, .3, 1.8)) p.sneaking = true;
      } else p.sneaking = false;
      p.h = p.sneaking ? 1.5 : 1.8;
      p.edgeGuard = p.sneaking && p.onGround;
      p.noclip = spec;
      p.eyeTarget = p.sneaking ? 1.27 : 1.62;
      // Sprinting
      if (!blocked && G.keyTapped === binds.forward) {
        if (G.tickCount - wTap < 7 && p.food > 6) p.sprinting = true;
        wTap = G.tickCount;
      }
      if (!blocked && down('sprint') && fw > 0 && (p.food > 6 || creative)) p.sprinting = true;
      if (fw <= 0 || p.sneaking || (p.food <= 6 && !creative) || p.using || p.hitWall) p.sprinting = false;
      // Flying toggle
      if (!blocked && G.keyTapped === binds.jump && p.mode === 'creative') {
        if (G.tickCount - spaceTap < 7) { p.flying = !p.flying; p.vy = 0; spaceTap = -99; } else spaceTap = G.tickCount;
      }
      G.keyTapped = null;
      const useK = p.using ? .2 : p.sneaking ? .3 : 1;
      let forward = fw * useK, strafe = st * useK;
      const fluidBody = FLUID[W.get(Math.floor(p.x), Math.floor(p.y + .4), Math.floor(p.z))];
      const fluidEye = FLUID[W.get(Math.floor(p.x), Math.floor(p.y + p.eyeNow), Math.floor(p.z))];
      const webbed = W.get(Math.floor(p.x), Math.floor(p.y + .5), Math.floor(p.z)) === B.cobweb;
      const applyInput = accel => {
        let f = strafe * strafe + forward * forward;
        if (f < 1e-4) return;
        f = Math.sqrt(f);
        if (f < 1) f = 1;
        f = accel / f;
        const s = strafe * f, w = forward * f, sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
        p.vx += s * cos - w * sin;
        p.vz += -s * sin - w * cos;
      };
      const ox = p.x, oz = p.z, oy = p.y;
      if (p.flying) {
        const up = (jump ? 1 : 0) - (down('sneak') && !blocked ? 1 : 0);
        p.vy += up * .15;
        applyInput(p.sprinting ? .1 : .05);
        G.move(p, p.vx, p.vy, p.vz);
        p.vx *= .91; p.vz *= .91; p.vy *= .6;
        if (p.onGround && !spec) p.flying = false;
        p.fall = 0;
      } else if (fluidBody) {
        const lava = fluidBody === 2;
        applyInput(lava ? .02 : .025);
        const surfaceY = p.y;
        G.move(p, p.vx, p.vy, p.vz);
        const k = lava ? .5 : .8;
        p.vx *= k; p.vz *= k; p.vy = p.vy * k - .02;
        if (jump) p.vy += .04;
        else if (sneak) p.vy -= .02;
        if (p.hitWall && !FLUID[W.get(Math.floor(p.x), Math.floor(surfaceY + 1.4), Math.floor(p.z))]) p.vy = .3;
        p.fall = 0;
        if (!wasWater && !lava) { CraftAudio.play('splash', Math.min(1, .3 + Math.abs(p.vy))); splash(p); }
        wasWater = !lava;
      } else {
        wasWater = false;
        const under = W.get(Math.floor(p.x), Math.floor(p.y - .2), Math.floor(p.z));
        const slip = p.onGround ? (DEF[under].slip || .6) * .91 : .91;
        const sprintK = p.sprinting ? 1.3 : 1;
        applyInput(p.onGround ? .1 * (.16277 / (slip * slip * slip)) * sprintK : .02 * sprintK);
        // Ladders and vines hold you up.
        const climb = DEF[W.get(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))].climb;
        if (climb) {
          p.vx = Math.max(-.15, Math.min(.15, p.vx)); p.vz = Math.max(-.15, Math.min(.15, p.vz));
          p.vy = Math.max(p.vy, -.15);
          if (p.sneaking && p.vy < 0) p.vy = 0;
          p.fall = 0;
        }
        if (jump && p.onGround && !p.jumpCd) {
          p.vy = .42; p.jumpCd = 10;
          if (p.sprinting) { p.vx -= Math.sin(p.yaw) * .2; p.vz -= Math.cos(p.yaw) * .2; G.exhaust(.2); } else G.exhaust(.05);
        }
        if (webbed) { p.vx *= .25; p.vz *= .25; p.vy *= .05; p.fall = 0; }
        const vy0 = p.vy;
        G.move(p, p.vx, p.vy, p.vz);
        if (climb && p.hitWall && (fw || st)) p.vy = .2;
        if (p.onGround) {
          if (p.fall > 3 && !creative) {
            const dmg = Math.ceil(p.fall - 3);
            G.hurtPlayer(dmg, 'fall');
            CraftAudio.play('fall', Math.min(1, dmg / 6));
          } else if (vy0 < -.3) CraftAudio.block('step', mat(under), .7);
          p.fall = 0;
        } else if (vy0 < 0) p.fall -= vy0;
        p.vy = (p.vy - .08) * .98;
        p.vx *= slip; p.vz *= slip;
      }
      // Footsteps and swimming strokes follow distance walked.
      const moved = Math.hypot(p.x - ox, p.z - oz);
      G.walkDist = (G.walkDist || 0) + moved;
      if (!p.flying) {
        G.exhaust(fluidBody ? moved * .01 : p.sprinting ? moved * .1 : 0);
        stepDist += moved;
        if (stepDist > (p.sprinting ? 2.2 : 1.7)) {
          stepDist = 0;
          if (fluidBody) CraftAudio.play('swim', .4);
          else if (p.onGround && !p.sneaking) {
            const u = W.get(Math.floor(p.x), Math.floor(p.y - .2), Math.floor(p.z));
            if (u) CraftAudio.block('step', mat(u), .6);
            if (p.sprinting) R.addParticle({ tile: 'p_smoke', x: p.x, y: p.y + .1, z: p.z, vy: .5, g: 0, life: .4, size: .18, r: .75, gc: .75, b: .75, fade: true });
          }
        }
      }
      p.oyTick = oy;
      statusTick(p, fluidEye, fluidBody);
      useTick(p);
    };
    const splash = p => { for (let i = 0; i < 16; i++) R.addParticle({ tile: 'p_drop', x: p.x + (Math.random() - .5), y: p.y + .3, z: p.z + (Math.random() - .5), vx: (Math.random() - .5) * 3, vy: 2 + Math.random() * 3, vz: (Math.random() - .5) * 3, life: .7, size: .13 }); };
    const statusTick = (p, fluidEye, fluidBody) => {
      const W = G.W, survival = p.mode === 'survival' || p.mode === 'adventure';
      if (fluidEye === 1 && survival) {
        p.air--;
        if (G.tickCount % 12 === 0) { const f = dirOf(p.yaw, 0); R.addParticle({ tile: 'p_bubble', x: p.x + f[0] * .5, y: p.y + 1.5, z: p.z + f[2] * .5, vy: 1.8, g: 0, life: 1, size: .12 }); if (Math.random() < .3) CraftAudio.play('bubble', .3); }
        if (p.air <= -20) { p.air = 0; G.hurtPlayer(2, 'drown'); }
        G.ui.dirty();
      } else if (p.air < 300) { p.air = Math.min(300, p.air + 4); G.ui.dirty(); }
      if (fluidBody === 2 && survival) {
        p.fire = Math.max(p.fire, 300);
        if (G.tickCount % 10 === 0) G.hurtPlayer(4, 'lava');
        if (G.tickCount % 12 === 0) CraftAudio.play('lava', .5);
      }
      const cell = W.get(Math.floor(p.x), Math.floor(p.y + .1), Math.floor(p.z));
      if (cell === B.fire && survival) { p.fire = Math.max(p.fire, 160); if (G.tickCount % 10 === 0) G.hurtPlayer(1, 'fire'); }
      if (p.fire > 0) {
        p.fire--;
        if (fluidBody === 1 || G.weatherRainAt(Math.floor(p.x), Math.floor(p.z))) p.fire = 0;
        if (survival && p.fire % 20 === 0 && fluidBody !== 2) G.hurtPlayer(1, 'fire');
        if (G.tickCount % 2 === 0 && G.cameraMode) R.addParticle({ tile: 'p_flame', x: p.x + (Math.random() - .5) * .6, y: p.y + Math.random() * 1.8, z: p.z + (Math.random() - .5) * .6, vy: 1, g: 0, life: .5, size: .25, glow: true, fade: true });
      }
      // Cactus pricks and walls suffocate.
      if (survival) {
        for (const [dx, dz] of [[.32, 0], [-.32, 0], [0, .32], [0, -.32]]) if (W.get(Math.floor(p.x + dx), Math.floor(p.y + .5), Math.floor(p.z + dz)) === B.cactus && G.tickCount % 10 === 0) { G.hurtPlayer(1, 'cactus'); break; }
        const headId = W.get(Math.floor(p.x), Math.floor(p.y + p.eyeNow), Math.floor(p.z));
        if (OPAQUE[headId] && G.tickCount % 10 === 0) G.hurtPlayer(1, 'suffocate');
      }
      if (p.y < -64) { if (p.mode === 'creative' || p.mode === 'spectator') { if (p.vy < 0 && p.y < -80) { p.y = 280; } } else if (G.tickCount % 10 === 0) { p.invul = 0; G.hurtPlayer(4, 'void'); } }
      if (!survival) return;
      // Hunger
      if (G.level.difficulty === 'peaceful') {
        if (G.tickCount % 20 === 0 && p.food < 20) { p.food++; G.ui.dirty(); }
        if (G.tickCount % 20 === 0 && p.hp < 20 && G.level.rules.naturalRegeneration) { p.hp = Math.min(20, p.hp + 1); G.ui.dirty(); }
        return;
      }
      if (p.exh >= 4) {
        p.exh -= 4;
        if (p.sat > 0) p.sat = Math.max(0, p.sat - 1);
        else if (p.food > 0) { p.food--; G.ui.dirty(); }
      }
      const regenOn = G.level.rules.naturalRegeneration;
      if (regenOn && p.food >= 20 && p.sat > 0 && p.hp < 20) {
        if (++p.regen >= 10) { p.regen = 0; const a = Math.min(p.sat, 6); p.hp = Math.min(20, p.hp + a / 6); p.exh += a; G.ui.dirty(); }
      } else if (regenOn && p.food >= 18 && p.hp < 20) {
        if (++p.regen >= 80) { p.regen = 0; p.hp = Math.min(20, p.hp + 1); p.exh += 6; G.ui.dirty(); }
      } else if (p.food <= 0) {
        if (++p.starve >= 80) {
          p.starve = 0;
          const floor = { easy: 10, normal: 1, hard: 0 }[G.level.difficulty] ?? 1;
          if (p.hp > floor) { p.invul = 0; G.hurtPlayer(1, 'starve'); }
        }
      } else { p.regen = 0; p.starve = 0; }
    };
    const useTick = p => {
      // Mining, attacking, placing and holding items in use.
      const left = G.mouse.left && !noInput(), right = G.mouse.right && !noInput();
      const leftEdge = left && !leftWas, rightEdge = right && !rightWas;
      leftWas = left; rightWas = right;
      const spec = p.mode === 'spectator', s = G.held(), it = s ? ITEMS[s.id] : null;
      if (spec) return;
      if (rightCd > 0) rightCd--;
      if (breakCd > 0) breakCd--;
      if (p.using) {
        if (!right || !s || s.id !== p.using.id) {
          if (p.using.kind === 'bow') shootBow(p, s);
          p.using = null;
        } else {
          p.using.t++;
          if (p.using.kind === 'eat') {
            if (p.using.t % 4 === 0 && p.using.t > 6) {
              CraftAudio.play(it.key === 'milk_bucket' ? 'drink' : 'eat', .7);
              if (it.block === undefined) foodBits(p, s.id);
            }
            if (p.using.t >= p.using.max) { finishEating(p, s, it); p.using = null; }
          }
        }
      }
      const hit = G.raycast();
      G.target = hit;
      const mobHit = rayEntity(p.mode === 'creative' ? 5 : 3);
      const mobFirst = mobHit && (!hit || mobHit.t < hit.t);
      G.targetMob = mobFirst ? mobHit.e : null;
      if (leftEdge || (left && mobFirst && p.atk >= 20 / attackRate(it))) {
        G.swing();
        if (mobFirst) { attack(p, mobHit.e, s, it); dig = null; }
      }
      // Digging
      if (left && !mobFirst && hit && !p.using) {
        const k = hit.x + ',' + hit.y + ',' + hit.z, d = DEF[hit.id];
        if (!dig || dig.k !== k) { dig = { k, x: hit.x, y: hit.y, z: hit.z, p: 0, id: hit.id, t: 0 }; }
        G.swing();
        if (p.mode === 'adventure') dig = null;
        else if (p.mode === 'creative') {
          if (leftEdge || !breakCd) {
            if (it && it.tool === 'sword') { dig = null; }
            else {
              G.destroy(hit.x, hit.y, hit.z, false);
              breakCd = 5; dig = null;
            }
          }
        } else if (d.hard >= 0) {
          dig.t++;
          dig.p += digSpeed(p, d, it);
          if (dig.t % 4 === 1) { CraftAudio.block('hit', mat(hit.id), .5); digBits(hit); }
          if (dig.p >= 1) { finishDig(p, hit, s, it); dig = null; breakCd = 5; }
        }
      } else dig = null;
      if (dig) R.setCrack(dig.x, dig.y, dig.z, Math.min(9, Math.floor(dig.p * 10)));
      else R.setCrack(0, 0, 0, -1);
      // Right click
      if (right && !p.using && (rightEdge || !rightCd)) {
        let acted = false;
        if (mobFirst) acted = interactMob(p, mobHit.e, s, it);
        if (!acted && it && it.bucket !== undefined) acted = G.useBucket(s, it);
        if (!acted && hit) acted = G.useItemOn(hit, s, p.mode);
        if (!acted && it && it.food !== undefined && (p.food < 20 || it.always || it.heal || p.mode === 'creative')) {
          p.using = { kind: 'eat', id: s.id, t: 0, max: it.key === 'milk_bucket' ? 32 : it.key === 'melon_slice' || it.key === 'cookie' ? 24 : 32 };
          acted = true;
        }
        if (!acted && it && it.bow && (p.mode === 'creative' || findArrow(p) >= 0)) { p.using = { kind: 'bow', id: s.id, t: 0 }; CraftAudio.play('draw', .7); acted = true; }
        if (!acted && it && it.thrown && rightEdge) {
          const f = dirOf(p.yaw, p.pitch);
          G.spawnThrown(p.x + f[0] * .4, p.y + p.eyeNow - .1, p.z + f[2] * .4, f[0] * 1.5, f[1] * 1.5 + .1, f[2] * 1.5, it.thrown, 'player');
          CraftAudio.play('thrown', .8);
          G.consume(s); G.swing();
          acted = true;
        }
        if (!acted && it && it.armor !== undefined && rightEdge) {
          const old = p.armor[it.armor];
          p.armor[it.armor] = s;
          p.inv[p.sel] = old;
          CraftAudio.play('chest_close', .5, 1.6); G.swing(); G.advance('armor'); G.ui.dirty();
          acted = true;
        }
        rightCd = acted ? 4 : 2;
      }
    };
    const attackRate = it => (it && it.rate) || 4;
    const attack = (p, e, s, it) => {
      const charge = Math.min(1, p.atk / (20 / attackRate(it)));
      p.atk = 0;
      let dmg = (it && it.dmg ? it.dmg : 1) * (.2 + .8 * charge * charge);
      const crit = charge > .9 && p.vy < -.05 && !p.onGround && !p.sprinting;
      if (crit) dmg *= 1.5;
      const k = p.sprinting ? 1.6 : 1, l = Math.hypot(e.x - p.x, e.z - p.z) || 1;
      const kx = (e.x - p.x) / l * k, kz = (e.z - p.z) / l * k;
      if (G.net && e.remote) G.net.sendHit(e.netId, dmg, kx, kz);
      else G.damageMob(e, dmg, kx, kz, { player: true });
      G.exhaust(.1);
      p.sprinting = false;
      CraftAudio.play(crit ? 'crit' : charge < .5 ? 'whoosh' : 'hit', 1);
      for (let i = 0; i < (crit ? 14 : 4); i++) R.addParticle({ tile: crit ? 'p_spark' : 'p_smoke', x: e.x, y: e.y + e.h * .6, z: e.z, vx: (Math.random() - .5) * 4, vy: Math.random() * 3, vz: (Math.random() - .5) * 4, life: .4, size: crit ? .14 : .1, r: crit ? 1 : .7, gc: crit ? .9 : .1, b: crit ? .4 : .1, glow: crit });
      if (it && it.dur) G.useDurability(s, it.tool === 'sword' ? 1 : 2);
    };
    const interactMob = (p, e, s, it) => {
      if (it && it.shears && e.type === 'sheep' && !e.shorn) {
        e.shorn = true;
        const n = 1 + Math.floor(Math.random() * 3);
        G.spawnItem(e.x, e.y + 1, e.z, I[(e.color || 'white') + '_wool'], n);
        G.useDurability(s); G.swing(); CraftAudio.play('sheep', .8);
        return true;
      }
      if (it && it.key === 'bucket' && e.type === 'cow') { G.replaceStack(s, I.milk_bucket); G.swing(); CraftAudio.play('bucket', .8); return true; }
      return false;
    };
    const digSpeed = (p, d, it) => {
      const hard = d.hard;
      if (hard === 0) return 1;
      let speed = 1;
      const toolMatch = it && it.tool && it.tool === d.tool;
      if (toolMatch) speed = it.speed;
      if (it && it.tool === 'sword') speed = d.key === 'cobweb' ? 15 : d.decay ? 1.5 : 1;
      if (it && it.shears) speed = d.key === 'cobweb' ? 15 : d.decay ? 15 : d.key.endsWith('_wool') ? 5 : speed;
      const can = d.level < 0 || (toolMatch && it.level >= d.level);
      const body = FLUID[G.W.get(Math.floor(p.x), Math.floor(p.y + p.eyeNow), Math.floor(p.z))];
      if (body === 1) speed /= 5;
      if (!p.onGround && !p.flying) speed /= 5;
      return speed / hard / (can ? 30 : 100);
    };
    const digBits = hit => {
      const t = TILE_NAME(tileOf(hit.id, hit.m || 0)), d = DEF[hit.id], tint = d.tint === 'grass' ? [.55, .78, .35] : d.tint === 'foliage' ? [.45, .7, .3] : [1, 1, 1];
      for (let i = 0; i < 3; i++) R.addParticle({ tile: t, cut: 4, ou: Math.random() * .75, ov: Math.random() * .75, x: hit.hx + hit.nx * .05, y: hit.hy + hit.ny * .05, z: hit.hz + hit.nz * .05, vx: (Math.random() - .5) + hit.nx, vy: Math.random() * 1.5, vz: (Math.random() - .5) + hit.nz, g: 14, life: .3 + Math.random() * .3, size: .07 + Math.random() * .05, r: tint[0], gc: tint[1], b: tint[2], collide: true });
    };
    const finishDig = (p, hit, s, it) => {
      const d = DEF[hit.id], toolMatch = it && it.tool === d.tool, can = d.level < 0 || (toolMatch && it.level >= d.level);
      G.destroy(hit.x, hit.y, hit.z, can, it);
      if (can && d.xp) G.spawnOrb(hit.x + .5, hit.y + .5, hit.z + .5, d.xp[0] + Math.floor(Math.random() * (d.xp[1] - d.xp[0] + 1)));
      G.exhaust(.005);
      if (it && (it.tool || it.shears) && d.hard > 0) G.useDurability(s, it.tool === 'sword' ? 2 : 1);
      if (d.axis) decayAround(hit.x, hit.y, hit.z);
    };
    const decayAround = (x, y, z) => {
      for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) for (let c = -4; c <= 4; c++) {
        const dd = DEF[G.W.get(x + a, y + b, z + c)];
        if (dd.decay && !G.W.getMeta(x + a, y + b, z + c)) G.scheduleDecay(x + a, y + b, z + c);
      }
    };
    const decayJobs = [];
    G.scheduleDecay = (x, y, z) => decayJobs.push([G.tickCount + 10 + Math.floor(Math.random() * 160), x, y, z]);
    const runDecay = () => {
      for (let i = decayJobs.length - 1; i >= 0; i--) {
        const j = decayJobs[i];
        if (j[0] > G.tickCount) continue;
        decayJobs.splice(i, 1);
        const [, x, y, z] = j, dd = DEF[G.W.get(x, y, z)];
        if (dd.decay && !G.W.getMeta(x, y, z) && !leafNearLog(x, y, z)) G.destroy(x, y, z, true);
      }
    };
    const leafNearLog = (x, y, z) => {
      const seen = new Set([x + ',' + y + ',' + z]), q = [[x, y, z, 0]];
      for (let i = 0; i < q.length && i < 300; i++) {
        const [a, b, c, n] = q[i];
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]) {
          const X = a + dx, Y = b + dy, Z = c + dz, k = X + ',' + Y + ',' + Z;
          if (seen.has(k)) continue;
          seen.add(k);
          const dd = DEF[G.W.get(X, Y, Z)];
          if (dd.axis) return true;
          if (dd.decay && n < 4) q.push([X, Y, Z, n + 1]);
        }
      }
      return false;
    };
    const foodBits = (p, id) => {
      const f = dirOf(p.yaw, p.pitch), px = CraftTex.pixelsOf(id);
      let r = 1, gc = 1, b = 1;
      if (px) { const i = (8 + 8 * px.w) * 4; if (px.data[i + 3]) { r = px.data[i] / 255; gc = px.data[i + 1] / 255; b = px.data[i + 2] / 255; } }
      for (let i = 0; i < 3; i++) R.addParticle({ tile: 'p_snow', x: p.x + f[0] * .5, y: p.y + p.eyeNow - .2 + f[1] * .5, z: p.z + f[2] * .5, vx: f[0] + (Math.random() - .5), vy: Math.random(), vz: f[2] + (Math.random() - .5), g: 12, life: .4, size: .09, r, gc, b });
    };
    const finishEating = (p, s, it) => {
      p.food = Math.min(20, p.food + it.food);
      p.sat = Math.min(p.food, p.sat + it.sat);
      if (it.heal) p.hp = Math.min(20, p.hp + it.heal);
      if (it.key === 'rotten_flesh' && Math.random() < .8) p.exh += 4;
      CraftAudio.play('burp', .6);
      if (it.leaves) G.replaceStack(s, I[it.leaves]); else G.consume(s);
      G.ui.dirty();
    };
    const findArrow = p => p.inv.findIndex(x => x && x.id === I.arrow);
    const shootBow = (p, s) => {
      const t = p.using.t, f0 = t / 20, power = Math.min(1, (f0 * f0 + f0 * 2) / 3);
      if (power < .1 || !s) return;
      if (p.mode !== 'creative') {
        const a = findArrow(p);
        if (a < 0) return;
        G.consume(p.inv[a]);
        G.useDurability(s);
      }
      const f = dirOf(p.yaw, p.pitch), v = power * 3;
      G.spawnArrow(p.x + f[0] * .5, p.y + p.eyeNow - .1, p.z + f[2] * .5, f[0] * v, f[1] * v, f[2] * v, 2, 'player');
      CraftAudio.play('bow', 1, .9 + power * .3);
      G.swing();
    };

    // ---------- Blocks with state ----------
    const furnaces = new Map(), spawners = new Map();
    const posKey = (x, y, z) => x + ',' + y + ',' + z;
    G.placeFurnace = (x, y, z) => { const be = { type: 'furnace', slots: [null, null, null], burn: 0, burnMax: 0, cook: 0 }; G.W.setBE(x, y, z, be); furnaces.set(posKey(x, y, z), [x, y, z, be]); };
    G.placeSpawner = (x, y, z) => { const be = { type: 'spawner', mob: 'zombie', delay: 200 }; G.W.setBE(x, y, z, be); spawners.set(posKey(x, y, z), [x, y, z, be]); };
    const onChunk = c => {
      if (!c.be.size) return;
      for (const [i, v] of c.be) {
        const x = c.cx * 16 + (i & 15), y = i >> 8, z = c.cz * 16 + ((i >> 4) & 15);
        if (v.type === 'furnace') furnaces.set(posKey(x, y, z), [x, y, z, v]);
        else if (v.type === 'spawner') spawners.set(posKey(x, y, z), [x, y, z, v]);
      }
    };
    G.removeContainer = (x, y, z, oldId, newId) => {
      if (DEF[newId].use === DEF[oldId].use) return;
      const be = G.W.beAt(x, y, z);
      if (be) {
        const slots = be.slots || (be.items ? be.items : []);
        for (const s of slots) if (s) G.spawnItem(x + .5, y + .5, z + .5, s.id, s.count, s.dmg || 0);
        G.W.setBE(x, y, z, null);
        if (G.net) G.net.sendBE(x, y, z, null);
      }
      furnaces.delete(posKey(x, y, z));
    };
    G.chestSlots = be => {
      if (!be.slots) {
        be.slots = new Array(27).fill(null);
        for (const s of be.items || []) be.slots[s.slot] = { id: s.id, count: s.count, dmg: 0 };
        delete be.items;
      }
      return be.slots;
    };
    const fuelOf = s => (s && ITEMS[s.id].fuel) || 0;
    const smeltOf = s => (s ? D.smelt[s.id] : undefined);
    const furnaceTick = () => {
      for (const [k, f] of furnaces) {
        const [x, y, z, be] = f;
        if (!G.W.loaded(x, z)) { furnaces.delete(k); continue; }
        const [input, fuel, out] = be.slots, target = smeltOf(input);
        const room = target !== undefined && (!out || (out.id === target && out.count < stackMax(target)));
        let changed = false;
        if (be.burn > 0) be.burn--;
        if (be.burn <= 0 && room && fuelOf(fuel)) {
          be.burn = be.burnMax = fuelOf(fuel);
          const it = ITEMS[fuel.id];
          if (it.bucket === 'lava') be.slots[1] = { id: I.bucket, count: 1, dmg: 0 };
          else { fuel.count--; if (fuel.count <= 0) be.slots[1] = null; }
          changed = true;
        }
        if (be.burn > 0 && room) {
          be.cook++;
          if (be.cook >= 200) {
            be.cook = 0;
            if (out) out.count++; else be.slots[2] = { id: target, count: 1, dmg: 0 };
            input.count--; if (input.count <= 0) be.slots[0] = null;
            G.spawnOrb(x + .5, y + 1.1, z + .5, Math.random() < .5 ? 1 : 0);
            G.advance('smelt');
            changed = true;
          }
        } else if (be.cook > 0) be.cook = Math.max(0, be.cook - 2);
        const id = G.W.get(x, y, z), lit = be.burn > 0;
        if ((id === B.furnace && lit) || (id === B.lit_furnace && !lit)) G.setBlock(x, y, z, lit ? B.lit_furnace : B.furnace, G.W.getMeta(x, y, z), { noUpdate: true });
        if (lit && Math.random() < .12) {
          const m = G.W.getMeta(x, y, z) & 3, fx = x + .5 + DX[m] * .55, fz = z + .5 + DZ[m] * .55;
          R.addParticle({ tile: 'p_flame', x: fx, y: y + .3, z: fz, vy: .1, g: 0, life: .5, size: .14, glow: true, fade: true });
          R.addParticle({ tile: 'p_smoke', x: fx, y: y + .5, z: fz, vy: .6, g: 0, life: .8, size: .14, grow: .2, r: .35, gc: .35, b: .35, fade: true });
          CraftAudio.play('furnace', falloff(x, y, z));
        }
        if (changed) { G.W.touchBE(x, y, z); G.ui.containerChanged(be); if (G.net) G.net.sendBE(x, y, z, be); }
        else if (G.tickCount % 10 === 0 && lit) G.ui.containerChanged(be);
      }
    };
    const spawnerTick = () => {
      if (!G.host() || G.tickCount % 20) return;
      const p = G.player;
      for (const [k, s] of spawners) {
        const [x, y, z, be] = s;
        if (!G.W.loaded(x, z) || G.W.get(x, y, z) !== B.spawner) { spawners.delete(k); continue; }
        if (Math.hypot(x - p.x, y - p.y, z - p.z) > 16) continue;
        be.delay = (be.delay || 200) - 20;
        for (let i = 0; i < 4; i++) R.addParticle({ tile: 'p_flame', x: x + Math.random(), y: y + Math.random(), z: z + Math.random(), vy: .3, g: 0, life: .7, size: .16, glow: true, fade: true });
        if (be.delay > 0) continue;
        be.delay = 200 + Math.floor(Math.random() * 600);
        if (G.level.difficulty === 'peaceful' || G.entities.filter(e => e.kind === 'mob' && Math.hypot(e.x - x, e.y - y, e.z - z) < 9).length > 5) continue;
        for (let n = 0; n < 3; n++) {
          const a = x + Math.floor(Math.random() * 7) - 3, c = z + Math.floor(Math.random() * 7) - 3, b = y + Math.floor(Math.random() * 3) - 1;
          if (!SOLID[G.W.get(a, b, c)] && !SOLID[G.W.get(a, b + 1, c)] && SOLID[G.W.get(a, b - 1, c)]) { const e = G.spawnMob(be.mob, a + .5, b, c + .5); if (e) e.persist = false; }
        }
      }
    };
    G.openBlock = (use, x, y, z) => {
      G.swing();
      const be = G.W.beAt(x, y, z);
      if (use === 'craft') G.ui.openCraft();
      else if (use === 'chest') {
        const c = be || (G.W.setBE(x, y, z, { type: 'chest', items: [] }), G.W.beAt(x, y, z));
        G.chestSlots(c);
        CraftAudio.play('chest_open', falloff(x, y, z));
        G.ui.openChest(c, [x, y, z]);
      } else if (use === 'furnace') {
        const f = be || (G.placeFurnace(x, y, z), G.W.beAt(x, y, z));
        if (!furnaces.has(posKey(x, y, z))) furnaces.set(posKey(x, y, z), [x, y, z, f]);
        G.ui.openFurnace(f, [x, y, z]);
      } else if (use === 'bed') sleep(x, y, z);
    };
    G.beChanged = (be, pos) => {
      if (!pos) return;
      G.W.touchBE(pos[0], pos[1], pos[2]);
      if (G.net) G.net.sendBE(pos[0], pos[1], pos[2], be);
    };
    const sleep = (x, y, z) => {
      const t = ((G.level.time % 24000) + 24000) % 24000;
      if (t < 12500 || t > 23500) { if (!G.level.thunder) { G.ui.action('You can only sleep at night or during thunderstorms'); G.level.spawn = { x: x + .5, y: y + 1, z: z + .5 }; return; } }
      for (const e of G.entities) if (e.kind === 'mob' && !e.m.passive && Math.hypot(e.x - x, e.y - y, e.z - z) < 8) { G.ui.action('You may not rest now, there are monsters nearby'); return; }
      G.level.spawn = { x: x + .5, y: y + 1, z: z + .5 };
      CraftAudio.play('sleep', .8);
      G.advance('sleep');
      G.ui.sleep(() => {
        G.level.time += 24000 - t;
        G.level.rain = false; G.level.thunder = false;
        if (G.net) G.net.syncTime();
      });
    };

    // ---------- Weather ----------
    const weatherTick = () => {
      const L = G.level;
      if (!G.host()) { L.rainK += ((L.rain ? 1 : 0) - L.rainK) * .01; L.thunderK += ((L.thunder ? 1 : 0) - L.thunderK) * .01; return; }
      if (L.rainTimer === undefined) L.rainTimer = 12000 + Math.floor(Math.random() * 168000);
      if (--L.rainTimer <= 0) {
        L.rain = !L.rain;
        L.thunder = L.rain && Math.random() < .3;
        L.rainTimer = L.rain ? 12000 + Math.floor(Math.random() * 12000) : 12000 + Math.floor(Math.random() * 168000);
        if (G.net) G.net.syncTime();
      }
      L.rainK += ((L.rain ? 1 : 0) - L.rainK) * .01;
      L.thunderK += ((L.thunder ? 1 : 0) - L.thunderK) * .01;
      if (L.thunder && L.rainK > .8 && Math.random() < .0015) lightning();
    };
    const lightning = () => {
      const p = G.player, a = Math.random() * 6.283, r = 12 + Math.random() * 60, x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
      if (!G.W.loaded(x, z)) return;
      const y = G.W.top(x, z) + 1;
      strike(x, y, z);
      setTimeout(() => CraftAudio.play('thunder', Math.max(.3, 1 - r / 90)), r * 6);
      if (G.level.rules.doFireTick && !G.W.get(x, y, z) && Math.random() < .5) G.setBlock(x, y, z, B.fire);
      for (const e of G.entities) if (e.kind === 'mob' && Math.hypot(e.x - x, e.z - z) < 3) G.damageMob(e, 5, 0, 0, null);
      if (Math.hypot(p.x - x, p.z - z) < 3) G.hurtPlayer(5, 'fire');
    };
    const strike = (x, y, z) => {
      G.flash('rgba(220,230,255,.5)');
      const pts = [];
      let ax = x + .5, ay = y + 90, az = z + .5;
      while (ay > y) { const nx = ax + (Math.random() - .5) * 4, ny = ay - 6 - Math.random() * 8, nz = az + (Math.random() - .5) * 4; pts.push(ax, ay, az, nx, Math.max(ny, y), nz); ax = nx; ay = ny; az = nz; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xe8efff, fog: false }));
      m.frustumCulled = false;
      R.scene.add(m);
      setTimeout(() => { R.scene.remove(m); g.dispose(); m.material.dispose(); }, 180);
    };

    // ---------- Main tick ----------
    let rainBed = null, waterBed = null;
    const tick = () => {
      const L = G.level, p = G.player;
      G.tickCount++;
      if (L.rules.doDaylightCycle && G.host()) L.time++;
      weatherTick();
      G.runScheduled();
      runDecay();
      if (G.host()) { G.randomTicks(Math.floor(p.x), Math.floor(p.z)); G.ents.spawnTick(); }
      furnaceTick();
      spawnerTick();
      playerTick();
      G.ents.update();
      if (G.net) G.net.tick();
      if (G.tickCount % 600 === 0 && !L.remote) G.saveLevel();
      if (G.tickCount % 200 === 0) G.W.saveAll();
      ambientTick();
    };
    const ambientTick = () => {
      const p = G.player, rainHere = G.weatherRainAt(Math.floor(p.x), Math.floor(p.z)) && !biomeDef(Math.floor(p.x), Math.floor(p.z)).cold;
      if (!rainBed) rainBed = CraftAudio.bed(2600, .3);
      if (rainBed) {
        const open = G.W.top(Math.floor(p.x), Math.floor(p.z)) <= p.y + 2;
        rainBed.set(rainHere ? (open ? .22 : .07) * G.level.rainK : 0);
      }
      if (G.tickCount % 400 === 0 && p.y < 45 && Math.random() < .25) CraftAudio.play('lava', .4, .5);
      // Torches and lanterns near the player smoke and flicker.
      if (G.tickCount % 4 === 0) for (let n = 0; n < 12; n++) {
        const x = Math.floor(p.x + (Math.random() - .5) * 28), y = Math.floor(p.y + (Math.random() - .5) * 20), z = Math.floor(p.z + (Math.random() - .5) * 28), id = G.W.get(x, y, z);
        if (id === B.torch) {
          const m = G.W.getMeta(x, y, z), ox = m ? DX[m - 1] * .25 : 0, oz = m ? DZ[m - 1] * .25 : 0;
          R.addParticle({ tile: 'p_flame', x: x + .5 + ox, y: y + (m ? .95 : .78), z: z + .5 + oz, vy: .08, g: 0, life: .5, size: .07, glow: true, fade: true });
          R.addParticle({ tile: 'p_smoke', x: x + .5 + ox, y: y + (m ? 1.0 : .85), z: z + .5 + oz, vy: .4, g: 0, life: .9, size: .08, grow: .1, r: .35, gc: .35, b: .35, fade: true });
        } else if (id === B.lava && !G.W.get(x, y + 1, z) && Math.random() < .3) {
          R.addParticle({ tile: 'p_flame', x: x + Math.random(), y: y + 1, z: z + Math.random(), vx: (Math.random() - .5), vy: 3, vz: (Math.random() - .5), g: 8, life: .8, size: .1, glow: true });
          CraftAudio.play('lava', falloff(x, y, z) * .5);
        } else if (id === B.water && !G.W.get(x, y + 1, z) && G.level.rainK > .5 && Math.random() < .5) {
          R.addParticle({ tile: 'p_drop', x: x + Math.random(), y: y + 1, z: z + Math.random(), vy: 1.2, g: 8, life: .25, size: .07 });
        }
      }
    };

    // ---------- Worlds ----------
    const stopWorld = () => {
      G.ready = false;
      if (G.W) { G.W.destroy(); G.W = null; }
      G.ents.clear();
      G.clearTicks();
      furnaces.clear(); spawners.clear(); decayJobs.length = 0;
      localGenerator = null;
      R.hideSelection(); R.setCrack(0, 0, 0, -1); R.setHeld(0);
      if (G.playerModel) { R.scene.remove(G.playerModel.group); G.playerModel = null; }
      if (rainBed) { rainBed.stop(); rainBed = null; }
      if (waterBed) { waterBed.stop(); waterBed = null; }
      G.player = null;
    };
    const makeWorld = (settings, hooks) => CraftWorld.create({ settings, version: VERSION, uploadSection: R.uploadSection, freeSection: R.freeSection, onChunk, ...hooks });
    // The menu background: a real generated landscape with the camera slowly turning.
    const panorama = async () => {
      G.level = null;
      const seed = 41 + Math.floor(Date.now() / 86400000) % 12;
      G.panorama = { yaw: Math.random() * 6.283, x: 0, y: 90, z: 0, ready: false, rd: Math.min(opt.render, coarse() ? 3 : 6) };
      G.W = makeWorld({ seed: seed * 7919, type: 'default', structures: true }, {});
      G.W.setCenter(0, 0, G.panorama.rd);
      const pn = G.panorama;
      const s = await G.W.ask('spawn', { village: false });
      if (G.panorama !== pn) return;
      pn.x = s.x; pn.z = s.z; pn.y = pn.y0 = s.y + 12; pn.ready = true;
      G.W.setCenter(Math.floor(s.x / 16), Math.floor(s.z / 16), pn.rd);
      R.setDistance(pn.rd);
      G.camera = { x: pn.x, y: pn.y, z: pn.z };
    };
    G.toTitle = () => {
      G.panorama = null;
      if (G.W) stopWorld();
      G.level = null;
      if (G.net) { G.net.close(); G.net = null; }
      panorama();
      G.ui.title();
      window.removeEventListener('beforeunload', confirmLeave);
    };
    const confirmLeave = e => { if (G.ready) { G.saveNow(); e.preventDefault(); e.returnValue = ''; } };
    const thumbnail = () => {
      try {
        const c = CraftTex.canvas2(96, 96), g = c.getContext('2d'), s = Math.min(R.canvas.width, R.canvas.height);
        g.drawImage(R.canvas, (R.canvas.width - s) / 2, (R.canvas.height - s) / 2, s, s, 0, 0, 96, 96);
        return c.toDataURL('image/jpeg', .7);
      } catch (e) { return null; }
    };
    G.saveLevel = async withThumb => {
      const L = G.level, p = G.player;
      if (!L || L.remote || !p) return;
      if (withThumb) { render3D(1); L.thumb = thumbnail() || L.thumb; }
      L.played = Date.now();
      L.playerData = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, hp: p.hp, food: p.food, sat: p.sat, xp: p.xp, level: p.level, inv: p.inv, armor: p.armor, sel: p.sel, mode: p.mode, flying: p.flying, air: p.air, fire: p.fire, dead: p.dead };
      await CraftDB.putWorld(L);
    };
    G.saveNow = () => { if (G.W && G.level && !G.level.remote) { G.W.saveAll(); G.saveLevel(); } };
    G.saveAndQuit = async () => {
      G.ui.loading('Saving world');
      if (G.W && !G.level.remote) { G.W.saveAll(); await flushRemoteEdits(); await G.saveLevel(true); }
      await new Promise(r => setTimeout(r, 120));
      G.toTitle();
    };
    const flushRemoteEdits = async () => {
      if (!G.pendingRemote) return;
      for (const [k, v] of G.pendingRemote) {
        const [cx, cz] = k.split(',').map(Number), doc = (await CraftDB.chunk(G.level.id, cx, cz)) || { e: [], b: null };
        for (const [i, val] of v) doc.e.push(i, val);
        await CraftDB.putChunk(G.level.id, cx, cz, doc);
      }
      G.pendingRemote = null;
    };
    G.newLevel = o => ({
      id: 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), owner: ctx.user.key, name: o.name, seed: o.seed, seedText: o.seedText || String(o.seed), mode: o.mode, hardcore: !!o.hardcore, difficulty: o.difficulty, commands: !!o.commands, type: o.type, structures: o.structures, bonus: !!o.bonus,
      rules: { ...RULES, ...(o.rules || {}) }, created: Date.now(), played: Date.now(), time: 1000, rain: false, thunder: false, rainK: 0, thunderK: 0, spawn: null, version: VERSION, done: {},
    });
    // Starts a level: streams the terrain around the spawn, then hands over to the player.
    G.enter = async (L, net) => {
      G.panorama = null;
      if (G.W) stopWorld();
      G.ui.loading('Generating terrain');
      G.level = L;
      L.rainK = L.rainK || 0; L.thunderK = L.thunderK || 0;
      L.rules = { ...RULES, ...L.rules };
      G.tickCount = 0;
      const remote = L.remote;
      G.W = makeWorld({ seed: L.seed, type: L.type, structures: L.structures }, {
        loadChunk: (cx, cz) => (remote ? Promise.resolve(net.diffs.get(cx + ',' + cz) || null) : CraftDB.chunk(L.id, cx, cz)),
        saveChunk: (cx, cz, v) => { if (!remote) CraftDB.putChunk(L.id, cx, cz, v); },
      });
      if (!L.spawn) {
        const s = await G.W.ask('spawn', { village: L.mode === 'adventure' });
        L.spawn = { x: s.x, y: s.y, z: s.z };
        L.fresh = true;
      }
      const d = L.playerData, sp = d && !d.dead ? d : L.spawn;
      const p = newPlayer(sp, L.mode);
      if (d) {
        Object.assign(p, { yaw: d.yaw, pitch: d.pitch, hp: d.hp, food: d.food, sat: d.sat, xp: d.xp, level: d.level, inv: d.inv.map(s => s || null), armor: d.armor.map(s => s || null), sel: d.sel, mode: d.mode, flying: d.flying, air: d.air, fire: d.fire || 0 });
        if (d.dead) { p.hp = 20; p.food = 20; p.dead = false; p.x = L.spawn.x; p.y = L.spawn.y; p.z = L.spawn.z; }
      }
      G.player = p;
      G.camera = { x: p.x, y: p.y + 1.6, z: p.z };
      R.setDistance(opt.render);
      G.W.setCenter(Math.floor(p.x / 16), Math.floor(p.z / 16), opt.render);
      G.loadingWorld = { p };
      window.addEventListener('beforeunload', confirmLeave);
      ctx.add(() => window.removeEventListener('beforeunload', confirmLeave));
    };
    const finishLoading = () => {
      const L = G.level, p = G.player;
      G.loadingWorld = null;
      if (L.fresh) {
        placeOnGround(p);
        L.spawn = { x: p.x, y: p.y, z: p.z };
        if (L.bonus) bonusChest(p);
        if (L.mode === 'adventure') {
          G.ui.chatLine('Adventure mode: blocks cannot be broken or placed. Explore, loot chests and fight.');
        }
        delete L.fresh;
        G.saveLevel();
      } else if (!L.playerData || L.playerData.dead) placeOnGround(p);
      p.px = p.x; p.py = p.y; p.pz = p.z;
      G.ready = true;
      G.ui.closeLoading();
      G.ui.hudOn();
      capture();
      CraftAudio.startMusic(40, 150);
    };
    const bonusChest = p => {
      const x0 = Math.floor(p.x) + 2, z0 = Math.floor(p.z) + 1;
      for (let i = 0; i < 12; i++) {
        const x = x0 + Math.floor(Math.random() * 5) - 2, z = z0 + Math.floor(Math.random() * 5) - 2, y = G.W.top(x, z) + 1;
        if (SOLID[G.W.get(x, y, z)] || !OPAQUE[G.W.get(x, y - 1, z)]) continue;
        G.setBlock(x, y, z, B.chest, 0, { quiet: true, noUpdate: true });
        G.W.setBE(x, y, z, { type: 'chest', items: D.rollLoot('bonus', Math.random) });
        for (let f = 0; f < 4; f++) { const a = x + DX[f], c = z + DZ[f]; if (OPAQUE[G.W.get(a, y - 1, c)] && !G.W.get(a, y, c)) G.setBlock(a, y, c, B.torch, 0, { quiet: true, noUpdate: true }); }
        return;
      }
    };

    // ---------- Commands ----------
    G.runCommand = line => {
      const L = G.level, p = G.player, a = line.slice(1).trim().split(/\s+/), cmd = a[0];
      const say = t => G.ui.chatLine(t);
      if (cmd === 'help') { say('/gamemode survival|creative|adventure|spectator, /tp x y z, /time set day|night|<n>, /weather clear|rain|thunder, /give <item> [n], /seed, /kill, /difficulty <level>, /summon <mob>, /locate village|temple|tower, /gamerule <rule> <value>, /spawnpoint, /clear'); return; }
      if (cmd === 'seed') { say('Seed: ' + L.seedText); return; }
      if (!L.commands) { say('Commands are not allowed in this world. Enable them when creating a world.'); return; }
      if (cmd === 'gamemode') {
        const map = { survival: 'survival', s: 'survival', 0: 'survival', creative: 'creative', c: 'creative', 1: 'creative', adventure: 'adventure', a: 'adventure', 2: 'adventure', spectator: 'spectator', 3: 'spectator' }, m = map[a[1]];
        if (!m) return say('Unknown game mode.');
        G.setMode(m);
        return say('Set own game mode to ' + m[0].toUpperCase() + m.slice(1));
      }
      if (cmd === 'tp' && a.length >= 4) {
        const rel = (s, c) => (s[0] === '~' ? c + (+s.slice(1) || 0) : +s), x = rel(a[1], p.x), y = rel(a[2], p.y), z = rel(a[3], p.z);
        if ([x, y, z].some(Number.isNaN)) return say('Those coordinates are not numbers.');
        p.x = p.px = x; p.y = p.py = y; p.z = p.pz = z; p.vx = p.vy = p.vz = 0; p.fall = 0;
        return say(`Teleported to ${x}, ${y}, ${z}`);
      }
      if (cmd === 'time' && a[1] === 'set') {
        const named = { day: 1000, noon: 6000, night: 13000, midnight: 18000 }, v = named[a[2]] ?? +a[2];
        if (Number.isNaN(v)) return say('Unknown time.');
        L.time = Math.floor(L.time / 24000) * 24000 + v;
        if (G.net) G.net.syncTime();
        return say('Set the time to ' + v);
      }
      if (cmd === 'weather') {
        L.rain = a[1] !== 'clear'; L.thunder = a[1] === 'thunder';
        L.rainTimer = 6000 + Math.floor(Math.random() * 6000);
        if (G.net) G.net.syncTime();
        return say('Set the weather to ' + (a[1] || 'clear'));
      }
      if (cmd === 'give' && a[1]) {
        const id = I[a[1]] ?? I[a[1] + '_item'];
        if (id === undefined) return say('Unknown item: ' + a[1]);
        const n = Math.max(1, Math.min(6400, +a[2] || 1));
        let left = n;
        while (left > 0) { const k = Math.min(left, stackMax(id)); left -= k; if (G.give(id, k) > 0) G.spawnItem(p.x, p.y + 1, p.z, id, k, 0, { delay: 0 }); }
        return say(`Gave ${n} ${ITEMS[id].name}`);
      }
      if (cmd === 'kill') { p.invul = 0; const m = p.mode; p.mode = 'survival'; G.hurtPlayer(1000, 'void'); p.mode = m; return; }
      if (cmd === 'difficulty' && ['peaceful', 'easy', 'normal', 'hard'].includes(a[1])) {
        L.difficulty = a[1];
        if (a[1] === 'peaceful') for (const e of G.entities) if (e.kind === 'mob' && !e.m.passive) e.dead = true;
        return say('Set difficulty to ' + a[1]);
      }
      if (cmd === 'summon' && CraftEntities.MOBS[a[1]]) { const f = dirOf(p.yaw, 0); G.spawnMob(a[1], p.x + f[0] * 3, p.y, p.z + f[2] * 3); return say('Summoned new ' + a[1]); }
      if (cmd === 'locate' && a[1]) {
        G.W.ask('locate', { what: a[1], x: p.x, z: p.z }).then(r => say(r ? `Nearest ${a[1]} is at ${r.x}, ~, ${r.z} (${Math.round(r.d)} blocks away)` : `No ${a[1]} found nearby.`));
        return;
      }
      if (cmd === 'gamerule' && a[1] in L.rules) {
        if (a[2] === undefined) return say(`${a[1]} = ${L.rules[a[1]]}`);
        L.rules[a[1]] = a[2] === 'true' ? true : a[2] === 'false' ? false : +a[2];
        return say(`Game rule ${a[1]} is now ${L.rules[a[1]]}`);
      }
      if (cmd === 'spawnpoint') { L.spawn = { x: p.x, y: p.y, z: p.z }; return say('Set your spawn point here.'); }
      if (cmd === 'clear') { p.inv.fill(null); p.armor.fill(null); G.ui.dirty(); return say('Cleared your inventory.'); }
      say('Unknown command. Type /help for a list.');
    };
    G.setMode = m => {
      const p = G.player;
      p.mode = m;
      p.flying = m === 'spectator' ? true : m === 'creative' ? p.flying : false;
      p.noclip = m === 'spectator';
      G.ui.dirty();
    };

    // ---------- Online rooms ----------
    const installNet = (room, diffs) => {
      const others = new Map();
      const net = {
        room, isHost: room.isHost, diffs: diffs || new Map(), others,
        close() { room.close(); for (const o of others.values()) if (o.model) { R.scene.remove(o.model.group); if (o.tag) R.scene.remove(o.tag); } others.clear(); },
        sendBlock: (x, y, z, id, m) => room.send({ t: 'b', x, y, z, id, m }),
        sendBE: (x, y, z, be) => room.send({ t: 'be', x, y, z, be }),
        sendFx: (k, x, y, z, a) => room.send({ t: 'fx', k, x, y, z, a }),
        sendDamage: (to, dmg, kx, kz) => room.send({ t: 'dmg', to, dmg, kx, kz }),
        sendHit: (id, dmg, kx, kz) => room.send({ t: 'hit', id, dmg, kx, kz, by: room.me }),
        sendLoot: (to, x, y, z, list, xp) => room.send({ t: 'loot', to: to, x, y, z, list, xp }),
        chat: text => room.send({ t: 'c', text }),
        syncTime: () => room.send({ t: 'time', time: G.level.time, rain: G.level.rain, thunder: G.level.thunder }),
        eachPlayer: f => { for (const o of others.values()) if (o.x !== undefined) f(o); },
        playersIn: hit => { for (const o of others.values()) if (o.x !== undefined && hit({ x: o.x, y: o.y, z: o.z, w: .6, h: 1.8 })) return true; return false; },
        tick() {
          const p = G.player;
          if (G.tickCount % 2 === 0) room.send({ t: 'p', x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(2), pitch: +p.pitch.toFixed(2), sn: p.sneaking ? 1 : 0, sw: G.swingT > .5 ? 1 : 0, it: (G.held() || {}).id || 0, m: p.mode, d: p.dead ? 1 : 0, n: ctx.user.name, y0: 0 });
          if (net.isHost && G.tickCount % 4 === 0) {
            const list = [];
            for (const e of G.entities) if (e.kind === 'mob') list.push([e.id, e.type, +e.x.toFixed(2), +e.y.toFixed(2), +e.z.toFixed(2), +e.yaw.toFixed(2), +e.headYaw.toFixed(2), +e.pitch.toFixed(2), Math.ceil(e.hp), e.hurt > 10 ? 1 : 0, e.color || '', e.shorn ? 1 : 0, e.fuseT || 0]);
            room.send({ t: 'm', list });
          }
          if (net.isHost && G.tickCount % 100 === 0) net.syncTime();
        },
        frame(alpha) {
          for (const o of others.values()) {
            if (o.x === undefined) continue;
            if (!o.model) {
              o.model = R.makeModel('player');
              R.scene.add(o.model.group);
              o.tag = Gfx.label(o.n || 'Player');
              o.tag.scale.set(1.25, .28, 1);
              R.scene.add(o.tag);
            }
            o.rx += (o.x - o.rx) * .3; o.ry += (o.y - o.ry) * .3; o.rz += (o.z - o.rz) * .3;
            const g = o.model.group, parts = o.model.parts, speed = Math.hypot(o.x - o.rx, o.z - o.rz);
            o.stride = (o.stride || 0) + speed * 1.4;
            g.visible = o.m !== 'spectator' && !o.d;
            g.position.set(o.rx, o.ry - (o.sn ? .1 : 0), o.rz); g.rotation.y = o.yaw;
            parts.head.rotation.x = o.pitch;
            const s = Math.sin(o.stride) * Math.min(1, speed * 6) * .9;
            parts.legL.rotation.x = s; parts.legR.rotation.x = -s; parts.armL.rotation.x = -s;
            parts.armR.rotation.x = o.sw ? 1.4 : s;
            const l = R.litAt(G.W.lightAt(Math.floor(o.rx), Math.floor(o.ry + 1), Math.floor(o.rz)));
            o.model.mat.color.setRGB(l, l, l);
            o.tag.position.set(o.rx, o.ry + 2.15, o.rz);
            o.tag.visible = g.visible;
          }
          return alpha;
        },
        stepRemote(e) {
          e.x += (e.tx - e.x) * .35; e.y += (e.ty - e.y) * .35; e.z += (e.tz - e.z) * .35;
          e.stride += Math.hypot(e.x - e.px, e.z - e.pz) * 5;
          e.vx = e.x - e.px; e.vz = e.z - e.pz;
        },
      };
      room.onMessage((d, from) => {
        if (d.to && d.to !== room.me) return;
        switch (d.t) {
          case 'b': G.W && G.W.loaded(d.x, d.z) ? G.setBlock(d.x, d.y, d.z, d.id, d.m, { quiet: true }) : remoteEdit(d); break;
          case 'be': if (G.W) G.W.setBE(d.x, d.y, d.z, d.be); if (d.be) G.ui.containerChanged(G.W && G.W.beAt(d.x, d.y, d.z)); if (G.W && d.be && d.be.type === 'furnace') { const k = posKey(d.x, d.y, d.z); furnaces.set(k, [d.x, d.y, d.z, d.be]); } break;
          case 'p': {
            const o = others.get(from) || { rx: d.x, ry: d.y, rz: d.z };
            Object.assign(o, d, { id: from });
            others.set(from, o);
            break;
          }
          case 'left': {
            const o = others.get(from);
            if (o && o.model) { R.scene.remove(o.model.group); R.scene.remove(o.tag); }
            others.delete(from);
            G.ui.chatLine(`${(o && o.n) || 'A player'} left the game`);
            break;
          }
          case 'c': G.ui.chatLine(d.text); break;
          case 'time': if (G.level && !net.isHost) { G.level.time = d.time; G.level.rain = d.rain; G.level.thunder = d.thunder; } break;
          case 'fx': if (d.k === 'explode' && G.ready) G.fx.explosion(d.x, d.y, d.z, d.a); break;
          case 'dmg': if (G.ready) G.hurtPlayer(d.dmg, 'mob', d.kx, d.kz); break;
          case 'hit': if (net.isHost) { const e = G.entities.find(q => q.kind === 'mob' && q.id === d.id); if (e) G.damageMob(e, d.dmg, d.kx, d.kz, { net: d.by }); } break;
          case 'loot': if (G.ready) { for (const [id, n] of d.list) G.spawnItem(d.x, d.y + .4, d.z, id, n); G.spawnOrb(d.x, d.y + .3, d.z, d.xp); } break;
          case 'm': if (!net.isHost && G.ready) syncMobs(d.list); break;
          case 'hello': if (net.isHost) welcome(from, d.name); break;
          default: break;
        }
      });
      return net;
    };
    const remoteEdit = d => {
      // A friend edited somewhere this host has not loaded. Keep it until the save flushes.
      if (!G.net || !G.net.isHost || !G.W) return;
      G.pendingRemote = G.pendingRemote || new Map();
      const k = (d.x >> 4) + ',' + (d.z >> 4), i = (d.y << 8) | ((d.z & 15) << 4) | (d.x & 15);
      if (!G.pendingRemote.has(k)) G.pendingRemote.set(k, new Map());
      G.pendingRemote.get(k).set(i, d.id | (d.m << 8));
      G.W.set(d.x, d.y, d.z, d.id, d.m);
    };
    const syncMobs = list => {
      const seen = new Set();
      for (const a of list) {
        const [id, type, x, y, z, yaw, headYaw, pitch, hp, hurt, color, shorn, fuse] = a;
        seen.add(id);
        let e = G.entities.find(q => q.kind === 'mob' && q.remote && q.netId === id);
        if (!e) {
          e = G.spawnMob(type, x, y, z, { remote: true, netId: id, color: color || undefined });
          if (!e) continue;
          e.tx = x; e.ty = y; e.tz = z;
        }
        e.tx = x; e.ty = y; e.tz = z; e.yaw = yaw; e.headYaw = headYaw; e.pitch = pitch; e.hp = hp; e.hurt = hurt ? 20 : 0; e.shorn = !!shorn; e.fuseT = fuse;
      }
      for (const e of G.entities) if (e.kind === 'mob' && e.remote && !seen.has(e.netId)) e.dead = true;
    };
    const welcome = async (to, name) => {
      const L = G.level, room = G.net.room;
      G.ui.chatLine(`${name || 'A friend'} joined the game`);
      G.W.saveAll();
      const { id, seed, seedText, type, structures, difficulty, rules, spawn, time, rain, thunder, name: worldName } = L;
      room.send({ t: 'welcome', to, level: { id, seed, seedText, type, structures, difficulty, rules, spawn, time, rain, thunder, name: worldName, mode: L.mode === 'spectator' ? 'survival' : L.mode, commands: false } });
      await new Promise(r => setTimeout(r, 250));
      const all = await CraftDB.allChunks(L.id);
      for (let i = 0; i < all.length; i++) {
        room.send({ t: 'cd', to, k: all[i][0], e: all[i][1].e, b: all[i][1].b });
        if (i % 20 === 19) await new Promise(r => setTimeout(r, 80));
      }
      room.send({ t: 'cd-end', to });
    };
    G.openRoom = async () => {
      if (G.net) return G.net.room.code;
      const room = await Net.host('craft', ctx.user.name);
      window.__room = room;
      G.net = installNet(room);
      room.onClose(() => { G.net = null; });
      return room.code;
    };
    G.joinRoom = async code => {
      const room = await Net.join('craft', code, ctx.user.name), diffs = new Map();
      window.__room = room;
      G.panorama = null;
      if (G.W) stopWorld();
      G.net = installNet(room, diffs);
      room.onClose(why => { const was = !!G.ready; G.net = null; if (was || G.level) { G.toTitle(); G.ui.message('Connection Lost', why || 'The host closed the world.'); } });
      return new Promise((ok, no) => {
        let level = null;
        const timer = setTimeout(() => no(new Error('The host did not answer. They may not have opened a world.')), 15000);
        const off = room.onMessage(d => {
          if (d.to && d.to !== room.me) return;
          if (d.t === 'welcome') { clearTimeout(timer); level = d.level; }
          else if (d.t === 'cd') diffs.set(d.k, { e: d.e, b: d.b });
          else if (d.t === 'cd-end') {
            off();
            level.remote = true;
            G.enter(level, G.net);
            ok();
          }
        });
        room.send({ t: 'hello', name: ctx.user.name });
      });
    };

    // ---------- Input ----------
    const capture = () => {
      if (coarse() || G.noLock) return;
      const c = R.canvas;
      if (!c.requestPointerLock) { G.noLock = true; return; }
      try {
        const r = c.requestPointerLock();
        if (r && r.catch) r.catch(() => { G.lockFail = true; });
      } catch (e) { G.noLock = true; }
    };
    G.capture = capture;
    const releaseCapture = () => { if (document.pointerLockElement) document.exitPointerLock(); };
    G.release = releaseCapture;
    const locked = () => document.pointerLockElement === R.canvas;
    G.locked = locked;
    ctx.on(document, 'pointerlockchange', () => {
      if (locked()) { G.lockFail = false; return; }
      G.mouse.left = G.mouse.right = false;
      if (G.ready && !G.ui.isOpen() && G.player && !G.player.dead) G.ui.pause();
    });
    ctx.on(document, 'pointerlockerror', () => { G.lockFail = true; });
    const look = (dx, dy) => {
      const p = G.player;
      if (!p || !G.ready || G.ui.isOpen() || p.dead) return;
      const s = (opt.sens * .6 + .2), k = s * s * s * 8 * .15 * Math.PI / 180;
      p.yaw -= dx * k;
      p.pitch -= dy * k * (opt.invert ? -1 : 1);
      p.pitch = Math.max(-Math.PI / 2 + .001, Math.min(Math.PI / 2 - .001, p.pitch));
    };
    G.look = look;
    ctx.on(document, 'mousemove', e => {
      if (locked()) { if (Math.abs(e.movementX) < 300 && Math.abs(e.movementY) < 300) look(e.movementX, e.movementY); }
      else if (G.dragLook && e.buttons) {
        look(e.clientX - G.dragLook[0], e.clientY - G.dragLook[1]);
        G.dragLook = [e.clientX, e.clientY];
        if (G.dragTap && Math.hypot(e.clientX - G.dragTap.x, e.clientY - G.dragTap.y) > 5) G.dragTap.moved = true;
      }
    });
    ctx.on(R.canvas, 'contextmenu', e => e.preventDefault());
    ctx.on(document, 'mousedown', e => {
      if (!G.ready || G.ui.isOpen() || coarse()) return;
      if (e.target !== R.canvas && !locked()) return;
      if (!locked()) {
        capture();
        // Where the browser refuses mouse capture, play still works: drag to look, hold still to mine, tap to hit.
        if (e.button === 0) {
          G.dragLook = [e.clientX, e.clientY];
          G.dragTap = { x: e.clientX, y: e.clientY, at: performance.now(), moved: false };
          clearTimeout(G.dragHold);
          G.dragHold = setTimeout(() => { if (G.dragTap && !G.dragTap.moved && !locked()) G.mouse.left = true; }, 220);
          return;
        }
      }
      if (e.button === 0) G.mouse.left = true;
      else if (e.button === 2) G.mouse.right = true;
      else if (e.button === 1) { e.preventDefault(); pickBlock(); }
    });
    ctx.on(document, 'mouseup', e => {
      if (e.button === 0) {
        G.mouse.left = false;
        clearTimeout(G.dragHold);
        if (G.dragTap && !G.dragTap.moved && !locked() && G.ready && !G.ui.isOpen() && performance.now() - G.dragTap.at < 220) {
          G.mouse.left = true;
          setTimeout(() => { G.mouse.left = false; }, 110);
        }
        G.dragTap = null;
      } else if (e.button === 2) G.mouse.right = false;
      G.dragLook = null;
    });
    ctx.on(window, 'wheel', e => {
      if (!G.ready || G.ui.isOpen() || !G.player) return;
      e.preventDefault();
      const p = G.player, n = e.deltaY > 0 ? 1 : -1;
      p.sel = (p.sel + n + 9) % 9;
      G.ui.dirty(); G.ui.itemName();
    }, { passive: false });
    const pickBlock = () => {
      const hit = G.target, p = G.player;
      if (!hit) return;
      const d = DEF[hit.id];
      let id = d.noItem ? (typeof d.drops === 'string' ? I[d.drops] : undefined) : I[d.key];
      if (d.stages) id = I[{ wheat: 'wheat_seeds', carrots: 'carrot', potatoes: 'potato' }[d.key]];
      if (id === undefined) return;
      const have = p.inv.findIndex(s => s && s.id === id);
      if (have >= 0 && have < 9) { p.sel = have; G.ui.dirty(); G.ui.itemName(); return; }
      if (have >= 9) { const t = p.inv[p.sel]; p.inv[p.sel] = p.inv[have]; p.inv[have] = t; G.ui.dirty(); G.ui.itemName(); return; }
      if (p.mode === 'creative') {
        let slot = p.sel;
        if (p.inv[slot]) { const e = p.inv.findIndex((s, i) => i < 9 && !s); if (e >= 0) slot = e; }
        p.inv[slot] = { id, count: 1, dmg: 0 }; p.sel = slot;
        G.ui.dirty(); G.ui.itemName();
      }
    };
    ctx.on(window, 'keydown', e => {
      if (e.target.matches && e.target.matches('input,textarea,select')) { if (e.code === 'Escape') G.ui.escape(); return; }
      if (['Space', 'Tab', 'F1', 'F2', 'F3', 'F5', 'ArrowUp', 'ArrowDown', 'Slash', 'Quote'].includes(e.code)) e.preventDefault();
      if (e.code === 'Escape') { if (G.ui.isOpen()) { e.preventDefault(); G.ui.escape(); } else if (G.ready && !locked()) G.ui.pause(); return; }
      if (!G.ready || G.player === null) return;
      if (G.ui.isOpen()) {
        if (e.code === binds.inventory && G.ui.isContainer()) G.ui.closeScreen();
        else G.ui.keyInGui(e);
        return;
      }
      if (!e.repeat) G.keyTapped = e.code;
      keys.add(e.code);
      if (e.repeat) return;
      const p = G.player;
      if (p.dead) return;
      if (/^Digit[1-9]$/.test(e.code)) { p.sel = +e.code[5] - 1; G.ui.dirty(); G.ui.itemName(); return; }
      if (e.code === binds.inventory && p.mode !== 'spectator') G.ui.openInventory();
      else if (e.code === binds.drop && p.mode !== 'spectator') G.dropHeld(e.ctrlKey);
      else if (e.code === binds.chat) { e.preventDefault(); G.ui.openChat(''); }
      else if (e.code === binds.command) G.ui.openChat('/');
      else if (e.code === binds.debug) G.ui.toggleDebug();
      else if (e.code === binds.hud) G.ui.toggleHud();
      else if (e.code === binds.perspective) { G.cameraMode = ((G.cameraMode || 0) + 1) % 3; }
      else if (e.code === binds.screenshot) G.screenshot();
      else if (e.code === binds.players) G.ui.players(true);
    });
    ctx.on(window, 'keyup', e => { keys.delete(e.code); if (e.code === binds.players) G.ui.players(false); });
    ctx.on(window, 'blur', () => { keys.clear(); G.mouse.left = G.mouse.right = false; });
    ctx.on(document, 'visibilitychange', () => { if (document.hidden) G.saveNow(); });
    ctx.on(window, 'resize', () => { R.resize(); G.ui.fit(); });
    if (window.ResizeObserver) { const ro = new ResizeObserver(() => { R.resize(); if (G.ui) G.ui.fit(); }); ro.observe(root); ctx.add(() => ro.disconnect()); }
    ctx.on(document, 'fullscreenchange', () => { R.resize(); G.ui.fit(); });
    G.screenshot = () => {
      render3D(1);
      const a = el('a', { href: R.canvas.toDataURL('image/png'), download: `blockcraft-${Date.now()}.png` });
      a.click();
      G.ui.chatLine('Saved a screenshot to your downloads.');
    };

    // ---------- Frame ----------
    let acc = 0, lastNow = performance.now(), time = 0, fovNow = opt.fov, fps = 60, fpsT = 0, fpsN = 0;
    G.swingT = 0; G.tilt = 0;
    const cameraPlace = alpha => {
      const p = G.player, cam = R.camera;
      const x = p.px + (p.x - p.px) * alpha, y = p.py + (p.y - p.py) * alpha, z = p.pz + (p.z - p.pz) * alpha;
      p.eyeNow += ((p.eyeTarget || 1.62) - p.eyeNow) * .35;
      let cx = x, cy = y + p.eyeNow, cz = z, yaw = p.yaw, pitch = p.pitch;
      const mode = G.cameraMode || 0;
      if (mode) {
        // Third person pulls back along the view until it would hit something.
        const f = dirOf(yaw, pitch), sign = mode === 1 ? -1 : 1;
        let dist = 4;
        for (let t = .4; t < 4; t += .2) {
          const a = Math.floor(cx + f[0] * t * sign), b = Math.floor(cy + f[1] * t * sign), c = Math.floor(cz + f[2] * t * sign);
          if (OPAQUE[G.W.get(a, b, c)]) { dist = t - .3; break; }
        }
        cx += f[0] * dist * sign; cy += f[1] * dist * sign; cz += f[2] * dist * sign;
        if (mode === 2) { yaw += Math.PI; pitch = -pitch; }
      }
      const walk = (G.walkDist || 0), speedNow = Math.hypot(p.x - p.px, p.z - p.pz), onFoot = p.onGround && !p.flying && !mode;
      G.bobK = (G.bobK || 0) + ((onFoot ? Math.min(1, speedNow * 6) : 0) - (G.bobK || 0)) * .2;
      let bobX = 0, bobY = 0, roll = 0;
      if (opt.bob) { bobX = Math.sin(walk * Math.PI * .75) * .035 * G.bobK; bobY = -Math.abs(Math.cos(walk * Math.PI * .75)) * .05 * G.bobK; roll = Math.sin(walk * Math.PI * .75) * .007 * G.bobK; }
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
      cam.position.set(cx + bobX * cosY, cy + bobY, cz - bobX * sinY);
      if (G.shake > .002) { cam.position.x += (Math.random() - .5) * G.shake; cam.position.y += (Math.random() - .5) * G.shake; cam.position.z += (Math.random() - .5) * G.shake; G.shake *= .9; }
      G.tilt *= .86;
      cam.rotation.set(pitch, yaw, roll + G.tilt);
      G.camera = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
      // Field of view eases with speed, flight and a drawn bow.
      let want = opt.fov;
      if (p.sprinting) want *= 1.15; else if (p.flying) want *= 1.08;
      if (p.using && p.using.kind === 'bow') want *= 1 - Math.min(1, p.using.t / 20) * .22;
      const fluidCam = FLUID[G.W.get(Math.floor(cam.position.x), Math.floor(cam.position.y), Math.floor(cam.position.z))];
      if (fluidCam === 1) want *= .92;
      fovNow += (want - fovNow) * .18;
      if (Math.abs(cam.fov - fovNow) > .01) R.setFov(fovNow);
      return { fluidCam, x, y, z, mode };
    };
    const playerAvatar = (x, y, z, mode) => {
      const p = G.player;
      if (mode && !G.playerModel) {
        G.playerModel = R.makeModel('player');
        R.scene.add(G.playerModel.group);
      }
      if (!G.playerModel) return;
      const m = G.playerModel, g = m.group;
      g.visible = !!mode && p.mode !== 'spectator';
      if (!g.visible) return;
      g.position.set(x, y, z); g.rotation.y = p.yaw;
      m.parts.head.rotation.x = p.pitch;
      const s = Math.sin((G.walkDist || 0) * 3) * Math.min(1, Math.hypot(p.x - p.px, p.z - p.pz) * 6) * .9;
      m.parts.legL.rotation.x = s; m.parts.legR.rotation.x = -s; m.parts.armL.rotation.x = -s; m.parts.armR.rotation.x = G.swingT > .1 ? Math.sin(G.swingT * 3.14) * 1.6 : s;
      const l = R.litAt(G.W.lightAt(Math.floor(x), Math.floor(y + 1), Math.floor(z)));
      m.mat.color.setRGB(l, l, l);
    };
    const render3D = alpha => {
      const p = G.player, L = G.level;
      const cp = cameraPlace(alpha);
      const t = L.time + alpha;
      const biome = G.W.biome(Math.floor(p.x), Math.floor(p.z));
      R.setSky(t, L.rainK, L.thunderK * L.rainK, cp.fluidCam, biome, Math.floor(L.time / 24000));
      playerAvatar(cp.x, cp.y, cp.z, cp.mode);
      G.ents.render(alpha);
      if (G.net) G.net.frame(alpha);
      const l = R.litAt(G.W.lightAt(Math.floor(p.x), Math.floor(p.y + 1.2), Math.floor(p.z)));
      const hs = R.handState;
      R.setHeld(p.mode === 'spectator' || cp.mode ? 0 : (G.held() || { id: 0 }).id);
      hs.swing = 1 - G.swingT;
      if (!G.swingT) hs.swing = 0;
      if (opt.bob) { hs.bobX = Math.sin((G.walkDist || 0) * Math.PI * .75) * .025 * (G.bobK || 0); hs.bobY = -Math.abs(Math.cos((G.walkDist || 0) * Math.PI * .75)) * .03 * (G.bobK || 0); } else { hs.bobX = hs.bobY = 0; }
      hs.eat += ((p.using && p.using.kind === 'eat' ? 1 : 0) - hs.eat) * .2;
      hs.draw += ((p.using && p.using.kind === 'bow' ? Math.min(1, p.using.t / 20) : 0) - hs.draw) * .2;
      R.updateHand(l);
      const hit = G.target;
      if (hit && p.mode !== 'spectator' && !cp.mode) R.setSelection(hit.x, hit.y, hit.z, hit.boxes, hit.id + ':' + hit.m + ':' + (hit.conn || 0));
      else R.hideSelection();
      R.updateParticles(lastDt, (a, b, c) => SOLID[G.W.get(a, b, c)], (a, b, c) => R.litAt(G.W.lightAt(a, b, c)));
      R.render(time, p.mode !== 'spectator' && !cp.mode && !G.ui.hudHidden());
    };
    let lastDt = 0;
    ctx.loop((_, now) => {
      const dt = Math.min(.25, (now - lastNow) / 1000);
      lastNow = now; lastDt = dt;
      time += dt;
      fpsN++; fpsT += dt;
      if (fpsT >= .5) { fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; G.fps = fps; }
      if (G.swingT > 0) G.swingT = Math.max(0, G.swingT - dt * 3.4);
      if (G.panorama) {
        const pn = G.panorama, cam = R.camera;
        if (G.W && pn.ready) {
          G.W.pump();
          pn.yaw += dt * .025;
          // Keep the view above the treetops around it.
          let high = 0;
          for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; high = Math.max(high, G.W.top(Math.floor(pn.x + Math.cos(a) * 14), Math.floor(pn.z + Math.sin(a) * 14)), G.W.top(Math.floor(pn.x), Math.floor(pn.z))); }
          pn.y += (Math.max(pn.y0, high + 9) - pn.y) * Math.min(1, dt * 3);
          cam.position.set(pn.x, pn.y, pn.z);
          cam.rotation.set(-.1, pn.yaw, 0);
          G.W.meshQueue(10, pn.x, pn.y, pn.z);
          R.setSky(4200 + Math.sin(time * .01) * 800, 0, 0, 0, 0);
          R.setFov(70);
          G.W.cull({ x: pn.x, y: pn.y, z: pn.z }, R.planes(), true);
          R.updateParticles(dt, () => false, () => 1);
          R.render(time, false);
        } else if (G.W) { G.W.pump(); R.renderer.clear(); }
        return;
      }
      if (!G.W || !G.player) { R.renderer.clear(); return; }
      const p = G.player;
      G.W.setCenter(Math.floor(p.x / 16), Math.floor(p.z / 16), opt.render);
      G.W.pump();
      if (G.loadingWorld) {
        G.W.meshQueue(12, p.x, p.y, p.z);
        const k = G.W.progress(Math.floor(p.x / 16), Math.floor(p.z / 16), Math.min(3, opt.render));
        G.ui.setLoading(k);
        if (k >= 1) finishLoading();
        return;
      }
      G.W.meshQueue(4, p.x, p.y, p.z);
      if (G.ready && !(G.paused && !G.net)) {
        acc += dt;
        let n = 0;
        while (acc >= .05 && n++ < 5) { tick(); acc -= .05; }
        if (acc > .25) acc = 0;
      }
      const alpha = G.paused && !G.net ? 1 : Math.min(1, acc / .05);
      const weatherKind = () => {
        if (G.level.rainK < .15) return null;
        const b = G.biomeDef(Math.floor(p.x), Math.floor(p.z));
        return dryBiome(b) ? null : b.cold ? 'snow' : 'rain';
      };
      R.updateWeather(dt, G.camera, weatherKind(), (x, z) => G.W.top(x, z));
      render3D(alpha);
      const cam = R.camera;
      G.drawn = G.W.cull({ x: cam.position.x, y: cam.position.y, z: cam.position.z }, R.planes(), !OPAQUE[G.W.get(Math.floor(cam.position.x), Math.floor(cam.position.y), Math.floor(cam.position.z))]);
      G.ui.frame(dt);
    });
    G.ui = CraftUI.create(G);
    const inWorld = f => () => { if (G.player && G.ready) f(G.player); else throw new Error('not in a world'); };
    ctx.cheat('🎨 Creative mode', inWorld(() => G.setMode('creative')));
    ctx.cheat('⛏️ Survival mode', inWorld(() => G.setMode('survival')));
    ctx.cheat('💎 Diamond gear and blocks', inWorld(() => { for (const k of ['diamond_pickaxe', 'diamond_sword', 'diamond_axe', 'diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots', 'diamond', 'torch', 'cooked_beef']) G.give(I[k], ITEMS[I[k]].stack === 1 ? 1 : 64); }));
    ctx.cheat('❤️ Full health and food', inWorld(p => { p.hp = 20; p.food = 20; p.sat = 20; p.air = 300; G.ui.dirty(); }));
    ctx.cheat('⌨️ Turn on commands', inWorld(() => { G.level.commands = true; G.ui.chatLine('Commands are on. Press / to type one.'); }));
    ctx.cheat('☀️ Make it day', inWorld(() => { G.level.time = Math.floor(G.level.time / 24000) * 24000 + 1000; G.level.rain = G.level.thunder = false; }));
    ctx.add(() => {
      if (G.W) { G.saveNow(); G.panorama = null; stopWorld(); }
      if (G.net) { G.net.close(); G.net = null; }
      CraftAudio.stopMusic();
      releaseCapture();
      R.dispose();
      root.remove();
      document.body.classList.remove('bc-lock');
      window.removeEventListener('beforeunload', confirmLeave);
    });
    G.saveOptions = () => Store.set('craft.options', opt);
    G.saveKeys = () => Store.set('craft.keys', binds);
    G.applyOptions = () => {
      R.setClouds(opt.clouds); R.setWaves(opt.waves); R.setScale(opt.scale);
      CraftMesher.setFancy(opt.fancy);
      CraftAudio.volume = opt.sound; CraftAudio.music = opt.music;
      if (G.player) { R.setDistance(opt.render); G.W.setCenter(Math.floor(G.player.x / 16), Math.floor(G.player.z / 16), opt.render); }
      G.ui.fit();
      G.saveOptions();
    };
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') window.__craft = G;
    panorama();
    G.ui.title();
    // Joining from a friend's invite skips straight into their world.
    let pend = null;
    try { pend = JSON.parse(sessionStorage.getItem('amg.join') || 'null'); } catch (e) {}
    if (pend && pend.game === 'craft') {
      sessionStorage.removeItem('amg.join');
      G.ui.loading('Joining your friend');
      G.joinRoom(pend.code).catch(e => { G.toTitle(); G.ui.message('Could not join', e.message); });
    }
    return G;
  }
  return { start, VERSION, RULES };
})();
