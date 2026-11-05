// Shared online services through Firebase: real accounts, friends, presence and invites.
// The config below is public by design; the database rules decide what each player may read or write.
const Cloud = (() => {
  const CONFIG = {
    apiKey: 'AIzaSyBnG4HuVU5-AXJRJI0vK2Yu900q7nFDBwY',
    authDomain: 'ackp-s-free-multi-games.firebaseapp.com',
    databaseURL: 'https://ackp-s-free-multi-games-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'ackp-s-free-multi-games',
    appId: '1:610653736055:web:500a09dcf1e292911bca72',
  };
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.5/';
  let ready = null, db = null, auth = null, me = null;
  const script = src => new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => no(new Error('Could not reach the online service. Check your connection and reload.'));
    document.head.append(s);
  });
  // Resolves with the signed-in player, or null, once Firebase has restored any saved session.
  const start = () => ready || (ready = (async () => {
    await script(SDK + 'firebase-app-compat.js');
    await Promise.all([script(SDK + 'firebase-auth-compat.js'), script(SDK + 'firebase-database-compat.js')]);
    firebase.initializeApp(CONFIG);
    auth = firebase.auth(); db = firebase.database();
    const u = await new Promise(ok => { const off = auth.onAuthStateChanged(x => { off(); ok(x); }); });
    if (u) me = await profile(u.uid);
    if (me) online();
    return me;
  })());
  const keyOf = name => name.trim().toLowerCase();
  // Usernames become a private sign-in address, so players never need a real email.
  const emailOf = name => keyOf(name).replace(/[^a-z0-9._-]/g, c => '_' + c.charCodeAt(0)) + '@players.ackp-games.app';
  const profile = async uid => {
    const v = (await db.ref('users/' + uid).get()).val();
    return v ? { uid, key: v.key, name: v.name } : null;
  };
  const friendly = e => {
    const c = e && e.code || '';
    if (/wrong-password|invalid-credential|user-not-found|invalid-login/.test(c)) return 'Wrong username or password.';
    if (/email-already-in-use/.test(c)) return 'That username is taken.';
    if (/weak-password/.test(c)) return 'Use a password of at least 6 characters.';
    if (/too-many-requests/.test(c)) return 'Too many tries. Wait a minute and try again.';
    if (/network/.test(c)) return 'No connection to the online service.';
    return e && e.message || 'Something went wrong.';
  };
  const signUp = async (name, pw) => {
    const key = keyOf(name);
    if ((await db.ref('names/' + key).get()).exists()) throw new Error('That username is taken.');
    let cred;
    try { cred = await auth.createUserWithEmailAndPassword(emailOf(name), pw); } catch (e) { throw new Error(friendly(e)); }
    const uid = cred.user.uid;
    await db.ref('names/' + key).set(uid);
    await db.ref('logins/' + uid).set(emailOf(name));
    await db.ref('users/' + uid).set({ name: name.trim(), key, created: firebase.database.ServerValue.TIMESTAMP });
    me = { uid, key, name: name.trim() };
    online();
    return me;
  };
  // The sign-in address never changes, so a renamed player looks it up through their current username.
  const loginOf = async name => {
    const uid = (await db.ref('names/' + keyOf(name)).get()).val();
    if (!uid) return emailOf(name);
    return (await db.ref('logins/' + uid).get()).val() || emailOf(name);
  };
  const logIn = async (name, pw) => {
    try { await auth.signInWithEmailAndPassword(await loginOf(name), pw); } catch (e) { throw new Error(friendly(e)); }
    me = await profile(auth.currentUser.uid);
    if (!me) throw new Error('This account has no profile. Create it again.');
    online();
    return me;
  };
  const logOut = async () => { if (me) await db.ref('presence/' + me.uid).remove(); me = null; await auth.signOut(); };

  // Presence: what each signed-in player is doing, cleared by the server when they disconnect.
  let presence = { online: true };
  const online = () => {
    const ref = db.ref('presence/' + me.uid);
    db.ref('.info/connected').on('value', s => {
      if (!s.val() || !me) return;
      ref.onDisconnect().remove();
      ref.set({ ...presence, name: me.name, at: firebase.database.ServerValue.TIMESTAMP });
    });
  };
  const setActivity = a => {
    presence = { online: true, ...a };
    if (me) db.ref('presence/' + me.uid).set({ ...presence, name: me.name, at: firebase.database.ServerValue.TIMESTAMP });
  };

  // Friends
  const findPlayers = async q => {
    q = keyOf(q);
    if (!q) return [];
    const s = await db.ref('users').orderByChild('key').startAt(q).endAt(q + '').limitToFirst(10).get();
    const out = [];
    s.forEach(c => { if (c.key !== me.uid) out.push({ uid: c.key, name: c.val().name }); });
    return out;
  };
  const request = to => db.ref(`requests/${to}/${me.uid}`).set({ name: me.name, at: firebase.database.ServerValue.TIMESTAMP });
  const accept = async (from, name) => {
    await db.ref(`friends/${me.uid}/${from}`).set({ name });
    await db.ref(`friends/${from}/${me.uid}`).set({ name: me.name });
    await db.ref(`requests/${me.uid}/${from}`).remove();
  };
  const decline = from => db.ref(`requests/${me.uid}/${from}`).remove();
  const unfriend = async uid => { await db.ref(`friends/${me.uid}/${uid}`).remove(); await db.ref(`friends/${uid}/${me.uid}`).remove(); };
  const invite = (to, game, code) => db.ref(`invites/${to}`).push({ from: me.uid, name: me.name, game, code, at: firebase.database.ServerValue.TIMESTAMP });
  // Calls back with the current friends (with presence), requests and invites whenever any of them change.
  const watch = cb => {
    const state = { friends: {}, requests: {}, invites: {}, presence: {}, live: {} };
    const fire = () => cb(state);
    const refs = [];
    const on = (path, f) => { const r = db.ref(path); r.on('value', s => { f(s.val() || {}); fire(); }); refs.push(r); };
    on('friends/' + me.uid, v => {
      state.friends = v;
      for (const uid in v) if (!state.presence[uid]) {
        const r = db.ref('presence/' + uid);
        state.presence[uid] = r;
        r.on('value', s => { state.live[uid] = s.val(); fire(); });
        refs.push(r);
      }
    });
    on('requests/' + me.uid, v => { state.requests = v; });
    on('invites/' + me.uid, v => { state.invites = v; });
    return () => refs.forEach(r => r.off());
  };
  const clearInvite = id => db.ref(`invites/${me.uid}/${id}`).remove();
  const reauth = async pw => {
    const u = auth.currentUser;
    try { await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, pw)); }
    catch (e) { throw new Error(/wrong-password|invalid-credential|invalid-login/.test(e.code || '') ? 'Your current password is wrong.' : friendly(e)); }
  };
  const changePassword = async (current, next) => {
    await reauth(current);
    try { await auth.currentUser.updatePassword(next); } catch (e) { throw new Error(friendly(e)); }
  };
  const rename = async (name, pw) => {
    const key = keyOf(name), old = me;
    if (key === old.key && name.trim() === old.name) return me;
    await reauth(pw);
    const owner = (await db.ref('names/' + key).get()).val();
    if (owner && owner !== old.uid) throw new Error('That username is taken.');
    const login = db.ref('logins/' + old.uid);
    if (!(await login.get()).exists()) await login.set(auth.currentUser.email);
    if (key !== old.key) await db.ref('names/' + key).set(old.uid);
    await db.ref('users/' + old.uid).update({ name: name.trim(), key });
    if (key !== old.key) await db.ref('names/' + old.key).remove();
    // Friends keep a copy of your name; refresh it on their side.
    const friends = (await db.ref('friends/' + old.uid).get()).val() || {};
    await Promise.all(Object.keys(friends).map(f => db.ref(`friends/${f}/${old.uid}/name`).set(name.trim()).catch(() => {})));
    me = { uid: old.uid, key, name: name.trim() };
    setActivity(presence);
    return me;
  };
  return { start, changePassword, rename, signUp, logIn, logOut, setActivity, findPlayers, request, accept, decline, unfriend, invite, watch, clearInvite, get me() { return me; }, get db() { return db; } };
})();
