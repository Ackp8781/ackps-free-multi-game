// BlockCraft sound: block and mob effects plus a slow generative score, all synthesized live.
const CraftAudio = (() => {
  // Noise bursts are [seconds, volume, filterHz, delay]; tones are [startHz, endHz, seconds, wave, volume, delay].
  const MAT = {
    stone: { dig: { n: [[.16, .3, 1500], [.1, .16, 700, .02]], t: [[170, 80, .1, 'square', .05]] }, step: { n: [[.07, .08, 1700]] }, place: { n: [[.09, .22, 1300]], t: [[150, 80, .08, 'triangle', .2]] }, hit: { n: [[.05, .09, 1600]] } },
    wood: { dig: { n: [[.14, .18, 900]], t: [[210, 90, .13, 'triangle', .3], [130, 70, .1, 'square', .05, .02]] }, step: { n: [[.05, .05, 800]], t: [[170, 110, .06, 'triangle', .1]] }, place: { t: [[190, 90, .11, 'triangle', .3]], n: [[.06, .12, 800]] }, hit: { t: [[230, 120, .06, 'triangle', .14]], n: [[.03, .05, 900]] } },
    grass: { dig: { n: [[.2, .24, 3200], [.12, .12, 1400, .05]] }, step: { n: [[.1, .07, 2600]] }, place: { n: [[.13, .2, 2800]] }, hit: { n: [[.06, .08, 3000]] } },
    gravel: { dig: { n: [[.2, .28, 1300], [.12, .16, 800, .06]] }, step: { n: [[.1, .1, 1100]] }, place: { n: [[.13, .24, 1100]] }, hit: { n: [[.06, .1, 1200]] } },
    sand: { dig: { n: [[.22, .22, 4200]] }, step: { n: [[.11, .07, 3800]] }, place: { n: [[.14, .18, 3600]] }, hit: { n: [[.07, .08, 3800]] } },
    snow: { dig: { n: [[.2, .2, 5200]] }, step: { n: [[.1, .07, 5200]] }, place: { n: [[.13, .16, 5000]] }, hit: { n: [[.06, .07, 5000]] } },
    wool: { dig: { n: [[.16, .22, 620]] }, step: { n: [[.09, .07, 560]] }, place: { n: [[.11, .18, 620]] }, hit: { n: [[.06, .08, 600]] } },
    glass: { dig: { n: [[.1, .18, 6000]], t: [[2600, 900, .16, 'triangle', .12], [3400, 1500, .12, 'sine', .09, .02], [1900, 700, .2, 'triangle', .08, .04]] }, step: { n: [[.05, .05, 2600]], t: [[1400, 1000, .05, 'sine', .04]] }, place: { t: [[1700, 1100, .07, 'triangle', .1]], n: [[.05, .1, 2600]] }, hit: { t: [[1800, 1200, .05, 'sine', .05]] } },
    metal: { dig: { t: [[820, 610, .25, 'triangle', .14], [1240, 900, .18, 'sine', .08]], n: [[.08, .14, 2600]] }, step: { t: [[620, 520, .07, 'triangle', .05]], n: [[.04, .04, 2200]] }, place: { t: [[700, 500, .14, 'triangle', .16]], n: [[.05, .1, 2400]] }, hit: { t: [[900, 720, .06, 'triangle', .08]] } },
  };
  const FX = {
    pop: { t: [[700, 1500, .08, 'sine', .22]] }, orb: { t: [[1320, 1760, .09, 'sine', .1], [1760, 2200, .1, 'sine', .08, .05]] }, level: { t: [[523, 523, .1, 'triangle', .2], [659, 659, .1, 'triangle', .2, .1], [784, 784, .12, 'triangle', .2, .2], [1047, 1047, .3, 'triangle', .2, .3]] },
    hurt: { t: [[400, 150, .16, 'sawtooth', .13]], n: [[.08, .1, 1200]] }, crit: { n: [[.08, .16, 3400]], t: [[980, 520, .1, 'square', .05]] }, hit: { n: [[.07, .14, 1200]], t: [[220, 110, .09, 'square', .08]] }, whoosh: { n: [[.1, .06, 2600]] },
    eat: { n: [[.07, .12, 2400], [.06, .1, 1900, .07]] }, burp: { t: [[160, 90, .22, 'sawtooth', .1]] }, drink: { t: [[420, 620, .1, 'sine', .08], [380, 600, .1, 'sine', .07, .12]] },
    splash: { n: [[.4, .26, 2200], [.2, .12, 900, .05]] }, swim: { n: [[.18, .07, 1400]] }, bubble: { t: [[520, 1050, .06, 'sine', .05]] }, hiss: { n: [[.5, .16, 5200]] }, burn: { n: [[.14, .12, 3000]] }, lava: { t: [[90, 60, .25, 'sine', .08]], n: [[.08, .05, 700]] },
    fall: { n: [[.1, .16, 500]], t: [[120, 60, .12, 'sine', .24]] }, door_open: { t: [[300, 180, .12, 'triangle', .22], [150, 100, .1, 'square', .05, .03]] }, door_close: { t: [[180, 90, .1, 'triangle', .3]], n: [[.05, .12, 900]] },
    chest_open: { t: [[240, 340, .22, 'triangle', .14], [170, 240, .2, 'square', .03]], n: [[.1, .05, 1200]] }, chest_close: { t: [[280, 120, .14, 'triangle', .24]], n: [[.06, .12, 1000]] },
    bow: { n: [[.12, .16, 2800]], t: [[640, 300, .12, 'triangle', .1]] }, arrow_hit: { t: [[520, 200, .08, 'triangle', .14]], n: [[.04, .1, 1800]] }, draw: { t: [[140, 260, .3, 'sawtooth', .025]] }, thrown: { n: [[.14, .08, 2200]] },
    fuse: { n: [[.5, .14, 7000]] }, explode: { t: [[110, 24, .9, 'sine', .55], [70, 20, .7, 'square', .1]], n: [[.9, .55, 1100], [.3, .3, 3400]] }, ignite: { n: [[.12, .16, 4800]], t: [[1800, 900, .05, 'square', .04]] }, bucket: { n: [[.18, .14, 1800]], t: [[300, 180, .1, 'sine', .1]] }, thunder: { n: [[1.8, .5, 480], [.4, .3, 2200]], t: [[60, 28, 1.6, 'sine', .4]] }, break_tool: { t: [[1600, 400, .2, 'square', .06]], n: [[.1, .14, 3000]] },
    furnace: { n: [[.05, .03, 3600]] }, sleep: { t: [[392, 392, .25, 'sine', .08], [330, 330, .3, 'sine', .08, .25]] }, advance: { t: [[659, 659, .1, 'triangle', .16], [880, 880, .1, 'triangle', .16, .09], [1175, 1175, .26, 'triangle', .18, .18]] },
    pig: { t: [[210, 170, .14, 'sawtooth', .07], [260, 180, .12, 'sawtooth', .06, .13]] }, cow: { t: [[150, 120, .55, 'sawtooth', .08], [120, 105, .3, 'sine', .08, .05]] }, sheep: { t: [[330, 300, .22, 'sawtooth', .05], [345, 300, .22, 'sawtooth', .05, .2]] }, chicken_mob: { t: [[1050, 780, .07, 'square', .03], [920, 720, .08, 'square', .03, .1]] },
    zombie: { t: [[120, 90, .5, 'sawtooth', .08], [90, 72, .4, 'square', .03, .1]] }, skeleton: { n: [[.05, .1, 3000], [.05, .09, 2600, .1], [.05, .08, 3000, .2]] }, spider: { n: [[.1, .1, 3600]], t: [[300, 240, .1, 'sawtooth', .03]] }, blastcap: { t: [[460, 180, .14, 'square', .03]], n: [[.08, .05, 5000]] },
    mob_hurt: { t: [[300, 110, .18, 'sawtooth', .1]], n: [[.06, .08, 1500]] }, mob_die: { t: [[240, 60, .4, 'sawtooth', .1]], n: [[.1, .08, 900]] },
  };
  let vol = 1, music = .5, musicTimer = null, musicBus = null, active = false;
  const last = {};
  const play = (def, v = 1, rate = 1) => { if (def && vol > 0 && v > .01) Sfx.fx(def, v * vol, rate); };
  const named = (k, v = 1, rate = 1) => {
    const now = performance.now();
    if (now - (last[k] || 0) < 35) return;
    last[k] = now;
    play(FX[k], v, rate * (.94 + Math.random() * .12));
  };
  const block = (kind, mat, v = 1) => {
    const m = MAT[mat] || MAT.stone, k = kind + mat, now = performance.now();
    if (now - (last[k] || 0) < 30) return;
    last[k] = now;
    play(m[kind], v, .9 + Math.random() * .22);
  };

  // A loop of filtered noise for rain, wind and water.
  const bed = (hz, q = .5) => {
    const g = Sfx.graph();
    if (!g) return null;
    const s = g.ac.createBufferSource(), f = g.ac.createBiquadFilter(), a = g.ac.createGain();
    s.buffer = g.noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = hz; f.Q.value = q; a.gain.value = 0;
    s.connect(f); f.connect(a); a.connect(g.master); s.start();
    return { set: v => a.gain.setTargetAtTime(v * vol, g.ac.currentTime, .4), stop: () => { try { s.stop(); a.disconnect(); } catch (e) {} } };
  };

  // Sparse piano-like notes over a soft pad, drifting through a mode. Every phrase is rolled fresh.
  const SCALES = [[0, 2, 4, 7, 9], [0, 2, 3, 7, 10], [0, 3, 5, 7, 10], [0, 2, 5, 7, 9], [0, 4, 5, 7, 11]];
  const bus = () => {
    if (musicBus) return musicBus;
    const g = Sfx.graph();
    if (!g) return null;
    const dry = g.ac.createGain(), delay = g.ac.createDelay(1.5), fb = g.ac.createGain(), lp = g.ac.createBiquadFilter();
    dry.gain.value = music;
    delay.delayTime.value = .46; fb.gain.value = .46; lp.type = 'lowpass'; lp.frequency.value = 1500;
    dry.connect(g.master); dry.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(g.master);
    musicBus = { g, dry };
    return musicBus;
  };
  const note = (hz, when, len, v) => {
    const b = bus();
    if (!b) return;
    const { ac } = b.g, o = ac.createOscillator(), o2 = ac.createOscillator(), a = ac.createGain();
    o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = hz; o2.frequency.value = hz * 2.002;
    const a2 = ac.createGain(); a2.gain.value = .14;
    a.gain.setValueAtTime(.0001, when); a.gain.exponentialRampToValueAtTime(v, when + .015); a.gain.exponentialRampToValueAtTime(.0005, when + len);
    o.connect(a); o2.connect(a2); a2.connect(a); a.connect(b.dry);
    o.start(when); o2.start(when); o.stop(when + len + .05); o2.stop(when + len + .05);
  };
  const pad = (hz, when, len, v) => {
    const b = bus();
    if (!b) return;
    const { ac } = b.g, o = ac.createOscillator(), a = ac.createGain();
    o.type = 'sine'; o.frequency.value = hz;
    a.gain.setValueAtTime(.0001, when); a.gain.linearRampToValueAtTime(v, when + len * .4); a.gain.linearRampToValueAtTime(.0001, when + len);
    o.connect(a); a.connect(b.dry);
    o.start(when); o.stop(when + len + .05);
  };
  const phrase = () => {
    const b = bus();
    if (!b) return 8;
    const t0 = b.g.ac.currentTime + .1, scale = SCALES[Math.floor(Math.random() * SCALES.length)], root = 174.6 * Math.pow(2, Math.floor(Math.random() * 7) / 12);
    const hz = deg => { const o = Math.floor(deg / scale.length), s = scale[((deg % scale.length) + scale.length) % scale.length]; return root * Math.pow(2, o + s / 12); };
    const bars = 3 + Math.floor(Math.random() * 4), beat = 1.2 + Math.random() * .7;
    let t = t0, deg = Math.floor(Math.random() * 5) + 3;
    for (let bar = 0; bar < bars; bar++) {
      const chord = Math.floor(Math.random() * 5);
      pad(hz(chord - 5) * .5, t, beat * 4.4, .05); pad(hz(chord - 3) * .5, t, beat * 4.4, .035);
      for (let i = 0; i < 4; i++) {
        if (Math.random() < .55) {
          deg += Math.floor(Math.random() * 5) - 2;
          deg = Math.max(0, Math.min(11, deg));
          note(hz(deg), t + i * beat + (Math.random() - .5) * .06, 2.8 + Math.random() * 1.6, .1 + Math.random() * .06);
          if (Math.random() < .25) note(hz(deg + 2), t + i * beat + .16, 2.4, .05);
        }
      }
      t += beat * 4;
    }
    return bars * beat * 4;
  };
  const startMusic = (gapMin = 20, gapMax = 80) => {
    if (active) return;
    active = true;
    const run = (first) => {
      if (!active) return;
      const len = music > 0 ? phrase() : 4;
      musicTimer = setTimeout(() => run(false), (len + gapMin + Math.random() * (gapMax - gapMin)) * 1000);
      return first;
    };
    run(true);
  };
  const stopMusic = () => { active = false; clearTimeout(musicTimer); };
  return {
    play: named, block, bed, startMusic, stopMusic,
    set volume(v) { vol = v; },
    get volume() { return vol; },
    set music(v) { music = v; if (musicBus) musicBus.dry.gain.value = v; },
  };
})();
