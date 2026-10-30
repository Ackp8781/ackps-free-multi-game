// Shared 3D stage and the procedural model library used by every 3D game.
const Gfx = (() => {
  const mats = new Map();
  const mat = (color, o = {}) => {
    const key = color + JSON.stringify(o);
    if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: .6, metalness: .05, ...o }));
    return mats.get(key);
  };
  const skyTex = (top, bottom) => {
    const c = el('canvas', { width: 4, height: 256 }), g = c.getContext('2d'), s = g.createLinearGradient(0, 0, 0, 256);
    s.addColorStop(0, top); s.addColorStop(1, bottom);
    g.fillStyle = s; g.fillRect(0, 0, 4, 256);
    return new THREE.CanvasTexture(c);
  };
  // Creates a renderer inside the game stage. Everything is released by ctx.clear().
  function stage(ctx, o = {}) {
    const ratio = o.ratio || 16 / 9, reserve = o.reserve === undefined ? 190 : o.reserve;
    const wrap = el('div', { class: 'game3d' });
    (o.parent || ctx.stage).append(wrap);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = renderer.domElement;
    wrap.append(canvas);
    const scene = new THREE.Scene();
    scene.background = skyTex(o.top || '#4aa8f0', o.bottom || '#d6f1ff');
    if (o.fog) scene.fog = new THREE.Fog(o.fog[0], o.fog[1], o.fog[2]);
    const camera = new THREE.PerspectiveCamera(o.fov || 55, ratio, o.near || 1, o.far || 4000);
    scene.add(new THREE.HemisphereLight(o.skyLight || 0xffffff, o.groundLight || 0x667788, o.hemi || .75));
    const sun = new THREE.DirectionalLight(o.sunColor || 0xfff2d8, o.sunPower || .85);
    const R = o.shadow || 500, sunDir = new THREE.Vector3(...(o.sunDir || [.5, 1, .35])).normalize();
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: R * 6 });
    sun.shadow.bias = -.0006;
    scene.add(sun, sun.target);
    const follow = (x, y, z) => { sun.target.position.set(x, y, z); sun.position.set(x, y, z).addScaledVector(sunDir, R * 2.5); };
    follow(...(o.center || [0, 0, 0]));
    const size = () => {
      const w = ctx.stage.clientWidth || 800, h = Math.max(200, Math.min(w / ratio, innerHeight - reserve)), cw = Math.min(w, h * ratio);
      const fixed = o.parent ? o.parent.clientWidth || cw : cw;
      const W = o.parent ? fixed : cw, H = o.parent ? fixed / ratio : h;
      renderer.setSize(W, H, false);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      wrap.style.width = W + 'px';
      camera.aspect = W / H; camera.updateProjectionMatrix();
    };
    size();
    ctx.on(window, 'resize', size);
    ctx.add(() => { renderer.dispose(); renderer.forceContextLoss(); });

    const ray = new THREE.Raycaster();
    const aim = e => {
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
    };
    const pick = (e, plane) => { aim(e); return ray.ray.intersectPlane(plane, new THREE.Vector3()); };
    const pickObj = (e, list) => { aim(e); const h = ray.intersectObjects(list, true)[0]; return h ? h.object : null; };

    const bits = [], bitGeo = new THREE.BoxGeometry(1, 1, 1);
    const burst = (pos, color, n = 14, s = 6, power = 120) => {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(bitGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
        m.position.copy(pos); m.scale.setScalar(s * (.5 + Math.random() * .7));
        scene.add(m);
        bits.push({ m, life: .7, v: new THREE.Vector3((Math.random() - .5) * 2, Math.random() * 1.6, (Math.random() - .5) * 2).multiplyScalar(power), g: power * 2 });
      }
    };
    const render = dt => {
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.life -= dt; b.v.y -= b.g * dt;
        b.m.position.addScaledVector(b.v, dt); b.m.rotation.x += dt * 6;
        b.m.material.opacity = Math.max(0, b.life / .7);
        if (b.life <= 0) { scene.remove(b.m); b.m.material.dispose(); bits.splice(i, 1); }
      }
      renderer.render(scene, camera);
    };
    return { wrap, canvas, renderer, scene, camera, sun, follow, pick, pickObj, burst, render, size };
  }

  const mesh = (geo, material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    return m;
  };
  const box = (w, h, d, material, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z);
  const ball = (r, material, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const m = mesh(new THREE.SphereGeometry(r, 24, 18), material, x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  };
  const cyl = (a, b, h, material, x, y, z, seg = 20) => mesh(new THREE.CylinderGeometry(a, b, h, seg), material, x, y, z);
  const cone = (r, h, material, x, y, z, seg = 16) => mesh(new THREE.ConeGeometry(r, h, seg), material, x, y, z);
  const group = (...kids) => { const g = new THREE.Group(); g.add(...kids); return g; };
  const eye = (x, y, z, r = .2) => group(ball(r, mat(0xffffff, { roughness: .2 }), x, y, z), ball(r * .55, mat(0x111111, { roughness: .1 }), x + r * .55, y, z));

  const label = text => {
    const c = el('canvas', { width: 256, height: 56 }), g = c.getContext('2d');
    g.fillStyle = '#000a'; g.fillRect(0, 0, 256, 56);
    g.fillStyle = '#fff'; g.font = '600 32px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(text).slice(0, 16), 128, 29);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    s.scale.set(4.5, 1, 1);
    return s;
  };
  // Makes a private, see-through copy of the materials so shared ones stay untouched.
  const ghost = (g, opacity) => g.traverse(m => { if (m.material) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = opacity; } });

  // Every model faces +X and sits around the origin at roughly unit scale.
  const Models = {
    bird(color = 0xffd23f) {
      const c = mat(color);
      const wing = ball(.55, mat(0xffa928), -.1, .05, .75, 1.1, .25, .75);
      const wing2 = ball(.55, mat(0xffa928), -.1, .05, -.75, 1.1, .25, .75);
      const g = group(ball(1, c, 0, 0, 0, 1.15, .95, .9), ball(.7, mat(0xfff3c4), .3, -.3, 0, 1, .8, .8),
        wing, wing2, eye(.65, .35, .42), eye(.65, .35, -.42),
        cone(.3, .7, mat(0xff7a1a), 1.3, -.05, 0), cone(.3, .8, c, -1.2, .15, 0));
      g.children[6].rotation.z = -Math.PI / 2; g.children[7].rotation.z = Math.PI / 2;
      g.userData = { wing, wing2 };
      return g;
    },
    fish(color = 0xff9f43) {
      const c = mat(color, { roughness: .35 }), fin = mat(new THREE.Color(color).multiplyScalar(.75).getHex(), { roughness: .4 });
      const tail = group(cone(.7, 1, fin, -.4, 0, 0));
      tail.children[0].rotation.z = -Math.PI / 2; tail.children[0].scale.z = .18;
      tail.position.x = -1.1;
      const dorsal = cone(.5, .7, fin, -.1, .75, 0); dorsal.scale.z = .15;
      const side = ball(.4, fin, .1, -.25, .62, 1, .5, .2), side2 = ball(.4, fin, .1, -.25, -.62, 1, .5, .2);
      const g = group(ball(1, c, 0, 0, 0, 1.3, .85, .65), ball(.62, mat(0xfff7e0), .3, -.32, 0, 1.3, .6, .78), tail, dorsal, side, side2, eye(.75, .22, .44, .24), eye(.75, .22, -.44, .24));
      g.userData = { tail };
      return g;
    },
    car(color = 0xff4d4d) {
      const paint = mat(color, { roughness: .28, metalness: .45 }), dark = mat(0x15171c, { roughness: .8 }), glass = mat(0x1c3347, { roughness: .1, metalness: .6 });
      const s = new THREE.Shape();
      s.moveTo(-2, .3); s.lineTo(2, .3); s.quadraticCurveTo(2.15, .7, 1.7, .78); s.lineTo(.8, .9); s.lineTo(-1.8, 1); s.quadraticCurveTo(-2.1, .8, -2, .3);
      const geo = new THREE.ExtrudeGeometry(s, { depth: 1.5, bevelEnabled: true, bevelSize: .1, bevelThickness: .1, bevelSegments: 3 });
      geo.translate(0, 0, -.75);
      const body = mesh(geo, paint);
      const cab = new THREE.Shape();
      cab.moveTo(-1.1, 0); cab.lineTo(.8, 0); cab.lineTo(.2, .55); cab.lineTo(-.8, .55); cab.closePath();
      const cg = new THREE.ExtrudeGeometry(cab, { depth: 1.25, bevelEnabled: false }); cg.translate(0, .9, -.625);
      const wheels = [[1.25, 1], [1.25, -1], [-1.25, 1], [-1.25, -1]].map(([x, z]) => {
        const w = group(cyl(.42, .42, .32, dark, 0, 0, 0), cyl(.2, .2, .34, mat(0xc9ced6, { metalness: .8, roughness: .25 }), 0, 0, 0, 8));
        w.children.forEach(m => { m.rotation.x = Math.PI / 2; });
        w.position.set(x, .42, z);
        return w;
      });
      const g = group(body, mesh(cg, glass), ...wheels,
        box(.2, .08, 1.7, paint, -1.95, 1.4, 0), box(.1, .35, .1, dark, -1.9, 1.2, .6), box(.1, .35, .1, dark, -1.9, 1.2, -.6),
        box(.06, .14, .35, mat(0xffffcc, { emissive: 0xffffaa }), 2.13, .6, .5), box(.06, .14, .35, mat(0xffffcc, { emissive: 0xffffaa }), 2.13, .6, -.5),
        box(.06, .14, .4, mat(0xff2020, { emissive: 0xaa0000 }), -2.13, .7, .5), box(.06, .14, .4, mat(0xff2020, { emissive: 0xaa0000 }), -2.13, .7, -.5));
      g.userData = { wheels };
      return g;
    },
    tree() {
      return group(cyl(.22, .32, 1.5, mat(0x6d4a2a), 0, .75, 0, 8), cone(1.2, 1.8, mat(0x2f8f46), 0, 2.1, 0, 9), cone(.95, 1.5, mat(0x38a552), 0, 3, 0, 9), cone(.65, 1.2, mat(0x45b862), 0, 3.8, 0, 9));
    },
    apple() {
      const leaf = ball(.28, mat(0x47b84b), .25, 1.1, 0, 1.2, .3, .6); leaf.rotation.z = -.5;
      return group(ball(.8, mat(0xe8262f, { roughness: .22 }), 0, .1, 0, 1, .92, 1), cyl(.05, .07, .4, mat(0x5a3a1c), 0, 1, 0, 6), leaf);
    },
    gem(color = 0x4fe3ff) {
      const m = new THREE.MeshStandardMaterial({ color, flatShading: true, metalness: .35, roughness: .08, emissive: color, emissiveIntensity: .14 });
      return mesh(new THREE.OctahedronGeometry(1.5, 1), m);
    },
    tower(kind, level = 1) {
      const stone = mat(0x9aa1ab), dark = mat(0x5e6570), colors = { arrow: 0x6bbf4f, cannon: 0xb0733a, frost: 0x63d3ff };
      const c = mat(colors[kind], kind === 'frost' ? { emissive: 0x2a8fbf, emissiveIntensity: .35, roughness: .15 } : {});
      const h = 1 + level * .45;
      const g = group(cyl(1, 1.2, .4, dark, 0, .2, 0, 8), cyl(.72, .9, h, stone, 0, .4 + h / 2, 0, 8));
      const top = .4 + h;
      for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; g.add(box(.25, .3, .25, stone, Math.cos(a) * .78, top + .15, Math.sin(a) * .78)); }
      g.add(cyl(.82, .82, .12, dark, 0, top, 0, 8));
      const head = new THREE.Group(); head.position.y = top + .1; g.add(head);
      if (kind === 'arrow') {
        const shaft = cyl(.06, .06, 1.5, mat(0x6d4a2a), 0, .45, 0, 6); shaft.rotation.z = Math.PI / 2;
        const tip = cone(.13, .35, c, .85, .45, 0, 6); tip.rotation.z = -Math.PI / 2;
        const bow = mesh(new THREE.TorusGeometry(.55, .05, 6, 14, Math.PI), c, .1, .45, 0); bow.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
        head.add(shaft, tip, bow);
      } else if (kind === 'cannon') {
        const barrel = cyl(.26, .36, 1.5, mat(0x2a2d33, { metalness: .7, roughness: .3 }), .45, .5, 0); barrel.rotation.z = -Math.PI / 2 + .25;
        head.add(ball(.5, c, 0, .35, 0), barrel);
      } else {
        const crystal = mesh(new THREE.OctahedronGeometry(.6), c, 0, .75, 0); crystal.scale.y = 1.5;
        head.add(crystal);
      }
      g.userData = { head };
      return g;
    },
    foe(color, boss) {
      const c = mat(color, { roughness: .45 });
      const g = group(ball(1, c, 0, 1, 0, 1, 1.05, 1), eye(.72, 1.3, .34, .24), eye(.72, 1.3, -.34, .24), ball(.3, c, 0, .22, .55, 1.4, .6, 1), ball(.3, c, 0, .22, -.55, 1.4, .6, 1));
      if (boss) { const h1 = cone(.25, .9, mat(0xf0e6c8), 0, 2.2, .5), h2 = cone(.25, .9, mat(0xf0e6c8), 0, 2.2, -.5); g.add(h1, h2, cone(.3, .5, mat(0xffd23f, { metalness: .8, roughness: .2 }), 0, 2.2, 0)); }
      return g;
    },
    castle() {
      const s = mat(0xb9bec7), r = mat(0xd9404a, { roughness: .4 });
      const g = group(box(4, 2.6, 4, s, 0, 1.3, 0), box(1.3, 1.4, .2, mat(0x4a2f1c), 0, .7, 2.05));
      for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) g.add(cyl(.8, .9, 4, s, x, 2, z, 12), cone(1.05, 1.6, r, x, 4.8, z, 12));
      return g;
    },
    avatar(shirt = 0xff5d8f, pants = 0x2d3a66, skin = 0xffd23f) {
      const s = mat(skin, { roughness: .45 }), sh = mat(shirt, { roughness: .55 }), p = mat(pants);
      const part = (w, h, d, m, x, y, pivot) => {
        const q = new THREE.Group(); q.position.set(x, y, 0);
        const b = box(w, h, d, m, 0, pivot ? -h / 2 : 0, 0); q.add(b);
        return q;
      };
      const armL = part(.34, .9, .38, s, -.65, 1.7, true), armR = part(.34, .9, .38, s, .65, 1.7, true);
      const legL = part(.42, .85, .45, p, -.23, .85, true), legR = part(.42, .85, .45, p, .23, .85, true);
      const head = ball(.34, s, 0, 2.02, 0, 1.05, 1, 1);
      const g = group(part(.9, .9, .5, sh, 0, 1.28), head, armL, armR, legL, legR,
        ball(.06, mat(0x111111), -.13, 2.08, -.32), ball(.06, mat(0x111111), .13, 2.08, -.32),
        mesh(new THREE.CylinderGeometry(.3, .36, .2, 18), mat(0x2a6ee0), 0, 2.32, 0));
      g.userData = { armL, armR, legL, legR };
      return g;
    },
    flag(color = 0xff4d4d) {
      const f = box(1.1, .65, .05, mat(color), .55, 2.2, 0);
      return group(cyl(.06, .08, 2.6, mat(0xdddddd, { metalness: .7, roughness: .3 }), 0, 1.3, 0, 8), ball(.12, mat(0xffd23f, { metalness: .8, roughness: .2 }), 0, 2.65, 0), f);
    },
    coin() {
      const c = cyl(.45, .45, .1, mat(0xffc93c, { metalness: .85, roughness: .22 }), 0, 0, 0, 22);
      c.rotation.x = Math.PI / 2;
      return group(c);
    },
    mine() {
      const m = mat(0x24262e, { metalness: .6, roughness: .3 });
      const g = group(ball(.5, m, 0, 0, 0));
      for (const v of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [.7, .7, 0], [-.7, .7, 0], [0, .7, .7], [0, .7, -.7]]) {
        const s = cone(.1, .3, m, v[0] * .55, v[1] * .55, v[2] * .55, 6);
        s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...v).normalize());
        g.add(s);
      }
      return g;
    },
    cloud() {
      const w = mat(0xffffff, { roughness: 1, emissive: 0x999999 });
      const g = group(ball(1, w, 0, 0, 0), ball(.75, w, 1, -.1, 0), ball(.8, w, -1, -.1, .1), ball(.6, w, .3, .45, .2));
      g.traverse(m => { m.castShadow = false; });
      return g;
    },
  };
  return { stage, mat, mesh, box, ball, cyl, cone, group, eye, label, ghost, Models };
})();
