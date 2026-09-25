import { createSync, mergeFirst } from '../assets/synccore.js';
import assert from 'node:assert/strict';

const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0, n = 0;
const test = async (name, fn) => { n++; try { await fn(); console.log('✓', name); } catch (e) { fail++; console.log('✗', name, '\n   ', e.message.split('\n')[0]); } };

// 가짜 localStorage
const mkStorage = () => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, _m: m };
};

// 가짜 클라우드 (Firestore 흉내): uid → Map(k → doc), 같은 uid의 모든 리스너에게 변경을 알린다
const mkCloud = () => {
  const users = new Map(), listeners = new Map();
  const docs = uid => users.get(uid) || users.set(uid, new Map()).get(uid);
  const cloud = {
    users, failWrites: false, writes: 0,
    backend(name) {
      let cb = null, cur = null;
      const b = {
        name,
        onUser(f) { cb = f; },
        async signIn() {},
        async signOut() { cb?.(null); },
        login(uid) { cur = { uid, email: uid + '@x' }; cb?.(cur); },
        async listen(uid, onDocs) {
          const l = { onDocs, owner: name };
          (listeners.get(uid) || listeners.set(uid, new Set()).get(uid)).add(l);
          queueMicrotask(() => onDocs([...docs(uid).values()].map(d => ({ ...d, local: false })), true));
          return () => listeners.get(uid)?.delete(l);
        },
        async write(uid, ds) {
          if (cloud.failWrites) throw new Error('unavailable');
          cloud.writes++;
          for (const d of ds) docs(uid).set(d.k, { ...d });
          for (const l of listeners.get(uid) || []) l.onDocs(ds.map(d => ({ ...d, local: l.owner === name })), true);
        },
      };
      return b;
    },
  };
  return cloud;
};

const mkDevice = (cloud, name, clock, opts = {}) => {
  const storage = mkStorage(), remote = [], states = [];
  const backend = cloud.backend(name);
  const sync = createSync({ storage, backend, now: () => clock.t, delay: 5, onRemote: k => remote.push(...k), onState: s => states.push(s.status) });
  sync.start();
  const set = (k, v) => { storage.setItem('study:' + k, JSON.stringify(v)); sync.touch(k); };
  const get = k => { const v = storage.getItem('study:' + k); return v == null ? undefined : JSON.parse(v); };
  return { storage, backend, sync, remote, states, set, get, name };
};

await test('mergeFirst: 단어장 합집합 / 객체 깊은 병합 / 그 외는 원격', () => {
  const a = JSON.stringify([{ id: 'b1', name: '내', words: [{ id: 'w1', w: 'a' }] }]);
  const b = JSON.stringify([{ id: 'b1', name: '내', words: [{ id: 'w2', w: 'b' }] }, { id: 'b2', name: '두', words: [] }]);
  const m = JSON.parse(mergeFirst('wb', a, b));
  assert.equal(m.length, 2);
  assert.deepEqual(m.find(x => x.id === 'b1').words.map(w => w.id).sort(), ['w1', 'w2']);
  assert.deepEqual(JSON.parse(mergeFirst('p:x', '{"q":{"1":1,"2":0},"c":{}}', '{"q":{"2":1,"3":1},"c":{"a":1}}')), { q: { '1': 1, '2': 1, '3': 1 }, c: { a: 1 } });
  assert.equal(mergeFirst('sel', '["a"]', '["b"]'), '["b"]');
});

await test('처음 로그인: 기존 로컬 데이터가 클라우드로 올라간다', async () => {
  const cloud = mkCloud(), clock = { t: 100 };
  const A = mkDevice(cloud, 'A', clock);
  A.set('p:영어/21.json', { q: { 1: 1 }, c: {} }); A.set('wb', [{ id: 'b1', name: '내 단어장', words: [] }]);
  A.backend.login('u1'); await sleep(40);
  const docs = cloud.users.get('u1');
  assert.equal(docs.size, 2);
  assert.equal(JSON.parse(docs.get('p:영어/21.json').v).q[1], 1);
  assert.equal(A.storage.getItem('study:_uid'), 'u1');
  assert.equal(A.sync.state.status, 'ok');
});

await test('두 번째 기기: 로그인하면 같은 데이터를 받고 onRemote가 불린다', async () => {
  const cloud = mkCloud(), clock = { t: 100 };
  const A = mkDevice(cloud, 'A', clock);
  A.set('p:x', { q: { 1: 1 }, c: {} }); A.set('mode', 'ko');
  A.backend.login('u1'); await sleep(40);
  const B = mkDevice(cloud, 'B', clock);
  B.backend.login('u1'); await sleep(40);
  assert.deepEqual(B.get('p:x'), { q: { 1: 1 }, c: {} });
  assert.equal(B.get('mode'), 'ko');
  assert.deepEqual(B.remote.sort(), ['mode', 'p:x']);
});

await test('실시간: B의 변경이 A에 곧바로 반영된다 (에코는 무시)', async () => {
  const cloud = mkCloud(), clock = { t: 100 };
  const A = mkDevice(cloud, 'A', clock), B = mkDevice(cloud, 'B', clock);
  A.set('p:x', { q: {}, c: {} }); A.backend.login('u1'); B.backend.login('u1'); await sleep(40);
  A.remote.length = 0; B.remote.length = 0;
  clock.t = 200; B.set('p:x', { q: { 7: 1 }, c: {} }); await sleep(40);
  assert.deepEqual(A.get('p:x'), { q: { 7: 1 }, c: {} });
  assert.deepEqual(A.remote, ['p:x']);
  assert.deepEqual(B.remote, [], '자기 변경은 onRemote로 돌아오지 않는다');
});

