// Snake: the host (or the only player) runs the board; online clients just send turns.
App.register({
  id: 'snake', name: 'Snake & Apple', icon: '🍎', online: true,
  desc: 'Eat apples and grow. Solo, same keyboard, or online.',
  mount(ctx) {
    const W = 32, H = 22, S = 24, COLS = ['#3fe0c5', '#ffd23f', '#ff5d8f', '#8fa8ff', '#b4f461', '#ff9f43', '#e2a6ff', '#fff'];
    ctx.lobby({ intro: 'Crash into a wall or another snake and you are out.', start: (room, seed) => play(room, seed, false),
      extra: [{ label: '2 players, same keyboard', fn: () => play(null, Math.floor(Math.random() * 1e9), true) }] });

    function play(room, seed, local) {
      ctx.clear();
      const c = ctx.canvas(W * S, H * S), g = c.getContext('2d'), hud = ctx.hud();
      ctx.help(local ? 'Player 1: arrow keys. Player 2: WASD.' : 'Arrow keys or WASD. On a phone, swipe or use the buttons.');
      ctx.touch([['←', 'ArrowLeft'], ['↑', 'ArrowUp'], ['↓', 'ArrowDown'], ['→', 'ArrowRight']]);
      const players = room ? room.players : local ? [{ id: 'a', name: 'Player 1' }, { id: 'b', name: 'Player 2' }] : [{ id: 'a', name: ctx.user.name }];
      const r = rng(seed), isHost = !room || room.isHost;
      const myId = room ? room.me : 'a';
      const spawn = (p, i) => {
        const y = 3 + (i * 5) % (H - 6), left = i % 2 === 0, x = left ? 5 : W - 6, d = left ? [1, 0] : [-1, 0];
        return { id: p.id, name: p.name, col: COLS[i % 8], body: [[x, y], [x - d[0], y], [x - 2 * d[0], y]], d, next: d, alive: true, score: 0 };
      };
      let state = { snakes: players.map(spawn), apples: [] }, done = false;
      const free = () => {
        for (;;) {
          const a = [Math.floor(r() * W), Math.floor(r() * H)];
          if (!state.snakes.some(s => s.body.some(b => b[0] === a[0] && b[1] === a[1]))) return a;
        }
      };
      const appleCount = Math.max(2, players.length + 1);
      while (state.apples.length < appleCount) state.apples.push(free());

      const turn = (id, d) => {
        const s = state.snakes.find(x => x.id === id);
        if (s && !(s.d[0] === -d[0] && s.d[1] === -d[1])) s.next = d;
      };
      const send = d => (room && !room.isHost ? room.send({ t: 'turn', d }) : turn(myId, d));
      const DIRS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
      ctx.on(window, 'keydown', e => {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key, d = DIRS[k];
        if (!d) return;
        if (local) turn(k.length === 1 ? 'b' : 'a', d); else send(d);
      });
      let sw = null;
      ctx.on(c, 'pointerdown', e => { sw = [e.clientX, e.clientY]; });
      ctx.on(c, 'pointerup', e => {
        if (!sw) return;
        const dx = e.clientX - sw[0], dy = e.clientY - sw[1];
        if (Math.hypot(dx, dy) > 20) send(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]);
      });
      if (room) ctx.add(room.onMessage((d, from) => {
        if (d.t === 'turn' && isHost) turn(from, d.d);
        if (d.t === 'left' && isHost) { const s = state.snakes.find(x => x.id === from); if (s) s.alive = false; }
        if (d.t === 'state' && !isHost) { state = d.s; draw(); if (d.s.over) finish(); }
      }));

      function step() {
        const live = state.snakes.filter(s => s.alive);
        const heads = live.map(s => { s.d = s.next; return [s.body[0][0] + s.d[0], s.body[0][1] + s.d[1]]; });
        live.forEach((s, i) => {
          const h = heads[i], ai = state.apples.findIndex(a => a[0] === h[0] && a[1] === h[1]);
          s.body.unshift(h);
          if (ai >= 0) { s.score++; state.apples[ai] = null; } else s.body.pop();
        });
        live.forEach((s, i) => {
          const [x, y] = heads[i];
          const hit = x < 0 || y < 0 || x >= W || y >= H || state.snakes.some(o => o.alive && o.body.some((b, n) => (o !== s || n > 0) && b[0] === x && b[1] === y));
          if (hit) s.dead = true;
        });
        live.forEach(s => { if (s.dead) { s.alive = false; delete s.dead; } });
        state.apples = state.apples.map(a => a || free());
        const left = state.snakes.filter(s => s.alive).length;
        state.over = players.length > 1 ? left <= 1 : left === 0;
        if (room) room.send({ t: 'state', s: state });
        draw();
        if (state.over) finish();
      }
      function draw() {
        g.fillStyle = '#10301f'; g.fillRect(0, 0, c.width, c.height);
        g.fillStyle = '#143a26';
        for (let y = 0; y < H; y++) for (let x = (y % 2); x < W; x += 2) g.fillRect(x * S, y * S, S, S);
        g.font = S - 2 + 'px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        for (const a of state.apples) g.fillText('🍎', a[0] * S + S / 2, a[1] * S + S / 2 + 1);
        for (const s of state.snakes) {
          g.globalAlpha = s.alive ? 1 : .25;
          g.fillStyle = s.col;
          s.body.forEach((b, i) => { const m = i ? 2 : 0; g.fillRect(b[0] * S + m, b[1] * S + m, S - 2 * m, S - 2 * m); });
          g.fillStyle = '#000';
          const [hx, hy] = s.body[0];
          g.fillRect(hx * S + 6, hy * S + 7, 4, 4); g.fillRect(hx * S + 14, hy * S + 7, 4, 4);
          g.globalAlpha = 1;
        }
        hud.replaceChildren(...state.snakes.map(s => el('span', { style: 'color:' + s.col }, `${s.name}: ${s.score}${s.alive ? '' : ' 💀'}`)));
      }
      function finish() {
        if (done) return;
        done = true;
        const mine = state.snakes.find(s => s.id === myId);
        const nb = !local && ctx.score(mine.score);
        const best = state.snakes.filter(s => s.alive)[0];
        const title = players.length === 1 ? 'Game over' : best ? `${best.name} wins!` : 'Draw!';
        ctx.message(title, `${mine.name}: ${mine.score} apples.${nb ? ' New best!' : ''}`, room
          ? [{ label: 'Back to menu', fn: ctx.restart }]
          : [{ label: 'Play again', fn: () => play(null, Math.floor(Math.random() * 1e9), local) }, { label: 'Menu', fn: ctx.restart }]);
      }
      draw();
      if (isHost) ctx.every(110, () => { if (!done) step(); });
    }
  },
});
