// Online rooms relayed through the Firebase database, so players in different homes can always reach each other.
// Every player hears every other player's messages; the host owns the room and closing it ends the game.
const Net = (() => {
  class Room {
    constructor(code, game, isHost) {
      this.code = code; this.game = game; this.isHost = isHost; this.players = []; this.started = false;
      this.msgFns = []; this.playerFns = []; this.closeFns = []; this.closed = false; this.offs = [];
      this.ref = Cloud.db.ref('rooms/' + code);
    }
    get me() { return Cloud.me.uid; }
    onMessage(f) { this.msgFns.push(f); return () => { this.msgFns = this.msgFns.filter(x => x !== f); }; }
    onPlayers(f) { this.playerFns.push(f); }
    onClose(f) { this.closeFns.push(f); }
    send(d) {
      if (this.closed) return;
      // Messages are deleted shortly after sending so the room never grows.
      const m = this.ref.child('msgs').push({ from: this.me, d: JSON.stringify(d) });
      setTimeout(() => m.remove().catch(() => {}), 8000);
    }
    listen() {
      const players = this.ref.child('players');
      const onPlayers = s => {
        const v = s.val() || {}, list = Object.entries(v).sort((a, b) => a[1].at - b[1].at).map(([id, p]) => ({ id, name: p.name }));
        for (const p of this.players) if (!v[p.id]) for (const f of this.msgFns) f({ t: 'left' }, p.id);
        this.players = list;
        for (const f of this.playerFns) f(list);
      };
      players.on('value', onPlayers);
      this.offs.push(() => players.off('value', onPlayers));
      // Only messages newer than this moment are delivered.
      const start = Cloud.db.ref('rooms/' + this.code + '/msgs').push().key;
      const q = this.ref.child('msgs').orderByKey().startAt(start);
      const onMsg = s => {
        const m = s.val();
        if (!m || m.from === this.me) return;
        let d;
        try { d = JSON.parse(m.d); } catch (e) { return; }
        for (const f of this.msgFns) f(d, m.from);
      };
      q.on('child_added', onMsg);
      this.offs.push(() => q.off('child_added', onMsg));
      const host = this.ref.child('host');
      const onHost = s => { if (!s.exists() && !this.isHost) this._lost('The host left the room.'); };
      host.on('value', onHost);
      this.offs.push(() => host.off('value', onHost));
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      this.closeFns = [];
      this.offs.forEach(f => f());
      if (this.isHost) this.ref.remove().catch(() => {});
      else this.ref.child('players/' + this.me).remove().catch(() => {});
      Cloud.setActivity({});
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
  const join = async (gameId, code, name) => {
    if (!Cloud.me) throw new Error('Log in to play online.');
    const snap = await Cloud.db.ref('rooms/' + code).get();
    const r = snap.val();
    if (!r || !r.host) throw new Error('Room not found.');
    if (r.game !== gameId) throw new Error('That room is for a different game.');
    if (r.started && gameId !== 'craft') throw new Error('That room has already started.');
    if (Object.keys(r.players || {}).length >= 8) throw new Error('That room is full.');
    const room = new Room(code, gameId, false);
    const me = room.ref.child('players/' + Cloud.me.uid);
    await me.set({ name, at: firebase.database.ServerValue.TIMESTAMP });
    me.onDisconnect().remove();
    room.listen();
    Cloud.setActivity({ game: gameId, room: code });
    return room;
  };
  const host = async (gameId, name) => {
    if (!Cloud.me) throw new Error('Log in to play online.');
    for (let tries = 0; tries < 5; tries++) {
      const code = makeCode(), ref = Cloud.db.ref('rooms/' + code);
      try {
        await ref.set({ host: Cloud.me.uid, game: gameId, created: firebase.database.ServerValue.TIMESTAMP, players: { [Cloud.me.uid]: { name, at: firebase.database.ServerValue.TIMESTAMP } } });
      } catch (e) { continue; }
      ref.onDisconnect().remove();
      const room = new Room(code, gameId, true);
      room.listen();
      // Rooms of games that cannot be joined mid-round get marked once started.
      let started = false;
      Object.defineProperty(room, 'started', { get: () => started, set: v => { started = v; if (v) ref.child('started').set(true).catch(() => {}); } });
      Cloud.setActivity({ game: gameId, room: code });
      return room;
    }
    throw new Error('Could not create a room. Try again.');
  };
  return { host, join };
})();
