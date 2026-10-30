// Online rooms over WebRTC (PeerJS). The host relays messages to everyone else.
const Net = (() => {
  const PREFIX = 'ackp-multi-game-';
  let lib;
  const load = () => lib || (lib = new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    s.onload = ok;
    s.onerror = () => { lib = null; no(new Error('Could not load the multiplayer library.')); };
    document.head.append(s);
  }));

  class Room {
    constructor(name, isHost) {
      this.name = name; this.isHost = isHost; this.players = []; this.conns = new Map();
      this.msgFns = []; this.playerFns = []; this.closeFns = []; this.closed = false;
    }
    get me() { return this.peer.id; }
    onMessage(f) { this.msgFns.push(f); return () => { this.msgFns = this.msgFns.filter(x => x !== f); }; }
    onPlayers(f) { this.playerFns.push(f); }
    onClose(f) { this.closeFns.push(f); }
    send(d) {
      const m = { from: this.me, d };
      if (this.isHost) for (const c of this.conns.values()) c.send(m);
      else this.conn && this.conn.open && this.conn.send(m);
    }
    _deliver(m) { for (const f of this.msgFns) f(m.d, m.from); }
    _setPlayers(p) { this.players = p; for (const f of this.playerFns) f(p); }
    _sync() { for (const c of this.conns.values()) c.send({ sys: 'players', players: this.players }); this._setPlayers(this.players); }
    close() {
      if (this.closed) return;
      this.closed = true;
      this.closeFns = [];
      try { this.peer.destroy(); } catch (e) {}
    }
    _lost(why) {
      if (this.closed) return;
      const fns = this.closeFns;
      this.close();
      for (const f of fns) f(why);
    }
  }

  const makeCode = () => {
    const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  };

  async function host(gameId, name) {
    await load();
    const code = makeCode();
    const room = new Room(name, true);
    room.code = code; room.started = false;
    return new Promise((ok, no) => {
      const peer = room.peer = new Peer(PREFIX + gameId + '-' + code);
      peer.on('open', id => { room.players = [{ id, name }]; ok(room); });
      peer.on('error', e => no(new Error('Online service error: ' + e.type)));
      peer.on('connection', c => {
        c.on('open', () => {
          if (room.started || room.players.length >= 8) { c.send({ sys: 'full' }); setTimeout(() => c.close(), 300); return; }
          room.conns.set(c.peer, c);
          const pname = String((c.metadata && c.metadata.name) || 'Player').slice(0, 20);
          room.players = [...room.players, { id: c.peer, name: pname }];
          room._sync();
        });
        c.on('data', m => {
          if (!m || m.sys || m.from !== c.peer) return;
          for (const [id, o] of room.conns) if (id !== c.peer) o.send(m);
          room._deliver(m);
        });
        c.on('close', () => {
          room.conns.delete(c.peer);
          room.players = room.players.filter(p => p.id !== c.peer);
          room._sync();
          room._deliver({ from: c.peer, d: { t: 'left' } });
        });
      });
    });
  }

  async function join(gameId, code, name) {
    await load();
    const room = new Room(name, false);
    room.code = code;
    return new Promise((ok, no) => {
      const peer = room.peer = new Peer();
      const timer = setTimeout(() => { no(new Error('Room not found.')); room.close(); }, 12000);
      peer.on('error', e => {
        clearTimeout(timer);
        no(new Error(e.type === 'peer-unavailable' ? 'Room not found.' : 'Online service error: ' + e.type));
        room._lost('Connection lost.');
      });
      peer.on('open', () => {
        const c = room.conn = peer.connect(PREFIX + gameId + '-' + code, { metadata: { name }, reliable: true });
        c.on('open', () => { clearTimeout(timer); ok(room); });
        c.on('data', m => {
          if (m.sys === 'players') room._setPlayers(m.players);
          else if (m.sys === 'full') room._lost('That room is full or already playing.');
          else room._deliver(m);
        });
        c.on('close', () => room._lost('The host left the room.'));
      });
    });
  }
  return { host, join };
})();
