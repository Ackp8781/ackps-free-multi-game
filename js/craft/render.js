// BlockCraft renderer: terrain materials, sky, weather, particles, block overlays, models and the first-person hand.
const CraftRender = (() => {
  const D = CraftData;
  const TERRAIN_VS = `
    attribute vec4 aTint; attribute vec4 aLight;
    uniform float uTime, uFogNear, uFogFar, uWaves; uniform vec3 uSunLight;
    varying vec2 vUv; varying vec3 vTint; varying vec3 vLit; varying float vFog; varying float vView;
    float curve(float v) { return 0.05 + 0.95 * pow(0.84, (1.0 - v) * 15.0); }
    void main() {
      vec4 wp = modelMatrix * vec4(position / 64.0, 1.0);
      float w = aLight.a * 255.0;
      if (w > 0.5 && uWaves > 0.5) {
        if (w < 1.5) { wp.x += sin(uTime * 1.7 + wp.x * 1.3 + wp.z * 0.9) * 0.055; wp.z += cos(uTime * 1.3 + wp.z * 1.1 + wp.x * 0.7) * 0.055; }
        else if (w < 2.5) { wp.x += sin(uTime * 1.1 + wp.y * 1.1 + wp.z) * 0.018; wp.z += cos(uTime + wp.x + wp.y) * 0.018; }
        else wp.y += sin(uTime * 1.4 + wp.x * 0.9 + wp.z * 0.6) * 0.03 + sin(uTime * 2.3 + wp.z * 1.7) * 0.012 - 0.045;
      }
      vec2 t = uv;
      if (aLight.z > 0.001) t.y += floor(mod(uTime * 5.0, 8.0)) / 32.0;
      vUv = t;
      vec4 mv = viewMatrix * wp;
      gl_Position = projectionMatrix * mv;
      vTint = aTint.rgb;
      vec3 lit = max(uSunLight * curve(aLight.x), vec3(1.0, 0.86, 0.66) * curve(aLight.y));
      vLit = max(lit, vec3(0.035, 0.035, 0.05)) * aTint.a;
      float d = length(mv.xyz);
      vView = d;
      vFog = smoothstep(uFogNear, uFogFar, d);
    }`;
  const TERRAIN_FS = `
    uniform sampler2D uAtlas; uniform vec3 uFogColor;
    varying vec2 vUv; varying vec3 vTint; varying vec3 vLit; varying float vFog; varying float vView;
    void main() {
      vec4 c = texture2D(uAtlas, vUv);
      #ifdef TRANS
        if (c.a < 0.02) discard;
        vec3 rgb = c.rgb * vTint;
        float a = c.a;
      #else
        if (c.a < 0.5) discard;
        vec3 rgb = c.a < 0.9 ? c.rgb * vTint : c.rgb;
        float a = 1.0;
      #endif
      gl_FragColor = vec4(mix(rgb * vLit, uFogColor, vFog), a);
    }`;
  const SKY_VS = `varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
  const SKY_FS = `
    uniform vec3 uZenith, uHorizon, uGlow, uSunDir; uniform float uGlowK;
    varying vec3 vDir;
    void main() {
      vec3 d = normalize(vDir);
      float h = clamp(d.y * 2.4 + 0.08, 0.0, 1.0);
      vec3 c = mix(uHorizon, uZenith, pow(h, 0.62));
      float s = max(dot(normalize(vec3(d.x, d.y * 0.6, d.z)), uSunDir), 0.0);
      c = mix(c, uGlow, uGlowK * pow(s, 3.0) * (1.0 - h * 0.9));
      if (d.y < -0.02) c = mix(c, uHorizon * 0.72, clamp(-d.y * 3.0, 0.0, 1.0));
      gl_FragColor = vec4(c, 1.0);
    }`;
  const PART_VS = `
    attribute vec2 aCorner; attribute vec4 aColor;
    uniform float uFogNear, uFogFar;
    varying vec2 vUv; varying vec4 vColor; varying float vFog;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      mv.xy += aCorner;
      gl_Position = projectionMatrix * mv;
      vUv = uv; vColor = aColor;
      vFog = smoothstep(uFogNear, uFogFar, length(mv.xyz));
    }`;
  const PART_FS = `
    uniform sampler2D uAtlas; uniform vec3 uFogColor;
    varying vec2 vUv; varying vec4 vColor; varying float vFog;
    void main() {
      vec4 c = texture2D(uAtlas, vUv) * vColor;
      if (c.a < 0.05) discard;
      gl_FragColor = vec4(mix(c.rgb, uFogColor, vFog), c.a);
    }`;
  const ITEM_VS = `
    attribute vec4 aTint; uniform float uFogNear, uFogFar;
    varying vec2 vUv; varying vec4 vTint; varying float vFog;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      vUv = uv; vTint = aTint;
      vFog = smoothstep(uFogNear, uFogFar, length(mv.xyz));
    }`;
  const ITEM_FS = `
    uniform sampler2D uAtlas; uniform vec3 uFogColor, uLit;
    varying vec2 vUv; varying vec4 vTint; varying float vFog;
    void main() {
      vec4 c = texture2D(uAtlas, vUv);
      if (c.a < 0.5) discard;
      vec3 rgb = (c.a < 0.9 ? c.rgb * vTint.rgb : c.rgb) * vTint.a * uLit;
      gl_FragColor = vec4(mix(rgb, uFogColor, vFog), 1.0);
    }`;

  // ---------- Models ----------
  const canvas2 = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const speckle = (hex, jitter = .08, seed = 1) => (g, x, y, w, h) => {
    const [r, gr, b] = CraftTex.rgb(hex);
    let s = seed * 9973 + x * 31 + y * 17;
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const k = 1 + ((s >> 8) % 100 / 100 - .5) * jitter * 2;
      g.fillStyle = `rgb(${Math.min(255, r * k) | 0},${Math.min(255, gr * k) | 0},${Math.min(255, b * k) | 0})`;
      g.fillRect(x + i, y + j, 1, 1);
    }
  };
  const dots = (hex, pts) => (g, x, y) => { g.fillStyle = hex; for (const [a, b, c = 1, d = 1] of pts) g.fillRect(x + a, y + b, c, d); };
  const layers = (...fns) => (g, x, y, w, h) => fns.forEach(f => f(g, x, y, w, h));
  const SKINS = {};
  // Every part: [name, parent or null, pivot xyz, box min xyz, size xyz, painter]. Models face -z. One unit is 1/16 block.
  const faceP = (base, front, o = {}) => ({ all: base, front: layers(base, front), ...o });
  const hoodie = '#d98a1f', hoodieD = '#b56f14', jeans = '#2e3440', skin = '#e8b58a', hair = '#2c1d12';
  const humanoid = (head, body, armL, armR, leg, o = {}) => {
    const lw = o.limb || 4;
    return [
      ['body', null, [0, 12, 0], [-4, 0, -2], [8, 12, 4], body],
      ['head', null, [0, 24, 0], [-4, 0, -4], [8, 8, 8], head],
      ['armL', null, [-4 - lw / 2, 23, 0], [-lw / 2, -11, -lw / 2], [lw, 12, lw], armL],
      ['armR', null, [4 + lw / 2, 23, 0], [-lw / 2, -11, -lw / 2], [lw, 12, lw], armR],
      ['legL', null, [-2, 12, 0], [-lw / 2, -12, -lw / 2], [lw, 12, lw], leg],
      ['legR', null, [2, 12, 0], [-lw / 2, -12, -lw / 2], [lw, 12, lw], leg],
    ];
  };
  const sleeve = { all: speckle(hoodie, .06, 3), bottom: speckle(skin, .03, 4) };
  const armPaint = { all: layers(speckle(hoodie, .06, 3), dots(skin, [[0, 9, 4, 3]])), top: speckle(hoodie, .05, 3), bottom: speckle(skin, .03, 4) };
  const MODELS = {
    player: { scale: .9, parts: humanoid(
      { all: speckle(skin, .03, 5), top: speckle(hair, .1, 6), back: speckle(hair, .1, 6), left: layers(speckle(skin, .03, 5), dots(hair, [[0, 0, 8, 3]])), right: layers(speckle(skin, .03, 5), dots(hair, [[0, 0, 8, 3]])),
        front: layers(speckle(skin, .03, 5), dots(hair, [[0, 0, 8, 2], [0, 2, 1, 1], [7, 2, 1, 1]]), dots('#ffffff', [[1, 4, 2, 1], [5, 4, 2, 1]]), dots('#1f3f6a', [[2, 4, 1, 1], [5, 4, 1, 1]]), dots('#a86f4c', [[3, 6, 2, 1]])) },
      { all: speckle(hoodie, .06, 7), front: layers(speckle(hoodie, .06, 7), dots(hoodieD, [[3, 0, 2, 3], [2, 8, 4, 3]]), dots('#f4f1e8', [[3, 3, 1, 3], [4, 3, 1, 3]])) },
      armPaint, armPaint, { all: speckle(jeans, .1, 8), bottom: speckle('#191b20', .1, 9) }) },
    zombie: { scale: .9, armsUp: true, parts: humanoid(
      { all: speckle('#7d8a6a', .1, 11), top: speckle('#4c4235', .12, 12), front: layers(speckle('#7d8a6a', .1, 11), dots('#d8d24a', [[1, 3, 2, 2], [5, 3, 2, 2]]), dots('#20261a', [[2, 4, 1, 1], [5, 4, 1, 1], [2, 6, 4, 1]])) },
      { all: speckle('#5a4a35', .14, 13), front: layers(speckle('#5a4a35', .14, 13), dots('#7d8a6a', [[1, 9, 2, 3], [5, 7, 2, 2], [3, 10, 1, 2]])) },
      { all: speckle('#7d8a6a', .1, 14), top: speckle('#5a4a35', .14, 13) }, { all: speckle('#7d8a6a', .1, 14), top: speckle('#5a4a35', .14, 13) },
      { all: layers(speckle('#3a3128', .14, 15), dots('#7d8a6a', [[1, 9, 2, 3]])) }) },
    skeleton: { scale: .9, armsUp: true, bow: true, parts: humanoid(
      { all: speckle('#cfcfc7', .05, 21), front: layers(speckle('#cfcfc7', .05, 21), dots('#1c1c1c', [[1, 3, 2, 2], [5, 3, 2, 2], [3, 5, 2, 1], [2, 7, 1, 1], [4, 7, 1, 1]])) },
      { all: (g, x, y, w, h) => { g.fillStyle = '#2a2a28'; g.fillRect(x, y, w, h); g.fillStyle = '#cfcfc7'; for (let i = 0; i < h; i += 2) g.fillRect(x, y + i, w, 1); g.fillRect(x + (w >> 1) - 1, y, 2, h); } },
      { all: speckle('#cfcfc7', .05, 22) }, { all: speckle('#cfcfc7', .05, 22) }, { all: speckle('#bdbdb5', .05, 23) }, { limb: 2 }) },
    spider: { scale: 1, legs8: true, parts: [
      ['abdomen', null, [0, 9, 4], [-6, -4, 0], [12, 9, 13], { all: speckle('#2d2422', .16, 31), top: layers(speckle('#2d2422', .16, 31), dots('#8c2a1d', [[5, 1, 2, 11], [2, 4, 8, 1], [2, 8, 8, 1]])) }],
      ['head', null, [0, 8, 3], [-4, -3, -8], [8, 7, 8], { all: speckle('#3a2d2a', .14, 32), front: layers(speckle('#3a2d2a', .14, 32), dots('#ff3a2a', [[1, 1, 2, 1], [5, 1, 2, 1], [2, 3, 1, 1], [5, 3, 1, 1]])) }],
      ...[-1, 1].flatMap((sx, n) => [0, 1, 2, 3].map(i => ['leg' + (n * 4 + i), null, [sx * 3, 8, 3 - i * 2.4], sx < 0 ? [-15, -1, -1] : [0, -1, -1], [15, 2, 2], { all: speckle('#241c1a', .14, 33) }])),
    ] },
    pig: { scale: 1, parts: [
      ['body', null, [0, 11, 0], [-5, -4, -7], [10, 8, 15], { all: layers(speckle('#e6a0a8', .06, 41), dots('#c67c88', [[2, 2, 3, 2], [8, 6, 2, 2], [11, 3, 2, 1]])), top: layers(speckle('#ebaab1', .05, 42), dots('#c67c88', [[2, 4, 2, 3], [6, 9, 3, 2]])) }],
      ['head', null, [0, 11, -7], [-4, -3, -7], [8, 8, 7], faceP(speckle('#e6a0a8', .06, 43), dots('#1c1c1c', [[1, 2, 1, 2], [6, 2, 1, 2]]))],
      ['snout', 'head', [0, 0, -7], [-2, -2, -1], [4, 3, 1], { all: speckle('#d97f8c', .05, 44), front: layers(speckle('#d97f8c', .05, 44), dots('#7a3f49', [[0, 1, 1, 1], [3, 1, 1, 1]])) }],
      ['legFL', null, [-3, 7, -5], [-2, -7, -2], [4, 7, 4], { all: speckle('#d98d97', .06, 45) }], ['legFR', null, [3, 7, -5], [-2, -7, -2], [4, 7, 4], { all: speckle('#d98d97', .06, 45) }],
      ['legBL', null, [-3, 7, 6], [-2, -7, -2], [4, 7, 4], { all: speckle('#d98d97', .06, 45) }], ['legBR', null, [3, 7, 6], [-2, -7, -2], [4, 7, 4], { all: speckle('#d98d97', .06, 45) }],
    ] },
    cow: { scale: 1, parts: [
      ['body', null, [0, 19, 0], [-6, -5, -9], [12, 11, 18], { all: layers(speckle('#5b4230', .1, 51), dots('#efe7d6', [[2, 2, 4, 4], [10, 5, 5, 4], [0, 7, 2, 3], [13, 1, 3, 2]])), top: layers(speckle('#5b4230', .1, 51), dots('#efe7d6', [[3, 3, 4, 6], [7, 11, 3, 4]])), bottom: speckle('#efe7d6', .06, 52) }],
      ['head', null, [0, 21, -9], [-4, -5, -6], [8, 9, 6], faceP(speckle('#5b4230', .1, 53), dots('#efe7d6', [[2, 0, 4, 5]]), {})],
      ['muzzle', 'head', [0, -5, -6], [-3, 0, -1], [6, 4, 1], { all: speckle('#cdb7a0', .05, 54), front: layers(speckle('#cdb7a0', .05, 54), dots('#2a1c14', [[1, 1, 1, 1], [4, 1, 1, 1]])) }],
      ['eyes', 'head', [0, 0, -6], [-3, -2, -.2], [6, 1, .2], { all: dots('#111111', [[0, 0, 1, 1], [5, 0, 1, 1]]) }],
      ['hornL', 'head', [-4, 3, -3], [-1, 0, -1], [2, 2, 2], { all: speckle('#d8d2c0', .04, 55) }], ['hornR', 'head', [4, 3, -3], [-1, 0, -1], [2, 2, 2], { all: speckle('#d8d2c0', .04, 55) }],
      ['legFL', null, [-4, 13, -7], [-2, -13, -2], [4, 13, 4], { all: speckle('#4b3627', .1, 56) }], ['legFR', null, [4, 13, -7], [-2, -13, -2], [4, 13, 4], { all: speckle('#efe7d6', .06, 52) }],
      ['legBL', null, [-4, 13, 7], [-2, -13, -2], [4, 13, 4], { all: speckle('#efe7d6', .06, 52) }], ['legBR', null, [4, 13, 7], [-2, -13, -2], [4, 13, 4], { all: speckle('#4b3627', .1, 56) }],
    ] },
    sheep: { scale: 1, parts: [
      ['wool', null, [0, 13, 0], [-6, -5, -8], [12, 11, 16], { all: speckle('#ecebe4', .1, 61) }],
      ['body', null, [0, 13, 0], [-4, -4, -7], [8, 8, 14], { all: speckle('#d5c2ab', .06, 62) }],
      ['head', null, [0, 15, -8], [-3, -3, -7], [6, 7, 7], faceP(speckle('#d8c7b0', .05, 63), dots('#2a2118', [[0, 2, 2, 1], [4, 2, 2, 1], [2, 5, 2, 1]]))],
      ['legFL', null, [-3, 8, -5], [-1.5, -8, -1.5], [3, 8, 3], { all: speckle('#c7b59d', .06, 64) }], ['legFR', null, [3, 8, -5], [-1.5, -8, -1.5], [3, 8, 3], { all: speckle('#c7b59d', .06, 64) }],
      ['legBL', null, [-3, 8, 5], [-1.5, -8, -1.5], [3, 8, 3], { all: speckle('#c7b59d', .06, 64) }], ['legBR', null, [3, 8, 5], [-1.5, -8, -1.5], [3, 8, 3], { all: speckle('#c7b59d', .06, 64) }],
    ] },
    chicken_mob: { scale: 1, parts: [
      ['body', null, [0, 7, 0], [-3, -3, -4], [6, 6, 8], { all: speckle('#efe9d8', .05, 71), top: speckle('#f5f0e2', .05, 72) }],
      ['head', null, [0, 9, -3], [-2, 0, -3], [4, 6, 3], faceP(speckle('#efe9d8', .05, 73), dots('#111111', [[0, 1, 1, 1], [3, 1, 1, 1]]))],
      ['beak', 'head', [0, 3, -3], [-2, -1, -2], [4, 2, 2], { all: speckle('#e8a020', .05, 74) }],
      ['wattle', 'head', [0, 1, -3], [-1, -2, -1], [2, 2, 1], { all: speckle('#c92f26', .05, 75) }],
      ['wingL', null, [-3, 9, 0], [-1, -4, -3], [1, 5, 6], { all: speckle('#dfd8c5', .06, 76) }], ['wingR', null, [3, 9, 0], [0, -4, -3], [1, 5, 6], { all: speckle('#dfd8c5', .06, 76) }],
      ['legL', null, [-1.5, 4, 0], [-.5, -4, -1], [1, 4, 2], { all: speckle('#e8a020', .05, 74) }], ['legR', null, [1.5, 4, 0], [-.5, -4, -1], [1, 4, 2], { all: speckle('#e8a020', .05, 74) }],
    ] },
    // An original exploding walker: a grumpy mushroom on stubby feet.
    blastcap: { scale: 1, parts: [
      ['body', null, [0, 4, 0], [-4, 0, -4], [8, 13, 8], { all: speckle('#e6dcc2', .07, 81), front: layers(speckle('#e6dcc2', .07, 81), dots('#2a1320', [[1, 4, 2, 2], [5, 4, 2, 2], [1, 3, 3, 1], [4, 3, 3, 1], [2, 8, 4, 1], [1, 9, 1, 1], [6, 9, 1, 1]]), dots('#ff7a18', [[2, 5, 1, 1], [5, 5, 1, 1]])) }],
      ['cap', null, [0, 15, 0], [-9, 0, -9], [18, 7, 18], { all: layers(speckle('#6c2fa6', .1, 82), dots('#ff9a2a', [[2, 2, 3, 2], [11, 1, 3, 3], [6, 4, 2, 2], [15, 4, 2, 2]])), top: layers(speckle('#7a39b8', .1, 83), dots('#ff9a2a', [[3, 3, 3, 3], [12, 2, 3, 3], [8, 8, 3, 3], [2, 12, 3, 3], [13, 12, 3, 3]])), bottom: speckle('#3d1a5e', .08, 84) }],
      ['legFL', null, [-3, 4, -2], [-2, -4, -3], [4, 4, 5], { all: speckle('#b8ab8c', .07, 85) }], ['legFR', null, [3, 4, -2], [-2, -4, -3], [4, 4, 5], { all: speckle('#b8ab8c', .07, 85) }],
      ['legBL', null, [-3, 4, 2], [-2, -4, -2], [4, 4, 5], { all: speckle('#b8ab8c', .07, 85) }], ['legBR', null, [3, 4, 2], [-2, -4, -2], [4, 4, 5], { all: speckle('#b8ab8c', .07, 85) }],
    ] },
  };
  // Corners run counterclockwise from the bottom left as seen from outside each face.
  const FACE_ORDER = [['right', [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], 2, 1, .62], ['left', [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], 2, 1, .62], ['top', [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], 0, 2, 1], ['bottom', [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], 0, 2, .5], ['back', [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], 0, 1, .8], ['front', [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], 0, 1, .8]];
  const built = {};
  function modelKit(type, variant) {
    const key = type + (variant || '');
    if (built[key]) return built[key];
    const def = MODELS[type], W = 256, c = canvas2(W, W), g = c.getContext('2d');
    let px = 0, py = 0, rowH = 0;
    const parts = {};
    for (const [name, parent, pivot, min, size, paint] of def.parts) {
      const pos = [], uv = [], col = [], idx = [];
      FACE_ORDER.forEach(([face, corners, ua, va, shade]) => {
        const w = Math.max(1, Math.ceil(size[ua])), h = Math.max(1, Math.ceil(size[va]));
        if (px + w > W) { px = 0; py += rowH + 1; rowH = 0; }
        const p = paint[face] || paint.all;
        if (p) { g.save(); g.beginPath(); g.rect(px, py, w, h); g.clip(); p(g, px, py, w, h); g.restore(); }
        const n = pos.length / 3;
        corners.forEach(cn => {
          pos.push((min[0] + cn[0] * size[0]) / 16, (min[1] + cn[1] * size[1]) / 16, (min[2] + cn[2] * size[2]) / 16);
          col.push(shade, shade, shade);
        });
        const u0 = (px + .02) / W, u1 = (px + w - .02) / W, v0 = 1 - (py + .02) / W, v1 = 1 - (py + h - .02) / W;
        uv.push(u0, v1, u1, v1, u1, v0, u0, v0);
        idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
        px += w + 1; rowH = Math.max(rowH, h);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      parts[name] = { geo, parent, pivot };
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    return (built[key] = { parts, tex, scale: def.scale, def });
  }
  const makeModel = (type, tintHex) => {
    const kit = modelKit(type), group = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ map: kit.tex, vertexColors: true }), p = {};
    if (tintHex !== undefined) { mat.userData.base = new THREE.Color(tintHex); }
    for (const name in kit.parts) {
      const part = kit.parts[name], piv = new THREE.Group();
      piv.position.set(part.pivot[0] / 16, part.pivot[1] / 16, part.pivot[2] / 16);
      piv.add(new THREE.Mesh(part.geo, mat));
      p[name] = piv;
    }
    for (const name in kit.parts) (kit.parts[name].parent ? p[kit.parts[name].parent] : group).add(p[name]);
    group.scale.setScalar(kit.scale);
    return { group, parts: p, mat, type, def: kit.def };
  };

  function create(parent, opts = {}) {
    const atlasInfo = CraftTex.build();
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    renderer.autoClear = false;
    const canvas = renderer.domElement;
    parent.append(canvas);
    const atlas = new THREE.DataTexture(atlasInfo.mips[0].data, atlasInfo.W, atlasInfo.W, THREE.RGBAFormat, THREE.UnsignedByteType);
    atlas.mipmaps = atlasInfo.mips;
    atlas.magFilter = THREE.NearestFilter; atlas.minFilter = THREE.NearestMipmapLinearFilter;
    atlas.generateMipmaps = false; atlas.flipY = false; atlas.needsUpdate = true;
    const shared = { uAtlas: { value: atlas }, uTime: { value: 0 }, uFogNear: { value: 60 }, uFogFar: { value: 120 }, uFogColor: { value: new THREE.Color(0xbfd8ff) }, uSunLight: { value: new THREE.Color(1, 1, 1) }, uWaves: { value: 1 } };
    const solidMat = new THREE.ShaderMaterial({ uniforms: shared, vertexShader: TERRAIN_VS, fragmentShader: TERRAIN_FS });
    const transMat = new THREE.ShaderMaterial({ uniforms: shared, vertexShader: TERRAIN_VS, fragmentShader: TERRAIN_FS, defines: { TRANS: 1 }, transparent: true, depthWrite: false });
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xbfd8ff, 60, 120);
    const camera = new THREE.PerspectiveCamera(70, 1, .05, 1200);
    camera.rotation.order = 'YXZ';
    const handScene = new THREE.Scene(), handCam = new THREE.PerspectiveCamera(70, 1, .01, 10);
    let scaleFactor = opts.scale || 1;
    const resize = () => {
      const w = parent.clientWidth || innerWidth, h = parent.clientHeight || innerHeight;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2) * scaleFactor);
      renderer.setSize(w, h, false);
      canvas.style.width = '100%'; canvas.style.height = '100%';
      camera.aspect = handCam.aspect = w / h;
      camera.updateProjectionMatrix(); handCam.updateProjectionMatrix();
    };
    resize();

    // Shared quad index: every section mesh draws 2 triangles per 4 vertices.
    const QUADS = 24576, indices = new Uint32Array(QUADS * 6);
    for (let i = 0; i < QUADS; i++) { const v = i * 4, o = i * 6; indices[o] = v; indices[o + 1] = v + 1; indices[o + 2] = v + 2; indices[o + 3] = v; indices[o + 4] = v + 2; indices[o + 5] = v + 3; }
    const indexAttr = new THREE.BufferAttribute(indices, 1);
    const freeMesh = m => { scene.remove(m); m.geometry.index = null; m.geometry.dispose(); };
    const makeMesh = (data, mat, x, y, z) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(data.pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2, true));
      g.setAttribute('aTint', new THREE.BufferAttribute(data.tint, 4, true));
      g.setAttribute('aLight', new THREE.BufferAttribute(data.light, 4, true));
      g.setIndex(indexAttr);
      g.setDrawRange(0, data.quads * 6);
      const m = new THREE.Mesh(g, mat);
      m.frustumCulled = false; m.matrixAutoUpdate = false;
      m.position.set(x, y, z); m.updateMatrix();
      scene.add(m);
      return m;
    };
    const uploadSection = (s, data) => {
      if (s.opaque) { freeMesh(s.opaque); s.opaque = null; }
      if (s.trans) { freeMesh(s.trans); s.trans = null; }
      if (data.O) s.opaque = makeMesh(data.O, solidMat, s.x, s.y, s.z);
      if (data.T) { s.trans = makeMesh(data.T, transMat, s.x, s.y, s.z); s.trans.renderOrder = 2; }
    };
    const freeSection = s => {
      if (s.opaque) { freeMesh(s.opaque); s.opaque = null; }
      if (s.trans) { freeMesh(s.trans); s.trans = null; }
    };

    // ---------- Sky ----------
    const skyUni = { uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color(1, .55, .25) }, uSunDir: { value: new THREE.Vector3(1, 0, 0) }, uGlowK: { value: 0 } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 24, 16), new THREE.ShaderMaterial({ uniforms: skyUni, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false }));
    sky.renderOrder = -10; sky.frustumCulled = false;
    scene.add(sky);
    const celestial = new THREE.Group();
    scene.add(celestial);
    const disc = (paint, size) => {
      const c = canvas2(64, 64), g = c.getContext('2d');
      paint(g);
      const t = new THREE.CanvasTexture(c);
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      m.renderOrder = -8; m.frustumCulled = false;
      return m;
    };
    const sunM = disc(g => {
      // A chunky sun: a pale core inside stepped rings of warm pixels.
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) + Math.min(Math.abs(x - 7.5), Math.abs(y - 7.5)) * .35;
        const a = d < 3.8 ? 1 : d < 5 ? .85 : d < 6.4 ? .4 : d < 7.6 ? .12 : 0;
        g.fillStyle = `rgba(255,${d < 3.8 ? 250 : 214},${d < 3.8 ? 214 : 120},${a})`;
        g.fillRect(x * 4, y * 4, 4, 4);
      }
    }, 60);
    sunM.position.set(190, 0, 0); sunM.rotation.y = -Math.PI / 2;
    const moonDiscs = [];
    for (let phase = 0; phase < 8; phase++) {
      const m = disc(g => {
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy);
          if (d > 5.6) continue;
          // The lit edge slides across the disc as the nights pass; phase 4 is the new moon.
          const edge = Math.sqrt(Math.max(0, 31 - dy * dy)) * Math.cos(phase / 8 * 6.283);
          const lit = phase === 0 || (phase !== 4 && (phase < 4 ? dx > -edge : dx < edge));
          if (!lit) { g.fillStyle = 'rgba(70,80,110,.12)'; g.fillRect(x * 4, y * 4, 4, 4); continue; }
          const crater = (Math.hypot(dx + 2, dy + 1) < 1.6) || (Math.hypot(dx - 2, dy - 2) < 1.2) || (Math.hypot(dx - 1, dy + 3) < 1);
          g.fillStyle = crater ? 'rgb(166,172,190)' : 'rgb(226,230,240)';
          g.fillRect(x * 4, y * 4, 4, 4);
        }
      }, 44);
      m.position.set(-190, 0, 0); m.rotation.y = Math.PI / 2; m.visible = false;
      celestial.add(m); moonDiscs.push(m);
    }
    celestial.add(sunM);
    const starPos = [], sr = new THREE.Vector3();
    for (let i = 0; i < 1400; i++) { sr.set(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize().multiplyScalar(180); starPos.push(sr.x, sr.y, sr.z); }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    stars.renderOrder = -9; stars.frustumCulled = false;
    celestial.add(stars);

    // Clouds: a wrapping mask of 12 x 12 block cells turned into one mesh, then tiled around the camera.
    const CLOUD_N = 64, CLOUD_S = 12, CLOUD_Y = 192, CLOUD_H = 4;
    const cloudUni = { uColor: { value: new THREE.Color(1, 1, 1) }, uCenter: { value: new THREE.Vector3() }, uReach: { value: 300 }, uAlpha: { value: .82 } };
    const cloudMat = new THREE.ShaderMaterial({
      uniforms: cloudUni, transparent: true, depthWrite: true,
      vertexShader: `attribute float aShade; uniform vec3 uCenter; varying float vS; varying float vD; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vD = length(w.xz-uCenter.xz); vS = aShade; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uReach, uAlpha; varying float vS; varying float vD; void main(){ float a = uAlpha*(1.0-smoothstep(uReach*0.55,uReach,vD)); if(a<0.01) discard; gl_FragColor = vec4(uColor*vS,a); }`,
    });
    const cloudGeo = (() => {
      const r = new THREE.Vector2(), mask = new Uint8Array(CLOUD_N * CLOUD_N);
      const rnd = (x, y, s) => { const v = Math.sin((x % CLOUD_N) * 127.1 + (y % CLOUD_N) * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
      const n = (x, y, cell, s) => {
        const u = x / cell, v = y / cell, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, m = CLOUD_N / cell;
        const at = (a, b) => rnd(((a % m) + m) % m * cell, ((b % m) + m) % m * cell, s);
        const q = t => t * t * (3 - 2 * t), su = q(fu), sv = q(fv);
        return (at(i, j) * (1 - su) + at(i + 1, j) * su) * (1 - sv) + (at(i, j + 1) * (1 - su) + at(i + 1, j + 1) * su) * sv;
      };
      for (let y = 0; y < CLOUD_N; y++) for (let x = 0; x < CLOUD_N; x++) mask[x + y * CLOUD_N] = n(x, y, 8, 1) * .6 + n(x, y, 4, 2) * .4 > .54 ? 1 : 0;
      const pos = [], sh = [], at = (x, y) => mask[((x + CLOUD_N) % CLOUD_N) + ((y + CLOUD_N) % CLOUD_N) * CLOUD_N];
      const q = (a, b, c, e, s) => { pos.push(...a, ...b, ...c, ...a, ...c, ...e); for (let i = 0; i < 6; i++) sh.push(s); };
      const S = CLOUD_S, H = CLOUD_H;
      for (let y = 0; y < CLOUD_N; y++) for (let x = 0; x < CLOUD_N; x++) {
        if (!at(x, y)) continue;
        const X = x * S, Z = y * S;
        q([X, H, Z + S], [X + S, H, Z + S], [X + S, H, Z], [X, H, Z], 1);
        q([X, 0, Z], [X + S, 0, Z], [X + S, 0, Z + S], [X, 0, Z + S], .72);
        if (!at(x + 1, y)) q([X + S, 0, Z + S], [X + S, 0, Z], [X + S, H, Z], [X + S, H, Z + S], .8);
        if (!at(x - 1, y)) q([X, 0, Z], [X, 0, Z + S], [X, H, Z + S], [X, H, Z], .8);
        if (!at(x, y + 1)) q([X, 0, Z + S], [X + S, 0, Z + S], [X + S, H, Z + S], [X, H, Z + S], .88);
        if (!at(x, y - 1)) q([X + S, 0, Z], [X, 0, Z], [X, H, Z], [X + S, H, Z], .88);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aShade', new THREE.Float32BufferAttribute(sh, 1));
      r.set(0, 0);
      return g;
    })();
    const cloudMeshes = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(cloudGeo, cloudMat); m.frustumCulled = false; m.renderOrder = 1; scene.add(m); return m; });
    let cloudsOn = true;

    // ---------- Rain and snow ----------
    const WX = 900, wxPos = new Float32Array(WX * 3), wxFloor = new Float32Array(WX), wxOff = new Float32Array(WX * 2);
    const wxTex = (draw) => { const c = canvas2(16, 32), g = c.getContext('2d'); draw(g); const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t; };
    const rainT = wxTex(g => { g.fillStyle = 'rgba(180,205,255,.75)'; g.fillRect(7, 0, 2, 32); });
    const snowT = wxTex(g => { g.fillStyle = 'rgba(255,255,255,.95)'; g.fillRect(5, 12, 6, 6); g.fillRect(7, 10, 2, 10); g.fillRect(3, 14, 10, 2); });
    const wxGeo = new THREE.BufferGeometry();
    wxGeo.setAttribute('position', new THREE.BufferAttribute(wxPos, 3));
    const wxMat = new THREE.PointsMaterial({ map: rainT, size: 1.1, transparent: true, depthWrite: false, alphaTest: .05, sizeAttenuation: true, fog: false });
    const weatherPts = new THREE.Points(wxGeo, wxMat);
    weatherPts.frustumCulled = false; weatherPts.visible = false; weatherPts.renderOrder = 3;
    scene.add(weatherPts);
    for (let i = 0; i < WX; i++) { wxOff[i * 2] = Math.random() * 40 - 20; wxOff[i * 2 + 1] = Math.random() * 40 - 20; wxPos[i * 3 + 1] = -1e4; }

    // ---------- Particles ----------
    const PMAX = 900, pPos = new Float32Array(PMAX * 12), pCorner = new Float32Array(PMAX * 8), pUv = new Float32Array(PMAX * 8), pCol = new Float32Array(PMAX * 16);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('aCorner', new THREE.BufferAttribute(pCorner, 2).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('uv', new THREE.BufferAttribute(pUv, 2).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('aColor', new THREE.BufferAttribute(pCol, 4).setUsage(THREE.DynamicDrawUsage));
    const pIndex = new Uint16Array(PMAX * 6);
    for (let i = 0; i < PMAX; i++) { const v = i * 4, o = i * 6; pIndex[o] = v; pIndex[o + 1] = v + 1; pIndex[o + 2] = v + 2; pIndex[o + 3] = v; pIndex[o + 4] = v + 2; pIndex[o + 5] = v + 3; }
    pGeo.setIndex(new THREE.BufferAttribute(pIndex, 1));
    const partMesh = new THREE.Mesh(pGeo, new THREE.ShaderMaterial({ uniforms: shared, vertexShader: PART_VS, fragmentShader: PART_FS, transparent: true, depthWrite: false }));
    partMesh.frustumCulled = false; partMesh.renderOrder = 4;
    scene.add(partMesh);
    const particles = [];
    const tileUV = name => { const t = CraftTex.tileIndex(name); return [(t % 32) / 32, (t >> 5) / 32, 1 / 32]; };
    const addParticle = o => {
      if (particles.length >= PMAX) particles.shift();
      const [u, v, s] = o.tile ? tileUV(o.tile) : [0, 0, 1 / 32];
      const cut = o.cut || 1;
      particles.push({ x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, g: o.g === undefined ? 12 : o.g, drag: o.drag === undefined ? .98 : o.drag, life: o.life || .8, max: o.life || .8, size: o.size || .1, grow: o.grow || 0, fade: !!o.fade, r: o.r === undefined ? 1 : o.r, gc: o.gc === undefined ? 1 : o.gc, b: o.b === undefined ? 1 : o.b, a: o.a === undefined ? 1 : o.a, lit: !!o.lit,
        u0: u + (o.ou || 0) * s, v0: v + (o.ov || 0) * s, us: s / cut, collide: !!o.collide, glow: !!o.glow });
    };
    const updateParticles = (dt, solidAt, litAt) => {
      let n = 0;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.vy -= p.g * dt;
        const k = Math.pow(p.drag, dt * 60);
        p.vx *= k; p.vy *= k; p.vz *= k;
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
        if (p.collide && solidAt(Math.floor(nx), Math.floor(ny), Math.floor(nz))) { p.vx *= .4; p.vz *= .4; p.vy = 0; }
        else { p.x = nx; p.y = ny; p.z = nz; }
      }
      for (const p of particles) {
        const t = p.life / p.max, s = (p.size + p.grow * (1 - t)) * .5, l = p.glow ? 1 : litAt(p.x, p.y, p.z), a = p.fade ? p.a * t : p.a;
        const i3 = n * 12, i2 = n * 8, i4 = n * 16;
        for (let c = 0; c < 4; c++) {
          pPos[i3 + c * 3] = p.x; pPos[i3 + c * 3 + 1] = p.y; pPos[i3 + c * 3 + 2] = p.z;
          pCol[i4 + c * 4] = p.r * l; pCol[i4 + c * 4 + 1] = p.gc * l; pCol[i4 + c * 4 + 2] = p.b * l; pCol[i4 + c * 4 + 3] = a;
        }
        pCorner[i2] = -s; pCorner[i2 + 1] = -s; pCorner[i2 + 2] = s; pCorner[i2 + 3] = -s; pCorner[i2 + 4] = s; pCorner[i2 + 5] = s; pCorner[i2 + 6] = -s; pCorner[i2 + 7] = s;
        pUv[i2] = p.u0; pUv[i2 + 1] = p.v0 + p.us; pUv[i2 + 2] = p.u0 + p.us; pUv[i2 + 3] = p.v0 + p.us; pUv[i2 + 4] = p.u0 + p.us; pUv[i2 + 5] = p.v0; pUv[i2 + 6] = p.u0; pUv[i2 + 7] = p.v0;
        n++;
      }
      pGeo.setDrawRange(0, n * 6);
      for (const k of ['position', 'aCorner', 'uv', 'aColor']) pGeo.attributes[k].needsUpdate = true;
    };

    // ---------- Selection outline and cracks ----------
    const selMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: .55, depthWrite: false });
    const selection = new THREE.LineSegments(new THREE.BufferGeometry(), selMat);
    selection.frustumCulled = false; selection.visible = false;
    scene.add(selection);
    let selKey = '';
    const setSelection = (x, y, z, boxes, k) => {
      selection.position.set(x, y, z);
      selection.visible = true;
      if (k === selKey) return;
      selKey = k;
      const p = [], e = .002;
      for (const b of boxes) {
        const [a, c, f, g, h, i] = [b[0] - e, b[1] - e, b[2] - e, b[3] + e, b[4] + e, b[5] + e];
        const cs = [[a, c, f], [g, c, f], [g, c, i], [a, c, i], [a, h, f], [g, h, f], [g, h, i], [a, h, i]];
        for (const [m, n] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) p.push(...cs[m], ...cs[n]);
      }
      selection.geometry.dispose();
      selection.geometry = new THREE.BufferGeometry();
      selection.geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    };
    const crackUv = new Float32Array(48);
    const crackGeo = (() => {
      const g = new THREE.BoxGeometry(1.004, 1.004, 1.004);
      g.translate(.5, .5, .5);
      g.setAttribute('uv', new THREE.BufferAttribute(crackUv, 2));
      return g;
    })();
    const crack = new THREE.Mesh(crackGeo, new THREE.MeshBasicMaterial({ map: atlas, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, fog: false, opacity: .85 }));
    crack.visible = false; crack.frustumCulled = false; crack.renderOrder = 5;
    scene.add(crack);
    let crackStage = -1;
    const setCrack = (x, y, z, stage) => {
      if (stage < 0) { crack.visible = false; return; }
      crack.visible = true; crack.position.set(x, y, z);
      if (stage === crackStage) return;
      crackStage = stage;
      const [u, v, s] = tileUV('destroy_' + stage);
      for (let i = 0; i < 6; i++) {
        const o = i * 8;
        crackUv.set([u, v, u + s, v, u, v + s, u + s, v + s], o);
      }
      crackGeo.attributes.uv.needsUpdate = true;
    };

    // ---------- Items as 3D objects ----------
    const itemUni = { uAtlas: shared.uAtlas, uFogColor: shared.uFogColor, uFogNear: shared.uFogNear, uFogFar: shared.uFogFar };
    const newItemMat = () => new THREE.ShaderMaterial({ uniforms: { ...itemUni, uLit: { value: new THREE.Color(1, 1, 1) } }, vertexShader: ITEM_VS, fragmentShader: ITEM_FS, side: THREE.DoubleSide });
    const itemGeos = new Map();
    const FLAT = new Set(['cross', 'crop', 'torch', 'ladder', 'vine', 'pane', 'flat', 'lantern', 'door', 'fire']);
    const blockGeometry = id => {
      const d = D.blocks[id], pos = [], uv = [], tint = [], idx = [];
      const parts = D.shape(id, 0, 3).vis, tr = d.tint === 'grass' ? [124, 189, 84] : d.tint === 'foliage' ? [90, 165, 60] : [255, 255, 255];
      CraftMesher.init();
      for (const B of parts) CraftMesher.FACES.forEach((face, f) => {
        const t = CraftMesher.tileFor(id, 0, f), u0 = (t % 32) / 32, v0 = (t >> 5) / 32, s = 1 / 32, n = pos.length / 3;
        face.c.forEach((v, ci) => {
          const vx = v[0] ? B[3] : B[0], vy = v[1] ? B[4] : B[1], vz = v[2] ? B[5] : B[2];
          pos.push(vx - .5, vy - .5, vz - .5);
          let a, b;
          if (f === 0) { a = 1 - vz; b = 1 - vy; } else if (f === 1) { a = vz; b = 1 - vy; } else if (f === 2) { a = vx; b = vz; } else if (f === 3) { a = vx; b = 1 - vz; } else if (f === 4) { a = vx; b = 1 - vy; } else { a = 1 - vx; b = 1 - vy; }
          uv.push(u0 + a * s * .998 + .00002, v0 + b * s * .998 + .00002);
          tint.push(tr[0] / 255, tr[1] / 255, tr[2] / 255, face.shade / 255);
        });
        idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 4));
      g.setIndex(idx);
      return g;
    };
    const flatGeometry = id => {
      // Extrudes the icon's pixels into a thin solid, one little box face at a time.
      const px = CraftTex.pixelsOf(id);
      const g = new THREE.BufferGeometry();
      if (!px) return g;
      const W = px.w, H = px.h, pos = [], col = [], idx = [], step = 1 / Math.max(W, H), t = step * .95;
      const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : px.data[(x + y * W) * 4 + 3]);
      const add = (a, b, c, e, r, gc, bl, sh) => { const n = pos.length / 3; pos.push(...a, ...b, ...c, ...e); for (let i = 0; i < 4; i++) col.push(r * sh, gc * sh, bl * sh); idx.push(n, n + 1, n + 2, n, n + 2, n + 3); };
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (at(x, y) < 128) continue;
        const i = (x + y * W) * 4, r = px.data[i] / 255, gc = px.data[i + 1] / 255, bl = px.data[i + 2] / 255;
        const X = (x - W / 2) * step, Y = (H / 2 - y) * step, Z = t / 2, S = step;
        add([X, Y - S, Z], [X + S, Y - S, Z], [X + S, Y, Z], [X, Y, Z], r, gc, bl, 1);
        add([X + S, Y - S, -Z], [X, Y - S, -Z], [X, Y, -Z], [X + S, Y, -Z], r, gc, bl, .85);
        if (at(x, y - 1) < 128) add([X, Y, Z], [X + S, Y, Z], [X + S, Y, -Z], [X, Y, -Z], r, gc, bl, .95);
        if (at(x, y + 1) < 128) add([X, Y - S, -Z], [X + S, Y - S, -Z], [X + S, Y - S, Z], [X, Y - S, Z], r, gc, bl, .6);
        if (at(x + 1, y) < 128) add([X + S, Y - S, Z], [X + S, Y - S, -Z], [X + S, Y, -Z], [X + S, Y, Z], r, gc, bl, .75);
        if (at(x - 1, y) < 128) add([X, Y - S, -Z], [X, Y - S, Z], [X, Y, Z], [X, Y, -Z], r, gc, bl, .75);
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      return g;
    };
    // Returns { mesh, setLit(r, g, b), flat }. Geometry is cached; materials are per object so each can match its light.
    const itemObject = id => {
      const it = D.items[id], d = it && it.block !== undefined ? D.blocks[it.block] : null, isBlock = d && !FLAT.has(d.shape) && !d.stages;
      let g = itemGeos.get(id);
      if (!g) itemGeos.set(id, g = isBlock ? blockGeometry(it.block) : flatGeometry(id));
      if (isBlock) {
        const mat = newItemMat(), mesh = new THREE.Mesh(g, mat);
        mesh.frustumCulled = false;
        return { mesh, flat: false, setLit: (r, gc, b) => mat.uniforms.uLit.value.setRGB(r, gc, b), mat };
      }
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      return { mesh, flat: true, setLit: (r, gc, b) => mat.color.setRGB(r, gc, b), mat };
    };

    // ---------- First-person hand ----------
    const hand = new THREE.Group();
    handScene.add(hand);
    const armKit = makeModel('player');
    const armPiece = armKit.parts.armR.children[0];
    armPiece.material = armKit.mat;
    const armGroup = new THREE.Group();
    armGroup.add(armPiece);
    armPiece.position.set(0, 0, 0);
    armPiece.scale.setScalar(.85);
    hand.add(armGroup);
    let heldObj = null, heldId = -1;
    const setHeld = id => {
      if (id === heldId) return;
      heldId = id;
      if (heldObj) { hand.remove(heldObj.mesh); heldObj.mat.dispose(); heldObj = null; }
      armGroup.visible = !id;
      if (!id) return;
      heldObj = itemObject(id);
      hand.add(heldObj.mesh);
      const it = D.items[id];
      if (heldObj.flat) {
        heldObj.mesh.scale.setScalar(.62);
        heldObj.mesh.position.set(.52, -.42, -.8);
        heldObj.mesh.rotation.set(0, -1.1, .3);
        if (it.tool || it.bow) { heldObj.mesh.rotation.set(-.1, -1.45, .55); heldObj.mesh.position.set(.52, -.3, -.76); }
      } else {
        heldObj.mesh.scale.setScalar(.3);
        heldObj.mesh.position.set(.52, -.42, -.75);
        heldObj.mesh.rotation.set(0, .8, 0);
      }
    };
    const handState = { swing: 0, equip: 0, bobX: 0, bobY: 0, eat: 0, draw: 0 };
    const updateHand = (lit) => {
      const s = handState, sw = s.swing, k = Math.sin(sw * Math.PI), k2 = Math.sin(Math.sqrt(sw) * Math.PI);
      hand.position.set(s.bobX - k2 * .32, s.bobY - .1 * Math.sin(sw * sw * Math.PI) - s.equip * .5 + k2 * .16, -k * .16);
      hand.rotation.set(-k2 * .55 + s.eat * .2, k2 * -.3, -k * .22);
      if (s.eat) { hand.position.y += s.eat * (.12 + Math.sin(performance.now() * .03) * .02); hand.position.x -= s.eat * .28; }
      if (s.draw) { hand.position.x -= s.draw * .25; hand.position.z += s.draw * .12; hand.rotation.z = s.draw * .15; }
      armGroup.position.set(.5, -.62, -.25);
      armGroup.rotation.set(1.9, 0, -.28);
      armKit.mat.color.setRGB(lit, lit, lit);
      if (heldObj) heldObj.setLit(lit, lit, lit);
    };

    // ---------- Frame ----------
    const lerpc = (a, b, t) => a + (b - a) * t;
    const state = { dayK: 1, sunY: 1, rain: 0, under: 0, night: 0, fogNear: 60, fogFar: 120, zen: new THREE.Color(), hor: new THREE.Color(), weather: null };
    const setDistance = r => {
      state.fogFar = r * 16 - 4;
      state.fogNear = Math.max(10, r * 16 * .62);
      cloudUni.uReach.value = Math.max(220, r * 16 * 2.4);
      camera.far = Math.max(600, r * 16 * 3 + 200);
      camera.updateProjectionMatrix();
    };
    const setSky = (time, rain, thunder, fluid, biomeRain, day = 0) => {
      const t = ((time % 24000) + 24000) % 24000, a = t / 24000 * Math.PI * 2;
      const sy = Math.sin(a);
      const dayK = Math.min(1, Math.max(0, sy * 2 + .5));
      state.dayK = dayK; state.sunY = sy; state.rain = rain;
      celestial.rotation.z = a;
      moonDiscs.forEach((m, i) => { m.visible = i === (day % 8); });
      // Rain and thunder drain the colour out of the sky and darken it.
      const dark = 1 - rain * .42 - thunder * .25, grey = rain * .9;
      const wash = (r, g, b) => { const l = r * .3 + g * .59 + b * .11; return [lerpc(r, l, grey) * dark, lerpc(g, l, grey) * dark, lerpc(b, l, grey) * dark]; };
      const [zr, zg, zb] = wash(lerpc(.018, .36, dayK), lerpc(.022, .56, dayK), lerpc(.05, 1, dayK));
      const [hr, hg, hb] = wash(lerpc(.03, .72, dayK), lerpc(.04, .84, dayK), lerpc(.09, 1, dayK));
      state.zen.setRGB(zr, zg, zb);
      state.hor.setRGB(hr, hg, hb);
      skyUni.uZenith.value.copy(state.zen);
      skyUni.uHorizon.value.copy(state.hor);
      skyUni.uSunDir.value.set(Math.cos(a), sy * .6, 0).normalize();
      const dusk = Math.max(0, 1 - Math.abs(sy) * 3.2);
      skyUni.uGlowK.value = dusk * .9 * (1 - rain);
      sunM.material.opacity = 1 - rain;
      moonDiscs.forEach(m => { m.material.opacity = 1 - rain; });
      stars.material.opacity = Math.max(0, 1 - dayK * 2.2) * (1 - rain);
      // The daylight colour warms near sunset and turns to cool moonlight overnight.
      const warm = dusk * .22, sun = lerpc(.13, 1, dayK) * (1 - rain * .32 - thunder * .1);
      shared.uSunLight.value.setRGB(Math.min(1, sun * (1 + warm)) , sun * (1 - warm * .1), Math.max(sun * (1 - warm * .55), .2 * (1 - dayK)));
      // Fog takes the horizon colour, tilting toward the sunset glow on the sun's side.
      const fc = shared.uFogColor.value;
      if (fluid === 1) { fc.setRGB(.03 + .05 * dayK, .12 + .2 * dayK, .32 + .42 * dayK); shared.uFogNear.value = 1; shared.uFogFar.value = 20 + 22 * dayK; }
      else if (fluid === 2) { fc.setRGB(.8, .28, .04); shared.uFogNear.value = 0; shared.uFogFar.value = 2.4; }
      else {
        const look = Math.max(0, camera.getWorldDirection(tmpV).x * Math.cos(a) + tmpV.z * 0) * dusk;
        fc.setRGB(lerpc(hr, 1, look * .6), lerpc(hg, .55, look * .55), lerpc(hb, .32, look * .6));
        const r2 = 1 - rain * .3;
        shared.uFogNear.value = state.fogNear * r2; shared.uFogFar.value = state.fogFar;
      }
      scene.fog.color.copy(fc); scene.fog.near = shared.uFogNear.value; scene.fog.far = shared.uFogFar.value;
      cloudUni.uColor.value.setRGB(lerpc(.08, 1, dayK) * (1 - rain * .45), lerpc(.09, 1, dayK) * (1 - rain * .45), lerpc(.14, 1, dayK) * (1 - rain * .42));
      if (dusk > 0) { const c = cloudUni.uColor.value; c.r = Math.min(1, c.r + dusk * .22); c.b *= 1 - dusk * .22; }
    };
    const tmpV = new THREE.Vector3();
    const litAt = (light) => {
      // Light byte to a brightness, with the sun's current strength applied.
      const sky = .05 + .95 * Math.pow(.84, (15 - (light >> 4))), blk = .05 + .95 * Math.pow(.84, (15 - (light & 15)));
      return Math.max(.05, sky * shared.uSunLight.value.g, blk);
    };
    const updateWeather = (dt, cam, kind, solidTop) => {
      weatherPts.visible = !!kind;
      if (!kind) return;
      wxMat.map = kind === 'snow' ? snowT : rainT;
      wxMat.size = kind === 'snow' ? .32 : .95;
      const speed = kind === 'snow' ? 3 : 24;
      for (let i = 0; i < WX; i++) {
        const p = i * 3;
        wxPos[p + 1] -= speed * dt;
        if (kind === 'snow') { wxPos[p] += Math.sin(wxPos[p + 1] * .8 + i) * dt * .7; }
        if (wxPos[p + 1] < wxFloor[i] || wxPos[p + 1] < cam.y - 22) {
          const x = cam.x + wxOff[i * 2], z = cam.z + wxOff[i * 2 + 1], h = solidTop(Math.floor(x), Math.floor(z));
          wxOff[i * 2] = Math.random() * 40 - 20; wxOff[i * 2 + 1] = Math.random() * 40 - 20;
          wxPos[p] = x; wxPos[p + 2] = z; wxFloor[i] = h + 1;
          const start = Math.max(cam.y + 16 + Math.random() * 12, h + 2);
          wxPos[p + 1] = start;
        }
      }
      wxGeo.attributes.position.needsUpdate = true;
    };
    const frustum = new THREE.Frustum(), pv = new THREE.Matrix4();
    const planes = () => {
      camera.updateMatrixWorld();
      pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(pv);
      return frustum.planes;
    };
    let quake = 0;
    const render = (time, showHand) => {
      shared.uTime.value = time;
      sky.position.copy(camera.position);
      celestial.position.copy(camera.position);
      if (cloudsOn) {
        const ox = time * 1.2, S = CLOUD_N * CLOUD_S, cx = camera.position.x - ox, cz = camera.position.z;
        const bx = Math.floor(cx / S - .5), bz = Math.floor(cz / S - .5);
        cloudMeshes.forEach((m, i) => { m.visible = true; m.position.set((bx + (i & 1)) * S + ox, CLOUD_Y, (bz + (i >> 1)) * S); });
        cloudUni.uCenter.value.copy(camera.position);
      } else cloudMeshes.forEach(m => { m.visible = false; });
      renderer.clear();
      renderer.render(scene, camera);
      if (showHand) { renderer.clearDepth(); renderer.render(handScene, handCam); }
    };
    const setClouds = v => { cloudsOn = v; };
    const dispose = () => {
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch (e) {}
      canvas.remove();
    };
    const setScale = v => { scaleFactor = v; resize(); };
    const setFov = v => { camera.fov = v; camera.updateProjectionMatrix(); };
    return {
      renderer, canvas, scene, camera, handCam, atlas, shared, state, resize, uploadSection, freeSection, setSky, setDistance, render, setClouds, dispose, setScale, setFov, planes,
      addParticle, updateParticles, setSelection, hideSelection: () => { selection.visible = false; selKey = ''; }, setCrack, itemObject, setHeld, handState, updateHand, litAt, updateWeather, makeModel, setWaves: v => { shared.uWaves.value = v ? 1 : 0; },
    };
  }
  return { create, makeModel, speckle };
})();
