// 기기 간 동기화의 핵심 로직. 저장소(localStorage)와 백엔드(Firestore)에 직접 의존하지 않아서 Node에서 그대로 테스트할 수 있다.
//
// 동기화 대상: localStorage 의 "study:*" 키 (진행 기록, 단어장, 선택·설정 …)
// 규칙: 키마다 마지막으로 바꾼 시각(t)이 더 늦은 쪽이 이긴다.
//       다만 이 브라우저를 처음 계정에 연결할 때는 덮어쓰지 않고 합친다(단어장은 합집합).
//       다른 계정으로 바꿔 로그인하면 이 브라우저의 동기화 데이터를 비우고 그 계정의 것으로 채운다.

const P = 'study:';
const LOCAL_ONLY = new Set(['dict', 'fs', '_meta', '_uid']); // 캐시·기기별 설정·내부 키는 동기화하지 않는다
export const syncable = k => !LOCAL_ONLY.has(k);

const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
const deep = (a, b) => { // b(원격) 우선으로 깊게 합치기
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(a[k]) ? deep(a[k], v) : v;
  return out;
};

// 처음 연결할 때 로컬 값(a)과 원격 값(b)을 합친 JSON 문자열을 돌려준다
export function mergeFirst(key, a, b) {
  let x, y;
  try { x = JSON.parse(a); y = JSON.parse(b); } catch { return b; }
  if (key === 'wb' && Array.isArray(x) && Array.isArray(y)) { // 단어장: 책은 id로, 단어는 id로 합집합
    const books = new Map(x.map(bk => [bk.id, bk]));
    for (const rb of y) {
      const lb = books.get(rb.id);
      if (!lb) { books.set(rb.id, rb); continue; }
      const words = new Map((lb.words || []).map(w => [w.id, w]));
      for (const w of rb.words || []) words.set(w.id, w);
      books.set(rb.id, { ...lb, ...rb, words: [...words.values()] });
    }
    return JSON.stringify([...books.values()]);
  }
  if (isObj(x) && isObj(y)) return JSON.stringify(deep(x, y));
  return b;
}

