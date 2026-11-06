// Gem Mine Simulator: an idle clicker with buildings, hundreds of upgrades, achievements, golden gems and rebirths.
App.register({
  id: 'clicker', name: 'Gem Mine Simulator', icon: '💎', online: false,
  desc: 'Click gems, build a mining empire, chase golden gems and unlock hundreds of upgrades.',
  fmtBest: b => fmt(b) + ' gems',
  async mount(ctx) {
    await loadThree();
    if (!ctx.stage.isConnected) return;
    const SHOP = [
      { id: 'pick', name: 'Better Pickaxe', icon: '⛏️', base: 15, click: 1 },
      { id: 'miner', name: 'Miner', icon: '👷', base: 25, rate: 1 },
      { id: 'drill', name: 'Drill', icon: '🪛', base: 300, rate: 10 },
      { id: 'dig', name: 'Excavator', icon: '🚜', base: 4000, rate: 80 },
      { id: 'lab', name: 'Crystal Lab', icon: '🧪', base: 60000, rate: 600 },
      { id: 'moon', name: 'Moon Mine', icon: '🌙', base: 1e6, rate: 5000 },
      { id: 'star', name: 'Star Forge', icon: '⭐', base: 2e7, rate: 50000 },
      { id: 'mole', name: 'Robot Mole Swarm', icon: '🤖', base: 4e8, rate: 4e5 },
      { id: 'volcano', name: 'Volcano Tap', icon: '🌋', base: 8e9, rate: 3e6 },
      { id: 'magnet', name: 'Gem Magnet', icon: '🧲', base: 2e11, rate: 25e6 },
      { id: 'wizard', name: 'Gem Wizard Tower', icon: '🧙', base: 5e12, rate: 2e8 },
      { id: 'ocean', name: 'Deep Sea Rig', icon: '🌊', base: 1.5e14, rate: 18e8 },
      { id: 'rocket', name: 'Asteroid Rocket', icon: '🚀', base: 5e15, rate: 16e9 },
      { id: 'planet', name: 'Planet Cracker', icon: '🪐', base: 2e17, rate: 15e10 },
      { id: 'time', name: 'Time Machine', icon: '⏳', base: 8e18, rate: 15e11 },
      { id: 'portal', name: 'Crystal Portal', icon: '🌀', base: 4e20, rate: 16e12 },
      { id: 'dragon', name: 'Dragon Hoard', icon: '🐉', base: 2e22, rate: 18e13 },
      { id: 'galaxy', name: 'Galaxy Vault', icon: '🌌', base: 1.2e24, rate: 2e15 },
      { id: 'mirror', name: 'Mirror Universe', icon: '🪞', base: 8e25, rate: 25e15 },
      { id: 'prism', name: 'Infinite Prism', icon: '🔮', base: 6e27, rate: 35e16 },
      // Auto clickers have their own tab. cps is how many times each one clicks the gem per second.
      { id: 'auto', name: 'Auto Clicker', icon: '🖱️', base: 100, cps: 2 },
      { id: 'finger', name: 'Robo Finger', icon: '👆', base: 6000, cps: 12 },
      { id: 'hammer', name: 'Hammer Bot', icon: '🔨', base: 3e5, cps: 70 },
      { id: 'tapper', name: 'Turbo Tapper', icon: '⚡', base: 2e7, cps: 450 },
      { id: 'drone', name: 'Click Drone Fleet', icon: '🛸', base: 1.5e9, cps: 3000 },
      { id: 'piston', name: 'Mega Piston', icon: '🏭', base: 1.2e11, cps: 2e4 },
      { id: 'quantum', name: 'Quantum Clicker', icon: '⚛️', base: 1e13, cps: 1.4e5 },
      { id: 'godhand', name: 'Hand of the Gem God', icon: '🖐️', base: 1e15, cps: 1e6 },
    ];
    const byId = Object.fromEntries(SHOP.map(i => [i.id, i]));
    const AUTOS = SHOP.filter(i => i.cps), BUILDS = SHOP.filter(i => !i.cps);
    const autoOwned = s => AUTOS.reduce((a, i) => a + (s.own[i.id] || 0), 0);

    // Upgrades are generated in families. need(s) unlocks one; apply runs on the effects object.
    const UPS = [];
    const TIERS = [[1, 10, 'Sturdy'], [5, 50, 'Polished'], [25, 500, 'Reinforced'], [50, 5e4, 'Turbo'], [100, 5e6, 'Titanium'], [150, 5e8, 'Diamond-Tipped'], [200, 5e10, 'Quantum'], [250, 5e13, 'Mythic'], [300, 5e16, 'Cosmic'], [350, 5e19, 'Ultimate']];
    for (const b of SHOP) for (const [n, k, adj] of TIERS) UPS.push({ id: `${b.id}${n}`, icon: b.icon, name: `${adj} ${b.name}`, info: b.click ? 'Clicks x2' : b.cps ? `${b.name}s click twice as hard` : `${b.name} output x2`, cost: b.base * k, need: s => (s.own[b.id] || 0) >= n, apply: e => { e.b[b.id] *= 2; } });
    const STONES = ['Quartz', 'Amethyst', 'Topaz', 'Garnet', 'Opal', 'Jade', 'Sapphire', 'Ruby', 'Emerald', 'Diamond', 'Onyx', 'Moonstone', 'Starstone', 'Voidstone', 'Prismite'], CUTS = ['Rough', 'Faceted', 'Brilliant'];
    for (let k = 0; k < 45; k++) {
      const at = 1e3 * Math.pow(10, k);
      UPS.push({ id: 'cut' + k, icon: '💠', name: `${CUTS[k % 3]} ${STONES[Math.floor(k / 3)]}`, info: 'All production +10%', cost: at * 2, need: s => s.allTime >= at, apply: e => { e.global *= 1.1; } });
    }
    for (let k = 0; k < 20; k++) {
      const at = 30 * Math.pow(3, k);
      UPS.push({ id: 'glove' + k, icon: '🧤', name: `Mining Gloves ${k + 1}`, info: 'Clicks x2', cost: 200 * Math.pow(40, k), need: s => s.clicks >= at, apply: e => { e.click *= 2; } });
    }
    for (let k = 0; k < 8; k++) UPS.push({ id: 'res' + k, icon: '🔔', name: `Resonant Strike ${k + 1}`, info: 'Clicks gain 1% of gems/s', cost: 5e4 * Math.pow(100, k), need: s => s.clicks >= 200 * (k + 1), apply: e => { e.clickPct += .01; } });
    for (let k = 0; k < 6; k++) UPS.push({ id: 'luck' + k, icon: '🍀', name: `Lucky Charm ${k + 1}`, info: 'Golden gems come 15% more often', cost: 5e4 * Math.pow(500, k), need: s => s.goldens >= k * 3 + 1, apply: e => { e.goldWait *= .85; } });
    for (let k = 0; k < 6; k++) UPS.push({ id: 'shine' + k, icon: '⌛', name: `Long Shine ${k + 1}`, info: 'Golden effects last 15% longer', cost: 2e5 * Math.pow(500, k), need: s => s.goldens >= k * 4 + 2, apply: e => { e.goldLen *= 1.15; } });
    for (let k = 0; k < 8; k++) UPS.push({ id: 'tick' + k, icon: '⚙️', name: `Faster Springs ${k + 1}`, info: 'All auto clickers click 50% faster', cost: 2000 * Math.pow(60, k), need: s => autoOwned(s) >= 5 * (k + 1), apply: e => { e.autoSpeed *= 1.5; } });
    for (let k = 0; k < 6; k++) UPS.push({ id: 'oil' + k, icon: '🛢️', name: `Gear Oil ${k + 1}`, info: 'All auto clickers click twice as hard', cost: 5e4 * Math.pow(400, k), need: s => autoOwned(s) >= 25 * (k + 1), apply: e => { e.autoPower *= 2; } });
    for (let k = 0; k < 5; k++) UPS.push({ id: 'fury' + k, icon: '🔥', name: `Gem Fury ${k + 1}`, info: 'Frenzy multiplier +1', cost: 1e6 * Math.pow(1000, k), need: s => s.goldens >= k * 5 + 5, apply: e => { e.frenzyMul += 1; } });
    for (let k = 0; k < 5; k++) UPS.push({ id: 'nap' + k, icon: '😴', name: `Night Shift ${k + 1}`, info: 'Offline mining +10% speed and +2 hours', cost: 5e5 * Math.pow(800, k), need: s => s.allTime >= 1e6 * Math.pow(1000, k), apply: e => { e.offPct += .1; e.offHours += 2; } });
    for (let k = 0; k < 12; k++) UPS.push({ id: 'trophy' + k, icon: '🏆', name: `Trophy Polish ${k + 1}`, info: 'Each achievement gives +1% more', cost: 1e5 * Math.pow(300, k), need: s => Object.keys(s.ach).length >= 10 * (k + 1), apply: e => { e.achPct += .01; } });

    const ACHS = [];
    for (const b of SHOP) for (const n of [1, 10, 25, 50, 100, 150, 200]) ACHS.push({ id: `${b.id}x${n}`, icon: b.icon, name: `${n} ${b.name}${n > 1 ? 's' : ''}`, test: s => (s.own[b.id] || 0) >= n });
    for (let k = 0; k < 11; k++) { const at = Math.pow(1000, k + 1); ACHS.push({ id: 'mined' + k, icon: '💎', name: `Mine ${fmt(at)} gems`, test: s => s.allTime >= at }); }
    for (const n of [1, 100, 1000, 5000, 25000]) ACHS.push({ id: 'click' + n, icon: '👆', name: `${n} clicks`, test: s => s.clicks >= n });
    for (const n of [1, 7, 27, 77, 200]) ACHS.push({ id: 'gold' + n, icon: '✨', name: `Catch ${n} golden gems`, test: s => s.goldens >= n });
    for (const n of [10, 50, 100, 200]) ACHS.push({ id: 'ups' + n, icon: '📈', name: `Buy ${n} upgrades`, test: s => Object.keys(s.ups).length >= n });
    for (const n of [1, 5, 10]) ACHS.push({ id: 'skin' + n, icon: '🎨', name: `Own ${n} skin${n > 1 ? 's' : ''}`, test: s => Object.keys(s.skins || {}).length >= n });
    for (const n of [10, 100, 500, 1000]) ACHS.push({ id: 'autos' + n, icon: '🖱️', name: `Own ${n} auto clickers in total`, test: s => autoOwned(s) >= n });
    for (const n of [1, 3, 5, 10]) ACHS.push({ id: 're' + n, icon: '🔁', name: `Rebirth ${n} times`, test: s => s.rebirths >= n });

    const REBIRTH = 1e6, GROW = 8;
    const s = Object.assign({ gems: 0, total: 0, rebirths: 0, own: {}, last: Date.now(), ups: {}, ach: {}, clicks: 0, goldens: 0, allTime: 0, handmade: 0, skins: {}, skin: 'auto', autoClicks: 0 }, ctx.data('save', {}));
    s.allTime = Math.max(s.allTime, s.total);
    let fx = {}, frenzy = 0, clickFrenzy = 0, buyN = 1, sell = false, tab = 'Buildings';
    const recalc = () => {
      fx = { b: Object.fromEntries(SHOP.map(i => [i.id, 1])), global: 1, click: 1, clickPct: 0, goldWait: 1, goldLen: 1, achPct: .01, autoSpeed: 1, autoPower: 1, frenzyMul: 7, offPct: .5, offHours: 2 };
      for (const u of UPS) if (s.ups[u.id]) u.apply(fx);
    };
    recalc();
    const mult = () => (1 + s.rebirths * .5) * fx.global * (1 + Object.keys(s.ach).length * fx.achPct);
    const bRate = i => (i.rate || 0) * fx.b[i.id] * mult();
    const baseSec = () => BUILDS.reduce((a, i) => a + bRate(i) * (s.own[i.id] || 0), 0);
    const perSec = () => baseSec() * (frenzy > 0 ? fx.frenzyMul : 1);
    const perClick = () => ((1 + (s.own.pick || 0)) * fx.b.pick * fx.click * mult() + perSec() * fx.clickPct) * (clickFrenzy > 0 ? 77 : 1);
    // Auto clickers press the gem for you. Each press is worth one of your clicks times that clicker's upgrades.
    const autoCps = i => i.cps * fx.autoSpeed;
    const autoClicksPerSec = () => AUTOS.reduce((a, i) => a + autoCps(i) * (s.own[i.id] || 0), 0);
    const autoPerSec = () => perClick() * fx.autoPower * AUTOS.reduce((a, i) => a + autoCps(i) * fx.b[i.id] * (s.own[i.id] || 0), 0);
    const costOf = (i, n) => { const own = s.own[i.id] || 0; return Math.ceil(i.base * Math.pow(1.15, own) * (Math.pow(1.15, n) - 1) / .15); };
    const refund = (i, n) => { const own = s.own[i.id] || 0; n = Math.min(n, own); return n ? i.base * Math.pow(1.15, own - n) * (Math.pow(1.15, n) - 1) / .15 * .5 : 0; };
    const gain = n => { s.gems += n; s.total += n; s.allTime += n; };
    const save = () => { s.last = Date.now(); ctx.save('save', s); ctx.score(Math.floor(s.allTime)); };
    // In full screen only the game box is visible, so pop-ups go inside it.
    const host = () => document.fullscreenElement || document.body;
    const note = t => { const n = el('div', { class: 'toast', role: 'status', onanimationend: () => n.remove() }, t); host().append(n); };

    const away = Math.min((Date.now() - s.last) / 1000, fx.offHours * 3600);
    const offline = away > 30 ? (baseSec() + autoPerSec()) * away * fx.offPct : 0;
    gain(offline);

    const count = el('h2', { style: 'font-size:30px', 'aria-live': 'off' });
    const rate = el('p', { class: 'note', style: 'margin:0' });
    const buffs = el('p', { class: 'buffs', role: 'status' });
    const gem = el('button', { class: 'gem gemview', 'aria-label': 'Mine a gem', style: 'padding:0', onclick: () => {
      const n = perClick();
      gain(n); s.handmade += n; s.clicks++; paint();
      kick = 1;
      Sfx.play('pop');
      const num = el('span', { class: 'floatnum', style: `margin-left:${Math.random() * 90 - 45}px`, onanimationend: () => num.remove() }, '+' + fmt(n));
      gem.append(num);
      if (view) view.burst(new THREE.Vector3(0, 0, 1), skinColor(), 8, .16, 5);
    } });
    const COLORS = [0x4fe3ff, 0xff5dc8, 0x7bff8a, 0xffd23f, 0xc08bff, 0xff6b4a];
    let kick = 0, view = null, autoKick = 0;
    const need = () => REBIRTH * Math.pow(GROW, s.rebirths);
    const rebirth = el('button', { class: 'btn alt', onclick: () => {
      if (s.total < need()) return;
      s.gems = 0; s.total = 0; s.own = {}; s.ups = {}; s.rebirths++; frenzy = clickFrenzy = 0; recalc(); save(); drawUps(); paint();
      Sfx.play('win'); view.flash('#ffffff'); view.ring(new THREE.Vector3(0, 0, 0), 0xffffff, 3); view.burst(new THREE.Vector3(0, 0, 1), 0xffd23f, 40, .16, 7);
    } });

    const rows = SHOP.map(i => {
      const owned = el('small'), info = el('small'), cost = el('b');
      const b = el('button', { onclick: () => {
        if (sell) {
          const n = Math.min(buyN, s.own[i.id] || 0);
          if (n) { gain(0); s.gems += refund(i, n); s.own[i.id] -= n; Sfx.play('coin'); paint(); }
          return;
        }
        const p = costOf(i, buyN);
        if (s.gems >= p) { s.gems -= p; s.own[i.id] = (s.own[i.id] || 0) + buyN; Sfx.play('coin'); paint(); }
      } }, el('span', {}, `${i.icon} ${i.name}`, info, owned), cost);
      return { i, b, owned, info, cost };
    });
    const buildings = el('div', { class: 'shop', style: 'max-width:980px' }, ...rows.filter(r => !r.i.cps).map(r => r.b));
    const autoShop = el('div', { class: 'shop', style: 'max-width:980px' }, ...rows.filter(r => r.i.cps).map(r => r.b));
    const modes = el('div', { class: 'row' });
    const drawModes = () => modes.replaceChildren(...[1, 10, 100].map(n => el('button', { class: 'chip' + (buyN === n ? ' on' : ''), onclick: () => { buyN = n; drawModes(); paint(); } }, 'x' + n)),
      el('button', { class: 'chip' + (sell ? ' on' : ''), onclick: () => { sell = !sell; drawModes(); paint(); } }, sell ? 'Selling' : 'Sell'));
    drawModes();
    // Skins change the look of the big gem. They survive rebirths.
    const SKINS = [
      { id: 'auto', name: 'Classic', info: 'Changes colour with each rebirth', color: null, shape: 'oct' },
      { id: 'ruby', name: 'Ruby', color: 0xff3a5c, shape: 'oct', cost: 1e4 },
      { id: 'emerald', name: 'Emerald', color: 0x2ee07a, shape: 'ico', cost: 1e6 },
      { id: 'sapphire', name: 'Sapphire', color: 0x3a6bff, shape: 'dodeca', cost: 1e8 },
      { id: 'amethyst', name: 'Amethyst', color: 0xb05cff, shape: 'tetra', cost: 1e10 },
      { id: 'sun', name: 'Sun Gold', color: 0xffc928, shape: 'oct', cost: 1e13, metal: true },
      { id: 'obsidian', name: 'Obsidian Cube', color: 0x2a1f3d, shape: 'cube', cost: 1e16, glow: 0x7a3cff },
      { id: 'ice', name: 'Frost Crystal', color: 0xbdf3ff, shape: 'ico', cost: 1e20, clear: true },
      { id: 'rainbow', name: 'Rainbow Prism', color: 0xffffff, shape: 'dodeca', cost: 1e25, rainbow: true },
      { id: 'golden', name: 'Golden Gem', color: 0xffd23f, shape: 'oct', metal: true, info: 'Catch 50 golden gems', need: s => s.goldens >= 50 },
      { id: 'clover', name: 'Lucky Ring', color: 0x3fe07a, shape: 'torus', info: 'Catch 100 golden gems', need: s => s.goldens >= 100 },
      { id: 'champ', name: 'Champion Star', color: 0xffe08a, shape: 'star', metal: true, info: 'Unlock 100 achievements', need: s => Object.keys(s.ach).length >= 100 },
      { id: 'phoenix', name: 'Phoenix Heart', color: 0xff5a1a, shape: 'ico', glow: 0xff3a00, info: 'Rebirth 5 times', need: s => s.rebirths >= 5 },
    ];
    const SHAPE_NAMES = { oct: 'Classic cut', ico: 'Brilliant cut', dodeca: 'Round cut', tetra: 'Pyramid cut', cube: 'Cube cut', torus: 'Ring', star: 'Star cut' };
    const skinOf = () => SKINS.find(k => k.id === s.skin) || SKINS[0];
    const skinColor = () => skinOf().color === null ? COLORS[Math.min(s.rebirths, COLORS.length - 1)] : skinOf().color;
    const ownsSkin = k => k.id === 'auto' || s.skins[k.id] || (k.need && k.need(s));
    const skinList = el('div', { class: 'shop', style: 'max-width:980px' });
    function drawSkins() {
      skinList.replaceChildren(...SKINS.map(k => {
        const owned = ownsSkin(k), on = s.skin === k.id;
        const swatch = el('i', { class: 'swatch', style: `background:#${(k.color === null ? COLORS[0] : k.color).toString(16).padStart(6, '0')}` });
        const label = on ? 'Equipped' : owned ? 'Equip' : k.cost ? fmt(k.cost) : 'Locked';
        return el('button', { class: on ? 'on' : '', disabled: !owned && (!k.cost || s.gems < k.cost), onclick: () => {
          if (!owned) { if (s.gems < k.cost) return; s.gems -= k.cost; s.skins[k.id] = 1; Sfx.play('upgrade'); }
          if (k.need) s.skins[k.id] = 1;
          s.skin = k.id; drawSkins(); paint();
        } }, el('span', {}, swatch, ` ${k.name}`, el('small', {}, k.info || SHAPE_NAMES[k.shape])), el('b', {}, label));
      }));
    }
    const upList = el('div', { class: 'shop', style: 'max-width:980px' }), achList = el('div', { class: 'tiles' }), stats = el('div', { class: 'panel', style: 'max-width:980px;line-height:1.8' });
    const tabs = el('div', { class: 'row' }), shopPane = list => el('div', { style: 'display:grid;grid-template-columns:minmax(0,1fr);gap:10px;justify-items:center;width:100%' }, list),
      panes = { Buildings: shopPane(buildings), 'Auto Clickers': shopPane(autoShop), Upgrades: upList, Skins: skinList, Achievements: achList, Stats: stats };
    const body = el('div', { style: 'width:100%;display:grid;grid-template-columns:minmax(0,1fr);justify-items:center' });
    const drawTabs = () => tabs.replaceChildren(...Object.keys(panes).map(t => el('button', { class: 'chip' + (tab === t ? ' on' : ''), onclick: () => { tab = t; drawTabs(); if (t === 'Buildings' || t === 'Auto Clickers') panes[t].prepend(modes); body.replaceChildren(panes[t]); drawUps(); drawAch(); drawSkins(); paint(); } }, t === 'Upgrades' ? `Upgrades (${openUps().length})` : t)));
    const openUps = () => UPS.filter(u => !s.ups[u.id] && u.need(s)).sort((a, b) => a.cost - b.cost);
    let upKey = '', upRows = [];
    function drawUps() {
      const list = openUps(), key = list.map(u => u.id).join();
      if (key !== upKey) { upKey = key; drawTabs(); }
      else if (upList.childElementCount) return;
      upRows = list.map(u => {
        const b = el('button', { onclick: () => {
          if (s.gems < u.cost) return;
          s.gems -= u.cost; s.ups[u.id] = 1; recalc(); Sfx.play('upgrade'); upKey = ''; upList.replaceChildren(); drawUps(); paint();
        } }, el('span', {}, `${u.icon} ${u.name}`, el('small', {}, u.info)), el('b', {}, fmt(u.cost)));
        return { u, b };
      });
      upList.replaceChildren(...upRows.map(r => r.b));
      if (!list.length) upList.append(el('p', { class: 'note' }, 'No upgrades right now. Buy more buildings, click more and catch golden gems to unlock them.'));
    }
    function drawAch() {
      achList.replaceChildren(...ACHS.map(a => el('span', { class: 'tile' + (s.ach[a.id] ? ' on' : ''), title: a.name + (s.ach[a.id] ? ' (unlocked)' : ' (locked)') }, s.ach[a.id] ? a.icon : '?')));
    }

    // Golden gems: a shiny gem appears now and then. Catch it for a short burst of fortune.
    let goldIn = 40 + Math.random() * 80, goldEl = null;
    const catchGold = () => {
      goldEl.remove(); goldEl = null;
      s.goldens++;
      const roll = Math.random(), len = fx.goldLen;
      Sfx.play('win');
      if (roll < .45) {
        const n = Math.max(13, Math.min(s.gems * .15, baseSec() * 900));
        gain(n); note(`✨ Lucky! +${fmt(n)} gems`);
      } else if (roll < .9) { frenzy = 77 * len; note(`✨ Frenzy! Production x${fx.frenzyMul}`); }
      else { clickFrenzy = 13 * len; note('✨ Click Frenzy! Clicks x77'); }
    };
    const spawnGold = () => {
      goldEl = el('button', { class: 'goldgem', 'aria-label': 'Catch the golden gem', style: `left:${8 + Math.random() * 80}%;top:${12 + Math.random() * 70}%`, onclick: catchGold }, '💎');
      host().append(goldEl);
      const mine = goldEl;
      setTimeout(() => { if (goldEl === mine) { mine.remove(); goldEl = null; } }, 13000 * fx.goldLen);
    };
    ctx.add(() => { if (goldEl) goldEl.remove(); goldEl = null; });
    ctx.on(document, 'fullscreenchange', () => { if (goldEl) host().append(goldEl); });

    ctx.stage.append(count, rate, buffs, gem, tabs, body, rebirth);
    panes.Buildings.prepend(modes);
    body.append(panes.Buildings);
    view = Gfx.stage(ctx, { parent: gem, ratio: 1, fov: 40, near: .1, far: 100, top: '#1a1540', bottom: '#2a2358', sunDir: [.4, 1, .8], shadow: 5 });
    view.camera.position.set(0, .6, 6); view.camera.lookAt(0, 0, 0);
    let crystal = null, crystalTier = '';
    const SHAPES = { oct: () => new THREE.OctahedronGeometry(1.5, 1), ico: () => new THREE.IcosahedronGeometry(1.5, 0), dodeca: () => new THREE.DodecahedronGeometry(1.45, 0), tetra: () => new THREE.TetrahedronGeometry(1.8, 0), cube: () => new THREE.BoxGeometry(1.7, 1.7, 1.7).rotateX(Math.PI / 4).rotateZ(Math.atan(Math.SQRT1_2)), torus: () => new THREE.TorusGeometry(1.1, .45, 10, 20), star: () => new THREE.OctahedronGeometry(1.6, 0) };
    const makeGem = k => {
      const color = skinColor();
      const m = new THREE.MeshStandardMaterial({ color, flatShading: true, metalness: k.metal ? .45 : .35, roughness: k.metal ? .3 : .08, emissive: k.glow || color, emissiveIntensity: k.glow ? .3 : k.metal ? .3 : .14, transparent: !!k.clear, opacity: k.clear ? .75 : 1 });
      const g = new THREE.Mesh(SHAPES[k.shape](), m);
      if (k.shape === 'star') g.add(new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), m).rotateY(Math.PI / 4).rotateX(Math.PI / 4));
      return g;
    };
    const fill = new THREE.PointLight(0xffffff, .8); fill.position.set(-3, 2, 4); view.scene.add(fill);
    ctx.loop(dt => {
      const k = skinOf(), tier = k.id + Math.min(s.rebirths, COLORS.length - 1);
      if (tier !== crystalTier) {
        if (crystal) view.scene.remove(crystal);
        crystal = makeGem(k); view.scene.add(crystal); crystalTier = tier;
      }
      if (k.rainbow) crystal.material.color.setHSL((performance.now() / 4000) % 1, .9, .6), crystal.material.emissive.copy(crystal.material.color);
      kick = Math.max(0, kick - dt * 5);
      crystal.rotation.y += dt * (.7 + kick * 9);
      crystal.rotation.x = Math.sin(crystal.rotation.y * .5) * .15;
      crystal.scale.setScalar(1 + kick * .16);
      crystal.position.y = Math.sin(performance.now() * .002) * .14;
      if (Math.random() < dt * 1.5) view.burst(new THREE.Vector3((Math.random() - .5) * 2.4, (Math.random() - .5) * 2.4, 1.2), 0xffffff, 1, .07, 1);
      view.render(dt);
    });
    ctx.help('Your mine keeps earning while you are away (half speed for 2 hours, more with Night Shift upgrades). Auto Clickers click the gem for you. Catch golden gems when they appear. Achievements boost all production. Rebirth resets your mine and upgrades for a permanent +50% bonus.');
    if (offline > 1) ctx.message('Welcome back!', `Your workers mined ${fmt(offline)} gems while you were away.`, [{ label: 'Collect', fn: () => {} }]);

    function paint() {
      count.textContent = `${fmt(s.gems)} gems`;
      rate.textContent = `${fmt(perSec() + autoPerSec())} per second · ${fmt(perClick())} per click · x${fmt(mult())} bonus`;
      buffs.textContent = [frenzy > 0 ? `Frenzy x${fx.frenzyMul}: ${Math.ceil(frenzy)}s` : '', clickFrenzy > 0 ? `Click Frenzy x77: ${Math.ceil(clickFrenzy)}s` : ''].filter(Boolean).join(' · ');
      // Like a mine being explored, only the next two unbought buildings show.
      let hidden = 0;
      for (const r of rows) {
        const own = s.own[r.i.id] || 0, p = costOf(r.i, buyN);
        r.b.style.display = own || hidden < 2 ? '' : 'none';
        if (!own) hidden++;
        r.cost.textContent = sell ? '+' + fmt(refund(r.i, buyN)) : fmt(p);
        r.info.textContent = r.i.click ? `+${fmt(fx.b.pick * fx.click * mult())} per click` : r.i.cps ? `${fmt(autoCps(r.i))} clicks/s each · +${fmt(autoCps(r.i) * fx.b[r.i.id] * fx.autoPower * perClick())} gems/s` : `+${fmt(bRate(r.i))} gems/s each`;
        r.owned.textContent = `Owned: ${own}`;
        r.b.disabled = sell ? !own : s.gems < p;
      }
      for (const r of upRows) r.b.disabled = s.gems < r.u.cost;
      rebirth.textContent = `🔁 Rebirth (${fmt(s.total)} / ${fmt(need())} mined)`;
      rebirth.disabled = s.total < need();
      if (tab === 'Stats') stats.innerHTML = '';
      if (tab === 'Stats') stats.append(...[`All-time gems: ${fmt(s.allTime)}`, `This run: ${fmt(s.total)}`, `Mined by hand: ${fmt(s.handmade)}`, `Clicks: ${s.clicks}`, `Golden gems caught: ${s.goldens}`, `Auto Clicker presses: ${fmt(s.autoClicks)}`, `Skins: ${SKINS.filter(ownsSkin).length} / ${SKINS.length}`, `Buildings: ${BUILDS.reduce((a, i) => a + (s.own[i.id] || 0), 0)}`, `Auto clickers: ${autoOwned(s)}`, `Upgrades: ${Object.keys(s.ups).length} / ${UPS.length}`, `Achievements: ${Object.keys(s.ach).length} / ${ACHS.length}`, `Rebirths: ${s.rebirths}`].map(t => el('div', {}, t)));
    }
    drawTabs();
    ctx.every(100, () => {
      gain(perSec() / 10);
      const ac = autoClicksPerSec() / 10;
      if (ac) { gain(autoPerSec() / 10); s.autoClicks += ac; autoKick += ac; if (autoKick >= 1) { autoKick %= 1; kick = Math.max(kick, .5); } }
      frenzy = Math.max(0, frenzy - .1); clickFrenzy = Math.max(0, clickFrenzy - .1);
      goldIn -= .1 / fx.goldWait;
      if (goldIn <= 0) { goldIn = 60 + Math.random() * 120; if (!goldEl) spawnGold(); }
      paint();
    });
    ctx.every(1000, () => {
      let fresh = false;
      for (const a of ACHS) if (!s.ach[a.id] && a.test(s)) { s.ach[a.id] = 1; fresh = true; note(`🏆 ${a.name}`); }
      if (fresh) { Sfx.play('ding'); if (tab === 'Achievements') drawAch(); }
      if (tab === 'Upgrades' || openUps().map(u => u.id).join() !== upKey) drawUps();
    });
    ctx.every(5000, save);
    ctx.cheat('💎 +1 million gems', () => { gain(1e6); paint(); });
    ctx.cheat('💎 +1 trillion gems', () => { gain(1e12); paint(); });
    ctx.cheat('💎 +1e30 gems', () => { gain(1e30); paint(); });
    ctx.cheat('🏗️ +100 of every building', () => { for (const i of SHOP) s.own[i.id] = (s.own[i.id] || 0) + 100; paint(); });
    ctx.cheat('📈 Unlock every upgrade', () => { for (const u of UPS) s.ups[u.id] = 1; recalc(); upKey = ''; upList.replaceChildren(); drawUps(); paint(); });
    ctx.cheat('🏆 Unlock every achievement', () => { for (const a of ACHS) s.ach[a.id] = 1; drawAch(); paint(); });
    ctx.cheat('✨ Golden gem now', () => { if (!goldEl) spawnGold(); });
    ctx.cheat('🎨 Unlock every skin', () => { for (const k of SKINS) s.skins[k.id] = 1; drawSkins(); });
    // Typed cheats: the admin panel shows a box, and the number typed is passed in.
    const whole = n => Math.max(0, Math.floor(n));
    ctx.cheat('💎 Give gems', n => { gain(n); s.gems = Math.max(0, s.gems); paint(); }, 'Amount, like 5m or 1e30');
    ctx.cheat('💎 Set gems to', n => { s.gems = Math.max(0, n); s.allTime = Math.max(s.allTime, s.gems); paint(); }, 'Amount');
    ctx.cheat('🔁 Give rebirths', n => { s.rebirths = whole(s.rebirths + Math.round(n)); recalc(); drawSkins(); paint(); }, 'How many (minus takes away)');
    ctx.cheat('🔁 Rebirth now (keep everything)', () => { s.rebirths++; recalc(); paint(); });
    ctx.cheat('🏗️ Give every building', n => { for (const i of BUILDS) s.own[i.id] = whole((s.own[i.id] || 0) + n); paint(); }, 'How many of each');
    ctx.cheat('🖱️ Give every auto clicker', n => { for (const i of AUTOS) s.own[i.id] = whole((s.own[i.id] || 0) + n); paint(); }, 'How many of each');
    ctx.cheat('⛏️ Give pickaxes', n => { s.own.pick = whole((s.own.pick || 0) + n); paint(); }, 'How many');
    ctx.cheat('✨ Add golden gems caught', n => { s.goldens = whole(s.goldens + n); drawSkins(); paint(); }, 'How many');
    ctx.cheat('🔥 Frenzy for 5 minutes', () => { frenzy = 300; paint(); });
    ctx.cheat('👆 Click Frenzy for 1 minute', () => { clickFrenzy = 60; paint(); });
    ctx.cheat('🔁 Make rebirth ready', () => { gain(Math.max(0, need() - s.total)); paint(); });
    ctx.add(save);
    drawUps(); drawAch(); drawSkins();
    paint();
    if (location.hostname === 'localhost') window.__gem = { s, spawnGold, UPS, ACHS, recalc };
  },
});