await test('충돌: 더 늦게 바꾼 쪽이 이긴다', async () => {
  const cloud = mkCloud(), clock = { t: 100 };
  const A = mkDevice(cloud, 'A', clock), B = mkDevice(cloud, 'B', clock);
  A.set('k', 'base'); A.backend.login('u1'); B.backend.login('u1'); await sleep(40);
  // A가 오프라인인 동안 각자 수정 (A 300, B 200)
  cloud.failWrites = true;
  clock.t = 300; A.set('k', 'A-late');
  clock.t = 200; B.set('k', 'B-early');
  await sleep(40);
  cloud.failWrites = false;
  await A.sync.flush(); await B.sync.flush(); await sleep(40);
  assert.equal(A.get('k'), 'A-late');
  assert.equal(B.get('k'), 'A-late');
  assert.equal(cloud.users.get('u1').get('k').v, '"A-late"');
});

await test('처음 연결 병합: 이 기기의 단어와 계정의 단어가 모두 남는다', async () => {
  const cloud = mkCloud(), clock = { t: 100 };
  const A = mkDevice(cloud, 'A', clock);
  A.set('wb', [{ id: 'b1', name: '내', words: [{ id: 'w2', w: 'remote' }] }, { id: 'b2', name: '두', words: [] }]);
  A.backend.login('u1'); await sleep(40);
  const C = mkDevice(cloud, 'C', clock);
  C.set('wb', [{ id: 'b1', name: '내', words: [{ id: 'w1', w: 'local' }] }]);   // 로그인 전에 만든 단어장
  C.backend.login('u1'); await sleep(60);
  const wb = C.get('wb');
  assert.equal(wb.length, 2);
  assert.deepEqual(wb.find(b => b.id === 'b1').words.map(w => w.id).sort(), ['w1', 'w2']);
  assert.deepEqual(JSON.parse(cloud.users.get('u1').get('wb').v).find(b => b.id === 'b1').words.map(w => w.id).sort(), ['w1', 'w2'], '합친 결과가 클라우드에도 올라감');
});

await test('계정 전환: 이전 계정의 데이터가 새 계정으로 섞이지 않는다', async () => {
  const cloud = mkCloud(), clock = { t: 100 };
  const A = mkDevice(cloud, 'A', clock);
  A.set('wb', [{ id: 'b1', name: 'u1의 단어장', words: [{ id: 'w1', w: 'secret' }] }]);
  A.backend.login('u1'); await sleep(40);
  await A.backend.signOut(); await sleep(10);
  assert.equal(A.sync.state.status, 'signedout');
  assert.ok(A.get('wb'), '로그아웃해도 이 기기의 데이터는 남는다');
  A.backend.login('u2'); await sleep(60);
  assert.equal(A.get('wb'), undefined, '다른 계정으로 로그인하면 이전 계정 데이터는 비워진다');
  assert.equal(cloud.users.get('u2')?.size ?? 0, 0, 'u2 클라우드에 u1 데이터가 올라가지 않는다');
  assert.equal(cloud.users.get('u1').size, 1);
});

await test('같은 계정으로 다시 로그인하면 로컬 변경이 유지·업로드된다', async () => {
  const cloud = mkCloud(), clock = { t: 100 };
  const A = mkDevice(cloud, 'A', clock);
  A.set('k', 1); A.backend.login('u1'); await sleep(40);
  await A.backend.signOut(); await sleep(10);
  clock.t = 500; A.set('k', 2);          // 로그아웃 중에 변경
  A.backend.login('u1'); await sleep(60);
  assert.equal(A.get('k'), 2);
  assert.equal(cloud.users.get('u1').get('k').v, '2');
});

await test('캐시·기기별 설정(dict, fs)은 동기화하지 않는다', async () => {
  const cloud = mkCloud(), clock = { t: 100 };
  const A = mkDevice(cloud, 'A', clock);
  A.set('dict', { a: 1 }); A.set('fs', 22); A.set('mode', 'en');
  A.backend.login('u1'); await sleep(40);
  assert.deepEqual([...cloud.users.get('u1').keys()], ['mode']);
});

await test('쓰기 실패: 오류 상태가 되고, 복구되면 다시 올라간다', async () => {
  const cloud = mkCloud(), clock = { t: 100 };
  const A = mkDevice(cloud, 'A', clock);
  A.backend.login('u1'); await sleep(30);
  cloud.failWrites = true; A.set('k', 'v'); await sleep(40);
  assert.equal(A.sync.state.status, 'error');
  cloud.failWrites = false; await A.sync.flush(); await sleep(20);
  assert.equal(A.sync.state.status, 'ok');
  assert.equal(cloud.users.get('u1').get('k').v, '"v"');
});

await test('잦은 변경은 한 번에 묶어 보낸다(디바운스)', async () => {
  const cloud = mkCloud(), clock = { t: 100 };
  const A = mkDevice(cloud, 'A', clock);
  A.backend.login('u1'); await sleep(30);
  const before = cloud.writes;
  for (let i = 0; i < 20; i++) { clock.t++; A.set('p:' + (i % 3), { i }); }
  await sleep(40);
  assert.equal(cloud.writes - before, 1);
  assert.equal(cloud.users.get('u1').size, 3);
});

console.log(`\n${n - fail}/${n} 통과`);
process.exit(fail ? 1 : 0);
