// BlockCraft tables: blocks, items, recipes and loot. No DOM here, so the generator worker can load it too.
// Block and item ids are saved inside worlds, so only ever append to these lists.
const CraftData = (() => {
  const blocks = [], B = {};
  const TABS = ['Building Blocks', 'Colored Blocks', 'Natural Blocks', 'Functional Blocks', 'Tools & Utilities', 'Combat', 'Food & Drinks', 'Ingredients', 'Spawn Eggs'];
  const block = (key, name, o = {}) => {
    const d = { id: blocks.length, key, name, shape: 'cube', solid: true, opaque: true, hard: 1, tool: null, level: -1, sound: 'stone', light: 0, tex: key, tab: 0, ...o };
    if (d.op === undefined) d.op = d.opaque ? 15 : 0;
    blocks.push(d); B[key] = d.id;
    return d;
  };
  block('air', 'Air', { shape: 'none', solid: false, opaque: false, hard: 0, replace: true, noItem: true });

  const rock = (key, name, hard = 1.5, o = {}) => block(key, name, { hard, tool: 'pickaxe', level: 0, ...o });
  const plant = (key, name, o = {}) => block(key, name, { shape: 'cross', solid: false, opaque: false, hard: 0, sound: 'grass', cut: true, replace: true, support: 'soil', wave: 1, tab: 2, ...o });
  const pick = (a, b, r) => a + Math.floor(r() * (b - a + 1));

  // Terrain
  rock('stone', 'Stone', 1.5, { drops: 'cobblestone', tab: 2 });
  block('grass_block', 'Grass Block', { hard: .6, tool: 'shovel', sound: 'grass', tex: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, tint: 'grass', drops: 'dirt', tab: 2 });
  block('dirt', 'Dirt', { hard: .5, tool: 'shovel', sound: 'gravel', tab: 2 });
  rock('cobblestone', 'Cobblestone', 2);
  block('bedrock', 'Bedrock', { hard: -1, tab: 2 });
  block('sand', 'Sand', { hard: .5, tool: 'shovel', sound: 'sand', fall: true, tab: 2 });
  block('red_sand', 'Red Sand', { hard: .5, tool: 'shovel', sound: 'sand', fall: true, tab: 2 });
  block('gravel', 'Gravel', { hard: .6, tool: 'shovel', sound: 'gravel', fall: true, drops: (m, r) => [[r() < .1 ? 'flint' : 'gravel', 1]], tab: 2 });
  rock('sandstone', 'Sandstone', .8, { tex: { top: 'sandstone_top', side: 'sandstone', bottom: 'sandstone_bottom' } });
  rock('red_sandstone', 'Red Sandstone', .8, { tex: { top: 'red_sandstone_top', side: 'red_sandstone', bottom: 'red_sandstone_bottom' } });
  block('clay', 'Clay', { hard: .6, tool: 'shovel', sound: 'gravel', drops: () => [['clay_ball', 4]], tab: 2 });
  block('snow_block', 'Snow Block', { hard: .2, tool: 'shovel', sound: 'snow', tex: 'snow', drops: () => [['snowball', 4]], tab: 2 });
  block('snow', 'Snow', { shape: 'snow', hard: .1, tool: 'shovel', solid: false, opaque: false, sound: 'snow', replace: true, support: 'solid', drops: () => [['snowball', 1]], tab: 2 });
  block('ice', 'Ice', { hard: .5, tool: 'pickaxe', opaque: false, op: 2, trans: true, cullSame: true, sound: 'glass', slip: .98, drops: null, silk: true, tab: 2 });
  block('packed_ice', 'Packed Ice', { hard: .5, tool: 'pickaxe', sound: 'glass', slip: .98, drops: null, silk: true, tab: 2 });
  block('water', 'Water', { shape: 'fluid', solid: false, opaque: false, op: 2, trans: true, hard: 100, replace: true, fluid: 1, tint: 'water', tex: 'water', noItem: true, drops: null });
  block('lava', 'Lava', { shape: 'fluid', solid: false, opaque: false, op: 15, hard: 100, replace: true, fluid: 2, light: 15, tex: 'lava', noItem: true, drops: null });
  rock('granite', 'Granite', 1.5, { tab: 2 });
  rock('diorite', 'Diorite', 1.5, { tab: 2 });
  rock('andesite', 'Andesite', 1.5, { tab: 2 });
  rock('deepslate', 'Deepslate', 3, { drops: 'cobbled_deepslate', tab: 2 });
  rock('cobbled_deepslate', 'Cobbled Deepslate', 3.5);
  const ore = (key, name, level, drop, xp, tab = 2) => rock(key, name, 3, { level, drops: drop, xp, tab });
  ore('coal_ore', 'Coal Ore', 0, () => [['coal', 1]], [0, 2]);
  ore('iron_ore', 'Iron Ore', 1, () => [['raw_iron', 1]]);
  ore('copper_ore', 'Copper Ore', 1, (m, r) => [['raw_copper', pick(2, 4, r)]]);
  ore('gold_ore', 'Gold Ore', 2, () => [['raw_gold', 1]]);
  ore('ruby_ore', 'Ruby Ore', 2, (m, r) => [['ruby', pick(1, 2, r)]], [3, 7]);
  ore('lapis_ore', 'Lapis Ore', 1, (m, r) => [['lapis', pick(4, 8, r)]], [2, 5]);
  ore('diamond_ore', 'Diamond Ore', 2, () => [['diamond', 1]], [3, 7]);
  ore('emerald_ore', 'Emerald Ore', 2, () => [['emerald', 1]], [3, 7]);
  rock('obsidian', 'Obsidian', 50, { level: 3, tab: 2 });
  block('glow_block', 'Glow Block', { hard: .3, light: 15, sound: 'glass', tab: 3 });

  // Wood families. Each species adds the same run of blocks.
  const WOODS = ['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak', 'cherry'];
  const title = s => s.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  for (const s of WOODS) {
    const n = title(s), tinted = s !== 'birch' && s !== 'spruce' && s !== 'cherry';
    block(s + '_log', n + ' Log', { hard: 2, tool: 'axe', sound: 'wood', flam: 1, axis: true, tex: { top: s + '_log_top', side: s + '_log', bottom: s + '_log_top' }, tab: 2 });
    block(s + '_leaves', n + ' Leaves', { hard: .2, tool: 'hoe', opaque: false, op: 1, cut: true, sound: 'grass', flam: 3, wave: 2, decay: true, tint: tinted ? 'foliage' : null, tab: 2,
      drops: (m, r) => r() < .05 ? [[s + '_sapling', 1]] : (s === 'oak' || s === 'dark_oak') && r() < .05 ? [['apple', 1]] : r() < .02 ? [['stick', 1]] : [] });
    block(s + '_planks', n + ' Planks', { hard: 2, tool: 'axe', sound: 'wood', flam: 2 });
    plant(s + '_sapling', n + ' Sapling', { replace: false, sapling: s });
    block(s + '_slab', n + ' Slab', { shape: 'slab', hard: 2, tool: 'axe', sound: 'wood', opaque: false, tex: s + '_planks', flam: 2 });
    block(s + '_stairs', n + ' Stairs', { shape: 'stairs', hard: 2, tool: 'axe', sound: 'wood', opaque: false, tex: s + '_planks', flam: 2 });
    block(s + '_fence', n + ' Fence', { shape: 'fence', hard: 2, tool: 'axe', sound: 'wood', opaque: false, tex: s + '_planks', flam: 2, tab: 3 });
    block(s + '_door', n + ' Door', { shape: 'door', hard: 3, tool: 'axe', sound: 'wood', opaque: false, cut: true, tex: s + '_door', door: true, tab: 3 });
  }

  // Crafted and functional blocks
  block('crafting_table', 'Crafting Table', { hard: 2.5, tool: 'axe', sound: 'wood', flam: 2, use: 'craft', tex: { top: 'crafting_top', side: 'crafting_side', front: 'crafting_front', bottom: 'oak_planks' }, facing: true, tab: 3 });
  rock('furnace', 'Furnace', 3.5, { use: 'furnace', tex: { top: 'furnace_top', side: 'furnace_side', front: 'furnace_front', bottom: 'furnace_top' }, facing: true, tab: 3 });
  rock('lit_furnace', 'Lit Furnace', 3.5, { use: 'furnace', light: 13, drops: 'furnace', noItem: true, tex: { top: 'furnace_top', side: 'furnace_side', front: 'furnace_front_lit', bottom: 'furnace_top' }, facing: true });
  block('chest', 'Chest', { shape: 'chest', hard: 2.5, tool: 'axe', sound: 'wood', opaque: false, use: 'chest', tex: { top: 'chest_top', side: 'chest_side', front: 'chest_front', bottom: 'chest_top' }, facing: true, tab: 3 });
  block('bed', 'Bed', { shape: 'bed', hard: .2, sound: 'wool', opaque: false, use: 'bed', tex: { top: 'bed_foot', side: 'bed_side', bottom: 'oak_planks' }, flam: 2, tab: 3, noItem: true, drops: 'bed_item' });
  block('torch', 'Torch', { shape: 'torch', solid: false, opaque: false, hard: 0, sound: 'wood', light: 14, cut: true, replace: false, support: 'torch', tab: 3 });
  block('lantern', 'Lantern', { shape: 'lantern', hard: 3.5, tool: 'pickaxe', level: 0, solid: true, opaque: false, sound: 'metal', light: 15, cut: true, support: 'solid', tab: 3 });
  block('ladder', 'Ladder', { shape: 'ladder', solid: false, opaque: false, hard: .4, tool: 'axe', sound: 'wood', cut: true, climb: true, support: 'wall', tab: 3 });
  block('glass', 'Glass', { hard: .3, opaque: false, cut: true, cullSame: true, sound: 'glass', drops: null, silk: true });
  block('glass_pane', 'Glass Pane', { shape: 'pane', hard: .3, opaque: false, cut: true, sound: 'glass', tex: 'glass', drops: null, silk: true });
  block('iron_bars', 'Iron Bars', { shape: 'pane', hard: 5, tool: 'pickaxe', level: 0, opaque: false, cut: true, sound: 'metal' });
  rock('bricks', 'Bricks', 2);
  rock('stone_bricks', 'Stone Bricks', 1.5);
  rock('mossy_stone_bricks', 'Mossy Stone Bricks', 1.5);
  rock('cracked_stone_bricks', 'Cracked Stone Bricks', 1.5);
  rock('mossy_cobblestone', 'Mossy Cobblestone', 2);
  rock('smooth_stone', 'Smooth Stone', 2);
  block('bookshelf', 'Bookshelf', { hard: 1.5, tool: 'axe', sound: 'wood', flam: 2, tex: { top: 'oak_planks', side: 'bookshelf', bottom: 'oak_planks' }, drops: () => [['book', 3]], tab: 3 });
  block('tnt', 'TNT', { hard: 0, sound: 'grass', flam: 1, tex: { top: 'tnt_top', side: 'tnt_side', bottom: 'tnt_bottom' }, use: 'tnt', tab: 3 });
  const COLORS = ['white', 'light_gray', 'gray', 'black', 'brown', 'red', 'orange', 'yellow', 'lime', 'green', 'cyan', 'light_blue', 'blue', 'purple', 'magenta', 'pink'];
  for (const c of COLORS) block(c + '_wool', title(c) + ' Wool', { hard: .8, sound: 'wool', flam: 3, tab: 1 });
  for (const c of COLORS) rock(c + '_concrete', title(c) + ' Concrete', 1.8, { tab: 1 });
  for (const c of COLORS) block(c + '_stained_glass', title(c) + ' Stained Glass', { hard: .3, opaque: false, trans: true, cullSame: true, sound: 'glass', drops: null, silk: true, tab: 1 });
  rock('terracotta', 'Terracotta', 1.25, { tab: 1 });
  for (const c of ['white', 'orange', 'yellow', 'red', 'brown', 'light_gray']) rock(c + '_terracotta', title(c) + ' Terracotta', 1.25, { tab: 1 });
  const metal = (key, name, level, sound = 'metal') => rock(key, name, 5, { level, sound });
  metal('iron_block', 'Block of Iron', 1); metal('gold_block', 'Block of Gold', 2); metal('diamond_block', 'Block of Diamond', 2);
  metal('emerald_block', 'Block of Emerald', 2); metal('ruby_block', 'Block of Ruby', 0); metal('copper_block', 'Block of Copper', 1);
  metal('lapis_block', 'Block of Lapis', 1, 'stone'); metal('coal_block', 'Block of Coal', 0, 'stone');
  block('hay_block', 'Hay Bale', { hard: .5, tool: 'hoe', sound: 'grass', flam: 2, tex: { top: 'hay_top', side: 'hay_side', bottom: 'hay_top' } });

  // Plants and farming
  block('pumpkin', 'Pumpkin', { hard: 1, tool: 'axe', sound: 'wood', tex: { top: 'pumpkin_top', side: 'pumpkin_side', front: 'pumpkin_side', bottom: 'pumpkin_top' }, tab: 2 });
  block('jack_o_lantern', "Jack o'Lantern", { hard: 1, tool: 'axe', sound: 'wood', light: 15, facing: true, tex: { top: 'pumpkin_top', side: 'pumpkin_side', front: 'jack_front', bottom: 'pumpkin_top' }, tab: 3 });
  block('melon', 'Melon', { hard: 1, tool: 'axe', sound: 'wood', tex: { top: 'melon_top', side: 'melon_side', bottom: 'melon_top' }, drops: (m, r) => [['melon_slice', pick(3, 7, r)]], tab: 2 });
  block('cactus', 'Cactus', { shape: 'cactus', hard: .4, sound: 'wool', opaque: false, cut: true, support: 'sand', tex: { top: 'cactus_top', side: 'cactus_side', bottom: 'cactus_top' }, tab: 2 });
  plant('sugar_cane', 'Sugar Cane', { support: 'cane', replace: false, wave: 0, tint: 'grass' });
  block('wheat', 'Wheat Crops', { shape: 'crop', solid: false, opaque: false, hard: 0, sound: 'grass', cut: true, support: 'farmland', stages: 8, tex: 'wheat', noItem: true, wave: 1,
    drops: (m, r) => m >= 7 ? [['wheat_item', 1], ['wheat_seeds', pick(1, 3, r)]] : [['wheat_seeds', 1]] });
  block('carrots', 'Carrots', { shape: 'crop', solid: false, opaque: false, hard: 0, sound: 'grass', cut: true, support: 'farmland', stages: 4, tex: 'carrots', noItem: true, wave: 1,
    drops: (m, r) => [['carrot', m >= 3 ? pick(2, 5, r) : 1]] });
  block('potatoes', 'Potatoes', { shape: 'crop', solid: false, opaque: false, hard: 0, sound: 'grass', cut: true, support: 'farmland', stages: 4, tex: 'potatoes', noItem: true, wave: 1,
    drops: (m, r) => [['potato', m >= 3 ? pick(2, 5, r) : 1]] });
  block('farmland', 'Farmland', { shape: 'farmland', hard: .6, tool: 'shovel', sound: 'gravel', opaque: false, tex: { top: 'farmland', side: 'dirt', bottom: 'dirt' }, wetTex: 'farmland_wet', drops: 'dirt', noItem: true });
  block('dirt_path', 'Dirt Path', { shape: 'farmland', hard: .65, tool: 'shovel', sound: 'gravel', opaque: false, tex: { top: 'path_top', side: 'path_side', bottom: 'dirt' }, drops: 'dirt', tab: 2 });
  plant('short_grass', 'Short Grass', { tex: 'short_grass', tint: 'grass', drops: (m, r) => r() < .125 ? [['wheat_seeds', 1]] : [] });
  plant('fern', 'Fern', { tint: 'grass', drops: (m, r) => r() < .125 ? [['wheat_seeds', 1]] : [] });
  plant('dead_bush', 'Dead Bush', { support: 'dry', wave: 0, drops: (m, r) => [['stick', pick(0, 2, r)]] });
  for (const [k, n] of [['dandelion', 'Dandelion'], ['poppy', 'Poppy'], ['blue_orchid', 'Blue Orchid'], ['allium', 'Allium'], ['azure_bluet', 'Azure Bluet'], ['red_tulip', 'Red Tulip'], ['orange_tulip', 'Orange Tulip'], ['oxeye_daisy', 'Oxeye Daisy'], ['cornflower', 'Cornflower']]) plant(k, n, { replace: false });
  plant('brown_mushroom', 'Brown Mushroom', { support: 'mushroom', replace: false, light: 1, wave: 0 });
  plant('red_mushroom', 'Red Mushroom', { support: 'mushroom', replace: false, wave: 0 });
  block('lily_pad', 'Lily Pad', { shape: 'flat', hard: 0, opaque: false, cut: true, sound: 'grass', support: 'water', tint: 'foliage', tab: 2 });
  block('vine', 'Vines', { shape: 'vine', solid: false, opaque: false, hard: .2, tool: 'axe', cut: true, sound: 'grass', climb: true, replace: true, tint: 'foliage', wave: 1, tab: 2, drops: null, support: 'wall' });
  block('cobweb', 'Cobweb', { shape: 'cross', solid: false, opaque: false, hard: 4, tool: 'sword', cut: true, sound: 'wool', web: true, drops: () => [['string', 1]], tab: 2 });
  plant('kelp', 'Kelp', { waterlogged: true, support: 'kelp', replace: false, op: 2, wave: 1 });
  plant('seagrass', 'Seagrass', { waterlogged: true, support: 'seabed', replace: false, op: 2, wave: 1 });
  rock('spawner', 'Monster Spawner', 5, { opaque: false, cut: true, sound: 'metal', drops: null, xp: [15, 40], tab: 3 });
  block('red_mushroom_block', 'Red Mushroom Block', { hard: .2, tool: 'axe', sound: 'wood', tab: 2 });
  block('brown_mushroom_block', 'Brown Mushroom Block', { hard: .2, tool: 'axe', sound: 'wood', tab: 2 });
  block('mushroom_stem', 'Mushroom Stem', { hard: .2, tool: 'axe', sound: 'wood', tab: 2 });
  block('mycelium', 'Mycelium', { hard: .6, tool: 'shovel', sound: 'grass', tex: { top: 'mycelium_top', side: 'mycelium_side', bottom: 'dirt' }, drops: 'dirt', tab: 2 });
  block('podzol', 'Podzol', { hard: .5, tool: 'shovel', sound: 'gravel', tex: { top: 'podzol_top', side: 'podzol_side', bottom: 'dirt' }, drops: 'dirt', tab: 2 });
  block('coarse_dirt', 'Coarse Dirt', { hard: .5, tool: 'shovel', sound: 'gravel', tab: 2 });
  const stoneFamily = (k, name, tex, hard = 2) => {
    rock(k + '_slab', name + ' Slab', hard, { shape: 'slab', opaque: false, tex });
    rock(k + '_stairs', name + ' Stairs', hard, { shape: 'stairs', opaque: false, tex });
  };
  stoneFamily('stone', 'Stone', 'stone', 1.5); stoneFamily('cobblestone', 'Cobblestone', 'cobblestone');
  stoneFamily('brick', 'Brick', 'bricks'); stoneFamily('stone_brick', 'Stone Brick', 'stone_bricks', 1.5);
  stoneFamily('sandstone', 'Sandstone', { top: 'sandstone_top', side: 'sandstone', bottom: 'sandstone_bottom' }, .8);
  block('fire', 'Fire', { shape: 'fire', solid: false, opaque: false, hard: 0, sound: 'wool', light: 15, cut: true, replace: true, drops: null, noItem: true, support: 'fire' });

  const OP = new Uint8Array(256), EMIT = new Uint8Array(256), OPAQUE = new Uint8Array(256), SOLID = new Uint8Array(256), REPLACE = new Uint8Array(256), FLUID = new Uint8Array(256);
  for (const d of blocks) { OP[d.id] = d.op; EMIT[d.id] = d.light; OPAQUE[d.id] = d.opaque ? 1 : 0; SOLID[d.id] = d.solid ? 1 : 0; REPLACE[d.id] = d.replace ? 1 : 0; FLUID[d.id] = d.fluid || (d.waterlogged ? 1 : 0); }

  // Shapes in block units: [x0, y0, z0, x1, y1, z1, shearX, shearZ]. Directions run east, south, west, north.
  const P = n => n / 16;
  const CUBE = [[0, 0, 0, 1, 1, 1]], shapes = new Map();
  const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
  const arms = (conn, half, y0, y1) => {
    const out = [], a = .5 - half, b = .5 + half;
    if (conn & 1) out.push([b, y0, a, 1, y1, b]);
    if (conn & 2) out.push([a, y0, b, b, y1, 1]);
    if (conn & 4) out.push([0, y0, a, a, y1, b]);
    if (conn & 8) out.push([a, y0, 0, b, y1, a]);
    return out;
  };
  function buildShape(d, m, conn) {
    const s = d.shape;
    const r = (vis, col = vis, sel = vis) => ({ vis, col: d.solid ? col : [], sel });
    if (s === 'cube') return r(CUBE);
    if (s === 'slab') { const b = m & 1 ? [[0, .5, 0, 1, 1, 1]] : [[0, 0, 0, 1, .5, 1]]; return r(b); }
    if (s === 'stairs') {
      const up = m & 4, f = m & 3, y0 = up ? 0 : .5, y1 = up ? .5 : 1;
      const base = up ? [0, .5, 0, 1, 1, 1] : [0, 0, 0, 1, .5, 1];
      const tall = [[.5, y0, 0, 1, y1, 1], [0, y0, .5, 1, y1, 1], [0, y0, 0, .5, y1, 1], [0, y0, 0, 1, y1, .5]][f];
      return r([base, tall]);
    }
    if (s === 'fence') {
      const vis = [[P(6), 0, P(6), P(10), 1, P(10)], ...arms(conn, P(1), P(6), P(9)), ...arms(conn, P(1), P(12), P(15))];
      const col = [[P(6), 0, P(6), P(10), 1.5, P(10)], ...arms(conn, P(2), 0, 1.5)];
      return r(vis, col, [[P(6), 0, P(6), P(10), 1, P(10)], ...arms(conn, P(2), 0, 1)]);
    }
    if (s === 'pane') { const b = [[P(7), 0, P(7), P(9), 1, P(9)], ...arms(conn, P(1), 0, 1)]; return r(b); }
    if (s === 'door') {
      const f = m & 3, open = m & 4, hinge = m & 16, t = P(3);
      const p = open ? (f + (hinge ? 3 : 1)) % 4 : f;
      const b = [[[0, 0, 0, t, 1, 1]], [[0, 0, 0, 1, 1, t]], [[1 - t, 0, 0, 1, 1, 1]], [[0, 0, 1 - t, 1, 1, 1]]][p];
      return r(b);
    }
    if (s === 'torch') {
      if (!m) return r([[P(7), 0, P(7), P(9), P(10), P(9)]], [], [[P(6), 0, P(6), P(10), P(10), P(10)]]);
      const k = .62, dir = m - 1;
      const v = [P(7), P(3), P(7), P(9), P(13), P(9), DX[dir] * k, DZ[dir] * k];
      const cx = .5 + DX[dir] * .28, cz = .5 + DZ[dir] * .28;
      return r([v], [], [[cx - P(3), P(3), cz - P(3), cx + P(3), P(13), cz + P(3)]]);
    }
    if (s === 'ladder' || s === 'vine') {
      const t = P(1), e = .01;
      const b = [[[1 - t, 0, 0, 1 - e, 1, 1]], [[0, 0, 1 - t, 1, 1, 1 - e]], [[e, 0, 0, t, 1, 1]], [[0, 0, e, 1, 1, t]]][m & 3];
      return r(b, [], b);
    }
    if (s === 'bed') return r([[0, P(3), 0, 1, P(9), 1], [0, 0, 0, P(3), P(3), P(3)], [P(13), 0, 0, 1, P(3), P(3)], [0, 0, P(13), P(3), P(3), 1], [P(13), 0, P(13), 1, P(3), 1]], [[0, 0, 0, 1, P(9), 1]], [[0, 0, 0, 1, P(9), 1]]);
    if (s === 'chest') { const b = [[P(1), 0, P(1), P(15), P(14), P(15)]]; return r(b); }
    if (s === 'cactus') return r([[P(1), 0, P(1), P(15), 1, P(15)]], [[P(1), 0, P(1), P(15), P(15), P(15)]], [[P(1), 0, P(1), P(15), 1, P(15)]]);
    if (s === 'flat') return r([[0, 0, 0, 1, P(.25), 1]], [[0, 0, 0, 1, P(1), 1]], [[0, 0, 0, 1, P(1), 1]]);
    if (s === 'snow') { const b = [[0, 0, 0, 1, (m + 1) / 8, 1]]; return { vis: b, col: m ? [[0, 0, 0, 1, m / 8, 1]] : [], sel: b }; }
    if (s === 'farmland') return r([[0, 0, 0, 1, P(15), 1]]);
    if (s === 'lantern') { const b = [[P(5), 0, P(5), P(11), P(7), P(11)], [P(6), P(7), P(6), P(10), P(9), P(10)]]; return r(b, [b[0]], [[P(5), 0, P(5), P(11), P(9), P(11)]]); }
    if (s === 'crop') return { vis: [], col: [], sel: [[0, 0, 0, 1, P(Math.max(3, 2 + m * 2)), 1]] };
    if (s === 'cross' || s === 'fire') return { vis: [], col: [], sel: [[.15, 0, .15, .85, .8, .85]] };
    if (s === 'fluid') return { vis: [], col: [], sel: [] };
    return r(CUBE);
  }
  const shape = (id, m = 0, conn = 0) => {
    const k = id * 65536 + m * 256 + conn;
    let v = shapes.get(k);
    if (!v) shapes.set(k, v = buildShape(blocks[id], m, conn));
    return v;
  };

  // Items: every block with an item shares its block id; other items start at 256.
  const items = [], I = {};
  for (const d of blocks) if (!d.noItem) { items[d.id] = { id: d.id, key: d.key, name: d.name, block: d.id, tab: d.tab, stack: 64 }; I[d.key] = d.id; }
  let nextItem = 256;
  const item = (key, name, o = {}) => { const id = nextItem++; items[id] = { id, key, name, stack: 64, tab: 7, ...o }; I[key] = id; return id; };

  const TIERS = {
    wooden: { name: 'Wooden', speed: 2, dur: 59, level: 0, dmg: 0, mat: '#planks', fuel: 200 },
    stone: { name: 'Stone', speed: 4, dur: 131, level: 1, dmg: 1, mat: '#cobble' },
    iron: { name: 'Iron', speed: 6, dur: 250, level: 2, dmg: 2, mat: 'iron_ingot' },
    golden: { name: 'Golden', speed: 12, dur: 32, level: 0, dmg: 0, mat: 'gold_ingot' },
    diamond: { name: 'Diamond', speed: 8, dur: 1561, level: 3, dmg: 3, mat: 'diamond' },
  };
  const TOOLS = { pickaxe: { dmg: 2, rate: 1.2, name: 'Pickaxe' }, axe: { dmg: 6, rate: .9, name: 'Axe' }, shovel: { dmg: 2.5, rate: 1, name: 'Shovel' }, hoe: { dmg: 1, rate: 2, name: 'Hoe' }, sword: { dmg: 4, rate: 1.6, name: 'Sword' } };
  for (const t in TIERS) for (const k in TOOLS) {
    const ti = TIERS[t], to = TOOLS[k];
    item(t + '_' + k, ti.name + ' ' + to.name, { stack: 1, tab: k === 'sword' || k === 'axe' ? 5 : 4, tool: k, tier: t, speed: ti.speed, level: ti.level, dur: ti.dur, dmg: to.dmg + ti.dmg, rate: to.rate, fuel: ti.fuel });
  }
  const ARMOR = {
    leather: { name: 'Leather', dur: 5, pts: [1, 3, 2, 1], mat: 'leather' }, iron: { name: 'Iron', dur: 15, pts: [2, 6, 5, 2], mat: 'iron_ingot' },
    golden: { name: 'Golden', dur: 7, pts: [2, 5, 3, 1], mat: 'gold_ingot' }, diamond: { name: 'Diamond', dur: 33, pts: [3, 8, 6, 3], mat: 'diamond' },
  };
  const PIECES = [['helmet', 'Cap', 'Helmet', 11], ['chestplate', 'Tunic', 'Chestplate', 16], ['leggings', 'Pants', 'Leggings', 15], ['boots', 'Boots', 'Boots', 13]];
  for (const t in ARMOR) PIECES.forEach(([k, leather, plain, mul], slot) => {
    const a = ARMOR[t];
    item(t + '_' + k, a.name + ' ' + (t === 'leather' ? leather : plain), { stack: 1, tab: 5, armor: slot, pts: a.pts[slot], dur: a.dur * mul, tier: t });
  });
  const food = (key, name, hunger, sat, o = {}) => item(key, name, { tab: 6, food: hunger, sat, ...o });
  food('apple', 'Apple', 4, 2.4); food('golden_apple', 'Golden Apple', 4, 9.6, { heal: 8 });
  food('bread', 'Bread', 5, 6); food('cookie', 'Cookie', 2, .4); food('pumpkin_pie', 'Pumpkin Pie', 8, 4.8);
  food('melon_slice', 'Melon Slice', 2, 1.2); food('carrot', 'Carrot', 3, 3.6, { plants: 'carrots' }); food('potato', 'Potato', 1, .6, { plants: 'potatoes' }); food('baked_potato', 'Baked Potato', 5, 6);
  food('beef', 'Raw Beef', 3, 1.8); food('cooked_beef', 'Steak', 8, 12.8); food('porkchop', 'Raw Porkchop', 3, 1.8); food('cooked_porkchop', 'Cooked Porkchop', 8, 12.8);
  food('mutton', 'Raw Mutton', 2, 1.2); food('cooked_mutton', 'Cooked Mutton', 6, 9.6); food('chicken', 'Raw Chicken', 2, 1.2); food('cooked_chicken', 'Cooked Chicken', 6, 7.2);
  food('rotten_flesh', 'Rotten Flesh', 4, .8); food('mushroom_stew', 'Mushroom Stew', 6, 7.2, { stack: 1, leaves: 'bowl' });
  food('milk_bucket', 'Milk Bucket', 0, 0, { stack: 1, leaves: 'bucket', always: true, tab: 4 });
  const stuff = (k, n, o) => item(k, n, o);
  stuff('stick', 'Stick', { fuel: 100 }); stuff('coal', 'Coal', { fuel: 1600 }); stuff('charcoal', 'Charcoal', { fuel: 1600 });
  stuff('raw_iron', 'Raw Iron'); stuff('raw_copper', 'Raw Copper'); stuff('raw_gold', 'Raw Gold');
  stuff('iron_ingot', 'Iron Ingot'); stuff('copper_ingot', 'Copper Ingot'); stuff('gold_ingot', 'Gold Ingot'); stuff('iron_nugget', 'Iron Nugget');
  stuff('diamond', 'Diamond'); stuff('emerald', 'Emerald'); stuff('ruby', 'Ruby'); stuff('lapis', 'Lapis Lazuli');
  stuff('flint', 'Flint'); stuff('brick', 'Brick'); stuff('clay_ball', 'Clay Ball'); stuff('string', 'String'); stuff('feather', 'Feather');
  stuff('leather', 'Leather'); stuff('gunpowder', 'Gunpowder'); stuff('bone', 'Bone'); stuff('bone_meal', 'Bone Meal', { boneMeal: true }); stuff('sugar', 'Sugar');
  stuff('paper', 'Paper'); stuff('book', 'Book'); stuff('wheat_item', 'Wheat'); stuff('wheat_seeds', 'Wheat Seeds', { plants: 'wheat' }); stuff('bowl', 'Bowl', { fuel: 100, tab: 4 });
  stuff('egg', 'Egg', { stack: 16, tab: 4, thrown: 'egg' }); stuff('snowball', 'Snowball', { stack: 16, tab: 4, thrown: 'snowball' });
  stuff('arrow', 'Arrow', { tab: 5 }); stuff('bow', 'Bow', { stack: 1, tab: 5, bow: true, dur: 384 });
  stuff('shears', 'Shears', { stack: 1, tab: 4, shears: true, dur: 238 }); stuff('flint_and_steel', 'Flint and Steel', { stack: 1, tab: 4, igniter: true, dur: 64 });
  stuff('bucket', 'Bucket', { stack: 16, tab: 4, bucket: 0 }); stuff('water_bucket', 'Water Bucket', { stack: 1, tab: 4, bucket: 'water' }); stuff('lava_bucket', 'Lava Bucket', { stack: 1, tab: 4, bucket: 'lava', fuel: 20000 });
  stuff('bed_item', 'Bed', { tab: 3, stack: 1, places: 'bed' });
  stuff('clock', 'Clock', { tab: 4, stack: 1 }); stuff('compass', 'Compass', { tab: 4, stack: 1 });
  for (const c of COLORS) stuff(c + '_dye', title(c) + ' Dye', { dye: c });
  const EGGS = [['pig', 'Pig'], ['cow', 'Cow'], ['sheep', 'Sheep'], ['chicken_mob', 'Chicken'], ['zombie', 'Rotter'], ['skeleton', 'Skeleton'], ['spider', 'Spider'], ['blastcap', 'Blastcap']];
  for (const [m, n] of EGGS) stuff(m + '_egg', n + ' Spawn Egg', { tab: 8, spawns: m });
  for (const k in items) if (items[k].fuel === undefined) {
    const d = items[k].block !== undefined && blocks[items[k].block];
    if (d && d.key.endsWith('_log')) items[k].fuel = 300;
    else if (d && d.key.endsWith('_sapling')) items[k].fuel = 100;
    else if (d && (d.key.endsWith('_planks') || d.key.endsWith('_slab') && d.sound === 'wood' || d.key.endsWith('_stairs') && d.sound === 'wood' || d.key.endsWith('_fence'))) items[k].fuel = 300;
    else if (d && d.key === 'coal_block') items[k].fuel = 16000;
  }

  // Crafting
  const TAGS = {
    '#planks': WOODS.map(s => s + '_planks'), '#logs': WOODS.map(s => s + '_log'), '#cobble': ['cobblestone', 'cobbled_deepslate'],
    '#wool': COLORS.map(c => c + '_wool'), '#coal': ['coal', 'charcoal'], '#stoneish': ['stone', 'granite', 'diorite', 'andesite'],
  };
  const recipes = [];
  const R = (out, n, rows, map) => recipes.push({ out, n, rows, map });
  const S = (out, n, list) => recipes.push({ out, n, list });
  for (const s of WOODS) {
    S(s + '_planks', 4, [s + '_log']);
    R(s + '_slab', 6, ['XXX'], { X: s + '_planks' });
    R(s + '_stairs', 4, ['X  ', 'XX ', 'XXX'], { X: s + '_planks' });
    R(s + '_fence', 3, ['X|X', 'X|X'], { X: s + '_planks', '|': 'stick' });
    R(s + '_door', 3, ['XX', 'XX', 'XX'], { X: s + '_planks' });
  }
  R('stick', 4, ['X', 'X'], { X: '#planks' });
  R('crafting_table', 1, ['XX', 'XX'], { X: '#planks' });
  R('furnace', 1, ['XXX', 'X X', 'XXX'], { X: '#cobble' });
  R('chest', 1, ['XXX', 'X X', 'XXX'], { X: '#planks' });
  R('torch', 4, ['C', '|'], { C: '#coal', '|': 'stick' });
  R('ladder', 3, ['| |', '|||', '| |'], { '|': 'stick' });
  R('bed_item', 1, ['WWW', 'PPP'], { W: '#wool', P: '#planks' });
  R('bowl', 4, ['X X', ' X '], { X: '#planks' });
  const toolRows = { pickaxe: ['XXX', ' | ', ' | '], axe: ['XX', 'X|', ' |'], shovel: ['X', '|', '|'], hoe: ['XX', ' |', ' |'], sword: ['X', 'X', '|'] };
  for (const t in TIERS) for (const k in TOOLS) R(t + '_' + k, 1, toolRows[k], { X: TIERS[t].mat, '|': 'stick' });
  const armorRows = [['XXX', 'X X'], ['X X', 'XXX', 'XXX'], ['XXX', 'X X', 'X X'], ['X X', 'X X']];
  for (const t in ARMOR) PIECES.forEach(([k], i) => R(t + '_' + k, 1, armorRows[i], { X: ARMOR[t].mat }));
  R('bow', 1, [' XS', 'X S', ' XS'], { X: 'stick', S: 'string' });
  R('arrow', 4, ['F', '|', 'P'], { F: 'flint', '|': 'stick', P: 'feather' });
  R('shears', 1, [' I', 'I '], { I: 'iron_ingot' });
  S('flint_and_steel', 1, ['iron_ingot', 'flint']);
  R('bucket', 1, ['I I', ' I '], { I: 'iron_ingot' });
  R('clock', 1, [' G ', 'GCG', ' G '], { G: 'gold_ingot', C: 'ruby' });
  R('compass', 1, [' I ', 'ICI', ' I '], { I: 'iron_ingot', C: 'ruby' });
  R('bread', 1, ['WWW'], { W: 'wheat_item' });
  R('cookie', 8, ['WCW'], { W: 'wheat_item', C: 'brown_dye' });
  S('pumpkin_pie', 1, ['pumpkin', 'sugar', 'egg']);
  S('mushroom_stew', 1, ['bowl', 'brown_mushroom', 'red_mushroom']);
  R('golden_apple', 1, ['GGG', 'GAG', 'GGG'], { G: 'gold_ingot', A: 'apple' });
  S('sugar', 1, ['sugar_cane']);
  R('paper', 3, ['CCC'], { C: 'sugar_cane' });
  S('book', 1, ['paper', 'paper', 'paper', 'leather']);
  R('bookshelf', 1, ['PPP', 'BBB', 'PPP'], { P: '#planks', B: 'book' });
  R('tnt', 1, ['GSG', 'SGS', 'GSG'], { G: 'gunpowder', S: 'sand' });
  R('glass_pane', 16, ['GGG', 'GGG'], { G: 'glass' });
  R('iron_bars', 16, ['III', 'III'], { I: 'iron_ingot' });
  R('bricks', 1, ['BB', 'BB'], { B: 'brick' });
  R('stone_bricks', 4, ['SS', 'SS'], { S: 'stone' });
  R('sandstone', 1, ['SS', 'SS'], { S: 'sand' });
  R('red_sandstone', 1, ['SS', 'SS'], { S: 'red_sand' });
  R('snow_block', 1, ['SS', 'SS'], { S: 'snowball' });
  R('clay', 1, ['CC', 'CC'], { C: 'clay_ball' });
  R('snow', 6, ['SSS'], { S: 'snow_block' });
  R('hay_block', 1, ['WWW', 'WWW', 'WWW'], { W: 'wheat_item' });
  S('wheat_item', 9, ['hay_block']);
  R('melon', 1, ['MMM', 'MMM', 'MMM'], { M: 'melon_slice' });
  S('jack_o_lantern', 1, ['pumpkin', 'torch']);
  S('mossy_cobblestone', 1, ['cobblestone', 'vine']);
  S('mossy_stone_bricks', 1, ['stone_bricks', 'vine']);
  R('lantern', 1, ['NNN', 'NTN', 'NNN'], { N: 'iron_nugget', T: 'torch' });
  S('iron_nugget', 9, ['iron_ingot']);
  R('iron_ingot', 1, ['NNN', 'NNN', 'NNN'], { N: 'iron_nugget' });
  R('glow_block', 1, ['RGR', 'GRG', 'RGR'], { R: 'ruby', G: 'glass' });
  for (const [out, it] of [['iron_block', 'iron_ingot'], ['gold_block', 'gold_ingot'], ['diamond_block', 'diamond'], ['emerald_block', 'emerald'], ['ruby_block', 'ruby'], ['copper_block', 'copper_ingot'], ['lapis_block', 'lapis'], ['coal_block', 'coal']]) {
    R(out, 1, ['XXX', 'XXX', 'XXX'], { X: it });
    S(it, 9, [out]);
  }
  for (const [k, slab, stair] of [['stone', 'stone_slab', 'stone_stairs'], ['cobblestone', 'cobblestone_slab', 'cobblestone_stairs'], ['bricks', 'brick_slab', 'brick_stairs'], ['stone_bricks', 'stone_brick_slab', 'stone_brick_stairs'], ['sandstone', 'sandstone_slab', 'sandstone_stairs']]) {
    R(slab, 6, ['XXX'], { X: k });
    R(stair, 4, ['X  ', 'XX ', 'XXX'], { X: k });
  }
  R('white_wool', 1, ['SS', 'SS'], { S: 'string' });
  S('bone_meal', 3, ['bone']);
  S('white_dye', 1, ['bone_meal']); S('white_dye', 1, ['oxeye_daisy']); S('light_gray_dye', 1, ['azure_bluet']); S('gray_dye', 2, ['black_dye', 'white_dye']); S('black_dye', 1, ['coal']);
  S('brown_dye', 1, ['brown_mushroom']); S('red_dye', 1, ['poppy']); S('red_dye', 1, ['red_tulip']); S('orange_dye', 1, ['orange_tulip']); S('yellow_dye', 1, ['dandelion']);
  S('lime_dye', 2, ['green_dye', 'white_dye']); S('cyan_dye', 2, ['blue_dye', 'green_dye']); S('light_blue_dye', 1, ['blue_orchid']); S('blue_dye', 1, ['cornflower']); S('blue_dye', 1, ['lapis']);
  S('purple_dye', 2, ['red_dye', 'blue_dye']); S('magenta_dye', 1, ['allium']); S('pink_dye', 2, ['red_dye', 'white_dye']);
  for (const c of COLORS) {
    if (c !== 'white') S(c + '_wool', 1, ['white_wool', c + '_dye']);
    S(c + '_concrete', 8, ['sand', 'sand', 'sand', 'sand', 'gravel', 'gravel', 'gravel', 'gravel', c + '_dye']);
    R(c + '_stained_glass', 8, ['GGG', 'GDG', 'GGG'], { G: 'glass', D: c + '_dye' });
  }

  const SMELT = {
    raw_iron: 'iron_ingot', raw_gold: 'gold_ingot', raw_copper: 'copper_ingot', iron_ore: 'iron_ingot', gold_ore: 'gold_ingot', copper_ore: 'copper_ingot', coal_ore: 'coal', diamond_ore: 'diamond',
    sand: 'glass', red_sand: 'glass', cobblestone: 'stone', cobbled_deepslate: 'deepslate', stone: 'smooth_stone', clay_ball: 'brick', clay: 'terracotta', cactus: 'green_dye',
    beef: 'cooked_beef', porkchop: 'cooked_porkchop', mutton: 'cooked_mutton', chicken: 'cooked_chicken', potato: 'baked_potato',
  };
  for (const s of WOODS) SMELT[s + '_log'] = 'charcoal';

  // Resolve names to ids now that every item exists.
  const idOf = k => { if (I[k] === undefined) throw new Error('Unknown item ' + k); return I[k]; };
  const resolve = k => k[0] === '#' ? TAGS[k].map(idOf) : [idOf(k)];
  for (const r of recipes) {
    r.id = idOf(r.out);
    if (r.list) r.need = r.list.map(resolve);
    else {
      r.w = Math.max(...r.rows.map(x => x.length)); r.h = r.rows.length;
      r.grid = [];
      for (const row of r.rows) for (let i = 0; i < r.w; i++) { const c = row[i]; r.grid.push(c && c !== ' ' ? resolve(r.map[c]) : null); }
    }
  }
  const smelt = {};
  for (const k in SMELT) smelt[idOf(k)] = idOf(SMELT[k]);

  const trim = g => {
    let x0 = g.w, x1 = -1, y0 = g.h, y1 = -1;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.slots[x + y * g.w]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < 0) return null;
    return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };
  // Finds the recipe for a crafting grid: slots is a w x h array of stacks or nulls.
  const match = (slots, w, h) => {
    const box = trim({ slots, w, h });
    if (!box) return null;
    const used = slots.filter(Boolean);
    for (const r of recipes) {
      if (r.need) {
        if (used.length !== r.need.length) continue;
        const left = used.map(s => s.id);
        if (r.need.every(opts => { const i = left.findIndex(v => opts.includes(v)); if (i < 0) return false; left.splice(i, 1); return true; })) return r;
      } else if (r.w === box.w && r.h === box.h) {
        for (const flip of [false, true]) {
          let ok = true;
          for (let y = 0; y < r.h && ok; y++) for (let x = 0; x < r.w && ok; x++) {
            const need = r.grid[(flip ? r.w - 1 - x : x) + y * r.w], s = slots[box.x0 + x + (box.y0 + y) * w];
            if (need ? !(s && need.includes(s.id)) : !!s) ok = false;
          }
          if (ok) return r;
        }
      }
    }
    return null;
  };

  // Chest loot: [item, min, max, weight]
  const LOOT = {
    bonus: { rolls: [8, 10], list: [['apple', 2, 4, 8], ['bread', 2, 4, 8], ['oak_log', 2, 6, 10], ['stick', 2, 8, 6], ['wooden_axe', 1, 1, 4], ['wooden_pickaxe', 1, 1, 4], ['stone_pickaxe', 1, 1, 2], ['torch', 4, 8, 6], ['oak_sapling', 2, 4, 4]] },
    house: { rolls: [3, 7], list: [['bread', 1, 4, 10], ['apple', 1, 3, 8], ['wheat_item', 2, 6, 6], ['potato', 1, 5, 6], ['carrot', 1, 4, 6], ['torch', 2, 8, 6], ['stick', 2, 6, 4], ['coal', 1, 4, 5], ['iron_ingot', 1, 2, 2], ['paper', 1, 3, 3], ['oak_sapling', 1, 2, 3]] },
    smith: { rolls: [4, 8], list: [['iron_ingot', 1, 5, 10], ['gold_ingot', 1, 3, 4], ['bread', 1, 3, 6], ['diamond', 1, 2, 1], ['iron_sword', 1, 1, 3], ['iron_pickaxe', 1, 1, 3], ['iron_axe', 1, 1, 2], ['iron_chestplate', 1, 1, 2], ['iron_helmet', 1, 1, 2], ['iron_leggings', 1, 1, 2], ['iron_boots', 1, 1, 2], ['coal', 2, 6, 6]] },
    dungeon: { rolls: [4, 9], list: [['bone', 2, 6, 10], ['rotten_flesh', 2, 6, 10], ['gunpowder', 1, 4, 6], ['string', 1, 4, 6], ['iron_ingot', 1, 4, 8], ['gold_ingot', 1, 3, 4], ['bread', 1, 3, 8], ['wheat_item', 1, 4, 6], ['bucket', 1, 1, 4], ['golden_apple', 1, 1, 1], ['diamond', 1, 2, 1], ['iron_helmet', 1, 1, 2], ['bow', 1, 1, 3], ['arrow', 4, 12, 5]] },
    temple: { rolls: [4, 8], list: [['gold_ingot', 2, 7, 10], ['iron_ingot', 1, 5, 8], ['emerald', 1, 3, 6], ['diamond', 1, 3, 3], ['bone', 3, 7, 8], ['rotten_flesh', 3, 7, 8], ['golden_apple', 1, 1, 2], ['golden_sword', 1, 1, 3], ['diamond_sword', 1, 1, 1]] },
    tower: { rolls: [3, 6], list: [['arrow', 4, 16, 10], ['bow', 1, 1, 4], ['stone_sword', 1, 1, 6], ['iron_sword', 1, 1, 2], ['cooked_beef', 1, 4, 6], ['bread', 2, 5, 8], ['iron_ingot', 1, 3, 6], ['torch', 4, 12, 8], ['leather_chestplate', 1, 1, 4], ['leather_helmet', 1, 1, 4], ['iron_helmet', 1, 1, 1]] },
  };
  for (const k in LOOT) for (const e of LOOT[k].list) e[0] = idOf(e[0]);
  const rollLoot = (table, r) => {
    const t = LOOT[table], out = [], total = t.list.reduce((a, e) => a + e[3], 0);
    const n = pick(t.rolls[0], t.rolls[1], r);
    for (let i = 0; i < n; i++) {
      let w = r() * total, e = t.list[0];
      for (const c of t.list) { w -= c[3]; if (w <= 0) { e = c; break; } }
      out.push({ slot: Math.floor(r() * 27), id: e[0], count: pick(e[1], e[2], r) });
    }
    const seen = new Set();
    return out.filter(s => !seen.has(s.slot) && seen.add(s.slot));
  };

  return { blocks, B, items, I, OP, EMIT, OPAQUE, SOLID, REPLACE, FLUID, WOODS, COLORS, TABS, TIERS, ARMOR, recipes, match, smelt, shape, rollLoot, EGGS, DX, DZ };
})();
if (typeof module !== 'undefined') module.exports = CraftData;
