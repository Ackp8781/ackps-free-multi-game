// Builds chunks away from the main thread so exploring never stutters.
importScripts('data.js', 'worldgen.js');
let gen = null;
onmessage = ({ data: m }) => {
  if (m.t === 'init') gen = CraftGen.create(m.settings);
  else if (m.t === 'chunk') {
    const c = gen.chunk(m.cx, m.cz);
    const buf = [c.blocks.buffer, c.light.buffer, c.top.buffer, c.tint.buffer, c.biome.buffer];
    if (c.meta) buf.push(c.meta.buffer);
    postMessage({ t: 'chunk', id: m.id, c }, buf);
  } else if (m.t === 'spawn') postMessage({ t: 'spawn', id: m.id, p: gen.spawnPoint(m.village) });
  else if (m.t === 'locate') postMessage({ t: 'locate', id: m.id, p: gen.locate(m.what, m.x, m.z) });
};
