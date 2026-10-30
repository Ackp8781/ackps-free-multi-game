// Game Maker: draw a platformer level, test it, save it, and share it as a code.
App.register({
  id: 'maker', name: 'Game Maker', icon: '🛠️', online: false,
  desc: 'Create your own platformer and share it with a code.',
  mount(ctx) {
    const COLS = 40, ROWS = 16, T = 24;
    const TILES = [
      { name: 'Eraser', icon: '🧽' }, { name: 'Ground', icon: '🟩' }, { name: 'Brick', icon: '🧱' }, { name: 'Spikes', icon: '🔺' },
      { name: 'Coin', icon: '🪙' }, { name: 'Goal', icon: '🚩' }, { name: 'Start', icon: '🧍' }, { name: 'Enemy', icon: '👾' }, { name: 'Spring', icon: '🟡' },
    ];
    const blank = () => {
      const t = Array(COLS * ROWS).fill(0);
      for (let x = 0; x < COLS; x++) { t[(ROWS - 1) * COLS + x] = 1; t[(ROWS - 2) * COLS + x] = 1; }
      t[(ROWS - 3) * COLS + 2] = 6; t[(ROWS - 3) * COLS + 37] = 5;
      return { name: 'My Game', sky: '#7ec8ff', jump: 10, grav: 10, tiles: t };
    };
    const encode = g => btoa(unescape(encodeURIComponent(JSON.stringify({ n: g.name, s: g.sky, j: g.jump, g: g.grav, t: g.tiles.join('') }))));
    const decode = code => {
      const o = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      const t = String(o.t).split('').map(Number);
      if (t.length !== COLS * ROWS || t.some(v => !(v >= 0 && v <= 8))) throw new Error('bad level');
      return { name: String(o.n).slice(0, 30), sky: /^#[0-9a-f]{6}$/i.test(o.s) ? o.s : '#7ec8ff', jump: clamp(+o.j || 10, 5, 15), grav: clamp(+o.g || 10, 5, 15), tiles: t };
    };
    const list = () => ctx.data('games', []);
    menu();

    function drawTile(g, v, x, y) {
      const px = x * T, py = y * T;
      if (v === 1) { g.fillStyle = '#7a4f2a'; g.fillRect(px, py, T, T); g.fillStyle = '#4caf50'; g.fillRect(px, py, T, 7); }
      else if (v === 2) { g.fillStyle = '#b5533c'; g.fillRect(px, py, T, T); g.fillStyle = '#7d3524'; g.fillRect(px, py + 11, T, 2); g.fillRect(px + 11, py, 2, 11); }
      else if (v === 3) { g.fillStyle = '#ddd'; g.beginPath(); g.moveTo(px, py + T); g.lineTo(px + T / 2, py + 3); g.lineTo(px + T, py + T); g.fill(); }
      else if (v === 4) { g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(px + T / 2, py + T / 2, 8, 0, 7); g.fill(); }
      else if (v === 5) { g.fillStyle = '#fff'; g.fillRect(px + 5, py, 3, T); g.fillStyle = '#ff4d4d'; g.fillRect(px + 8, py, 13, 10); }
      else if (v === 6) { g.fillStyle = '#3fa7ff88'; g.fillRect(px + 4, py + 2, 16, 22); }
      else if (v === 7) { g.fillStyle = '#a55eea'; g.fillRect(px + 2, py + 6, 20, 18); g.fillStyle = '#fff'; g.fillRect(px + 6, py + 10, 4, 4); g.fillRect(px + 14, py + 10, 4, 4); }
      else if (v === 8) { g.fillStyle = '#ffb300'; g.fillRect(px + 2, py + 14, 20, 10); }
    }

    function menu() {
      ctx.clear();
      const code = el('input', { placeholder: 'Paste a game code', 'aria-label': 'Game code' });
      const err = el('p', { class: 'err', role: 'alert' });
      const games = list();
      const box = el('div', { class: 'box', style: 'max-width:520px' }, el('h3', {}, 'Your games'),
        el('div', { class: 'stack' }, el('button', { class: 'btn', onclick: () => edit(blank(), -1) }, '➕ Create a new game'),
          ...games.map((x, i) => el('div', { class: 'row', style: 'align-items:center;justify-content:space-between' }, el('span', {}, x.name), el('span', { class: 'row' },
            el('button', { class: 'btn small', onclick: () => run(x, menu) }, 'Play'),
            el('button', { class: 'btn alt small', onclick: () => edit(x, i) }, 'Edit'),
            el('button', { class: 'btn alt small', onclick: () => { const l = list(); l.splice(i, 1); ctx.save('games', l); menu(); } }, 'Delete')))),
          el('form', { class: 'row', style: 'flex-wrap:nowrap', onsubmit: e => {
            e.preventDefault();
            try { run(decode(code.value), menu); } catch (x) { err.textContent = 'That code is not valid.'; }
          } }, code, el('button', { class: 'btn alt' }, 'Play'))), err);
      ctx.stage.append(box);
    }

    function edit(game, index) {
      ctx.clear();
      game = { ...game, tiles: [...game.tiles] };
      let tool = 1, painting = false;
      const c = ctx.canvas(COLS * T, ROWS * T), g = c.getContext('2d');
      const tools = el('div', { class: 'tools' });
      const drawTools = () => tools.replaceChildren(...TILES.map((t, i) => el('button', { class: i === tool ? 'on' : '', title: t.name, 'aria-label': t.name, onclick: () => { tool = i; drawTools(); } }, t.icon)));
      drawTools();
      const name = el('input', { value: game.name, maxLength: 30, 'aria-label': 'Game name', oninput: () => { game.name = name.value; } });
      const sky = el('input', { type: 'color', value: game.sky, 'aria-label': 'Sky color', oninput: () => { game.sky = sky.value; draw(); } });
      const jump = el('input', { type: 'range', min: 5, max: 15, value: game.jump, 'aria-label': 'Jump height', oninput: () => { game.jump = +jump.value; } });
      const grav = el('input', { type: 'range', min: 5, max: 15, value: game.grav, 'aria-label': 'Gravity', oninput: () => { game.grav = +grav.value; } });
      const out = el('input', { readOnly: true, placeholder: 'Your share code appears here', 'aria-label': 'Share code' });
      const persist = () => {
        const l = list();
        if (index < 0) { l.push(game); index = l.length - 1; } else l[index] = game;
        ctx.save('games', l);
      };
      ctx.stage.append(tools,
        el('div', { class: 'field' }, name, el('label', {}, 'Sky '), sky, el('label', {}, 'Jump '), jump, el('label', {}, 'Gravity '), grav),
        el('div', { class: 'row' },
          el('button', { class: 'btn', onclick: () => { persist(); run(game, () => edit(game, index)); } }, '▶ Test'),
          el('button', { class: 'btn alt', onclick: () => { persist(); menu(); } }, '💾 Save and exit'),
          el('button', { class: 'btn alt', onclick: async () => {
            persist(); out.value = encode(game); out.select();
            try { await navigator.clipboard.writeText(out.value); out.placeholder = 'Copied'; } catch (e) {}
          } }, '🔗 Get share code')),
        el('div', { class: 'field' }, out));
      ctx.help('Pick a block and draw on the grid. Every game needs a start and a goal.');
      function draw() {
        g.fillStyle = game.sky; g.fillRect(0, 0, c.width, c.height);
        g.strokeStyle = '#00000018';
        for (let x = 0; x <= COLS; x++) { g.beginPath(); g.moveTo(x * T, 0); g.lineTo(x * T, c.height); g.stroke(); }
        for (let y = 0; y <= ROWS; y++) { g.beginPath(); g.moveTo(0, y * T); g.lineTo(c.width, y * T); g.stroke(); }
        game.tiles.forEach((v, i) => drawTile(g, v, i % COLS, Math.floor(i / COLS)));
      }
      const put = e => {
        const p = ctx.pos(e, c), x = Math.floor(p.x / T), y = Math.floor(p.y / T);
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
        if (tool === 6 || tool === 5) game.tiles = game.tiles.map(v => (v === tool ? 0 : v));
        game.tiles[y * COLS + x] = tool;
        draw();
      };
      ctx.on(c, 'pointerdown', e => { painting = true; c.setPointerCapture(e.pointerId); put(e); });
      ctx.on(c, 'pointermove', e => { if (painting) put(e); });
      ctx.on(c, 'pointerup', () => { painting = false; });
      draw();
    }

    function run(game, back) {
      ctx.clear();
      const c = ctx.canvas(COLS * T, ROWS * T), g = c.getContext('2d'), hud = ctx.hud();
      ctx.help('Arrows or WASD to move, Space or up to jump. R restarts.');
      ctx.touch([['←', 'ArrowLeft'], ['→', 'ArrowRight'], ['⤒', ' ']]);
      const tiles = [...game.tiles];
      const startI = tiles.indexOf(6);
      const home = startI < 0 ? { x: 48, y: 48 } : { x: startI % COLS * T + 3, y: Math.floor(startI / COLS) * T };
      const SOLID = v => v === 1 || v === 2;
      const at = (x, y) => {
        const tx = Math.floor(x / T), ty = Math.floor(y / T);
        if (tx < 0 || tx >= COLS) return 1;
        if (ty < 0 || ty >= ROWS) return 0;
        return tiles[ty * COLS + tx];
      };
      const enemies = [];
      tiles.forEach((v, i) => { if (v === 7) { enemies.push({ x: i % COLS * T + 2, y: Math.floor(i / COLS) * T + 4, dir: -1, alive: true }); tiles[i] = 0; } });
      const pl = { x: home.x, y: home.y, vx: 0, vy: 0, ground: false, w: 16, h: 22 };
      let coins = 0, deaths = 0, over = false, time = 0;
      const total = tiles.filter(v => v === 4).length;
      const GRAV = game.grav * 130, JUMP = Math.sqrt(2 * GRAV * (game.jump * 12));
      const respawn = () => { pl.x = home.x; pl.y = home.y; pl.vx = pl.vy = 0; deaths++; };
      const overlaps = (ax, ay, aw, ah) => {
        const hits = [];
        for (let y = Math.floor(ay / T); y <= Math.floor((ay + ah - 1) / T); y++) for (let x = Math.floor(ax / T); x <= Math.floor((ax + aw - 1) / T); x++) hits.push([x, y, at(x * T, y * T)]);
        return hits;
      };
      ctx.loop(dt => {
        time += over ? 0 : dt;
        if (over) return;
        const k = ctx.keys;
        const dir = (k.has('ArrowRight') || k.has('d') ? 1 : 0) - (k.has('ArrowLeft') || k.has('a') ? 1 : 0);
        pl.vx = dir * 190;
        if ((k.has(' ') || k.has('ArrowUp') || k.has('w')) && pl.ground) { pl.vy = -JUMP; pl.ground = false; }
        if (k.has('r')) { respawn(); deaths--; }
        pl.vy = Math.min(pl.vy + GRAV * dt, 650);
        pl.x += pl.vx * dt;
        for (const [x, , v] of overlaps(pl.x, pl.y, pl.w, pl.h)) if (SOLID(v)) { pl.x = pl.vx > 0 ? x * T - pl.w : (x + 1) * T; pl.vx = 0; break; }
        pl.y += pl.vy * dt; pl.ground = false;
        for (const [, y, v] of overlaps(pl.x, pl.y, pl.w, pl.h)) if (SOLID(v)) {
          if (pl.vy > 0) { pl.y = y * T - pl.h; pl.ground = true; } else pl.y = (y + 1) * T;
          pl.vy = 0; break;
        }
        if (pl.y > ROWS * T) respawn();
        for (const [x, y, v] of overlaps(pl.x, pl.y, pl.w, pl.h)) {
          if (v === 3) { respawn(); break; }
          if (v === 4) { tiles[y * COLS + x] = 0; coins++; }
          if (v === 8 && pl.vy >= 0) { pl.vy = -JUMP * 1.5; }
          if (v === 5) {
            over = true;
            ctx.score(1);
            ctx.message(`You beat ${game.name}!`, `${time.toFixed(1)} seconds, ${coins}/${total} coins, ${deaths} deaths.`, [{ label: 'Back', fn: back }]);
          }
        }
        for (const e of enemies) {
          if (!e.alive) continue;
          e.x += e.dir * 60 * dt;
          const ahead = e.dir > 0 ? e.x + 20 : e.x;
          if (SOLID(at(ahead, e.y + 10)) || !SOLID(at(ahead, e.y + 24))) e.dir *= -1;
          if (pl.x < e.x + 20 && pl.x + pl.w > e.x && pl.y < e.y + 20 && pl.y + pl.h > e.y) {
            if (pl.vy > 0 && pl.y + pl.h < e.y + 12) { e.alive = false; pl.vy = -JUMP * .6; } else respawn();
          }
        }
        g.fillStyle = game.sky; g.fillRect(0, 0, c.width, c.height);
        tiles.forEach((v, i) => { if (v !== 6) drawTile(g, v, i % COLS, Math.floor(i / COLS)); });
        for (const e of enemies) if (e.alive) { g.fillStyle = '#a55eea'; g.fillRect(e.x, e.y, 20, 20); g.fillStyle = '#fff'; g.fillRect(e.x + 4, e.y + 5, 4, 4); g.fillRect(e.x + 12, e.y + 5, 4, 4); }
        g.fillStyle = '#ff5d8f'; g.fillRect(pl.x, pl.y, pl.w, pl.h);
        g.fillStyle = '#fff'; g.fillRect(pl.x + (dir < 0 ? 2 : 9), pl.y + 5, 5, 5);
        hud.replaceChildren(el('span', {}, game.name), el('span', {}, '🪙 ', el('b', {}, `${coins}/${total}`)), el('span', {}, '💀 ', el('b', {}, deaths)), el('button', { class: 'btn alt small', onclick: back }, 'Exit'));
      });
    }
  },
});
