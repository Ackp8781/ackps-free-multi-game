// Sound effects synthesized with Web Audio, so the site ships no audio files.
const Sfx = (() => {
  // Tones are [startHz, endHz, seconds, wave, volume, delay]; noise is [seconds, volume, filterHz, delay].
  const BANK = {
    click: { t: [[520, 420, .05, 'triangle', .12]] },
    tick: { t: [[720, 880, .05, 'sine', .1]] },
    flag: { t: [[500, 900, .09, 'square', .06]] },
    flap: { t: [[300, 620, .1, 'triangle', .16]], n: [[.07, .06, 2200]] },
    ding: { t: [[880, 880, .08, 'sine', .18], [1320, 1320, .18, 'sine', .16, .07]] },
    eat: { t: [[260, 760, .1, 'square', .08], [520, 980, .08, 'square', .06, .06]] },
    coin: { t: [[990, 990, .06, 'square', .08], [1480, 1480, .16, 'square', .07, .06]] },
    pop: { t: [[620, 140, .1, 'sine', .2]], n: [[.05, .07, 3000]] },
    jump: { t: [[240, 680, .15, 'square', .07]] },
    spring: { t: [[200, 1100, .24, 'sine', .18]] },
    place: { t: [[170, 90, .09, 'triangle', .22]], n: [[.05, .1, 1100]] },
    dig: { n: [[.12, .22, 900]], t: [[130, 70, .1, 'square', .07]] },
    land: { n: [[.09, .18, 500]], t: [[110, 55, .1, 'sine', .22]] },
    hurt: { t: [[420, 90, .25, 'sawtooth', .13]] },
    hit: { t: [[180, 45, .3, 'square', .14]], n: [[.18, .25, 1000]] },
    boom: { t: [[120, 28, .5, 'sine', .4]], n: [[.5, .4, 900]] },
    shoot: { n: [[.06, .09, 3800]], t: [[800, 300, .06, 'triangle', .06]] },
    cannon: { t: [[150, 45, .2, 'sine', .28]], n: [[.14, .16, 800]] },
    frost: { t: [[1500, 2300, .12, 'sine', .06], [1900, 2700, .12, 'sine', .04, .03]] },
    nitro: { n: [[.3, .13, 2400]] },
    skid: { n: [[.14, .05, 3200]] },
    horn: { t: [[220, 220, .22, 'sawtooth', .1], [330, 330, .36, 'sawtooth', .1, .18]] },
    beep: { t: [[520, 520, .14, 'square', .09]] },
    go: { t: [[1040, 1040, .4, 'square', .1]] },
    upgrade: { t: [[440, 440, .07, 'triangle', .15], [660, 660, .07, 'triangle', .15, .07], [880, 880, .16, 'triangle', .15, .14]] },
    win: { t: [[523, 523, .12, 'triangle', .18], [659, 659, .12, 'triangle', .18, .12], [784, 784, .12, 'triangle', .18, .24], [1047, 1047, .34, 'triangle', .2, .36]] },
    lose: { t: [[392, 370, .2, 'triangle', .17], [311, 294, .2, 'triangle', .17, .2], [233, 196, .42, 'triangle', .17, .4]] },
  };
  let ac = null, master = null, noiseBuf = null;
  const last = {};
  let muted = false;
  try { muted = localStorage.getItem('amg.mute') === '1'; } catch (e) {}
  const audio = () => {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain(); master.gain.value = muted ? 0 : .8; master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  };
  const tone = ([a, b, dur, type, vol, delay = 0], k = 1, rate = 1) => {
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(a * rate, t); o.frequency.exponentialRampToValueAtTime(Math.max(b * rate, 1), t + dur);
    g.gain.setValueAtTime(Math.max(vol * k, .0011), t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
  };
  const noise = ([dur, vol, hz, delay = 0], k = 1, rate = 1) => {
    const t = ac.currentTime + delay, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = hz * rate;
    g.gain.setValueAtTime(Math.max(vol * k, .0011), t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * .5); s.stop(t + dur + .02);
  };
  return {
    play(name) {
      const now = performance.now();
      if (now - (last[name] || 0) < 45 || !audio()) return;
      last[name] = now;
      const s = BANK[name];
      if (s.t) s.t.forEach(x => tone(x));
      if (s.n) s.n.forEach(x => noise(x));
    },
    // Plays a sound definition from a game's own bank, scaled in volume and pitch.
    fx(def, vol = 1, rate = 1) {
      if (!audio()) return;
      if (def.t) def.t.forEach(x => tone(x, vol, rate));
      if (def.n) def.n.forEach(x => noise(x, vol, rate));
    },
    // The raw audio graph, for games that build their own long-running sounds.
    graph: () => (audio() ? { ac, master, noiseBuf } : null),
    // A continuous car engine; set(hz, volume) follows the speed.
    engine() {
      if (!audio()) return { set() {}, stop() {} };
      const o = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = 0;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(master); o.start(); o2.start();
      return {
        set(hz, vol) {
          o.frequency.setTargetAtTime(hz, ac.currentTime, .05); o2.frequency.setTargetAtTime(hz * .5, ac.currentTime, .05);
          g.gain.setTargetAtTime(vol, ac.currentTime, .05);
        },
        stop() { try { o.stop(); o2.stop(); g.disconnect(); } catch (e) {} },
      };
    },
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('amg.mute', muted ? '1' : '0'); } catch (e) {}
      if (master) master.gain.value = muted ? 0 : .8;
      return muted;
    },
  };
})();
