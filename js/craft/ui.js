// BlockCraft interface: title and world screens, options, HUD, inventories and touch controls.
const CraftUI = (() => {
  const D = CraftData, { items: ITEMS, I, TABS } = D;
  const SPLASHES = ['Now with extra cubes!', 'Punch trees responsibly!', 'Ships zero image files!', 'Every texture is code!', 'Painted pixel by pixel!', 'Also try Snake & Apple!', 'Beware the Blastcap!', 'Mushrooms with attitude!', 'Fresh chunks daily!', 'Worlds without end!', 'Free as in free!', 'Runs in a browser tab!', 'Sixteen blocks wide!', '20 ticks a second!', 'Sleep through the storm!', 'Wear your boots!', 'Bring a torch!', 'Diamonds are down deep!', 'Seeds are forever!', 'Do not dig straight down!', 'Made by Ackp!', 'Lava is not a bath!', 'Sheep come in five shades!'];
  const MODE_TEXT = {
    survival: 'Gather resources, craft tools, gain levels and keep yourself fed and alive.',
    hardcore: 'Survival on the hardest difficulty, with only one life.',
    creative: 'Unlimited blocks, free flight and instant mining.',
    adventure: 'Explore, fight and loot chests. Blocks cannot be broken or placed.',
  };
  const DIFF_TEXT = { peaceful: 'No hostile creatures. Health and hunger refill on their own.', easy: 'Hostile creatures appear but deal less damage.', normal: 'Hostile creatures deal standard damage.', hard: 'Hostile creatures deal more damage and starving can kill you.' };
  const TYPE_TEXT = { default: 'Standard terrain with oceans, mountains, caves and biomes.', flat: 'A completely flat grass world.', large: 'Standard terrain with biomes four times the size.', amplified: 'Mountains twice as high. Slower to explore.' };
  const TYPE_NAME = { default: 'Default', flat: 'Superflat', large: 'Large Biomes', amplified: 'Amplified' };
  const cap = s => s[0].toUpperCase() + s.slice(1);
  const hashSeed = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h; };

  function create(G) {
    const { layer, opt, audio } = G;
    const hud = el('div', { class: 'bc-hud', style: 'display:none' }), screens = el('div', { class: 'bc-screens' });
    const fx = el('div', { class: 'bc-fx' });
    layer.append(fx, hud, screens);
    let current = null, containerOpen = false, hudVisible = true, debugOn = false;
    const R = G.R;

    // ---------- Layout ----------
    const fit = () => {
      const w = layer.clientWidth || innerWidth, h = layer.clientHeight || innerHeight;
      // Phones get the largest scale where the hotbar and inventories still fit.
      const auto = Math.max(1, Math.floor(G.coarse() ? Math.min(w / 182, h / 170) : Math.min(w / 320, h / 240)));
      G.root.style.setProperty('--u', (opt.gui ? Math.min(opt.gui, auto) : auto) + 'px');
    };
    G.root.style.setProperty('--tile', `url(${CraftTex.menuTile(.72)})`);
    G.root.style.setProperty('--tile2', `url(${CraftTex.menuTile(.52)})`);
    G.root.style.setProperty('--stone', `url(${CraftTex.buttonTile()})`);
    fit();

    const show = node => { hide(); current = node; screens.append(node); return node; };
    const hide = () => { if (current) { current.remove(); current = null; } containerOpen = false; };
    const button = (text, fn, cls = '') => el('button', { class: 'bc-btn ' + cls, onclick: e => { e.preventDefault(); fn(e); } }, text);
    const heading = t => el('h2', { class: 'bc-h' }, t);
    const dimScreen = (...kids) => el('div', { class: 'bc-screen bc-dim' }, ...kids);
    const dirtScreen = (...kids) => el('div', { class: 'bc-screen bc-dirt' }, ...kids);
    const row = (...kids) => el('div', { class: 'bc-row' }, ...kids);
    const cycle = (label, values, get, set, names, onChange) => {
      const b = el('button', { class: 'bc-btn' });
      const paint = () => { const v = get(); b.textContent = `${label}: ${names ? names(v) : cap(String(v))}`; };
      b.onclick = e => {
        const i = values.indexOf(get()), n = (i + (e.shiftKey ? values.length - 1 : 1)) % values.length;
        set(values[n]); paint();
        if (onChange) onChange();
      };
      paint();
      return b;
    };
    const slider = (label, min, max, step, get, set, fmt2) => {
      const t = el('span', { class: 'bc-sliderlabel' }), i = el('input', { type: 'range', min, max, step, value: get(), class: 'bc-slider', 'aria-label': label });
      const paint = () => { t.textContent = `${label}: ${fmt2 ? fmt2(+i.value) : i.value}`; };
      i.oninput = () => { set(+i.value); paint(); };
      paint();
      return el('label', { class: 'bc-sliderbox' }, i, t);
    };
    const onOff = (label, key, after) => cycle(label, [true, false], () => opt[key], v => { opt[key] = v; G.applyOptions(); if (after) after(); }, v => (v ? 'ON' : 'OFF'));

    // ---------- Title ----------
    const LETTERS = {
      B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'], L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'], O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
      C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'], K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'], R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
      A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'], T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    };
    const logo = () => {
      // Letters stacked from turf down through dirt into stone, cut from the game's own block art.
      const word = 'BLOCKCRAFT', S2 = 8, W = word.length * 6 * S2, H = 8 * S2 + 8, c = CraftTex.canvas2(W + 10, H + 10), g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      const faces = [CraftTex.tileCanvas('grass_top', [116, 186, 74]), CraftTex.tileCanvas('dirt'), CraftTex.tileCanvas('stone')];
      const drawLayer = (ox, oy, shade) => word.split('').forEach((ch, i) => LETTERS[ch].forEach((r, y) => [...r].forEach((p, x) => {
        if (p !== '#') return;
        const px = i * 6 * S2 + x * S2 + ox, py = y * S2 + oy;
        if (shade) { g.fillStyle = shade; g.fillRect(px, py, S2, S2); return; }
        const t = y === 0 ? faces[0] : y < 3 ? faces[1] : faces[2];
        g.drawImage(t, (x * 3 + i * 5) % 8, (y * 5) % 8, 8, 8, px, py, S2, S2);
        g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(px, py, S2, 1); g.fillRect(px, py, 1, S2);
        g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(px, py + S2 - 1, S2, 1); g.fillRect(px + S2 - 1, py, 1, S2);
      })));
      for (let d = 8; d > 0; d--) drawLayer(d, d, d > 7 ? '#000' : '#1c1c1c');
      drawLayer(0, 0, null);
      c.className = 'bc-logo';
      return c;
    };
    const title = () => {
      G.ready = false;
      hud.style.display = 'none';
      G.paused = false;
      const splash = el('div', { class: 'bc-splash' }, SPLASHES[Math.floor(Math.random() * SPLASHES.length)]);
      const head = el('div', { class: 'bc-logobox' }, logo(), splash);
      show(el('div', { class: 'bc-screen bc-title' }, head,
        el('div', { class: 'bc-menu' },
          button('Singleplayer', () => singleplayer()),
          button('Multiplayer', () => multiplayer()),
          row(button('Options...', () => options(title)), button('Quit Game', () => { location.hash = '#/'; }))),
        el('div', { class: 'bc-foot' }, el('span', {}, 'BlockCraft ' + G.VERSION), el('span', {}, 'Free fan-made game. Not affiliated with Mojang or Microsoft.'))));
      startMusicOnGesture();
    };
    let musicStarted = false;
    const startMusicOnGesture = () => {
      if (musicStarted) return;
      const go = () => { if (!musicStarted) { musicStarted = true; audio.startMusic(6, 22); } };
      G.ctx.on(window, 'pointerdown', go, { once: true });
      G.ctx.on(window, 'keydown', go, { once: true });
    };

    // ---------- Worlds ----------
    const singleplayer = async () => {
      const listEl = el('div', { class: 'bc-list', role: 'listbox', tabIndex: 0 });
      let worlds = [], picked = null, filter = '';
      const play = button('Play Selected World', () => picked && launch(picked)), edit = button('Edit', () => picked && editWorld(picked)), del = button('Delete', () => picked && confirmDelete(picked)), recreate = button('Re-Create', () => picked && createWorld({ from: picked }));
      const buttons = [play, edit, del, recreate];
      const paint = () => {
        buttons.forEach(b => { b.disabled = !picked; });
        const list = worlds.filter(w => w.name.toLowerCase().includes(filter));
        listEl.replaceChildren(...list.map(w => {
          const mode = w.hardcore ? 'Hardcore' : cap(w.mode);
          const when = new Date(w.played).toLocaleString();
          const r = el('div', { class: 'bc-world' + (picked === w ? ' on' : ''), role: 'option', onclick: () => { picked = w; paint(); }, ondblclick: () => launch(w) },
            w.thumb ? el('img', { src: w.thumb, alt: '', class: 'bc-thumb' }) : el('div', { class: 'bc-thumb bc-nothumb' }),
            el('div', {}, el('b', {}, w.name), el('small', {}, `${when}`), el('small', {}, `${mode} Mode${w.commands ? ', Commands' : ''}, ${TYPE_NAME[w.type] || 'Default'}`)));
          return r;
        }));
        if (!list.length) listEl.append(el('p', { class: 'bc-empty' }, worlds.length ? 'No worlds match that search.' : 'No worlds yet. Create your first one below.'));
      };
      const search = el('input', { class: 'bc-input', placeholder: 'Search for worlds', 'aria-label': 'Search for worlds', oninput: e => { filter = e.target.value.toLowerCase(); paint(); } });
      show(dirtScreen(heading('Select World'), el('div', { class: 'bc-search' }, search), listEl,
        el('div', { class: 'bc-actions' },
          row(play, button('Create New World', () => createWorld())),
          row(edit, del, recreate, button('Cancel', title)))));
      worlds = await CraftDB.worlds(G.ctx.user.key);
      paint();
    };
    const launch = async w => {
      const fresh = await CraftDB.world(w.id);
      if (fresh && fresh.hardcore && fresh.hardcoreDead) { fresh.mode = 'spectator'; }
      G.enter(fresh || w);
    };
    const confirmDelete = w => show(dirtScreen(
      el('p', { class: 'bc-msg' }, 'Are you sure you want to delete this world?'), el('p', { class: 'bc-msg dim' }, `"${w.name}" will be lost forever!`),
      el('div', { class: 'bc-actions' }, row(button('Delete', async () => { await CraftDB.deleteWorld(w.id); singleplayer(); }), button('Cancel', singleplayer)))));
    const editWorld = w => {
      const name = el('input', { class: 'bc-input', value: w.name, maxLength: 32, 'aria-label': 'World Name' });
      show(dirtScreen(heading('Edit World'), el('div', { class: 'bc-form' }, el('label', { class: 'bc-label' }, 'World Name', name),
        el('p', { class: 'bc-note' }, `Seed: ${w.seedText}`), el('p', { class: 'bc-note' }, `Created ${new Date(w.created).toLocaleDateString()}`)),
        el('div', { class: 'bc-actions' }, row(button('Save', async () => { w.name = name.value.trim() || w.name; await CraftDB.putWorld(w); singleplayer(); }), button('Cancel', singleplayer)))));
      name.focus();
    };
    const createWorld = (o = {}) => {
      const from = o.from;
      const s = {
        name: from ? from.name + ' Copy' : 'New World', mode: from ? (from.hardcore ? 'hardcore' : from.mode) : 'survival', difficulty: from ? from.difficulty : 'normal', commands: from ? from.commands : false,
        type: from ? from.type : 'default', seed: from ? from.seedText : '', structures: from ? from.structures : true, bonus: from ? from.bonus : false, rules: from ? { ...from.rules } : { ...G.RULES }, commandsTouched: !!from,
      };
      const body = el('div', { class: 'bc-tabbody' });
      let tab = 'Game';
      const tabBar = el('div', { class: 'bc-tabs', role: 'tablist' });
      const paintTabs = () => tabBar.replaceChildren(...['Game', 'World', 'More'].map(t => el('button', { class: 'bc-tab' + (t === tab ? ' on' : ''), role: 'tab', onclick: () => { tab = t; paintTabs(); paint(); } }, t)));
      const note = () => el('p', { class: 'bc-note' });
      const paint = () => {
        if (tab === 'Game') {
          const name = el('input', { class: 'bc-input', value: s.name, maxLength: 32, 'aria-label': 'World Name', oninput: e => { s.name = e.target.value; } });
          const modeNote = note(), diffNote = note();
          const diffBtn = cycle('Difficulty', ['peaceful', 'easy', 'normal', 'hard'], () => (s.mode === 'hardcore' ? 'hard' : s.difficulty), v => { if (s.mode !== 'hardcore') s.difficulty = v; }, null, () => { diffNote.textContent = DIFF_TEXT[s.mode === 'hardcore' ? 'hard' : s.difficulty]; });
          const cmdBtn = cycle('Allow Commands', [true, false], () => s.commands, v => { s.commands = v; s.commandsTouched = true; }, v => (v ? 'ON' : 'OFF'));
          const modeBtn = cycle('Game Mode', ['survival', 'hardcore', 'creative', 'adventure'], () => s.mode, v => {
            s.mode = v;
            if (!s.commandsTouched) s.commands = v === 'creative';
          }, null, () => {
            modeNote.textContent = MODE_TEXT[s.mode];
            diffBtn.disabled = s.mode === 'hardcore';
            cmdBtn.disabled = s.mode === 'hardcore';
            if (s.mode === 'hardcore') s.commands = false;
            cmdBtn.textContent = `Allow Commands: ${s.commands ? 'ON' : 'OFF'}`;
            diffBtn.textContent = `Difficulty: ${cap(s.mode === 'hardcore' ? 'hard' : s.difficulty)}`;
            diffNote.textContent = DIFF_TEXT[s.mode === 'hardcore' ? 'hard' : s.difficulty];
          });
          modeNote.textContent = MODE_TEXT[s.mode];
          diffNote.textContent = DIFF_TEXT[s.mode === 'hardcore' ? 'hard' : s.difficulty];
          diffBtn.disabled = cmdBtn.disabled = s.mode === 'hardcore';
          body.replaceChildren(el('label', { class: 'bc-label' }, 'World Name', name), modeBtn, modeNote, diffBtn, diffNote, cmdBtn, el('p', { class: 'bc-note' }, 'Commands let you use /gamemode, /tp, /time, /give and more.'));
        } else if (tab === 'World') {
          const typeNote = note();
          typeNote.textContent = TYPE_TEXT[s.type];
          const seed = el('input', { class: 'bc-input', value: s.seed, placeholder: 'Leave blank for a random seed', maxLength: 32, 'aria-label': 'Seed for the world generator', oninput: e => { s.seed = e.target.value; } });
          body.replaceChildren(
            cycle('World Type', ['default', 'flat', 'large', 'amplified'], () => s.type, v => { s.type = v; }, v => TYPE_NAME[v], () => { typeNote.textContent = TYPE_TEXT[s.type]; }), typeNote,
            el('label', { class: 'bc-label' }, 'Seed for the World Generator', seed),
            cycle('Generate Structures', [true, false], () => s.structures, v => { s.structures = v; }, v => (v ? 'ON' : 'OFF')), el('p', { class: 'bc-note' }, 'Villages, temples, watchtowers and dungeons.'),
            cycle('Bonus Chest', [true, false], () => s.bonus, v => { s.bonus = v; }, v => (v ? 'ON' : 'OFF')));
        } else {
          const NAMES = { keepInventory: 'Keep Inventory After Death', doDaylightCycle: 'Daylight Cycle', doMobSpawning: 'Mob Spawning', mobGriefing: 'Mob Griefing', naturalRegeneration: 'Natural Regeneration', doFireTick: 'Fire Spreads', showCoordinates: 'Show Coordinates' };
          const list = Object.keys(NAMES).map(k => cycle(NAMES[k], [true, false], () => s.rules[k], v => { s.rules[k] = v; }, v => (v ? 'ON' : 'OFF')));
          list.push(slider('Random Tick Speed', 0, 12, 1, () => s.rules.randomTickSpeed, v => { s.rules.randomTickSpeed = v; }));
          body.replaceChildren(el('p', { class: 'bc-note' }, 'Game rules for this world. You can change them later with /gamerule if commands are on.'), ...list);
        }
      };
      paintTabs(); paint();
      const go = async () => {
        const name = s.name.trim() || 'New World', text = s.seed.trim();
        let seed = text ? (/^-?\d+$/.test(text) ? (parseInt(text, 10) | 0) : hashSeed(text)) : Math.floor(Math.random() * 2147483647);
        if (!seed) seed = 1;
        const hardcore = s.mode === 'hardcore';
        const L = G.newLevel({ name, seed, seedText: text || String(seed), mode: hardcore ? 'survival' : s.mode, hardcore, difficulty: hardcore ? 'hard' : s.difficulty, commands: hardcore ? false : s.commands, type: s.type, structures: s.structures, bonus: s.bonus, rules: s.rules });
        await CraftDB.putWorld(L);
        G.enter(L);
      };
      show(dirtScreen(heading('Create New World'), tabBar, body, el('div', { class: 'bc-actions' }, row(button('Create New World', go), button('Cancel', singleplayer)))));
    };
    const multiplayer = () => {
      const code = el('input', { class: 'bc-input bc-code', maxLength: 5, placeholder: 'ROOM', autocapitalize: 'characters', 'aria-label': 'Room code' });
      const status = el('p', { class: 'bc-note', role: 'status' }, 'Ask a friend to open their world from the Game Menu, then type the room code they get.');
      const join = button('Join World', async () => {
        const c = code.value.trim().toUpperCase();
        if (!c) { status.textContent = 'Type a room code first.'; return; }
        join.disabled = true; status.textContent = 'Connecting...';
        try { await G.joinRoom(c); } catch (e) { status.textContent = e.message; join.disabled = false; if (G.net) { G.net.close(); G.net = null; } G.toTitle(); multiplayer(); }
      });
      show(dirtScreen(heading('Play with Friends'), el('div', { class: 'bc-form' }, el('label', { class: 'bc-label' }, 'Room Code', code), status), el('div', { class: 'bc-actions' }, row(join, button('Back', title)))));
      code.focus();
    };
    const message = (titleText, text) => show(dirtScreen(heading(titleText), el('p', { class: 'bc-msg' }, text), el('div', { class: 'bc-actions' }, row(button('Back to Title', title)))));

    // ---------- Options ----------
    const options = back => {
      show(dirtScreen(heading('Options'), el('div', { class: 'bc-grid2' },
        slider('FOV', 40, 110, 1, () => opt.fov, v => { opt.fov = v; G.saveOptions(); }, v => (v === 70 ? 'Normal' : v === 110 ? 'Quake Pro' : v)),
        button('Video Settings...', () => video(() => options(back))),
        button('Music & Sounds...', () => sounds(() => options(back))),
        button('Controls...', () => controls(() => options(back)))),
      el('div', { class: 'bc-actions' }, row(button('Done', back)))));
    };
    const video = back => {
      const needsReload = { rd: opt.render };
      show(dirtScreen(heading('Video Settings'), el('div', { class: 'bc-grid2' },
        slider('Render Distance', 2, 16, 1, () => opt.render, v => { opt.render = v; G.saveOptions(); }, v => v + ' chunks'),
        cycle('Graphics', [true, false], () => opt.fancy, v => { opt.fancy = v; G.applyOptions(); if (G.W) G.W.rebuildAll(); }, v => (v ? 'Fancy' : 'Fast')),
        onOff('Clouds', 'clouds'), onOff('View Bobbing', 'bob'), onOff('Swaying Plants', 'waves'),
        cycle('GUI Scale', [0, 1, 2, 3, 4], () => opt.gui, v => { opt.gui = v; G.applyOptions(); }, v => (v ? v : 'Auto')),
        cycle('Resolution', [1, .75, .5], () => opt.scale, v => { opt.scale = v; G.applyOptions(); }, v => Math.round(v * 100) + '%'),
        button('Toggle Fullscreen', () => { if (document.fullscreenElement) document.exitFullscreen(); else if (G.root.requestFullscreen) G.root.requestFullscreen().catch(() => {}); })),
      el('div', { class: 'bc-actions' }, row(button('Done', () => { if (needsReload.rd !== opt.render) G.applyOptions(); back(); })))));
    };
    const sounds = back => show(dirtScreen(heading('Music & Sound Options'), el('div', { class: 'bc-grid2' },
      slider('Sound Effects', 0, 100, 1, () => Math.round(opt.sound * 100), v => { opt.sound = v / 100; audio.volume = opt.sound; G.saveOptions(); }, v => (v ? v + '%' : 'OFF')),
      slider('Music', 0, 100, 1, () => Math.round(opt.music * 100), v => { opt.music = v / 100; audio.music = opt.music; G.saveOptions(); }, v => (v ? v + '%' : 'OFF'))),
    el('div', { class: 'bc-actions' }, row(button('Done', back)))));
    const KEY_NAMES = { forward: 'Walk Forward', back: 'Walk Backward', left: 'Strafe Left', right: 'Strafe Right', jump: 'Jump', sneak: 'Sneak', sprint: 'Sprint', inventory: 'Inventory', drop: 'Drop Item', chat: 'Open Chat', command: 'Open Command', perspective: 'Change Perspective', debug: 'Debug Screen', hud: 'Hide HUD', screenshot: 'Screenshot', players: 'List Players' };
    const keyLabel = c => c.replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Left Shift').replace('ShiftRight', 'Right Shift').replace('ControlLeft', 'Left Ctrl').replace('Slash', '/');
    const controls = back => {
      const list = el('div', { class: 'bc-list' });
      let waiting = null;
      const paint = () => list.replaceChildren(...Object.keys(KEY_NAMES).map(k => el('div', { class: 'bc-keyrow' }, el('span', {}, KEY_NAMES[k]), button(waiting === k ? '> Press a key <' : keyLabel(G.binds[k]), () => { waiting = k; paint(); }))));
      paint();
      const onKey = e => {
        if (!waiting) return;
        e.preventDefault(); e.stopPropagation();
        if (e.code !== 'Escape') G.binds[waiting] = e.code;
        waiting = null; G.saveKeys(); paint();
      };
      window.addEventListener('keydown', onKey, true);
      G.ctx.add(() => window.removeEventListener('keydown', onKey, true));
      const leave = () => { window.removeEventListener('keydown', onKey, true); back(); };
      show(dirtScreen(heading('Controls'), el('div', { class: 'bc-grid2' },
        slider('Mouse Sensitivity', 0, 100, 1, () => Math.round(opt.sens * 100), v => { opt.sens = v / 100; G.saveOptions(); }, v => v + '%'),
        onOff('Invert Mouse', 'invert')),
      el('p', { class: 'bc-note bc-mid' }, 'Sprint also works by double-tapping forward. Left Ctrl is avoided because Ctrl + W closes the browser tab.'), list,
      el('div', { class: 'bc-actions' }, row(button('Reset Keys', () => { Object.assign(G.binds, { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sneak: 'ShiftLeft', sprint: 'KeyR', inventory: 'KeyE', drop: 'KeyQ', chat: 'KeyT', command: 'Slash', perspective: 'F5', debug: 'F3', hud: 'F1', screenshot: 'F2', players: 'Tab' }); G.saveKeys(); paint(); }), button('Done', leave)))));
    };

    // ---------- Loading ----------
    let loadBar = null, loadPct = null;
    const loading = text => {
      loadBar = el('i');
      loadPct = el('span', { class: 'bc-pct' }, '0%');
      hud.style.display = 'none';
      show(dirtScreen(el('p', { class: 'bc-msg' }, text), el('div', { class: 'bc-loadbar' }, loadBar), loadPct));
    };
    const setLoading = k => { if (loadBar) { loadBar.style.width = Math.round(k * 100) + '%'; loadPct.textContent = Math.round(k * 100) + '%'; } };
    const closeLoading = () => { hide(); loadBar = null; };

    // ---------- Pause and death ----------
    const resume = () => { G.paused = false; hide(); G.capture(); };
    const pause = () => {
      G.paused = true;
      G.saveNow();
      const openBtn = G.net ? button('Room Code: ' + (G.net.room.code || ''), () => {}) : button('Open to Friends', async e => {
        e.target.disabled = true; e.target.textContent = 'Opening room...';
        try { const code = await G.openRoom(); e.target.textContent = 'Room Code: ' + code; chatLine(`Your world is open. Friends can join with room code ${code}.`); }
        catch (x) { e.target.disabled = false; e.target.textContent = 'Open to Friends'; chatLine(x.message); }
      });
      const left = G.level.remote ? 'Disconnect' : 'Save and Quit to Title';
      const panel = el('div', { class: 'bc-menu' }, button('Back to Game', resume),
        row(button('Stats...', () => stats()), openBtn),
        button('Options...', () => options(pause)),
        button(left, () => { G.paused = false; G.saveAndQuit(); }));
      show(dimScreen(heading('Game Menu'), panel));
    };
    const stats = () => {
      const L = G.level, p = G.player, done = Object.keys(L.done || {}).length;
      show(dimScreen(heading('World Stats'), el('div', { class: 'bc-form' },
        el('p', { class: 'bc-note' }, `World: ${L.name}`), el('p', { class: 'bc-note' }, `Seed: ${L.commands || !L.remote ? L.seedText : 'hidden'}`), el('p', { class: 'bc-note' }, `Mode: ${L.hardcore ? 'Hardcore' : cap(p.mode)}, Difficulty: ${cap(L.difficulty)}`), el('p', { class: 'bc-note' }, `Day ${Math.floor(L.time / 24000) + 1}, Level ${p.level}, Advancements ${done}/11`)),
      el('div', { class: 'bc-actions' }, row(button('Back', pause)))));
    };
    const death = (text, score) => {
      const L = G.level, hc = L.hardcore;
      if (hc) { L.hardcoreDead = true; }
      const btn = hc
        ? button('Spectate World', () => { G.player.dead = false; G.player.hp = 20; G.setMode('spectator'); L.mode = 'spectator'; hide(); G.capture(); })
        : button('Respawn', () => { hide(); G.respawn(); });
      show(el('div', { class: 'bc-screen bc-deadscreen' }, heading(hc ? 'Game Over!' : 'You Died!'), el('p', { class: 'bc-msg' }, `${G.ctx.user.name} ${text}`), hc ? el('p', { class: 'bc-msg dim' }, 'Hardcore worlds only allow one life.') : null, el('p', { class: 'bc-msg dim' }, `Score: ${score}`),
        el('div', { class: 'bc-menu' }, btn, button('Title Screen', () => G.saveAndQuit()))));
    };

    // ---------- HUD ----------
    const crosshair = el('div', { class: 'bc-cross' }), atkBar = el('div', { class: 'bc-atk' }, el('i'));
    const nameTag = el('div', { class: 'bc-itemname' }), actionEl = el('div', { class: 'bc-action' });
    const levelEl = el('div', { class: 'bc-level' });
    const statusCv = CraftTex.canvas2(182, 34);
    statusCv.className = 'bc-status';
    const slotEls = [];
    const hotbar = el('div', { class: 'bc-hotbar' });
    for (let i = 0; i < 9; i++) { const s = el('div', { class: 'bc-hslot', onpointerdown: e => { if (e.pointerType !== 'mouse') { G.player.sel = i; dirty(); itemName(); } } }, el('i', { class: 'ic' }), el('b', { class: 'cnt' }), el('u', { class: 'dur' })); slotEls.push(s); hotbar.append(s); }
    const bottom = el('div', { class: 'bc-bottom' }, nameTag, actionEl, levelEl, statusCv, hotbar);
    const chatBox = el('div', { class: 'bc-chat' });
    const debugEl = el('pre', { class: 'bc-debug', style: 'display:none' }), coordEl = el('div', { class: 'bc-coords' });
    const playerList = el('div', { class: 'bc-tablist', style: 'display:none' });
    const toasts = el('div', { class: 'bc-toasts' });
    const hint = el('div', { class: 'bc-hint' }, 'Click to capture the mouse');
    hud.append(crosshair, atkBar, bottom, chatBox, debugEl, coordEl, playerList, hint);
    layer.append(toasts);
    const vign = el('div', { class: 'bc-vignette' }), hurtEl = el('div', { class: 'bc-hurt' }), waterEl = el('div', { class: 'bc-under' }), fireEl = el('div', { class: 'bc-onfire' }), sleepEl = el('div', { class: 'bc-sleep' });
    fx.append(vign, waterEl, fireEl, hurtEl, sleepEl);
    const SPR = {
      heart: ['.##...##.', '#RR#.#RR#', '#RrRRRRR#', '#RRRRRRR#', '.#RRRRR#.', '..#RRR#..', '...#R#...', '....#....'],
      half: ['.##...##.', '#RR#.#..#', '#Rr#....#', '#RR#....#', '.#R#...#.', '..##..#..', '...##....', '....#....'],
      empty: ['.##...##.', '#..#.#..#', '#.......#', '#.......#', '.#.....#.', '..#...#..', '...#.#...', '....#....'],
      food: ['....##...', '...#BB#..', '..#BMM#..', '.#MMMMM#.', '#MMLMMM#.', '#MMMMM#..', '.#MMM#W..', '..###.WW.'],
      foodh: ['....##...', '...#..#..', '..#..M#..', '.#..MMM#.', '#...MMM#.', '#...MM#..', '.#..M#W..', '..###.WW.'],
      foode: ['....##...', '...#..#..', '..#...#..', '.#.....#.', '#......#.', '#.....#..', '.#...#...', '..###....'],
      armor: ['.##...##.', '#AA###AA#', '#AAAAAAA#', '.#AAAAA#.', '.#AAAAA#.', '.#AAAAA#.', '.#AAAAA#.', '..#####..'],
      armorh: ['.##...##.', '#AA##..#.', '#AAA#...#', '.#AA#..#.', '.#AA#..#.', '.#AA#..#.', '.#AA#..#.', '..#####..'],
      armore: ['.##...##.', '#..###..#', '#.......#', '.#.....#.', '.#.....#.', '.#.....#.', '.#.....#.', '..#####..'],
      air: ['..###....', '.#BWB#...', '#BWBBB#..', '#BBBBB#..', '#BBBBB#..', '.#BBB#...', '..###....', '.........'],
    };
    const COL = { '#': '#1a1a1a', R: '#d8232f', r: '#ffb0b0', B: '#e8d9b6', M: '#a8542d', L: '#d98d5c', W: '#d8d0c0', A: '#c9cdd2' };
    const drawSpr = (g, name, x, y, tint) => {
      SPR[name].forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = r[i]; if (c === '.') continue; g.fillStyle = c === '#' && tint ? tint : (name === 'air' && c === 'B' ? '#7ab7ff' : name === 'air' && c === 'W' ? '#fff' : COL[c]); g.fillRect(x + i, y + j, 1, 1); } });
    };
    let isDirty = true, hurtShow = 0, lastHp = 20, shakeT = 0;
    const dirty = () => { isDirty = true; };
    const paintSlot = (s, stack) => {
      const [ic, cnt, dur] = s.children;
      if (!stack) { if (ic.dataset.id) { ic.style.backgroundImage = ''; ic.dataset.id = ''; } cnt.textContent = ''; dur.style.display = 'none'; return; }
      if (ic.dataset.id !== String(stack.id)) { ic.style.backgroundImage = `url(${CraftTex.iconURL(stack.id)})`; ic.dataset.id = stack.id; }
      cnt.textContent = stack.count > 1 ? stack.count : '';
      const it = ITEMS[stack.id];
      if (it.dur && stack.dmg) {
        const k = Math.max(0, 1 - stack.dmg / it.dur);
        dur.style.display = 'block'; dur.style.setProperty('--k', k); dur.style.setProperty('--c', `hsl(${k * 120} 100% 45%)`);
      } else dur.style.display = 'none';
    };
    const drawHud = () => {
      const p = G.player;
      if (!p) return;
      slotEls.forEach((s, i) => { paintSlot(s, p.inv[i]); s.classList.toggle('on', i === p.sel); });
      const g = statusCv.getContext('2d');
      g.clearRect(0, 0, 182, 34);
      const m = p.mode, survival = m === 'survival' || m === 'adventure';
      const hideBars = !survival;
      statusCv.style.visibility = m === 'spectator' ? 'hidden' : 'visible';
      hotbar.style.visibility = m === 'spectator' ? 'hidden' : 'visible';
      // XP bar sits right on top of the hotbar.
      const need = p.level < 16 ? 2 * p.level + 7 : p.level < 31 ? 5 * p.level - 38 : 9 * p.level - 158, xpk = Math.min(1, p.xp / need);
      g.fillStyle = '#1a1a1a'; g.fillRect(0, 29, 182, 5);
      g.fillStyle = '#3a3a3a'; g.fillRect(1, 30, 180, 3);
      g.fillStyle = '#7fe02a'; g.fillRect(1, 30, Math.round(180 * xpk), 3);
      levelEl.textContent = p.level > 0 ? p.level : '';
      levelEl.style.display = p.level > 0 && m !== 'spectator' ? 'block' : 'none';
      if (!hideBars) {
        const hp = Math.ceil(p.hp), low = hp <= 4;
        const flash = hurtShow > 0 && Math.floor(hurtShow * 8) % 2 === 0 ? '#ffffff' : null;
        for (let i = 0; i < 10; i++) {
          const y = 18 + (low ? Math.round(Math.random() * 2 - 1) : 0), x = i * 8;
          drawSpr(g, 'empty', x, y, flash);
          if (hp >= i * 2 + 2) drawSpr(g, 'heart', x, y, flash);
          else if (hp === i * 2 + 1) drawSpr(g, 'half', x, y, flash);
        }
        for (let i = 0; i < 10; i++) {
          const x = 173 - i * 8, y = 18 + (p.sat <= 0 && G.tickCount % (p.food * 3 + 1) === 0 ? Math.round(Math.random() * 2 - 1) : 0);
          drawSpr(g, 'foode', x, y);
          if (p.food >= i * 2 + 2) drawSpr(g, 'food', x, y);
          else if (p.food === i * 2 + 1) drawSpr(g, 'foodh', x, y);
        }
        const pts = G.armorPts();
        if (pts > 0) for (let i = 0; i < 10; i++) {
          const x = i * 8;
          drawSpr(g, 'armore', x, 8);
          if (pts >= i * 2 + 2) drawSpr(g, 'armor', x, 8);
          else if (pts === i * 2 + 1) drawSpr(g, 'armorh', x, 8);
        }
        if (p.air < 300) {
          const full = Math.ceil((p.air - 2) * 10 / 300), part = Math.ceil(p.air * 10 / 300) - full;
          for (let i = 0; i < full + part; i++) drawSpr(g, 'air', 173 - i * 8, 8);
        }
      }
    };
    let nameT = 0, actT = 0;
    const itemName = () => {
      const s = G.player && G.held();
      nameTag.textContent = s ? ITEMS[s.id].name : '';
      nameT = s ? 2.2 : 0;
      nameTag.style.opacity = 1;
    };
    const action = t => { actionEl.textContent = t; actT = 3; actionEl.style.opacity = 1; };
    const chatLines = [];
    const chatLine = t => {
      const n = el('div', { class: 'bc-line' }, t);
      chatBox.append(n);
      chatLines.push({ n, t: 9 });
      while (chatLines.length > 40) chatLines.shift().n.remove();
    };
    const toast = (head, name, desc) => {
      const t = el('div', { class: 'bc-toast', title: desc, onanimationend: () => t.remove() }, el('b', {}, head), el('span', {}, name));
      toasts.append(t);
    };
    const flash = color => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const f = el('div', { class: 'flash', style: 'background:' + color, onanimationend: () => f.remove() });
      fx.append(f);
    };
    const hurtFlash = () => { hurtShow = .5; hurtEl.style.opacity = 1; isDirty = true; };
    const sleep = cb => {
      sleepEl.classList.add('on');
      setTimeout(() => { cb(); sleepEl.classList.remove('on'); }, 1800);
    };
    const players = on => {
      playerList.style.display = on && G.net ? 'block' : 'none';
      if (on && G.net) {
        const names = [G.ctx.user.name, ...[...G.net.others.values()].map(o => o.n || 'Player')];
        playerList.replaceChildren(el('b', {}, `Room ${G.net.room.code || ''}`), ...names.map(n => el('div', {}, n)));
      }
    };
    const FACE = ['south', 'west', 'north', 'east'];
    const debugText = () => {
      const p = G.player, W = G.W, s = W.stats(), L = G.level;
      const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z), l = W.lightAt(x, y + 1, z);
      const t = ((L.time % 24000) + 24000) % 24000, f = FACE[((Math.round(p.yaw / (Math.PI / 2)) % 4) + 4) % 4 === 0 ? 2 : ((Math.round(p.yaw / (Math.PI / 2)) % 4) + 4) % 4 === 1 ? 1 : ((Math.round(p.yaw / (Math.PI / 2)) % 4) + 4) % 4 === 2 ? 0 : 3];
      const target = G.target ? D.blocks[G.target.id].key : 'none';
      return [
        `BlockCraft ${G.VERSION}  ${G.fps || 0} fps  ${G.drawn || 0} sections`,
        `Chunks: ${s.chunks} loaded, ${s.pending} generating, ${s.queue} to mesh`,
        `Entities: ${G.entities.length}  Particles on`,
        '',
        `XYZ: ${p.x.toFixed(3)} / ${p.y.toFixed(3)} / ${p.z.toFixed(3)}`,
        `Block: ${x} ${y} ${z}  Chunk: ${x >> 4} ${z >> 4}`,
        `Facing: ${f}  Yaw ${(p.yaw * 57.3 % 360).toFixed(1)}  Pitch ${(p.pitch * 57.3).toFixed(1)}`,
        `Biome: ${G.biomeDef(x, z).name}`,
        `Light: ${Math.max(l & 15, (l >> 4) - G.skyDim())} (sky ${l >> 4}, block ${l & 15})`,
        `Day ${Math.floor(L.time / 24000) + 1}, time ${t}${L.rain ? ', raining' : ''}${L.thunder ? ', thunder' : ''}`,
        `Seed: ${L.seedText}`,
        `Looking at: ${target}`,
      ].join('\n');
    };
    let debugT = 0;
    const frame = dt => {
      if (!G.player) return;
      const p = G.player;
      if (hurtShow > 0) { hurtShow = Math.max(0, hurtShow - dt); hurtEl.style.opacity = hurtShow * 1.2; isDirty = true; }
      if (p.hp <= 4 && p.mode === 'survival') { shakeT += dt; if (shakeT > .15) { shakeT = 0; isDirty = true; } }
      if (isDirty) { drawHud(); isDirty = false; }
      if (nameT > 0) { nameT -= dt; if (nameT < .5) nameTag.style.opacity = Math.max(0, nameT * 2); }
      if (actT > 0) { actT -= dt; if (actT < .5) actionEl.style.opacity = Math.max(0, actT * 2); }
      const chatOpen = current && current.classList.contains('bc-chatinput');
      for (const c of chatLines) { c.t -= dt; c.n.style.opacity = chatOpen ? 1 : Math.max(0, Math.min(1, c.t)); }
      // Attack charge shows under the crosshair after a swing.
      const it = G.held() && ITEMS[G.held().id], rate = (it && it.rate) || 4, ch = Math.min(1, p.atk / (20 / rate));
      atkBar.style.display = ch < 1 && p.mode !== 'spectator' ? 'block' : 'none';
      atkBar.firstChild.style.width = ch * 100 + '%';
      const cam = R.camera.position, fluid = D.FLUID[G.W.get(Math.floor(cam.x), Math.floor(cam.y), Math.floor(cam.z))];
      waterEl.style.opacity = fluid === 1 ? 1 : 0;
      fireEl.style.display = p.fire > 0 && !G.cameraMode ? 'block' : 'none';
      vign.style.opacity = opt.fancy ? 1 : 0;
      hint.style.display = !G.coarse() && !G.locked() && !current && !p.dead ? 'block' : 'none';
      if (debugOn && (debugT -= dt) <= 0) { debugT = .2; debugEl.textContent = debugText(); }
      if (G.level.rules.showCoordinates && !debugOn) coordEl.textContent = `${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}`; else coordEl.textContent = '';
    };

    // ---------- Slots and containers ----------
    let cursor = null, cursorEl = null, tipEl = null, closeHook = null, activeBE = null, activePos = null, activeRefresh = null, drag = null;
    const stackMax = id => ITEMS[id].stack || 64;
    const same = (a, b) => a && b && a.id === b.id && !(a.dmg || b.dmg);
    const drawCursor = () => {
      if (!cursorEl) return;
      cursorEl.replaceChildren();
      if (!cursor) { cursorEl.style.display = 'none'; return; }
      cursorEl.style.display = 'block';
      const s = el('div', { class: 'bc-slotview' }, el('i', { class: 'ic' }), el('b', { class: 'cnt' }), el('u', { class: 'dur' }));
      paintSlot(s, cursor);
      cursorEl.append(s);
    };
    const moveCursor = e => { if (cursorEl) { cursorEl.style.left = e.clientX + 'px'; cursorEl.style.top = e.clientY + 'px'; } if (tipEl) { tipEl.style.left = e.clientX + 12 + 'px'; tipEl.style.top = e.clientY - 18 + 'px'; } };
    const tipFor = st => {
      if (!st) return '';
      const it = ITEMS[st.id];
      let t = it.name;
      if (it.dur) t += `\nDurability: ${it.dur - (st.dmg || 0)} / ${it.dur}`;
      if (it.pts) t += `\n+${it.pts} Armor`;
      if (it.food) t += `\nRestores ${it.food / 2} hunger`;
      if (it.tool && it.dmg) t += `\n${it.dmg} Attack Damage`;
      return t;
    };
    // A slot on screen bound to a model: { get, set, canPlace, output, take, creative }.
    const slot = model => {
      const n = el('div', { class: 'bc-slot' + (model.cls ? ' ' + model.cls : ''), oncontextmenu: e => e.preventDefault(),
        onpointerenter: () => {
          n.classList.add('hov');
          const st = model.get();
          if (tipEl) { tipEl.textContent = !cursor && st ? tipFor(st) : ''; tipEl.style.display = tipEl.textContent ? 'block' : 'none'; }
          if (drag && !model.output && !model.creative && !drag.list.includes(model)) { const st2 = model.get(); if ((!st2 || same(st2, cursor)) && (!model.canPlace || model.canPlace(cursor))) { drag.list.push(model); n.classList.add('drag'); drag.nodes.push(n); } }
        },
        onpointerleave: () => { n.classList.remove('hov'); if (tipEl) tipEl.style.display = 'none'; },
        onpointerdown: e => {
          e.preventDefault();
          const b = e.button;
          if (!model.output && !model.creative && cursor && !e.shiftKey && b !== 1) { drag = { b, list: [model], nodes: [n], cursor0: cursor.count }; n.classList.add('drag'); return; }
          clickSlot(model, b, e.shiftKey);
        },
      }, el('i', { class: 'ic' }), el('b', { class: 'cnt' }), el('u', { class: 'dur' }));
      n._model = model;
      refreshers.push(() => paintSlot(n, model.get()));
      return n;
    };
    let refreshers = [];
    const refresh = () => { refreshers.forEach(f => f()); drawCursor(); isDirty = true; };
    const finishDrag = () => {
      if (!drag) return;
      const d = drag;
      drag = null;
      d.nodes.forEach(n => n.classList.remove('drag'));
      if (d.list.length === 1) { clickSlot(d.list[0], d.b, false); return; }
      if (!cursor) return;
      const per = d.b === 0 ? Math.floor(cursor.count / d.list.length) : 1;
      if (per < 1) return;
      for (const m of d.list) {
        if (!cursor) break;
        const cur = m.get(), room = cur ? stackMax(cur.id) - cur.count : stackMax(cursor.id), n = Math.min(per, room, cursor.count);
        if (n <= 0) continue;
        if (cur) cur.count += n; else m.set({ id: cursor.id, count: n, dmg: cursor.dmg || 0 });
        cursor.count -= n;
        if (cursor.count <= 0) cursor = null;
        changed(m);
      }
      refresh();
    };
    const changed = m => { if (m && m.onChange) m.onChange(); };
    const clickSlot = (m, b, shift) => {
      const st = m.get();
      if (m.creative) {
        if (cursor && !m.keepCursor) { cursor = null; }
        else if (st) {
          if (shift) { G.give(st.id, stackMax(st.id)); }
          else cursor = { id: st.id, count: b === 2 ? 1 : stackMax(st.id), dmg: 0 };
        }
        refresh();
        return;
      }
      if (m.output) {
        if (!st) return;
        if (shift) {
          let guard = 0;
          while (m.get() && guard++ < 64) {
            const r = m.get();
            if (G.give(r.id, r.count, r.dmg || 0) > 0) break;
            m.take();
          }
        } else if (!cursor || (same(cursor, st) && cursor.count + st.count <= stackMax(st.id))) {
          cursor = cursor ? { ...cursor, count: cursor.count + st.count } : { ...st };
          m.take();
        }
        refresh();
        return;
      }
      if (shift) {
        if (st && m.quick) m.quick(st, m);
        refresh();
        return;
      }
      if (b === 0) {
        if (!cursor) { if (st) { cursor = st; m.set(null); } }
        else if (!st) { if (!m.canPlace || m.canPlace(cursor)) { m.set(cursor); cursor = null; } }
        else if (same(st, cursor)) {
          const n = Math.min(cursor.count, stackMax(st.id) - st.count);
          st.count += n; cursor.count -= n;
          if (cursor.count <= 0) cursor = null;
        } else if (!m.canPlace || m.canPlace(cursor)) { m.set(cursor); cursor = st; }
      } else if (b === 2) {
        if (!cursor) { if (st) { const n = Math.ceil(st.count / 2); cursor = { id: st.id, count: n, dmg: st.dmg || 0 }; st.count -= n; if (st.count <= 0) m.set(null); } }
        else if (!st) { if (!m.canPlace || m.canPlace(cursor)) { m.set({ id: cursor.id, count: 1, dmg: cursor.dmg || 0 }); cursor.count--; if (cursor.count <= 0) cursor = null; } }
        else if (same(st, cursor) && st.count < stackMax(st.id)) { st.count++; cursor.count--; if (cursor.count <= 0) cursor = null; }
      }
      changed(m);
      refresh();
    };
    const invSlot = (i, quick, extra = {}) => ({ get: () => G.player.inv[i], set: v => { G.player.inv[i] = v; }, quick: quick ? st => quick(st, i) : null, ...extra });
    const playerRows = quick => [
      el('div', { class: 'bc-slots', style: '--n:9' }, ...Array.from({ length: 27 }, (_, i) => slot(invSlot(i + 9, quick)))),
      el('div', { class: 'bc-slots hot', style: '--n:9' }, ...Array.from({ length: 9 }, (_, i) => slot(invSlot(i, quick)))),
    ];
    const giveRange = (st, from, to, set) => {
      // Merges a stack into a run of inventory slots, then fills the first free one.
      const inv = G.player.inv;
      for (let i = from; i < to && st.count > 0; i++) {
        const o = inv[i];
        if (same(o, st) && o.count < stackMax(o.id)) { const n = Math.min(st.count, stackMax(o.id) - o.count); o.count += n; st.count -= n; }
      }
      for (let i = from; i < to && st.count > 0; i++) if (!inv[i]) { inv[i] = { ...st }; st.count = 0; }
      if (st.count <= 0) set(null);
    };
    const quickInv = (st, i) => { const set = v => { G.player.inv[i] = v; }; if (i < 9) giveRange(st, 9, 36, set); else giveRange(st, 0, 9, set); };
    const openContainer = (panel, onClose, be, pos) => {
      G.release();
      refreshers = [];
      cursorEl = el('div', { class: 'bc-cursor' });
      tipEl = el('div', { class: 'bc-tip', style: 'display:none' });
      closeHook = onClose;
      activeBE = be || null; activePos = pos || null;
      const built = panel();
      const shell = el('div', { class: 'bc-screen bc-dim bc-cont', onpointermove: moveCursor, onpointerup: finishDrag,
        onpointerdown: e => {
          // Clicking outside the panel throws the held stack away.
          if (e.target === shell && cursor) {
            const n = e.button === 2 ? 1 : cursor.count;
            G.tossItem(cursor.id, n, cursor.dmg || 0);
            cursor.count -= n;
            if (cursor.count <= 0) cursor = null;
            refresh();
          }
        }, oncontextmenu: e => e.preventDefault() }, built, cursorEl, tipEl);
      show(shell);
      containerOpen = true;
      refresh();
    };
    const closeContainer = () => {
      if (closeHook) { closeHook(); closeHook = null; }
      if (cursor) { if (G.give(cursor.id, cursor.count, cursor.dmg || 0) > 0) G.tossItem(cursor.id, cursor.count, cursor.dmg || 0); cursor = null; }
      if (activeBE && activePos) G.beChanged(activeBE, activePos);
      if (activeBE && activeBE.type === 'chest' && activePos) audio.play('chest_close', G.fx.falloff(activePos[0], activePos[1], activePos[2]));
      activeBE = null; activePos = null; activeRefresh = null;
      refreshers = []; cursorEl = null; tipEl = null;
      hide();
      isDirty = true;
    };
    const closeScreen = () => { if (containerOpen) { closeContainer(); G.capture(); } else { hide(); G.capture(); } };
    // Crafting grid of w x h with an output slot, sharing logic between the inventory and the table.
    const craftGrid = (w, h, gridArr) => {
      const out = { recipe: null, get() { if (!this.recipe) return null; return { id: this.recipe.id, count: this.recipe.n, dmg: 0 }; }, set() {}, output: true };
      const update = () => { out.recipe = D.match(gridArr, w, h); };
      out.take = () => {
        G.hookCraft(out.recipe.id);
        for (let i = 0; i < gridArr.length; i++) {
          const s = gridArr[i];
          if (!s) continue;
          s.count--;
          const it = ITEMS[s.id];
          if (it.bucket && s.count <= 0) gridArr[i] = { id: I.bucket, count: 1, dmg: 0 };
          else if (s.count <= 0) gridArr[i] = null;
        }
        update();
        audio.play('pop', .35, 1.5);
      };
      const cells = gridArr.map((_, i) => slot({
        get: () => gridArr[i], set: v => { gridArr[i] = v; update(); }, onChange: update,
        quick: st => { const set = v => { gridArr[i] = v; update(); }; giveRange(st, 9, 36, set); if (st.count) giveRange(st, 0, 9, set); },
      }));
      update();
      return { out, cells, update };
    };
    const returnGrid = arr => arr.forEach((s, i) => { if (s) { if (G.give(s.id, s.count, s.dmg || 0) > 0) G.tossItem(s.id, s.count, s.dmg || 0); arr[i] = null; } });
    const avatar = () => {
      // A flat portrait of the player for the inventory screen.
      const c = CraftTex.canvas2(16, 32), g = c.getContext('2d');
      const p = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      p('#e8b58a', 4, 0, 8, 8); p('#2c1d12', 4, 0, 8, 2); p('#2c1d12', 4, 2, 1, 1); p('#2c1d12', 11, 2, 1, 1); p('#fff', 5, 4, 2, 1); p('#fff', 9, 4, 2, 1); p('#1f3f6a', 6, 4, 1, 1); p('#1f3f6a', 9, 4, 1, 1); p('#a86f4c', 7, 6, 2, 1);
      p('#d98a1f', 4, 8, 8, 12); p('#b56f14', 7, 8, 2, 3); p('#f4f1e8', 7, 11, 1, 3); p('#f4f1e8', 8, 11, 1, 3); p('#b56f14', 6, 16, 4, 3);
      p('#d98a1f', 0, 8, 4, 9); p('#d98a1f', 12, 8, 4, 9); p('#e8b58a', 0, 17, 4, 3); p('#e8b58a', 12, 17, 4, 3);
      p('#2e3440', 4, 20, 4, 12); p('#262b35', 8, 20, 4, 12);
      c.className = 'bc-avatar';
      return c;
    };
    // The recipe book lists what you can make right now from what you carry.
    const recipeBook = (w, h, grid, gridObj) => {
      const box = el('div', { class: 'bc-recipes' });
      const paint = () => {
        const p = G.player, have = new Map();
        for (const s of [...p.inv, ...grid]) if (s) have.set(s.id, (have.get(s.id) || 0) + s.count);
        const can = r => {
          if (r.w && (r.w > w || r.h > h)) return false;
          if (r.need && r.need.length > w * h) return false;
          const left = new Map(have), cells = r.need || r.grid.filter(Boolean);
          return cells.every(opts => { const id = opts.find(i => (left.get(i) || 0) > 0); if (id === undefined) return false; left.set(id, left.get(id) - 1); return true; });
        };
        const seen = new Set(), list = [];
        for (const r of D.recipes) if (!seen.has(r.id) && can(r)) { seen.add(r.id); list.push(r); }
        box.replaceChildren(el('p', { class: 'bc-note dark' }, list.length ? 'Craftable' : 'Nothing craftable yet'), el('div', { class: 'bc-reclist' }, ...list.map(r => el('button', { class: 'bc-rec', title: ITEMS[r.id].name, style: `background-image:url(${CraftTex.iconURL(r.id)})`, onclick: () => fill(r) }))));
      };
      const take = opts => {
        const inv = G.player.inv;
        for (let i = 0; i < 36; i++) if (inv[i] && opts.includes(inv[i].id)) { const id = inv[i].id; inv[i].count--; if (inv[i].count <= 0) inv[i] = null; return { id, count: 1, dmg: 0 }; }
        return null;
      };
      const fill = r => {
        returnGrid(grid);
        if (r.need) r.need.forEach((opts, i) => { grid[i] = take(opts); });
        else for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const c = r.grid[x + y * r.w]; if (c) grid[x + y * w] = take(c); }
        gridObj.update();
        refresh(); paint();
      };
      refreshers.push(() => {});
      paint();
      box.paint = paint;
      return box;
    };
    const openInventory = () => {
      if (G.mode() === 'creative') return creativeInventory();
      const grid = new Array(4).fill(null);
      openContainer(() => {
        const g = craftGrid(2, 2, grid);
        const armor = G.player.armor.map((_, i) => slot({ get: () => G.player.armor[i], set: v => { G.player.armor[i] = v; if (v) G.advance('armor'); }, canPlace: st => ITEMS[st.id].armor === i, cls: 'armor a' + i, quick: st => { const set = v => { G.player.armor[i] = v; }; giveRange(st, 9, 36, set); if (st.count) giveRange(st, 0, 9, set); } }));
        const quick = (st, i) => {
          const it = ITEMS[st.id], set = v => { G.player.inv[i] = v; };
          if (it.armor !== undefined && !G.player.armor[it.armor]) { G.player.armor[it.armor] = st; set(null); return; }
          if (i < 9) giveRange(st, 9, 36, set); else giveRange(st, 0, 9, set);
        };
        const book = recipeBook(2, 2, grid, g);
        let bookOn = false;
        const panelBody = el('div', { class: 'bc-panel' },
          el('div', { class: 'bc-invtop' }, el('div', { class: 'bc-armor' }, ...armor), el('div', { class: 'bc-avbox' }, avatar()),
            el('div', { class: 'bc-craftbox' }, el('span', { class: 'bc-cap' }, 'Crafting'), el('div', { class: 'bc-craftrow' }, el('div', { class: 'bc-slots', style: '--n:2' }, ...g.cells), el('div', { class: 'bc-arrow' }), slot(g.out)))),
          ...playerRows(quick));
        const wrap = el('div', { class: 'bc-withbook' }, panelBody);
        panelBody.prepend(el('button', { class: 'bc-bookbtn', title: 'Recipe Book', 'aria-label': 'Recipe Book', onclick: () => { bookOn = !bookOn; if (bookOn) { book.paint(); wrap.prepend(book); } else book.remove(); } }));
        return wrap;
      }, () => returnGrid(grid));
      return null;
    };
    const openCraft = () => {
      const grid = new Array(9).fill(null);
      openContainer(() => {
        const g = craftGrid(3, 3, grid);
        const book = recipeBook(3, 3, grid, g);
        let bookOn = false;
        const panelBody = el('div', { class: 'bc-panel' }, el('span', { class: 'bc-cap' }, 'Crafting'), el('div', { class: 'bc-craftrow big' }, el('div', { class: 'bc-slots', style: '--n:3' }, ...g.cells), el('div', { class: 'bc-arrow' }), slot({ ...g.out, get: g.out.get.bind(g.out), take: g.out.take, cls: 'big' })), el('span', { class: 'bc-cap' }, 'Inventory'), ...playerRows(quickInv));
        const wrap = el('div', { class: 'bc-withbook' }, panelBody);
        panelBody.prepend(el('button', { class: 'bc-bookbtn', title: 'Recipe Book', 'aria-label': 'Recipe Book', onclick: () => { bookOn = !bookOn; if (bookOn) { book.paint(); wrap.prepend(book); } else book.remove(); } }));
        return wrap;
      }, () => returnGrid(grid));
    };
    const openChest = (be, pos) => {
      const slots = G.chestSlots(be);
      openContainer(() => {
        const quickP = (st, i) => {
          const set = v => { G.player.inv[i] = v; };
          for (let k = 0; k < 27 && st.count > 0; k++) if (same(slots[k], st) && slots[k].count < stackMax(st.id)) { const n = Math.min(st.count, stackMax(st.id) - slots[k].count); slots[k].count += n; st.count -= n; }
          for (let k = 0; k < 27 && st.count > 0; k++) if (!slots[k]) { slots[k] = { ...st }; st.count = 0; }
          if (st.count <= 0) set(null);
        };
        const cells = slots.map((_, i) => slot({ get: () => slots[i], set: v => { slots[i] = v; }, quick: st => { const set = v => { slots[i] = v; }; giveRange(st, 0, 36, set); } }));
        return el('div', { class: 'bc-panel' }, el('span', { class: 'bc-cap' }, 'Chest'), el('div', { class: 'bc-slots', style: '--n:9' }, ...cells), el('span', { class: 'bc-cap' }, 'Inventory'), ...playerRows(quickP));
      }, null, be, pos);
    };
    const openFurnace = (be, pos) => {
      openContainer(() => {
        const s = be.slots;
        const flame = el('div', { class: 'bc-flame' }, el('i')), arrow = el('div', { class: 'bc-arrow prog' }, el('i'));
        activeRefresh = () => {
          flame.firstChild.style.height = (be.burnMax ? be.burn / be.burnMax * 100 : 0) + '%';
          arrow.firstChild.style.width = (be.cook / 200 * 100) + '%';
        };
        refreshers.push(activeRefresh);
        const quickP = (st, i) => {
          const set = v => { G.player.inv[i] = v; }, target = D.smelt[st.id] !== undefined ? 0 : ITEMS[st.id].fuel ? 1 : -1;
          if (target >= 0) {
            const cur = s[target];
            if (!cur) { s[target] = { ...st }; set(null); return; }
            if (same(cur, st) && cur.count < stackMax(st.id)) { const n = Math.min(st.count, stackMax(st.id) - cur.count); cur.count += n; st.count -= n; if (st.count <= 0) set(null); return; }
          }
          if (i < 9) giveRange(st, 9, 36, set); else giveRange(st, 0, 9, set);
        };
        const inv = st => { for (const k of [0, 1, 2]) if (s[k] === st) { s[k] = null; } };
        const a = slot({ get: () => s[0], set: v => { s[0] = v; }, quick: st => { const set = v => { s[0] = v; }; giveRange(st, 9, 36, set); if (st.count) giveRange(st, 0, 9, set); } });
        const f = slot({ get: () => s[1], set: v => { s[1] = v; }, canPlace: st => !!ITEMS[st.id].fuel, quick: st => { const set = v => { s[1] = v; }; giveRange(st, 9, 36, set); if (st.count) giveRange(st, 0, 9, set); } });
        const o = slot({ get: () => s[2], set: v => { s[2] = v; }, output: true, take: () => { s[2] = null; }, cls: 'big' });
        inv(null);
        return el('div', { class: 'bc-panel' }, el('span', { class: 'bc-cap' }, 'Furnace'), el('div', { class: 'bc-furn' }, el('div', { class: 'bc-furnleft' }, a, flame, f), arrow, o), el('span', { class: 'bc-cap' }, 'Inventory'), ...playerRows(quickP));
      }, null, be, pos);
    };
    const containerChanged = be => { if (be && be === activeBE) refresh(); };
    const creativeInventory = () => {
      const byTab = TABS.map(() => []);
      ITEMS.forEach(it => { if (it && it.tab !== undefined && !it.hidden) byTab[it.tab].push(it); });
      let tab = 0, query = '', survivalView = false;
      openContainer(() => {
        const hotQuick = (st, i) => { G.player.inv[i] = null; };
        const grid = el('div', { class: 'bc-slots creative', style: '--n:9' }), search = el('input', { class: 'bc-input bc-csearch', placeholder: 'Search...', 'aria-label': 'Search items', oninput: e => { query = e.target.value.toLowerCase(); paintGrid(); } });
        const tabs = el('div', { class: 'bc-ctabs' });
        const label = el('span', { class: 'bc-cap' });
        const area = el('div', { class: 'bc-carea' });
        const trash = slot({ get: () => null, set: () => {}, canPlace: () => true, creative: true, cls: 'trash' });
        const paintGrid = () => {
          const list = query ? ITEMS.filter(it => it && it.name.toLowerCase().includes(query)) : byTab[tab];
          const keep = refreshers.filter(f => !f.creative);
          refreshers = keep;
          grid.replaceChildren(...list.map(it => {
            const stack = { id: it.id, count: 1, dmg: 0 };
            const n = slot({ get: () => stack, set: () => {}, creative: true });
            refreshers[refreshers.length - 1].creative = true;
            return n;
          }));
          label.textContent = query ? 'Search Results' : TABS[tab];
          refresh();
        };
        const paintTabs = () => tabs.replaceChildren(...TABS.map((t, i) => el('button', { class: 'bc-ctab' + (i === tab && !survivalView ? ' on' : ''), title: t, 'aria-label': t, style: `background-image:url(${CraftTex.iconURL(byTab[i][0].id)})`, onclick: () => { tab = i; survivalView = false; query = ''; search.value = ''; paintTabs(); swap(); paintGrid(); } })),
          el('button', { class: 'bc-ctab' + (survivalView ? ' on' : ''), title: 'Inventory', 'aria-label': 'Inventory', style: `background-image:url(${CraftTex.iconURL(I.chest)})`, onclick: () => { survivalView = true; paintTabs(); swap(); } }));
        const armor = () => G.player.armor.map((_, i) => slot({ get: () => G.player.armor[i], set: v => { G.player.armor[i] = v; }, canPlace: st => ITEMS[st.id].armor === i, cls: 'armor a' + i }));
        const swap = () => {
          search.style.visibility = survivalView ? 'hidden' : 'visible';
          if (survivalView) { label.textContent = 'Inventory'; area.replaceChildren(el('div', { class: 'bc-invtop' }, el('div', { class: 'bc-armor' }, ...armor()), el('div', { class: 'bc-avbox' }, avatar())), playerRows(quickInv)[0]); }
          else area.replaceChildren(grid);
          refresh();
        };
        const hot = el('div', { class: 'bc-slots hot', style: '--n:9' }, ...Array.from({ length: 9 }, (_, i) => slot(invSlot(i, hotQuick))));
        paintTabs(); swap(); paintGrid();
        return el('div', { class: 'bc-panel creative' }, tabs, el('div', { class: 'bc-chead' }, label, search, trash), area, hot);
      }, null);
      return null;
    };

    // ---------- Chat ----------
    const openChat = prefill => {
      G.release();
      const input = el('input', { class: 'bc-chatfield', value: prefill, maxLength: 200, 'aria-label': 'Chat message', autocomplete: 'off',
        onkeydown: e => {
          if (e.code === 'Enter') {
            const v = input.value.trim();
            hide();
            if (v) {
              if (v[0] === '/') { chatLine(v); G.runCommand(v); }
              else { const line = `<${G.ctx.user.name}> ${v}`; chatLine(line); if (G.net) G.net.chat(line); }
            }
            G.capture();
          } else if (e.code === 'Escape') { hide(); G.capture(); }
          e.stopPropagation();
        } });
      show(el('div', { class: 'bc-screen bc-chatinput' }, input));
      setTimeout(() => input.focus(), 0);
    };
    const escape = () => {
      if (containerOpen) { closeScreen(); return; }
      if (!current) return;
      if (current.classList.contains('bc-chatinput')) { hide(); G.capture(); return; }
      if (G.player && !G.player.dead && G.ready) { resume(); return; }
      if (!G.ready && !current.classList.contains('bc-title')) title();
    };

    // ---------- Touch ----------
    if (G.coarse()) {
      G.touch = { stick: null, jump: false, sneak: false };
      const stick = el('div', { class: 'bc-stick' }, el('i'));
      const jumpBtn = el('button', { class: 'bc-tbtn', 'aria-label': 'Jump' }, '⤒');
      const sneakBtn = el('button', { class: 'bc-tbtn', 'aria-label': 'Sneak' }, '⇩');
      const invBtn = el('button', { class: 'bc-tbtn small', 'aria-label': 'Inventory', onclick: () => { if (G.ready && !current) openInventory(); } }, '▦');
      const pauseBtn = el('button', { class: 'bc-tbtn small', 'aria-label': 'Pause', onclick: () => { if (G.ready && !current) pause(); } }, '❚❚');
      const dropBtn = el('button', { class: 'bc-tbtn small', 'aria-label': 'Drop item', onclick: () => { if (G.ready && !current) G.dropHeld(false); } }, '⇣');
      const hold = (b, key) => { b.onpointerdown = e => { e.preventDefault(); G.touch[key] = true; if (key === 'jump') G.keyTapped = G.binds.jump; }; b.onpointerup = b.onpointercancel = b.onpointerleave = () => { G.touch[key] = false; }; };
      hold(jumpBtn, 'jump');
      sneakBtn.onclick = () => { G.touch.sneak = !G.touch.sneak; sneakBtn.classList.toggle('on', G.touch.sneak); };
      const pad = el('div', { class: 'bc-touch' }, stick, el('div', { class: 'bc-tright' }, sneakBtn, jumpBtn), el('div', { class: 'bc-ttop' }, dropBtn, invBtn, pauseBtn));
      hud.append(pad);
      let sid = null;
      stick.onpointerdown = e => { sid = e.pointerId; stick.setPointerCapture(sid); moveStick(e); };
      const moveStick = e => {
        const r = stick.getBoundingClientRect(), dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dz = (e.clientY - r.top - r.height / 2) / (r.height / 2), l = Math.hypot(dx, dz), k = l > 1 ? 1 / l : 1;
        G.touch.stick = [dx * k, -dz * k];
        stick.firstChild.style.transform = `translate(${dx * k * 50}%,${dz * k * 50}%)`;
      };
      stick.onpointermove = e => { if (e.pointerId === sid) moveStick(e); };
      stick.onpointerup = stick.onpointercancel = () => { sid = null; G.touch.stick = null; stick.firstChild.style.transform = ''; };
      // Drag the view to look. A tap uses, a press and hold mines or attacks.
      const canvas = R.canvas;
      let lookId = null, lx = 0, ly = 0, downAt = 0, moved = 0, holdTimer = null;
      canvas.style.touchAction = 'none';
      G.ctx.on(canvas, 'pointerdown', e => {
        if (e.pointerType === 'mouse' || lookId !== null || !G.ready || current) return;
        lookId = e.pointerId; lx = e.clientX; ly = e.clientY; downAt = performance.now(); moved = 0;
        holdTimer = setTimeout(() => { if (moved < 12) G.mouse.left = true; }, 260);
      });
      G.ctx.on(canvas, 'pointermove', e => {
        if (e.pointerId !== lookId) return;
        moved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly);
        G.look((e.clientX - lx) * 2.2, (e.clientY - ly) * 2.2);
        lx = e.clientX; ly = e.clientY;
      });
      const endLook = e => {
        if (e.pointerId !== lookId) return;
        lookId = null;
        clearTimeout(holdTimer);
        const quick = performance.now() - downAt < 260 && moved < 12;
        G.mouse.left = false;
        if (quick) { G.mouse.right = true; setTimeout(() => { G.mouse.right = false; }, 110); }
      };
      G.ctx.on(canvas, 'pointerup', endLook);
      G.ctx.on(canvas, 'pointercancel', endLook);
    }
    return {
      title, loading, setLoading, closeLoading, pause, death, frame, fit, dirty, flash, hurtFlash, toast, chatLine, action, itemName, sleep, players, message,
      openInventory, openCraft, openChest, openFurnace, containerChanged, openChat, escape,
      isOpen: () => !!current, isContainer: () => containerOpen, closeScreen,
      keyInGui() {},
      hudOn() { hud.style.display = 'block'; isDirty = true; itemName(); },
      hudHidden: () => !hudVisible,
      toggleHud() { hudVisible = !hudVisible; hud.style.visibility = hudVisible ? 'visible' : 'hidden'; },
      toggleDebug() { debugOn = !debugOn; debugEl.style.display = debugOn ? 'block' : 'none'; },
    };
  }
  return { create };
})();