// env: { storage, backend, now?, onState?, onRemote?, delay? }
// backend: {
//   onUser(cb)                       cb(user | null),  user = { uid, email, name }
//   signIn(), signOut()
//   listen(uid, onDocs, onError)     → Promise<unsubscribe>.  onDocs(changes, complete)
//                                      changes = [{ k, v, t, local }], complete = 서버에서 받은 전체 목록인가
//   write(uid, docs)                 docs = [{ k, v, t }]
// }
export function createSync(env) {
  const { storage, backend } = env;
  const now = env.now || Date.now;
  const delay = env.delay ?? 1200;
  let user = null, unsub = null, timer = 0, retry = 0, linkFirst = false, complete = false, gen = 0;
  let dirty = new Set();
  const state = { status: 'signedout', user: null, at: 0, error: '' };
  const emit = patch => { Object.assign(state, patch); env.onState?.({ ...state }); };

  const meta = () => { try { return JSON.parse(storage.getItem(P + '_meta') || '{}'); } catch { return {}; } };
  const saveMeta = m => storage.setItem(P + '_meta', JSON.stringify(m));
  const localKeys = () => {
    const ks = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(P) && syncable(k.slice(P.length))) ks.push(k.slice(P.length));
    }
    return ks;
  };
  const wipe = () => {
    for (const k of localKeys()) storage.removeItem(P + k);
    storage.removeItem(P + '_meta');
  };

  const schedule = () => { clearTimeout(timer); timer = setTimeout(flush, delay); };

  // 앱에서 값을 저장한 직후 부른다
  function touch(key) {
    if (!syncable(key)) return;
    const m = meta();
    m[key] = now();
    saveMeta(m);
    if (user) { dirty.add(key); schedule(); }
  }

  async function flush() {
    clearTimeout(timer);
    clearTimeout(retry);
    if (!user || !dirty.size) return;
    const m = meta(), me = user.uid;
    const docs = [...dirty].map(k => ({ k, v: storage.getItem(P + k), t: m[k] || now() })).filter(d => d.v != null);
    dirty = new Set();
    if (!docs.length) return;
    emit({ status: 'syncing', error: '' });
    try {
      await backend.write(me, docs);
      if (user?.uid === me) emit({ status: 'ok', at: now(), error: '' });
    } catch (e) {
      docs.forEach(d => dirty.add(d.k));
      emit({ status: 'error', error: String(e?.code || e?.message || e) });
      retry = setTimeout(flush, 10000);
    }
  }

  // 원격 문서가 도착했을 때
  function onDocs(changes, done, myGen) {
    if (myGen !== gen) return;
    const m = meta(), applied = [], remote = new Set();
    for (const c of changes) {
      remote.add(c.k);
      if (c.local || !syncable(c.k)) continue; // 방금 내가 쓴 것의 메아리
      const lv = storage.getItem(P + c.k), lt = m[c.k] || 0;
      if (lv == null) { storage.setItem(P + c.k, c.v); m[c.k] = c.t; applied.push(c.k); }
      else if (linkFirst) { // 처음 연결: 덮어쓰지 않고 합쳐서 다시 올린다
        const merged = mergeFirst(c.k, lv, c.v);
        if (merged !== lv) { storage.setItem(P + c.k, merged); applied.push(c.k); }
        m[c.k] = now();
        dirty.add(c.k);
      } else if (c.t > lt) { if (lv !== c.v) { storage.setItem(P + c.k, c.v); applied.push(c.k); } m[c.k] = c.t; }
      else if (lt > c.t) dirty.add(c.k);
    }
    if (done && !complete) { // 서버의 전체 목록을 처음 받았다: 원격에 없는 로컬 키를 올린다
      complete = true;
      for (const k of localKeys()) if (!remote.has(k)) { if (!m[k]) m[k] = now(); dirty.add(k); }
      linkFirst = false;
      storage.setItem(P + '_uid', user.uid);
    }
    saveMeta(m);
    if (applied.length) env.onRemote?.(applied);
    if (dirty.size) schedule();
    else if (state.status !== 'syncing') emit({ status: 'ok', at: now(), error: '' });
  }

  async function attach(u) {
    const myGen = ++gen;
    unsub?.();
    unsub = null;
    user = u;
    complete = false;
    dirty = new Set();
    const prev = storage.getItem(P + '_uid');
    if (prev && prev !== u.uid) wipe(); // 다른 계정의 데이터가 섞이지 않게
    linkFirst = !prev;
    emit({ status: 'syncing', user: u, error: '' });
    try {
      const un = await backend.listen(u.uid, (ch, done) => onDocs(ch, done, myGen), e => emit({ status: 'error', error: String(e?.code || e?.message || e) }));
      if (myGen !== gen) un?.(); else unsub = un;
    } catch (e) { emit({ status: 'error', error: String(e?.code || e?.message || e) }); }
  }

  function detach() {
    gen++;
    unsub?.();
    unsub = null;
    user = null;
    dirty = new Set();
    clearTimeout(timer);
    clearTimeout(retry);
    emit({ status: 'signedout', user: null, error: '' });
  }

  return {
    state,
    touch,
    flush,
    start() {
      emit({ status: 'loading' });
      backend.onUser((u, err) => {
        if (u) attach(u);
        else { detach(); if (err) emit({ error: String(err?.code || err?.message || err) }); }
      });
    },
    async signIn() { emit({ error: '' }); try { await backend.signIn(); } catch (e) { emit({ status: user ? state.status : 'signedout', error: String(e?.code || e?.message || e) }); } },
    async signOut() { await backend.signOut(); },
    syncNow() { for (const k of localKeys()) dirty.add(k); return flush(); },
  };
}
