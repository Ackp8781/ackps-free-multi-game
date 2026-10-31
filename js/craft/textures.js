// BlockCraft art: every texture and icon is painted here by code, so the game ships no image files.
const CraftTex = (() => {
  const D = CraftData;
  const S = 16, COLS = 32, tiles = new Map();
  const seedOf = s => { let h = 7; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  const rand = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const shade = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // Smooth noise that wraps around the tile, so repeated blocks show no seams.
  const wrapNoise = (seed, cx, cy = cx) => {
    const r = rand(seed), g = [];
    for (let i = 0; i < cx * cy; i++) g.push(r());
    return (x, y) => {
      const u = x / S * cx, v = y / S * cy, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
      const at = (a, b) => g[((a % cx) + cx) % cx + (((b % cy) + cy) % cy) * cx];
      const s = t => t * t * (3 - 2 * t), su = s(fu), sv = s(fv);
      return (at(i, j) * (1 - su) + at(i + 1, j) * su) * (1 - sv) + (at(i, j + 1) * (1 - su) + at(i + 1, j + 1) * su) * sv;
    };
  };
  const TINT = 191; // Alpha marker: pixels with this alpha take the biome colour in the shader.
  const tile = (name, f) => {
    const a = new Uint8ClampedArray(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const c = f(x, y), i = (x + y * S) * 4;
      if (!c) continue;
      a[i] = c[0]; a[i + 1] = c[1]; a[i + 2] = c[2]; a[i + 3] = c[3] === undefined ? 255 : c[3];
    }
    tiles.set(name, a);
    return a;
  };
  const read = (name, x, y) => { const a = tiles.get(name), i = (x + y * S) * 4; return [a[i], a[i + 1], a[i + 2], a[i + 3]]; };
  const pal = (list, v) => list[Math.max(0, Math.min(list.length - 1, Math.floor(v * list.length)))];
  // Layered speckle: big soft blotches with a little per-pixel grit, snapped to a short palette.
  const grit = (name, colors, o = {}) => {
    const list = colors.map(rgb), seed = seedOf(name), a = wrapNoise(seed, o.cx || 4, o.cy || o.cx || 4), b = wrapNoise(seed + 1, o.fx || 8, o.fy || o.fx || 8), r = rand(seed + 2), j = o.grit === undefined ? .22 : o.grit;
    return tile(name, (x, y) => {
      const c = pal(list, Math.min(.999, Math.max(0, a(x, y) * .55 + b(x, y) * .45 - j / 2 + r() * j)));
      return o.alpha ? [...c, o.alpha] : c;
    });
  };
  const over = (name, base, f) => tile(name, (x, y) => f(x, y) || read(base, x, y));

  const STONE = ['#5f6163', '#6d6f71', '#7a7c7e', '#87898b', '#939597'];
  function buildBlocks() {
    grit('stone', STONE, { cx: 3, cy: 6, fx: 8, fy: 16 });
    { // A few dark seams give stone its broken-rock look.
      const r = rand(8831), m = new Set();
      for (let n = 0; n < 7; n++) { let x = Math.floor(r() * 16), y = Math.floor(r() * 16); const l = 2 + Math.floor(r() * 4); for (let i = 0; i < l; i++) { m.add(((x + i) & 15) + (y & 15) * 16); if (r() < .3) y++; } }
      over('stone', 'stone', (x, y) => m.has(x + y * 16) ? rgb('#55575a') : null);
    }
    grit('dirt', ['#583c25', '#664830', '#74543a', '#806044', '#8d6c4f'], { cx: 5, fx: 16 });
    grit('coarse_dirt', ['#4a3320', '#5c432b', '#6e5137', '#7b6f5f', '#8e8373'], { cx: 8, fx: 16, grit: .5 });
    grit('grass_top', ['#a8a8a8', '#b8b8b8', '#c8c8c8', '#d8d8d8', '#e8e8e8'], { cx: 8, fx: 16, grit: .38, alpha: TINT });
    {
      const r = rand(551), edge = [];
      for (let x = 0; x < 16; x++) edge[x] = 2 + Math.floor(r() * 3);
      const fringe = wrapNoise(77, 8);
      tile('grass_side', (x, y) => {
        if (y < edge[x]) { const v = 168 + fringe(x, y) * 80; return [v, v, v, TINT]; }
        const c = read('dirt', x, y);
        return y === edge[x] ? shade(c, .8) : c;
      });
      const side = (name, base, top, n) => {
        const list = top.map(rgb), lip = [];
        const q = rand(seedOf(name));
        for (let x = 0; x < 16; x++) lip[x] = n + Math.floor(q() * 3);
        tile(name, (x, y) => y < lip[x] ? pal(list, q()) : read(base, x, y));
      };
      grit('mycelium_top', ['#6a5a70', '#766579', '#827184', '#91808f', '#a896a5'], { cx: 8, fx: 16, grit: .5 });
      side('mycelium_side', 'dirt', ['#6a5a70', '#7c6c80', '#91808f'], 2);
      grit('podzol_top', ['#4c361c', '#5e4422', '#6e5129', '#7a5c31', '#88683a'], { cx: 6, fx: 16, grit: .45 });
      side('podzol_side', 'dirt', ['#4c361c', '#5e4422', '#7a5c31'], 2);
      grit('path_top', ['#8a6f3f', '#94784a', '#9d8251', '#a78b59', '#b09561'], { cx: 6, fx: 16 });
      side('path_side', 'dirt', ['#8a6f3f', '#9d8251', '#b09561'], 1);
    }
    grit('sand', ['#d8cb94', '#ddd09c', '#e2d6a4', '#e7dbac', '#ece1b5'], { cx: 8, fx: 16, grit: .4 });
    grit('red_sand', ['#a55a24', '#ae6229', '#b76a2e', '#bf7234', '#c67b3b'], { cx: 8, fx: 16, grit: .4 });
    const blobs = (name, colors, n, mortar) => {
      // Scattered stones: each pixel takes the colour of its nearest pebble.
      const r = rand(seedOf(name)), pts = [];
      for (let i = 0; i < n; i++) pts.push([r() * 16, r() * 16, colors[Math.floor(r() * colors.length)]]);
      tile(name, (x, y) => {
        let a = 1e9, b = 1e9, c = null;
        for (const p of pts) {
          const dx = Math.min(Math.abs(x - p[0]), 16 - Math.abs(x - p[0])), dy = Math.min(Math.abs(y - p[1]), 16 - Math.abs(y - p[1])), d = dx * dx + dy * dy;
          if (d < a) { b = a; a = d; c = p[2]; } else if (d < b) b = d;
        }
        if (mortar && Math.sqrt(b) - Math.sqrt(a) < mortar) return rgb('#4c4e50');
        const v = rgb(c), lit = (y + x) % 7 === 0 ? 1.08 : 1;
        return shade(v, lit);
      });
    };
    blobs('gravel', ['#6c6866', '#7e7a77', '#8e8a86', '#9d9994', '#5b5855'], 26);
    blobs('cobblestone', ['#6e7072', '#7c7e80', '#8a8c8e', '#97999b', '#656769'], 11, .75);
    blobs('cobbled_deepslate', ['#3a3a40', '#46464c', '#505056', '#2f2f35'], 11, .7);
    over('mossy_cobblestone', 'cobblestone', (() => { const n = wrapNoise(331, 5); return (x, y) => n(x, y) > .55 ? pal(['#4d6b2d', '#5a7a34', '#6b8c3f'].map(rgb), (n(x + 3, y + 5))) : null; })());
    blobs('bedrock', ['#2b2b2b', '#414141', '#5a5a5a', '#747474', '#1d1d1d'], 18);
    grit('clay', ['#8d94a4', '#959caa', '#9da4b2', '#a5acb9', '#acb3c0'], { cx: 4, fx: 8, grit: .12 });
    grit('snow', ['#e6eef2', '#edf3f6', '#f3f7f9', '#f8fbfc', '#ffffff'], { cx: 4, fx: 8, grit: .12 });
    {
      const r = rand(90), cr = new Set();
      for (let n = 0; n < 4; n++) { let x = Math.floor(r() * 16), y = Math.floor(r() * 16); for (let i = 0; i < 7; i++) { cr.add((x & 15) + (y & 15) * 16); x += r() < .6 ? 1 : 0; y += r() < .6 ? 1 : 0; } }
      tile('ice', (x, y) => cr.has(x + y * 16) ? [228, 243, 255, 225] : [150, 192, 247, 165]);
      grit('packed_ice', ['#8fb2e8', '#99bbec', '#a3c3ef', '#adcbf2', '#b8d3f5'], { cx: 5, fx: 16, grit: .18 });
    }
    grit('granite', ['#8f6554', '#9b7160', '#a77c6b', '#b58a78', '#7d584a'], { cx: 8, fx: 16, grit: .55 });
    grit('diorite', ['#a8a8a8', '#b9b9b9', '#cbcbcb', '#dddddd', '#8f8f8f'], { cx: 8, fx: 16, grit: .6 });
    grit('andesite', ['#767676', '#828282', '#8c8c8c', '#969696', '#6b6b6b'], { cx: 8, fx: 16, grit: .42 });
    grit('deepslate', ['#3f3f45', '#49494f', '#535359', '#5d5d63', '#35353a'], { cx: 3, cy: 12, fx: 4, fy: 16 });
    grit('smooth_stone', ['#9a9a9a', '#a0a0a0', '#a6a6a6', '#acacac'], { cx: 3, fx: 6, grit: .1 });
    over('smooth_stone', 'smooth_stone', (x, y) => (x === 0 || y === 0) ? rgb('#bcbcbc') : (x === 15 || y === 15) ? rgb('#808080') : null);
    const strata = (name, colors) => {
      const list = colors.map(rgb), n = wrapNoise(seedOf(name), 8, 3), r = rand(seedOf(name) + 3);
      tile(name, (x, y) => pal(list, Math.min(.99, ((y % 8) / 8) * .55 + n(x, y) * .35 + r() * .15)));
    };
    strata('sandstone', ['#c9ba84', '#d3c48e', '#dbcd98', '#e2d5a2', '#eadcae']);
    grit('sandstone_top', ['#dfd19b', '#e3d6a2', '#e7daa8', '#ebdeaf'], { cx: 4, fx: 16, grit: .2 });
    strata('sandstone_bottom', ['#bfae78', '#c9ba84', '#d3c48e', '#dbcd98']);
    strata('red_sandstone', ['#94501f', '#a05a26', '#ad622b', '#b86b31', '#c27537']);
    grit('red_sandstone_top', ['#b86b31', '#bd7035', '#c27537', '#c87a3c'], { cx: 4, fx: 16, grit: .2 });
    strata('red_sandstone_bottom', ['#8c4a1b', '#94501f', '#a05a26', '#ad622b']);
    grit('obsidian', ['#0e0a18', '#16101f', '#1f1830', '#2b2140', '#3a2d57'], { cx: 5, fx: 16, grit: .3 });
    { // Warm cells that look lit from within.
      const n = wrapNoise(4120, 5);
      tile('glow_block', (x, y) => { const v = n(x, y) * .7 + ((x * 7 + y * 13) % 5) * .06; return pal(['#a86d25', '#d89b3c', '#f2c35f', '#ffe08b', '#fff3c0'].map(rgb), Math.min(.99, v)); });
    }

    // Ores sit on plain stone. Each has its own nugget shape so they read at a glance.
    const nuggets = (name, base, colors, n, seed = 0, spread = 3) => {
      const r = rand(seedOf(name) + seed), m = new Map(), list = colors.map(rgb);
      for (let k = 0; k < n; k++) {
        const cx = 2 + Math.floor(r() * 12), cy = 2 + Math.floor(r() * 12), count = 2 + Math.floor(r() * spread);
        for (let i = 0; i < count; i++) m.set((cx + Math.floor(r() * 3) - 1) + (cy + Math.floor(r() * 3) - 1) * 16, list[Math.floor(r() * list.length)]);
      }
      over(name, base, (x, y) => m.get(x + y * 16));
    };
    nuggets('coal_ore', 'stone', ['#1c1c1e', '#2a2a2d', '#38383c'], 6);
    nuggets('iron_ore', 'stone', ['#b98c67', '#cda27c', '#dfba97'], 5);
    nuggets('copper_ore', 'stone', ['#a95b35', '#c8743e', '#5f9c82'], 6);
    nuggets('gold_ore', 'stone', ['#e0b52a', '#f4d23e', '#fff08a'], 5);
    nuggets('ruby_ore', 'stone', ['#a81030', '#d8174a', '#ff5d7d'], 6);
    nuggets('lapis_ore', 'stone', ['#1d3f9c', '#2a57c7', '#6f94f0'], 6);
    nuggets('diamond_ore', 'stone', ['#25c4c9', '#62e5e2', '#c8fbf4'], 5);
    nuggets('emerald_ore', 'stone', ['#117a3b', '#1fb25a', '#74f09d'], 4);

    // Wood families
    const WOOD = {
      oak: { bark: ['#463820', '#55442a', '#624f31', '#715c3a'], ring: ['#a58750', '#b3945c', '#8d7040'], plank: ['#8f7244', '#9d7f4e', '#ab8b58', '#b89862'], leaf: null },
      birch: { bark: ['#c9c6bb', '#d9d6cc', '#e8e5dc', '#2f2d29'], ring: ['#cdb987', '#dbc896', '#a89668'], plank: ['#b8a673', '#c5b47f', '#d1c08a', '#dccc97'], leaf: ['#5f7f3d', '#6c8c45', '#79994d', '#86a656'] },
      spruce: { bark: ['#2d2011', '#3a2a18', '#46331f', '#523c25'], ring: ['#6a5230', '#7a5f38', '#54401f'], plank: ['#5a4427', '#664e2d', '#725834', '#7e623a'], leaf: ['#2d4f30', '#355a38', '#3d6540', '#477049'] },
      jungle: { bark: ['#42331a', '#544120', '#655027', '#766030'], ring: ['#a57a4c', '#b58a58', '#8d683f'], plank: ['#93673f', '#a17248', '#ad7d50', '#b98858'], leaf: null },
      acacia: { bark: ['#4c4539', '#5c5446', '#6c6352', '#7c735f'], ring: ['#b5602e', '#c36c35', '#9c5126'], plank: ['#a4552a', '#b25f30', '#be6a36', '#ca753d'], leaf: null },
      dark_oak: { bark: ['#231708', '#2e1f0d', '#3a2813', '#463219'], ring: ['#4a3519', '#59411f', '#3c2a13'], plank: ['#3b2711', '#463016', '#51391b', '#5c4221'], leaf: null },
      cherry: { bark: ['#2a1a22', '#37232c', '#442d37', '#523843'], ring: ['#e6bcc0', '#efcdd0', '#d09fa6'], plank: ['#dfaeb1', '#e6babc', '#edc6c7', '#f3d2d2'], leaf: ['#e39ac0', '#ecabcb', '#f4bdd6', '#fbcfe2'] },
    };
    for (const s of D.WOODS) {
      const w = WOOD[s], bark = w.bark.map(rgb), sd = seedOf(s), col = wrapNoise(sd, 16, 3), r = rand(sd + 9);
      if (s === 'birch') {
        const marks = new Set();
        for (let n = 0; n < 9; n++) { const x = Math.floor(r() * 16), y = Math.floor(r() * 16), l = 1 + Math.floor(r() * 3); for (let i = 0; i < l; i++) marks.add(((x + i) & 15) + y * 16); }
        tile(s + '_log', (x, y) => marks.has(x + y * 16) ? bark[3] : bark[Math.floor(col(x, y) * 3)]);
      } else tile(s + '_log', (x, y) => bark[Math.min(3, Math.floor(col(x, y) * 3.2 + r() * .9))]);
      const ring = w.ring.map(rgb);
      tile(s + '_log_top', (x, y) => {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        if (d > 6.6) return bark[(x + y) % 3];
        const k = Math.floor(d + (x * 3 + y * 5) % 3 * .2);
        return k % 3 === 2 ? ring[2] : ring[k % 2];
      });
      const plank = w.plank.map(rgb), grain = wrapNoise(sd + 3, 3, 16);
      tile(s + '_planks', (x, y) => {
        const row = Math.floor(y / 4), seam = (row * 7 + (row % 2) * 5) % 16;
        if (y % 4 === 3) return shade(plank[0], .72);
        if (x === seam) return shade(plank[0], .8);
        return plank[Math.min(3, Math.floor(grain(x + row * 5, y) * 3 + ((row * 3) % 2) * .6 + .2))];
      });
      // Leaves. Tinted species are painted in greys and coloured by the biome.
      const hole = wrapNoise(sd + 5, 8), lit = wrapNoise(sd + 6, 5), q = rand(sd + 7);
      const leafPal = w.leaf ? w.leaf.map(rgb) : [[136, 136, 136], [160, 160, 160], [184, 184, 184], [208, 208, 208]];
      tile(s + '_leaves', (x, y) => {
        if (hole(x, y) * .75 + q() * .3 < .32) return null;
        const c = leafPal[Math.min(3, Math.floor(lit(x, y) * 2.6 + q() * 1.5))];
        return w.leaf ? c : [...c, TINT];
      });
      // Saplings: a little trunk and a clump in the leaf colour.
      const clump = w.leaf ? w.leaf.map(rgb) : ['#3e6d24', '#4d8430', '#5d983a', '#6fae48'].map(rgb), q2 = rand(sd + 8);
      tile(s + '_sapling', (x, y) => {
        if (x >= 7 && x <= 8 && y >= 9) return bark[(y % 2) + 1];
        const dx = x - 7.5, dy = y - 6;
        if (dx * dx + dy * dy * 1.2 < 20 + q2() * 8) return q2() < .2 ? null : clump[Math.floor(q2() * 4)];
        return null;
      });
      // Doors: a framed panel with a window up top and a latch below.
      const dark = shade(plank[0], .7), mid = plank[1], lite = plank[3];
      const frame = (x, y) => x === 0 || x === 15 || y === 0 || y === 15;
      tile(s + '_door_top', (x, y) => {
        if (frame(x, y)) return dark;
        if (x >= 3 && x <= 12 && y >= 3 && y <= 11) { if (x === 7 || x === 8 || y === 7) return dark; return null; }
        return (x + y * 3) % 5 === 0 ? mid : lite;
      });
      tile(s + '_door_bottom', (x, y) => {
        if (frame(x, y)) return dark;
        if (x >= 12 && x <= 13 && y >= 2 && y <= 3) return rgb('#c7c7c7');
        if ((x >= 3 && x <= 12 && (y === 5 || y === 11)) || ((x === 3 || x === 12) && y >= 5 && y <= 11)) return dark;
        return x % 4 === 1 ? mid : lite;
      });
    }

    // Workstations
    const pk = rgb('#6b4f2c'), pl = (x, y) => read('oak_planks', x, y);
    tile('crafting_top', (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return rgb('#5a3f20');
      if (x === 5 || x === 10 || y === 5 || y === 10) return rgb('#6e5128');
      return shade(pl(x, y), 1.05);
    });
    const toolPix = (name, marks) => tile(name, (x, y) => {
      if (y < 2) return rgb('#5a3f20');
      const m = marks[y - 2] && marks[y - 2][x];
      if (m === '#') return rgb('#cfd2d6');
      if (m === 'o') return rgb('#7d8084');
      if (m === 'w') return rgb('#6e4a22');
      return pl(x, y);
    });
    toolPix('crafting_side', [
      '................', '................', '.##.............', '.##o.....www....', '..#oo....www....', '...ooo...www....', '....ooo..wo.....', '.....oww.w......',
      '......www.......', '.......wwo......', '.......w.oo.....', '......w...oo....', '.....w.....o....', '................']);
    toolPix('crafting_front', [
      '................', '................', '.oooooooooooo...', '.#############..', '.#w.w.w.w.w.w#..', '..www.........w.', '...www..oo.....', '....www.ooo.....',
      '.....www.oo.....', '......www.......', '.......ww.......', '................', '................', '................']);
    const stoneFrame = (x, y) => read('cobblestone', x, y);
    grit('furnace_top', ['#6a6c6e', '#74767a', '#7f8185', '#898b8f'], { cx: 4, fx: 16, grit: .25 });
    tile('furnace_side', (x, y) => (y < 2 || y > 13) ? shade(stoneFrame(x, y), .85) : stoneFrame(x, y));
    const mouth = (name, lit) => {
      const f = wrapNoise(lit ? 5151 : 5, 6);
      tile(name, (x, y) => {
        if (x >= 3 && x <= 12 && y >= 7 && y <= 13) {
          if (x === 3 || x === 12 || y === 7 || y === 13) return rgb('#2b2b2e');
          if (!lit) return (y === 11) ? rgb('#3b3b3f') : rgb('#121214');
          const v = f(x, y) + (y - 7) * .08;
          return pal(['#5b1405', '#b4380b', '#f07b12', '#ffc02c', '#fff0a0'].map(rgb), Math.min(.99, v * .9));
        }
        if (x >= 5 && x <= 10 && y >= 3 && y <= 4) return rgb('#2b2b2e');
        return stoneFrame(x, y);
      });
    };
    mouth('furnace_front', false); mouth('furnace_front_lit', true);
    const chestWood = ['#7d5522', '#8c6029', '#9a6b30', '#a87637'].map(rgb), chestN = wrapNoise(1111, 3, 16);
    const chestBase = (x, y) => (x === 0 || x === 15 || y === 15) ? rgb('#4a3112') : chestWood[Math.floor(chestN(x, y) * 3.9)];
    tile('chest_top', (x, y) => (y === 0) ? rgb('#4a3112') : chestBase(x, y));
    tile('chest_side', (x, y) => (y === 5) ? rgb('#3a250d') : y < 1 ? rgb('#4a3112') : chestBase(x, y));
    tile('chest_front', (x, y) => {
      if (x >= 7 && x <= 8 && y >= 3 && y <= 7) return y === 3 ? rgb('#8b8f94') : rgb('#d8dade');
      return (y === 5) ? rgb('#3a250d') : y < 1 ? rgb('#4a3112') : chestBase(x, y);
    });
    tile('bed_foot', (x, y) => (x === 0 || x === 15) ? rgb('#7b1717') : (y % 5 === 0 ? rgb('#a11e1e') : rgb('#b52626')));
    tile('bed_head', (x, y) => {
      if (x >= 2 && x <= 13 && y >= 3 && y <= 11) return (x === 2 || x === 13 || y === 3 || y === 11) ? rgb('#c7c7c7') : rgb('#ededed');
      return (x === 0 || x === 15) ? rgb('#7b1717') : rgb('#b52626');
    });
    tile('bed_side', (x, y) => y < 6 ? rgb(y === 5 ? '#d0d0d0' : '#b52626') : y < 9 ? rgb('#7b5a2c') : rgb('#5d4320'));
    const torchHead = ['#fff6b0', '#ffd34a', '#ff9c1c'].map(rgb);
    tile('torch', (x, y) => {
      if (x < 7 || x > 8 || y < 6) return null;
      if (y <= 7) return torchHead[y - 6 + (x === 8 ? 1 : 0)];
      return rgb(x === 7 ? '#8a6233' : '#6d4c26');
    });
    tile('lantern', (x, y) => {
      if (y < 2) return rgb('#3c3f45');
      if (x === 0 || x === 15 || y === 15) return rgb('#33363b');
      if (x < 3 || x > 12 || y > 12) return rgb('#4a4e55');
      return pal(['#ffb733', '#ffd566', '#ffeeaa'].map(rgb), ((x + y) % 5) / 5);
    });
    tile('ladder', (x, y) => {
      if ((x >= 2 && x <= 3) || (x >= 12 && x <= 13)) return rgb(x % 2 ? '#5e4522' : '#7c5c30');
      if (y % 4 === 2 && x > 3 && x < 12) return rgb('#8c6a38');
      if (y % 4 === 3 && x > 3 && x < 12) return rgb('#5e4522');
      return null;
    });
    const glint = (x, y) => (x + y === 6 || x + y === 7 || x + y === 19);
    tile('glass', (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [214, 236, 240];
      if (glint(x, y) && x > 1 && x < 14 && y > 1 && y < 14) return [240, 250, 252];
      return null;
    });
    tile('iron_bars', (x, y) => {
      if (x % 5 === 2 || x % 5 === 3) return rgb(x % 5 === 2 ? '#a6a9ad' : '#74777b');
      if (y === 2 || y === 13) return rgb('#8d9094');
      return null;
    });
    const bricky = (name, h, off, colors, mortar) => {
      const list = colors.map(rgb), m = rgb(mortar), n = wrapNoise(seedOf(name), 8), r = rand(seedOf(name) + 1);
      tile(name, (x, y) => {
        const row = Math.floor(y / h), sx = (x + (row % 2 ? off : 0)) % 16;
        if (y % h === h - 1 || sx % (off * 2) === (off * 2) - 1) return m;
        const lit = y % h === 0 ? .1 : 0;
        return list[Math.min(list.length - 1, Math.floor((n(x, y) * .7 + r() * .3 + lit) * list.length))];
      });
    };
    bricky('bricks', 4, 4, ['#7f3d2d', '#8f4635', '#9f513e', '#ae5d48'], '#b4a99b');
    bricky('stone_bricks', 8, 8, ['#6f7173', '#7b7d7f', '#87898b', '#919395'], '#515355');
    {
      const n = wrapNoise(4242, 5);
      over('mossy_stone_bricks', 'stone_bricks', (x, y) => n(x, y) > .58 ? pal(['#4d6b2d', '#5a7a34', '#6b8c3f'].map(rgb), n(x + 4, y + 7)) : null);
      const r = rand(5150), cr = new Set();
      for (let n2 = 0; n2 < 3; n2++) { let x = Math.floor(r() * 16), y = Math.floor(r() * 16); for (let i = 0; i < 8; i++) { cr.add((x & 15) + (y & 15) * 16); x += r() < .5 ? 1 : -1; y += r() < .7 ? 1 : 0; } }
      over('cracked_stone_bricks', 'stone_bricks', (x, y) => cr.has(x + y * 16) ? rgb('#3f4143') : null);
    }
    {
      const r = rand(777), spines = [];
      const col = ['#8e2b2b', '#2b5d8e', '#2f7a43', '#8e7a2b', '#5b2f7a', '#7a4a22', '#303d4a', '#a55e22'].map(rgb);
      for (let i = 0; i < 16; i++) spines[i] = col[Math.floor(r() * col.length)];
      tile('bookshelf', (x, y) => {
        if (y < 1 || y === 7 || y === 8 || y > 14) return pl(x, y);
        const top = y < 7, c = spines[(x + (top ? 0 : 5)) % 16];
        const gap = (x + (top ? 3 : 9)) % 8 === 0;
        if (gap) return rgb('#2a1c0e');
        if (y === (top ? 3 : 11) && x % 2) return shade(c, 1.5);
        return c;
      });
    }
    { // TNT: red paper with a white band and plain block letters.
      const L = { T: ['###', '.#.', '.#.', '.#.', '.#.'], N: ['#.#', '###', '###', '###', '#.#'] };
      const word = 'TNT', r = rand(1212);
      const paper = () => r() < .3 ? rgb('#b8281e') : rgb('#cf3226');
      tile('tnt_side', (x, y) => {
        if (y >= 4 && y <= 11) {
          const lx = x - 2, ly = y - 5;
          if (ly >= 0 && ly < 5 && lx >= 0 && lx < 12) { const i = Math.floor(lx / 4), c = lx % 4; if (c < 3 && L[word[i]][ly][c] === '#') return rgb('#2a2a2a'); }
          return rgb('#eeeeea');
        }
        return x % 4 === 3 ? rgb('#8e1c14') : paper();
      });
      tile('tnt_top', (x, y) => {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        if (d < 2) return rgb('#262626');
        if (d < 4) return rgb('#a8a8a4');
        return (x + y) % 4 === 0 ? rgb('#8e1c14') : paper();
      });
      tile('tnt_bottom', (x, y) => (x % 4 === 3 || y % 4 === 3) ? rgb('#8e1c14') : paper());
    }
    const DYE = { white: '#e9ecec', light_gray: '#9d9d97', gray: '#474f52', black: '#1d1d21', brown: '#835432', red: '#b02e26', orange: '#f07613', yellow: '#fed83d', lime: '#80c71f', green: '#5e7c16', cyan: '#169c9c', light_blue: '#3ab3da', blue: '#3c44aa', purple: '#8932b8', magenta: '#c74ebd', pink: '#f38baa' };
    for (const c of D.COLORS) {
      const base = rgb(DYE[c]), n = wrapNoise(seedOf(c), 8), r = rand(seedOf(c) + 4);
      tile(c + '_wool', (x, y) => shade(base, .84 + n(x, y) * .22 + (r() - .5) * .08 + ((x + y) % 2 ? .02 : -.02)));
      tile(c + '_concrete', (x, y) => shade(base, .92 + n(x, y) * .1));
      tile(c + '_stained_glass', (x, y) => (x === 0 || y === 0 || x === 15 || y === 15) ? [...shade(base, 1.15), 215] : (glint(x, y) ? [...shade(base, 1.3), 175] : [...base, 130]));
      tile(c + '_dye_pix', () => base);
    }
    const clayish = (name, hex) => { const base = rgb(hex), n = wrapNoise(seedOf(name), 8), r = rand(seedOf(name) + 1); tile(name, (x, y) => shade(base, .9 + n(x, y) * .16 + r() * .05)); };
    clayish('terracotta', '#985e43'); clayish('white_terracotta', '#d1b1a1'); clayish('orange_terracotta', '#a15325'); clayish('yellow_terracotta', '#ba8523');
    clayish('red_terracotta', '#8f3d2e'); clayish('brown_terracotta', '#4d3324'); clayish('light_gray_terracotta', '#876b62');
    const plate = (name, colors) => {
      const c = colors.map(rgb), n = wrapNoise(seedOf(name), 4);
      tile(name, (x, y) => {
        if (x === 0 || y === 0) return c[3];
        if (x === 15 || y === 15) return c[0];
        if ((x === 8 && y > 1 && y < 14) || (y === 8 && x > 1 && x < 14)) return c[1];
        return c[1 + Math.min(1, Math.floor(n(x, y) * 2))];
      });
    };
    plate('iron_block', ['#a9abae', '#d1d3d6', '#dfe1e3', '#f4f5f6']); plate('gold_block', ['#c28e14', '#efc42e', '#f7d84c', '#fff2a0']);
    plate('diamond_block', ['#2fa9ac', '#62dfdc', '#86ece7', '#d0fbf6']); plate('emerald_block', ['#108a43', '#25c261', '#49d67f', '#a4f5c2']);
    plate('ruby_block', ['#8c0d28', '#cf1545', '#e43a64', '#ff9db2']); plate('copper_block', ['#8f5230', '#c0703f', '#d28252', '#ecae88']);
    plate('lapis_block', ['#16307a', '#2449a9', '#2f5ac4', '#7d9dee']); plate('coal_block', ['#0d0d0f', '#1b1b1e', '#242428', '#3a3a40']);
    tile('hay_side', (x, y) => (y >= 3 && y <= 4) || (y >= 11 && y <= 12) ? rgb('#7d5a21') : pal(['#a78a26', '#bd9f30', '#d1b33e', '#e0c44f'].map(rgb), ((x * 5 + y) % 7) / 7));
    tile('hay_top', (x, y) => pal(['#a78a26', '#bd9f30', '#d1b33e', '#e0c44f'].map(rgb), ((x * 3 + y * 11) % 9) / 9));

    // Pumpkins and melons
    const rib = (x, a) => a[Math.min(a.length - 1, Math.floor(Math.abs(Math.sin((x + .5) * .78)) * a.length))];
    const pumpC = ['#a95f12', '#c7751b', '#d98624', '#e6962f'].map(rgb);
    tile('pumpkin_side', (x, y) => (y === 0 || y === 15) ? shade(rib(x, pumpC), .8) : rib(x, pumpC));
    tile('pumpkin_top', (x, y) => {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d < 2.2) return rgb('#6a7a2a');
      return shade(pumpC[Math.floor((Math.atan2(y - 7.5, x - 7.5) + 3.15) * 2.6) % 4], .95);
    });
    tile('jack_front', (x, y) => {
      const eye = (cx) => y >= 4 && y <= 7 && Math.abs(x - cx) <= (y - 4) * .75;
      const smile = y >= 10 && y <= 12 && x >= 3 && x <= 12 && !(y === 10 && x % 3 === 0) && !(y === 12 && x % 3 === 1);
      const nose = y === 8 && x >= 7 && x <= 8;
      if (eye(4.5) || eye(10.5) || smile || nose) return pal(['#ffd34a', '#ffb52c', '#ff8f18'].map(rgb), (x * 3 + y * 5) % 3 / 3);
      return rib(x, pumpC);
    });
    tile('melon_side', (x, y) => ((x + (y >> 2)) % 5 < 2 ? rgb('#8bb53b') : rgb('#5f8d24')));
    tile('melon_top', (x, y) => { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); return Math.floor(d) % 3 === 0 ? rgb('#8bb53b') : rgb('#5f8d24'); });
    tile('cactus_side', (x, y) => {
      if (x < 1 || x > 14) return null;
      if ((x * 5 + y * 3) % 23 === 0) return rgb('#d8d8a0');
      return x % 4 === 2 ? rgb('#2e6b1f') : x % 4 === 0 ? rgb('#4d9633') : rgb('#3f8429');
    });
    tile('cactus_top', (x, y) => { if (x < 1 || x > 14 || y < 1 || y > 14) return null; const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); return d < 3 ? rgb('#6fbc4c') : d < 5.5 ? rgb('#4d9633') : rgb('#3f8429'); });

    // Plants painted as simple blades, stems and blossoms.
    const blades = (name, n, colors, o = {}) => {
      const r = rand(seedOf(name)), m = new Map(), list = colors;
      for (let i = 0; i < n; i++) {
        let x = 1 + r() * 14, tall = (o.min || 4) + Math.floor(r() * (o.max || 9)), lean = (r() - .5) * .35;
        for (let k = 0; k < tall; k++) { const y = 15 - k; const c = list[Math.min(list.length - 1, Math.floor(k / tall * list.length))]; m.set(Math.round(x) + y * 16, c); x += lean; }
      }
      tile(name, (x, y) => m.get(x + y * 16) || null);
    };
    const gray = (v) => [v, v, v, TINT];
    blades('short_grass', 11, [gray(150), gray(180), gray(205), gray(230)], { min: 4, max: 8 });
    blades('fern', 9, [gray(130), gray(160), gray(190), gray(215)], { min: 5, max: 7 });
    blades('dead_bush', 7, [rgb('#6b4b24'), rgb('#7d5a2d'), rgb('#916b3a')], { min: 3, max: 7 });
    tile('sugar_cane', (x, y) => {
      for (const c of [3, 8, 12]) if (x === c || x === c + 1) return y % 5 === (c % 3) ? gray(120) : gray(x === c ? 210 : 175);
      return null;
    });
    blades('seagrass', 8, [rgb('#1f6a2e'), rgb('#2a8a3b'), rgb('#37a24a')], { min: 6, max: 8 });
    tile('kelp', (x, y) => {
      const c = 7 + Math.round(Math.sin(y * .8) * 1.5);
      if (x === c || x === c + 1) return rgb('#2e7d3e');
      if ((x === c - 1 || x === c + 2) && y % 4 === 1) return rgb('#3e9a4f');
      if ((x === c - 2 || x === c + 3) && y % 4 === 2) return rgb('#4bad5c');
      return null;
    });
    const stem = (x, y, s = 7) => (x === s && y >= 7) ? rgb('#3f8a2c') : (y === 11 && x === s + 1) || (y === 12 && x === s - 1) ? rgb('#55a53b') : null;
    const bloom = (name, pts, colors) => {
      const list = colors.map(rgb);
      tile(name, (x, y) => {
        for (let i = 0; i < pts.length; i++) if (pts[i].includes(x + ',' + y)) return list[i];
        return stem(x, y);
      });
    };
    const ringPts = (cx, cy, r) => { const o = []; for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (Math.abs(dx) + Math.abs(dy) <= r && (dx || dy)) o.push((cx + dx) + ',' + (cy + dy)); return o; };
    bloom('dandelion', [[`7,5`], ringPts(7, 5, 2)], ['#f2a51a', '#ffe13a']);
    bloom('poppy', [[`7,4`], ringPts(7, 4, 2), ringPts(7, 5, 3).slice(0, 4)], ['#2a1a0a', '#d41f1f', '#a51414']);
    bloom('blue_orchid', [ringPts(5, 4, 1), ringPts(9, 6, 1), [`7,6`]], ['#2fb8e8', '#59d0f2', '#ffe24d']);
    bloom('allium', [ringPts(7, 4, 3), [`7,4`]], ['#b165d8', '#e0a8f5']);
    bloom('azure_bluet', [ringPts(5, 7, 1), ringPts(10, 6, 1), ringPts(7, 3, 1), [`5,7`, `10,6`, `7,3`]], ['#e8eef0', '#ffffff', '#f4f7f8', '#e8cf3a']);
    bloom('red_tulip', [ringPts(7, 5, 1), [`6,3`, `7,3`, `8,3`, `6,4`, `8,4`]], ['#d62a2a', '#ef4b42']);
    bloom('orange_tulip', [ringPts(7, 5, 1), [`6,3`, `7,3`, `8,3`, `6,4`, `8,4`]], ['#e8782a', '#f8a048']);
    bloom('oxeye_daisy', [[`7,5`], ringPts(7, 5, 2)], ['#ecc531', '#f7f7f2']);
    bloom('cornflower', [[`7,5`], ringPts(7, 5, 2), ringPts(7, 5, 3).filter((_, i) => i % 3 === 0)], ['#1b3d9c', '#3a68d8', '#6e94ee']);
    const mushroom = (name, top, spots) => tile(name, (x, y) => {
      if (x >= 7 && x <= 8 && y >= 9) return rgb('#d9cfbb');
      const dx = x - 7.5, dy = y - 8;
      if (y <= 8 && dx * dx / 21 + dy * dy / 16 < 1) return spots && (x + y * 2) % 5 === 0 ? rgb(spots) : rgb(top);
      return null;
    });
    mushroom('brown_mushroom', '#8d6a4a'); mushroom('red_mushroom', '#c8241f', '#f2efe8');
    const capBlock = (name, base, spot) => { const n = wrapNoise(seedOf(name), 6); tile(name, (x, y) => n(x, y) > .68 && spot ? rgb(spot) : shade(rgb(base), .9 + n(x + 2, y) * .2)); };
    capBlock('red_mushroom_block', '#c8241f', '#f2efe8'); capBlock('brown_mushroom_block', '#8d6a4a'); capBlock('mushroom_stem', '#d9cfbb');
    tile('lily_pad', (x, y) => {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 7.6 || (y > 7 && Math.abs(x - 7.5) < 1 && d > 1)) return null;
      return [...((x + y) % 3 ? [190, 190, 190] : [150, 150, 150]), TINT];
    });
    {
      const r = rand(909), m = new Set();
      for (let n = 0; n < 7; n++) { let x = Math.floor(r() * 16), y = 0; const l = 6 + Math.floor(r() * 10); for (let i = 0; i < l; i++) { m.add(x + y * 16); y++; if (r() < .35) x = (x + (r() < .5 ? 1 : 15)) % 16; if (r() < .25) m.add(((x + 1) % 16) + y * 16); } }
      tile('vine', (x, y) => m.has(x + y * 16) ? [...((x * 3 + y) % 3 ? [170, 170, 170] : [130, 130, 130]), TINT] : null);
    }
    tile('cobweb', (x, y) => {
      if (x === y || x + y === 15 || x === 7 || y === 7 || Math.abs(Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) - 5) < .6) return [225, 228, 232, 220];
      return null;
    });
    tile('spawner', (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15 || (x === 5 || x === 10) || (y === 5 || y === 10)) return rgb((x + y) % 2 ? '#1b2331' : '#2a3648');
      return null;
    });
    const crop = (name, frames, f) => { for (let i = 0; i < frames; i++) tile(name + '_' + i, (x, y) => f(i, x, y)); };
    crop('wheat', 8, (s, x, y) => {
      const h = 3 + s * 1.6, rows = [2, 6, 9, 13];
      if (!rows.includes(x) && !rows.includes(x - 1)) return null;
      if (y < 16 - h) return null;
      const ripe = s / 7;
      if (s >= 6 && y < 16 - h + 4) return mixc(rgb('#8aa335'), rgb('#d9b83f'), ripe);
      return mixc(rgb('#2f8a22'), rgb('#94a32f'), ripe * .8);
    });
    const root = (name, top, tip) => crop(name, 4, (s, x, y) => {
      const rows = [3, 8, 12], h = 3 + s * 2.4;
      if (y < 16 - h) return null;
      if (!rows.some(c => Math.abs(x - c) <= (y < 13 ? 1 : 0))) return null;
      if (s === 3 && y < 9 && rows.includes(x)) return rgb(tip);
      return rgb((x + y) % 2 ? top : '#2f8a22');
    });
    root('carrots', '#3fa02f', '#f08e28'); root('potatoes', '#46a236', '#d8bb72');
    grit('farmland', ['#4a3320', '#553b26', '#5f432b', '#6a4b31'], { cx: 4, cy: 8, fx: 16, grit: .3 });
    over('farmland', 'farmland', (x, y) => y % 4 === 1 ? rgb('#3a2818') : null);
    tile('farmland_wet', (x, y) => shade(read('farmland', x, y), .66));

    // Particle sprites
    tile('p_smoke', (x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); return d < 6.5 ? [255, 255, 255, Math.max(0, 255 - d * 26)] : null; });
    tile('p_flame', (x, y) => { const d = Math.hypot(x - 7.5, (y - 9) * .8); return d < 6 ? pal(['#fff3a0', '#ffc73a', '#ff8a1c', '#c93a10'].map(rgb), d / 6) : null; });
    tile('p_spark', (x, y) => (Math.abs(x - 7.5) < 1 && Math.abs(y - 7.5) < 5) || (Math.abs(y - 7.5) < 1 && Math.abs(x - 7.5) < 5) ? [255, 255, 255] : null);
    tile('p_heart', (x, y) => {
      const rows = ['..##...##..', '.####.####.', '###########', '###########', '.#########.', '..#######..', '...#####...', '....###....', '.....#.....'];
      const r = rows[y - 3];
      return r && r[x - 2] === '#' ? rgb('#e8344a') : null;
    });
    tile('p_bubble', (x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); return d < 5 && d > 3.6 ? [200, 230, 255, 230] : d <= 3.6 ? [160, 210, 255, 60] : (null); });
    tile('p_drop', (x, y) => { const d = Math.hypot(x - 7.5, (y - 9) * .9); return d < 3.5 || (Math.abs(x - 7.5) < 1 && y >= 3 && y < 8) ? [160, 200, 255, 230] : null; });
    tile('p_orb', (x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); return d < 5.5 ? (d < 2.5 ? [240, 255, 170] : [130, 220, 60]) : null; });
    tile('p_snow', (x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); return d < 3 ? [255, 255, 255] : null; });
    // Cracks that spread as a block is mined.
    {
      const r = rand(62222), walks = [];
      for (let i = 0; i < 26; i++) {
        let x = 8 + (r() - .5) * 2, y = 8 + (r() - .5) * 2; const a = r() * 6.283, path = [];
        for (let k = 0; k < 14; k++) { path.push([Math.round(x), Math.round(y)]); x += Math.cos(a + (r() - .5) * 1.4); y += Math.sin(a + (r() - .5) * 1.4); }
        walks.push(path);
      }
      for (let s = 0; s < 10; s++) {
        const m = new Set(), n = 2 + s * 2.6, l = 2 + s * 1.3;
        for (let i = 0; i < n; i++) for (let k = 0; k < l && k < 14; k++) { const [a, c] = walks[i][k]; if (a >= 0 && a < 16 && c >= 0 && c < 16) m.add(a + c * 16); }
        tile('destroy_' + s, (x, y) => m.has(x + y * 16) ? [0, 0, 0, 190] : null);
      }
    }
  }

  // Tiles that animate take a strip of 8 rows in the atlas; the vertex shader steps through them.
  const STRIPS = {
    water: (x, y, t) => {
      const a = Math.sin((x / 16 + t) * 6.283) + Math.sin((y / 16 + x / 16 + t) * 6.283) + Math.sin((y / 16 * 2 - t) * 6.283) * .6;
      const v = 200 + a * 16;
      return [v, v, v, 178];
    },
    lava: (x, y, t) => {
      const a = Math.sin((x / 16 * 2 + t) * 6.283) * Math.sin((y / 16 + t) * 6.283) + Math.sin((y / 16 * 2 + x / 16 - t) * 6.283) * .5;
      return pal(['#c8340a', '#e4530d', '#f77e12', '#fcae1d', '#ffdc58'].map(rgb), Math.min(.99, Math.max(0, a * .32 + .45)));
    },
    fire: (x, y, t) => {
      const w = Math.sin((x / 16 * 2 + t * 2) * 6.283) * 1.5 + Math.sin((x / 16 * 5 - t) * 6.283) * 1.2;
      const h = 5 + w + Math.abs(Math.sin((x / 16 + t) * 3.14)) * 3;
      if (y < h) return null;
      return pal(['#fff3a0', '#ffd03a', '#ff9a1c', '#e8500f'].map(rgb), Math.min(.99, (16 - y) / 12));
    },
  };

  let atlas = null, index = null;
  function build() {
    if (atlas) return atlas;
    buildBlocks();
    index = new Map();
    let cell = 0;
    const W = COLS * S, data = new Uint8ClampedArray(W * W * 4);
    const put = (arr, c) => {
      const tx = (c % COLS) * S, ty = Math.floor(c / COLS) * S;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) for (let k = 0; k < 4; k++) data[(tx + x + (ty + y) * W) * 4 + k] = arr[(x + y * S) * 4 + k];
    };
    // Animated strips first so their eight frames line up vertically.
    let col = 0;
    for (const name in STRIPS) {
      index.set(name, col);
      for (let f = 0; f < 8; f++) {
        const a = new Uint8ClampedArray(S * S * 4);
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          const c = STRIPS[name](x, y, f / 8), i = (x + y * S) * 4;
          if (!c) continue;
          a[i] = c[0]; a[i + 1] = c[1]; a[i + 2] = c[2]; a[i + 3] = c[3] === undefined ? 255 : c[3];
        }
        if (!f) tiles.set(name, a);
        put(a, col + f * COLS);
      }
      col++;
    }
    cell = col;
    const skip = c => (c % COLS) < col && Math.floor(c / COLS) < 8;
    for (const [name, arr] of tiles) {
      if (STRIPS[name]) continue;
      while (skip(cell)) cell++;
      index.set(name, cell);
      put(arr, cell++);
    }
    if (cell > COLS * COLS) throw new Error('Atlas is full');
    // Hand-built mip levels average inside each tile so colours never bleed between neighbours.
    const mips = [{ data: new Uint8Array(data.buffer), width: W, height: W }];
    let size = S, prev = data, pw = W;
    while (pw > 1) {
      const nw = pw >> 1, next = new Uint8Array(nw * nw * 4);
      for (let y = 0; y < nw; y++) for (let x = 0; x < nw; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const i = (x * 2 + dx + (y * 2 + dy) * pw) * 4, al = prev[i + 3];
          r += prev[i] * al; g += prev[i + 1] * al; b += prev[i + 2] * al; a += al;
        }
        const i = (x + y * nw) * 4;
        if (a) { next[i] = r / a; next[i + 1] = g / a; next[i + 2] = b / a; }
        next[i + 3] = a / 4;
      }
      mips.push({ data: next, width: nw, height: nw });
      prev = next; pw = nw; size >>= 1;
    }
    atlas = { mips, W, COLS, S, index };
    return atlas;
  }
  const tileIndex = name => { if (!index) build(); const v = index.get(name); if (v === undefined) throw new Error('Missing tile ' + name); return v; };
  const has = name => { if (!index) build(); return index.has(name); };

  // ---------- Item sprites ----------
  const SPR = {};
  const sprite = (k, rows, colors) => { SPR[k] = { rows: rows.split('/'), colors }; };
  // Material ramps: dark, mid, light.
  const RAMP = {
    wooden: ['#5e4422', '#8a6a38', '#b08c52'], stone: ['#5a5c5e', '#808284', '#a4a6a8'], iron: ['#8a8d90', '#c9ccd0', '#f0f2f4'],
    golden: ['#b5820f', '#eebf2a', '#fff09a'], diamond: ['#1f9fa3', '#4fe0d8', '#c6fbf4'], leather: ['#5e3a1c', '#865a30', '#a97b4a'],
  };
  const STICK = { s: '#4f3a1c', t: '#8a6a38' };
  const tools = {
    sword: '.............DMM/............DMLM/...........DMLD./..........DMLD../.........DMLD.../........DMLD..../.......DMLD...../..D...DMLD....../..DD.DMLD......./...DDMLD......../...sDLD........./..stDDD........./.st...DD......./st............../t.............../................',
    pickaxe: '................/....DMMMMMMD..../..DMLLLLLLLLMD../.DLLDDDDDDtDLLD./.DMD.......tsDLD/.DD........stDMD/...........st.DD/..........st...D/.........st...../........st....../.......st......./......st......../.....st........./....st........../...st.........../..st............',
    axe: '................/.......DDD....../.....DDMLLD...../....DMLLLLMD..../...DMLLLLLMD..../...DLLLLLtsMD.../...DMLLLstDMD.../....DDDstDDD..../.......st......./......st......../.....st........./....st........../...st.........../..st............/.st............./................',
    shovel: '............DD../...........DMLD./..........DMLLMD/..........DLLLMD/..........DLLMD./.........stMDD../........st.DD.../.......st......./......st......../.....st........./....st........../...st.........../..st............/.st............./................/................',
    hoe: '................/.......DDDDD..../.....DDMLLMMD.../....DMLLMDDsMD../....DMDD..stDD../.....D....st.D../.........st...../........st....../.......st......./......st......../.....st........./....st........../...st.........../..st............/.st............./................',
  };
  for (const t in D.TIERS) for (const k in tools) {
    const [d, m, l] = RAMP[t];
    sprite(t + '_' + k, tools[k], { D: d, M: m, L: l, ...STICK });
  }
  const armor = {
    helmet: '................/................/....DDDDDDDD..../...DMMMMMMMMD.../..DMLLLLLLLLMD../..DMLMMMMMMLMD../..DMM......MMD../..DMM......MMD../..DM........MD../...D........D.../................/................/................/................/................/................',
    chestplate: '................/...DD......DD.../..DLMD....DMLD../.DLLMDDDDDDMLLD./.DLMMMMMMMMMMLD./.DDDMLLLLLLMDDD./...DMLLLLLLMD.../...DMLLLLLLMD.../...DMLLLLLLMD.../...DMLLLLLLMD.../...DMMMMMMMMD.../...DMMMMMMMMD.../...DDDDDDDDDD.../................/................/................',
    leggings: '................/...DDDDDDDDDD.../...DMLLLLLLMD.../...DMMMMMMMMD.../...DMLLDDLLMD.../...DML.DD.LMD.../...DML....LMD.../...DML....LMD.../...DML....LMD.../...DML....LMD.../...DML....LMD.../...DMM....MMD.../...DMM....MMD.../...DDD....DDD.../................/................',
    boots: '................/................/................/................/................/...DDD....DDD.../...DLM....MLD.../...DLM....MLD.../...DLM....MLD.../..DLLM....MLLD../.DLLLM....MLLLD/.DMMMM....MMMMD/.DDDDD....DDDDD/................/................/................',
  };
  for (const t in D.ARMOR) for (const k in armor) {
    const [d, m, l] = RAMP[t];
    sprite(t + '_' + k, armor[k], { D: d, M: m, L: l });
  }
  const ingot = '................/................/................/.....DDDDDDDD.../....DLLLLLLLMD../...DLLMMMMMMMMD./..DLLMMMMMMMMMD./..DMMMMMMMMMMD../..DDDDDDDDDDD.../................/................/................/................/................/................/................';
  const nugget = '................/................/................/................/.....DD........./....DLLMD......./....DLMMDDD...../.....DDMLLMD..../......DLMMMD..../.......DDDD...../................/................/................/................/................/................';
  const lump = '................/................/......DDDD....../....DDMLLMDD..../...DMLLMMMMMD.../...DLLMMMMMMD.../..DMLMMDMMMMMD../..DMMMMMMMMDMD../..DMMDMMMMMMMD../...DMMMMMMMMD.../....DDMMMMDD..../......DDDD....../................/................/................/................';
  const gem = '................/................/.....DDDDDD...../....DLLLLLLD..../...DLLMMMMLLD.../..DLLMMMMMMLLD../..DMMMMMMMMMMD../...DMMMMMMMMD.../....DMMMMMMD..../.....DMMMMD...../......DMMD....../.......DD......./................/................/................/................';
  const powder = '................/................/................/................/.......D......../......DMD......./.....DMLMD....../....DMLMLMD...../...DMLMMMLMD..../..DMMLMMMMLMD.../..DDDDDDDDDDD.../................/................/................/................/................';
  const meat = '................/................/.......DDDD...../.....DDMMMMD..../....DMMLLLMMD.../...DMMLLLLLMD.../..DMMLLLLLLMD.../..DMLLLLLLMMD.../..DMMLLLLMMD..../...DMMMMMMDD..../....DDMMDDsWW.../......DD..sWWW../............sW../................/................/................';
  const drum = '................/................/.....DDDDD....../....DMMMMMD...../...DMLLLMMMD..../...DMLLLLMMD..../...DMMLLMMMD..../....DMMMMMD...../.....DMMDD....../......DDsW....../.........sWW..../..........sWW.../...........W.../................/................/................';
  const food = {
    apple: ['................/.......sS......./.......Ss......./.....DDsDDD...../....DLMMMMMMD.../...DLLMMMMMMMD../...DLMMMMMMMMD../...DMMMMMMMMMD../...DMMMMMMMMMD../...DMMMMMMMMMD../....DMMMMMMMD.../....DMMMDMMMD.../.....DDD.DDD..../................/................/................', { D: '#7c1414', M: '#d42424', L: '#ff8a7a', s: '#5e4422', S: '#4f9a30' }],
    golden_apple: ['................/.......sS......./.......Ss......./.....DDsDDD...../....DLMMMMMMD.../...DLLMMMMMMMD../...DLMMMMMMMMD../...DMMMMMMMMMD../...DMMMMMMMMMD../...DMMMMMMMMMD../....DMMMMMMMD.../....DMMMDMMMD.../.....DDD.DDD..../................/................/................', { D: '#a87b10', M: '#f2c62e', L: '#fff5ae', s: '#5e4422', S: '#e8e29a' }],
    bread: ['................/................/................/................/.....DDDDDD...../...DDMLLLLLMDD../..DMLLDLLDLLLMD./.DMLLLDLLDLLLMD./.DMMLLLLLLLLMMD./.DMMMMMMMMMMMMD./..DDMMMMMMMMDD../....DDDDDDDD..../................/................/................/................', { D: '#6e4413', M: '#b3792a', L: '#dca64f' }],
    cookie: ['................/................/................/.....DDDDDD...../....DMMMMMMD..../...DMsMMMMsMD.../...DMMMMsMMMD.../...DMMMMMMMMD.../...DMsMMMMMsD.../...DMMMsMMMMD.../....DMMMMMMD..../.....DDDDDD...../................/................/................/................', { D: '#6e4413', M: '#c58a3e', s: '#3c2410' }],
    pumpkin_pie: ['................/................/................/.....DDDDDD...../...DDLLLLLLDD.../..DLLMMMMMMLLD../..DLMMMMMMMMLD../.DLMMMMMMMMMMLD./.DLLLLLLLLLLLLD./.DSSSSSSSSSSSSD./..DSSSSSSSSSSD../...DDDDDDDDDD.../................/................/................/................', { D: '#6e4413', L: '#c58a3e', M: '#d0781f', S: '#b5782f' }],
    melon_slice: ['................/................/................/................/..D..........D../..DG........GD../..DGRRRRRRRRGD../...DGRsRRsRGD.../...DGRRRRRRGD.../....DGRsRRGD..../.....DGRRGD...../......DGGD....../.......DD......./................/................/................', { D: '#2f5d17', G: '#7fb23a', R: '#de3a3a', s: '#1a1a1a' }],
    carrot: ['................/...........ss.../..........sS.s../.........DDSs.../........DMLMD.../.......DMLMD..../......DMLMMD..../.....DMMMMD...../.....DMLMD....../....DMMMD......./...DMLMD......../...DMMD........./..DMD.........../..DD............/................/................', { D: '#a4530f', M: '#ed8a24', L: '#ffb868', s: '#3f8a2c', S: '#64b342' }],
    potato: ['................/................/................/.....DDDDD....../....DMMLLMD...../...DMMLLMMMD..../...DMMMMMsMMD.../...DMsMMMMMMD.../...DMMMMMMMMD.../....DMMMMsMMD.../.....DMMMMMD..../......DDDDD...../................/................/................/................', { D: '#7c5a23', M: '#c9a24e', L: '#e6c97d', s: '#8b6a2d' }],
    baked_potato: ['................/................/................/.....DDDDD....../....DMMLLMD...../...DMMLLMMMD..../...DMMMLLMMMD.../...DMMLLLLMMD.../...DMMMMMMMMD.../....DMMMMMMMD.../.....DMMMMMD..../......DDDDD...../................/................/................/................', { D: '#5a3a14', M: '#a06c2a', L: '#f4dc96' }],
    beef: [meat, { D: '#7a1a1f', M: '#c23a40', L: '#e87a78', s: '#d8d0b8', W: '#efe8d6' }],
    cooked_beef: [meat, { D: '#3f210f', M: '#7c4a22', L: '#a4703c', s: '#d8d0b8', W: '#efe8d6' }],
    porkchop: [meat, { D: '#a44a57', M: '#e88a92', L: '#f7bcbd', s: '#d8d0b8', W: '#efe8d6' }],
    cooked_porkchop: [meat, { D: '#7a4a1e', M: '#c2905a', L: '#e5c594', s: '#d8d0b8', W: '#efe8d6' }],
    mutton: [meat, { D: '#7a1f1f', M: '#b84a3a', L: '#e8a092', s: '#d8d0b8', W: '#efe8d6' }],
    cooked_mutton: [meat, { D: '#4f2a13', M: '#8e5a2c', L: '#bc8850', s: '#d8d0b8', W: '#efe8d6' }],
    chicken: [drum, { D: '#b58a80', M: '#f0c9bb', L: '#ffe6dc', s: '#d8d0b8', W: '#efe8d6' }],
    cooked_chicken: [drum, { D: '#6e4413', M: '#c58a3e', L: '#e6b873', s: '#d8d0b8', W: '#efe8d6' }],
    rotten_flesh: ['................/................/......DDDD....../....DDMMGMDD..../...DMMGGMMMMD.../...DMGMMMMGMD.../..DMMMMGGMMMMD../..DMGMMMMMMGMD../...DMMMGMMMD..../....DDMMMMDD..../......DMDD....../......DD......../................/................/................/................', { D: '#4e2e18', M: '#8a5a33', G: '#5d7d3a' }],
    mushroom_stew: ['................/................/................/.....RRTTR....../...RRTTRRRTT.../..DRRRTTRRRRRD../..DMRRRRRRRRMD../..DLMMMMMMMMMD../...DLMMMMMMMD.../...DLMMMMMMMD.../....DLMMMMMD..../.....DDDDDD...../................/................/................/................', { D: '#3a2a12', M: '#7d5a2a', L: '#a9823f', R: '#8a5a3a', T: '#c8a06c' }],
    milk_bucket: ['................/................/...DDDDDDDDDD.../..DMWWWWWWWWMD../..DMLWWWWWWLMD../..DMLLLLLLLLMD../...DMLLLLLLMD.../...DMLLLLLLMD.../...DMLLLLLLMD.../....DMLLLLMD..../....DMMMMMMD..../.....DDDDDD...../................/................/................/................', { D: '#5f6163', M: '#8f9194', L: '#c6c8cb', W: '#f8f8f4' }],
  };
  for (const k in food) sprite(k, food[k][0], food[k][1]);
  const bucket = '................/................/...DDDDDDDDDD.../..DMFFFFFFFFMD../..DMLFFFFFFLMD../..DMLLLLLLLLMD../...DMLLLLLLMD.../...DMLLLLLLMD.../...DMLLLLLLMD.../....DMLLLLMD..../....DMMMMMMD..../.....DDDDDD...../................/................/................/................';
  sprite('bucket', bucket, { D: '#5f6163', M: '#8f9194', L: '#c6c8cb', F: '#37393c' });
  sprite('water_bucket', bucket, { D: '#5f6163', M: '#8f9194', L: '#c6c8cb', F: '#3a78d8' });
  sprite('lava_bucket', bucket, { D: '#5f6163', M: '#8f9194', L: '#c6c8cb', F: '#f07a12' });
  sprite('stick', '................/................/.............TT./............TSD./...........TSD../..........TSD.../.........TSD..../........TSD...../.......TSD....../......TSD......./.....TSD......../....TSD........./...TSD........../...SD.........../................/................', { T: '#b08c52', S: '#8a6a38', D: '#4f3a1c' });
  for (const [k, c] of [['coal', ['#0f0f12', '#26262b', '#46464d']], ['charcoal', ['#1a130c', '#3a2d20', '#5c4a38']]]) sprite(k, lump, { D: c[0], M: c[1], L: c[2] });
  for (const [k, c] of [['raw_iron', ['#6e5137', '#b08a64', '#dcbd9c']], ['raw_copper', ['#6e3b1e', '#b8693a', '#e29a6b']], ['raw_gold', ['#8a6410', '#dcab20', '#fbe27a']], ['clay_ball', ['#6e7482', '#a5acb9', '#d0d5de']], ['flint', ['#1c1c1f', '#3c3c42', '#6c6c74']], ['snowball', ['#b9c8d2', '#eef4f7', '#ffffff']], ['egg', ['#b39a78', '#e9dcc0', '#fff8e8']]]) sprite(k, lump, { D: c[0], M: c[1], L: c[2] });
  for (const [k, c] of [['iron_ingot', ['#73767a', '#c8cbcf', '#f4f5f6']], ['copper_ingot', ['#8a4a26', '#cc7a48', '#f0ad85']], ['gold_ingot', ['#a87b10', '#efc42e', '#fff4b0']], ['brick', ['#5e2a1c', '#a0533e', '#c67a60']]]) sprite(k, ingot, { D: c[0], M: c[1], L: c[2] });
  sprite('iron_nugget', nugget, { D: '#73767a', M: '#c8cbcf', L: '#f4f5f6' });
  for (const [k, c] of [['diamond', ['#177f85', '#4fe0d8', '#d0fcf6']], ['emerald', ['#0d6e36', '#25c261', '#a8f7c6']], ['ruby', ['#7c0c26', '#d8174a', '#ff9db2']], ['lapis', ['#132a6e', '#2a57c7', '#7fa0f2']]]) sprite(k, gem, { D: c[0], M: c[1], L: c[2] });
  for (const [k, c] of [['gunpowder', ['#2b2b2e', '#55555a', '#808086']], ['bone_meal', ['#a8a8a0', '#e4e4dc', '#ffffff']], ['sugar', ['#b8b8b8', '#ededed', '#ffffff']]]) sprite(k, powder, { D: c[0], M: c[1], L: c[2] });
  sprite('string', '................/............DL../...........DL.../..........DL..../.........DL...../.....DLLDL....../....DL.LL......./....DL..DL....../.....LLLDL....../........DL....../.......DL......./......DL......../.....DL........./....DL........../................/................', { D: '#b8b8b8', L: '#f0f0f0' });
  sprite('feather', '................/...........LLL../..........LLWW../.........LLWWW../........LLWWWL../.......LLWWWL.../......LLWWWL..../.....LLWWWL...../....LWWWWL....../....LWWWL......./....LWWL......../...SSLL........./..SS............/.SS............./................/................', { L: '#c9c9c9', W: '#f8f8f8', S: '#9a9a9a' });
  sprite('leather', '................/................/...D.DDDDDD.D.../..DMDMMMMMMDMD../..DMMMLLLLMMMD../...DMLLLLLLMD.../...DMLLLLLLMD.../...DMLLLLLLMD.../...DMLLLLLLMD.../...DMMLLLLMMD.../..DMMDMMMMDMMD../...D..DDDD..D.../................/................/................/................', { D: '#5e3a1c', M: '#8e5f33', L: '#b07e4d' });
  sprite('bone', '................/............DD../...........DWWD./...........DWWD./..........DWWD../.........DWWD.../........DWWD..../.......DWWD...../......DWWD....../.....DWWD......./....DWWD......../.DDDWWD........./.DWWWD........../.DWWD.........../..DD............/................', { D: '#a8a8a0', W: '#f2f2ea' });
  sprite('paper', '................/................/...DDDDDDDDD..../...DWWWWWWWD..../...DWLLLLLWD..../...DWWWWWWWD..../...DWLLLLLWD..../...DWWWWWWWD..../...DWLLLLLWD..../...DWWWWWWWD..../...DDDDDDDDD..../................/................/................/................/................', { D: '#b8b8ac', W: '#f4f4ea', L: '#d2d2c8' });
  sprite('book', '................/................/...DDDDDDDDD..../...DMMMMMMMMD.../...DMLLLLLLMD.../...DMMMMMMMMD.../...DMLLLLMMMD.../...DMMMMMMMMD.../...DMMMMMMMMD.../...DMMMMMMMMD.../...DWWWWWWWWD.../...DDDDDDDDDD.../................/................/................/................', { D: '#3c2410', M: '#7a4a22', L: '#c8a06c', W: '#eeeee2' });
  sprite('wheat_item', '................/...........Y.Y../.........Y.YYY../..........YYY.../........Y.YYY.Y./.......YYYYY..../........YYYY.Y../......Y.YY.YY.../.....YYYYY....../......SYY......./.....SS........./....SS........../...SS.........../..SS............/.SS............./................', { Y: '#d9b83f', S: '#a48a2c' });
  sprite('wheat_seeds', '................/................/................/.....S...S....../....SG........./...........S..../.......S....SG../......SG......../..S............./.SG......S....../........SG....../....S.........../...SG........../................/................/................', { S: '#7fb23a', G: '#3f8a2c' });
  sprite('bowl', '................/................/................/................/................/..DDDDDDDDDDDD../..DLLLLLLLLLLD../..DMMMMMMMMMMD../...DMMMMMMMMD.../...DMMMMMMMMD.../....DMMMMMMD..../.....DDDDDD...../................/................/................/................', { D: '#4a3112', M: '#8a6a38', L: '#b08c52' });
  sprite('arrow', '............SS../...........SWW../..........SWW.S./.........DSS.WS./........Dt..../.......Dt......./......Dt......../.....Dt........./....Dt........../...Dt.........../..WW............/.WWW............/WW.............../................/................/................', { S: '#55555a', W: '#e8e8e8', D: '#4f3a1c', t: '#8a6a38' });
  sprite('bow', '................/......DDDD....../....DDMMMS....../...DMMDD..S...../..DMD.....S...../..DD......S...../.DMD.......S..../.DM........S..../.DM........S..../.DMD.......S..../..DD......S...../..DMD.....S...../...DMMDD..S...../....DDMMMS....../......DDDD....../................', { D: '#4f3a1c', M: '#8a6a38', S: '#e8e8e8' });
  sprite('shears', '................/.......DD......./......DLD......./......DLD...DD../......DLD..DLD../......DLD.DLD.../......DLDDLD..../.......DLLD...../........DD....../.......RDDR...../......RR..RR..../.....RR....RR.../.....RR....RR.../......RRRRRR..../................/................', { D: '#73767a', L: '#d8dade', R: '#b52626' });
  sprite('flint_and_steel', '................/................/...MMMM........./..MMMMMM......../..MM..MM......../..MM............/..MM............/..MMMMMM..FFF.../...MMMM..FFFFF../........FFFFFF./........FFFFF.../.........FFFF.../..........FF..../................/................/................', { M: '#a6a9ad', F: '#3c3c42' });
  sprite('clock', '................/.....DDDDDD...../....DLLLLLLD..../...DLYYYYYYLD.../...DLYYBYYYLD.../...DLYYBYYYLD.../...DLYYBBBYLD.../...DLYYYYYYLD.../...DLYYYYYYLD.../....DLLLLLLD..../.....DDDDDD...../................/................/................/................/................', { D: '#8a6410', L: '#efc42e', Y: '#f8efc8', B: '#2a2a2a' });
  sprite('compass', '................/.....DDDDDD...../....DLLLLLLD..../...DLWWWWRWLD.../...DLWWWRRWLD.../...DLWWRRWWLD.../...DLWBBWWWLD.../...DLWBWWWWLD.../...DLWWWWWWLD.../....DLLLLLLD..../.....DDDDDD...../................/................/................/................/................', { D: '#4f5257', L: '#c8cbcf', W: '#efefef', R: '#d82a2a', B: '#2a4fb8' });
  const dyeBlob = '................/.......SS......./.......SS......./......DDDD....../.....DMMMMD...../....DMLMMMMD..../....DMLMMMMD..../....DMMMMMMD..../....DMMMMMMD..../.....DMMMMD...../......DDDD....../................/................/................/................/................';
  const EGG = { pig: ['#e89aa4', '#b05a6a'], cow: ['#5c4633', '#e8e0d0'], sheep: ['#e8e8e8', '#9a9a9a'], chicken_mob: ['#f4f0e0', '#d8452a'], zombie: ['#6b7d5a', '#3e3227'], skeleton: ['#c8c8c0', '#5a5a58'], spider: ['#2a2020', '#b02020'], blastcap: ['#7a3fb0', '#f08a20'] };
  for (const k in EGG) sprite(k + '_egg', '................/......DDDD....../.....DMMMMD...../....DMSMMMMD..../....DMMMMSMD..../...DMMMMMMMMD.../...DMSMMMMMMD.../...DMMMMMSMMD.../...DMMMMMMMMD.../....DMSMMMMD..../.....DMMMMD...../......DDDD....../................/................/................/................', { D: '#222222', M: EGG[k][0], S: EGG[k][1] });

  // ---------- Icons ----------
  const canvas2 = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const tileCanvas = (name, tint) => {
    const c = canvas2(S, S), g = c.getContext('2d'), d = g.createImageData(S, S), a = tiles.get(name) || tiles.get('stone');
    for (let i = 0; i < a.length; i += 4) {
      const t = a[i + 3] === TINT && tint;
      d.data[i] = t ? a[i] * tint[0] / 255 : a[i]; d.data[i + 1] = t ? a[i + 1] * tint[1] / 255 : a[i + 1]; d.data[i + 2] = t ? a[i + 2] * tint[2] / 255 : a[i + 2];
      d.data[i + 3] = a[i + 3] === TINT ? 255 : a[i + 3];
    }
    g.putImageData(d, 0, 0);
    return c;
  };
  const GRASS = [124, 189, 84], FOLIAGE = [90, 165, 60];
  const tintOf = d => d.tint === 'grass' ? GRASS : d.tint === 'foliage' ? FOLIAGE : null;
  const faceTile = (d, face) => {
    const t = d.tex;
    if (typeof t === 'string') return t;
    if (face === 'front') return t.front || t.side;
    return t[face] || t.side;
  };
  const icons = new Map();
  const spriteCanvas = k => {
    const s = SPR[k];
    if (!s) return null;
    const c = canvas2(S, S), g = c.getContext('2d');
    s.rows.forEach((row, y) => { for (let x = 0; x < S; x++) { const col = s.colors[row[x]]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } } });
    return c;
  };
  // Draws a block as a little isometric model from its real faces. Boxes come from the same shape tables as the world.
  const blockIcon = d => {
    const R = 32, c = canvas2(R, R), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const tint = tintOf(d);
    const face = (name, k, m) => {
      g.save(); g.transform(...m);
      g.drawImage(tileCanvas(name, tint), 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = `rgba(0,0,0,${k})`; g.fillRect(0, 0, S, S);
      g.restore();
    };
    const w = 14 / S, h = 7 / S, v = 15 / S;
    const cube = (x0, y0, z0, x1, y1, z1) => {
      // Project block coordinates to the icon. x runs down-right, z runs down-left.
      const px = (x, y, z) => [16 + (x - z) * 14, 16 + (x + z - 1) * 7 + (.5 - y) * 15 + 2];
      const a = px(x0, y1, z0);
      const side = (x, z) => px(x, y1, z);
      const topM = [(x1 - x0) * w, (x1 - x0) * h, -(z1 - z0) * w, (z1 - z0) * h, a[0], a[1]];
      const l = side(x0, z1), m = side(x1, z1);
      const leftM = [(x1 - x0) * w, (x1 - x0) * h, 0, (y1 - y0) * v, l[0], l[1]];
      const n = side(x1, z1), o = side(x1, z0);
      const rightM = [(o[0] - n[0]) / S, (o[1] - n[1]) / S, 0, (y1 - y0) * v, m[0], m[1]];
      face(faceTile(d, 'top'), 0, topM);
      face(faceTile(d, 'front'), .2, leftM);
      face(faceTile(d, 'side'), .42, rightM);
    };
    const parts = D.shape(d.id, d.shape === 'stairs' ? 1 : 0, 0).vis;
    if (d.shape === 'stairs') { cube(0, 0, 0, 1, .5, 1); cube(0, .5, .5, 1, 1, 1); }
    else if (d.shape === 'fence') { cube(.1, 0, .4, .3, 1, .6); cube(.7, 0, .4, .9, 1, .6); cube(.1, .35, .44, .9, .5, .56); cube(.1, .7, .44, .9, .85, .56); }
    else if (d.shape === 'chest') cube(.06, 0, .06, .94, .88, .94);
    else if (parts.length === 1) cube(...parts[0]);
    else cube(0, 0, 0, 1, 1, 1);
    return c;
  };
  const FLAT = new Set(['cross', 'crop', 'torch', 'ladder', 'vine', 'pane', 'flat', 'lantern', 'door', 'fire']);
  const iconCanvas = id => {
    const it = D.items[id];
    if (!it) return null;
    if (it.block !== undefined) {
      const d = D.blocks[it.block];
      if (d.door) {
        const c = canvas2(S, S), g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        g.drawImage(tileCanvas(d.key.replace('_door', '') + '_door_top'), 3, 0, 10, 16, 3, 0, 5, 8);
        g.drawImage(tileCanvas(d.key.replace('_door', '') + '_door_bottom'), 3, 0, 10, 16, 3, 8, 5, 8);
        return c;
      }
      if (FLAT.has(d.shape) && d.shape !== 'crop') {
        const name = faceTile(d, 'side');
        return tileCanvas(name, tintOf(d) || (d.waterlogged ? null : null));
      }
      return blockIcon(d);
    }
    if (it.key === 'bed_item') {
      const c = canvas2(S, S), g = c.getContext('2d');
      g.fillStyle = '#7b5a2c'; g.fillRect(1, 11, 2, 3); g.fillRect(13, 11, 2, 3);
      g.fillStyle = '#b52626'; g.fillRect(1, 8, 14, 3);
      g.fillStyle = '#ededed'; g.fillRect(1, 6, 5, 2);
      g.fillStyle = '#7b1717'; g.fillRect(1, 10, 14, 1);
      return c;
    }
    if (it.dye) {
      const s = { rows: dyeBlob.split('/'), colors: { S: '#b8b8b8' } };
      const base = '#' + [...tiles.get(it.dye + '_dye_pix').slice(0, 3)].map(v => v.toString(16).padStart(2, '0')).join('');
      const c = canvas2(S, S), g = c.getContext('2d');
      const rgb2 = rgb(base), css = (k) => `rgb(${shade(rgb2, k).map(Math.round).join(',')})`;
      s.rows.forEach((row, y) => { for (let x = 0; x < S; x++) { const ch = row[x]; if (ch === '.') continue; g.fillStyle = ch === 'D' ? css(.55) : ch === 'L' ? css(1.3) : ch === 'S' ? '#d8c8a8' : css(1); g.fillRect(x, y, 1, 1); } });
      return c;
    }
    return spriteCanvas(it.key) || spriteCanvas('stick');
  };
  const iconURL = id => {
    if (icons.has(id)) return icons.get(id);
    if (!atlas) build();
    const c = iconCanvas(id), url = c ? c.toDataURL() : '';
    icons.set(id, url);
    return url;
  };
  const pixelsOf = id => {
    if (!atlas) build();
    const c = iconCanvas(id);
    return c ? { w: c.width, h: c.height, data: c.getContext('2d').getImageData(0, 0, c.width, c.height).data } : null;
  };
  // A dark dirt tile behind list screens, like the game menus use.
  const menuTile = dark => {
    if (!atlas) build();
    const c = canvas2(S, S), g = c.getContext('2d');
    g.drawImage(tileCanvas('dirt'), 0, 0);
    g.fillStyle = `rgba(0,0,0,${dark})`; g.fillRect(0, 0, S, S);
    return c.toDataURL();
  };
  const buttonTile = () => {
    if (!atlas) build();
    const c = canvas2(S * 4, S), g = c.getContext('2d');
    for (let i = 0; i < 4; i++) g.drawImage(tileCanvas('stone'), i * S, 0);
    g.fillStyle = 'rgba(120,120,126,.5)'; g.fillRect(0, 0, S * 4, S);
    return c.toDataURL();
  };
  return { build, tileIndex, has, iconURL, pixelsOf, menuTile, buttonTile, tileCanvas, TINT, rgb, canvas2 };
})();
