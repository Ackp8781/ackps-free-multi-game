// Gem Mine Simulator: an idle clicker with rebirths and offline earnings.
App.register({
  id: 'clicker', name: 'Gem Mine Simulator', icon: '💎', online: false,
  desc: 'Click for gems, hire workers, and rebirth for bonuses.',
  fmtBest: b => fmt(b) + ' gems',
  mount(ctx) {
    const SHOP = [
      { id: 'pick', name: 'Better Pickaxe', icon: '⛏️', base: 15, click: 1, info: '+1 per click' },
      { id: 'miner', name: 'Miner', icon: '👷', base: 25, rate: 1, info: '+1 gem/s' },
      { id: 'drill', name: 'Drill', icon: '🪛', base: 300, rate: 10, info: '+10 gems/s' },
      { id: 'dig', name: 'Excavator', icon: '🚜', base: 4000, rate: 80, info: '+80 gems/s' },
      { id: 'lab', name: 'Crystal Lab', icon: '🧪', base: 60000, rate: 600, info: '+600 gems/s' },
      { id: 'moon', name: 'Moon Mine', icon: '🌙', base: 1e6, rate: 5000, info: '+5K gems/s' },
      { id: 'star', name: 'Star Forge', icon: '⭐', base: 2e7, rate: 50000, info: '+50K gems/s' },
    ];
    const REBIRTH = 1e6;
    const s = Object.assign({ gems: 0, total: 0, rebirths: 0, own: {}, last: Date.now() }, ctx.data('save', {}));
    const mult = () => 1 + s.rebirths * .5;
    const price = i => Math.ceil(i.base * Math.pow(1.15, s.own[i.id] || 0));
    const perSec = () => SHOP.reduce((a, i) => a + (i.rate || 0) * (s.own[i.id] || 0), 0) * mult();
    const perClick = () => (1 + (s.own.pick || 0)) * mult();
    const gain = n => { s.gems += n; s.total += n; };
    const save = () => { s.last = Date.now(); ctx.save('save', s); ctx.score(Math.floor(s.total)); };

    const away = Math.min((Date.now() - s.last) / 1000, 7200);
    const offline = away > 30 ? perSec() * away * .5 : 0;
    gain(offline);

    const count = el('h2', { style: 'font-size:30px', 'aria-live': 'off' });
    const rate = el('p', { class: 'note', style: 'margin:0' });
    const gem = el('button', { class: 'gem', 'aria-label': 'Mine a gem', onclick: () => { gain(perClick()); paint(); } }, '💎');
    const rebirth = el('button', { class: 'btn alt', onclick: () => {
      if (s.total < REBIRTH * Math.pow(4, s.rebirths)) return;
      s.gems = 0; s.total = 0; s.own = {}; s.rebirths++; save(); paint();
    } });
    const rows = SHOP.map(i => {
      const owned = el('small'), cost = el('b');
      const b = el('button', { onclick: () => {
        const p = price(i);
        if (s.gems >= p) { s.gems -= p; s.own[i.id] = (s.own[i.id] || 0) + 1; paint(); }
      } }, el('span', {}, `${i.icon} ${i.name}`, el('small', {}, i.info), owned), cost);
      return { i, b, owned, cost };
    });
    ctx.stage.append(count, rate, gem, el('div', { class: 'shop', style: 'max-width:980px' }, ...rows.map(r => r.b)), rebirth);
    ctx.help('Your mine keeps earning at half speed for up to 2 hours while you are away. Rebirth resets your mine for a permanent +50% bonus.');
    if (offline > 1) ctx.message('Welcome back!', `Your workers mined ${fmt(offline)} gems while you were away.`, [{ label: 'Collect', fn: () => {} }]);

    function paint() {
      const need = REBIRTH * Math.pow(4, s.rebirths);
      count.textContent = `${fmt(s.gems)} gems`;
      rate.textContent = `${fmt(perSec())} per second · ${fmt(perClick())} per click · x${mult()} bonus`;
      for (const r of rows) {
        const p = price(r.i);
        r.cost.textContent = fmt(p);
        r.owned.textContent = `Owned: ${s.own[r.i.id] || 0}`;
        r.b.disabled = s.gems < p;
      }
      rebirth.textContent = `🔁 Rebirth (${fmt(s.total)} / ${fmt(need)} mined)`;
      rebirth.disabled = s.total < need;
    }
    ctx.every(100, () => { gain(perSec() / 10); paint(); });
    ctx.every(5000, save);
    ctx.add(save);
    paint();
  },
});
