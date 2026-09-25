// Firebase(로그인 + Firestore) 어댑터. 설정이 없으면 아무것도 로드하지 않는다.
import { firebaseConfig } from './firebase-config.js';
import { createSync } from './synccore.js';

export const syncEnabled = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);

const V = '10.14.1';
const BASE = `https://www.gstatic.com/firebasejs/${V}/`;

// 데이터 위치: users/{uid}/kv/{인코딩한 키} = { k, v(JSON 문자열), t(바꾼 시각) }
function firebaseBackend(cfg) {
  let sdk, ready = null; // ready: 로드가 끝난 SDK (팝업을 클릭 직후 동기적으로 열기 위해 따로 들고 있음)
  const load = () => (sdk ??= (async () => {
    const [app, auth, fs] = await Promise.all([import(BASE + 'firebase-app.js'), import(BASE + 'firebase-auth.js'), import(BASE + 'firebase-firestore.js')]);
    const a = app.initializeApp(cfg);
    let db;
    try { db = fs.initializeFirestore(a, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }); } // 오프라인 중 변경을 쌓아 두었다가 보낸다
    catch { db = fs.getFirestore(a); }
    return (ready = { auth, fs, db, ai: auth.getAuth(a) });
  })());
  const slim = u => ({ uid: u.uid, email: u.email || '', name: u.displayName || '' });

  return {
    async onUser(cb) {
      try {
        const s = await load();
        s.auth.onAuthStateChanged(s.ai, u => cb(u ? slim(u) : null));
      } catch (e) { cb(null, e); }
    },
    async signIn() {
      // 미리 로드해 두었으면 await 없이 바로 팝업을 연다 (모바일 Safari는 클릭과 동시에 열리지 않은 팝업을 막는다)
      const s = ready || await load();
      await s.auth.signInWithPopup(s.ai, new s.auth.GoogleAuthProvider());
    },
    async signOut() { const s = await load(); await s.auth.signOut(s.ai); },
    async listen(uid, onDocs, onError) {
      const s = await load();
      return s.fs.onSnapshot(s.fs.collection(s.db, 'users', uid, 'kv'), snap => {
        const changes = snap.docChanges().filter(c => c.type !== 'removed').map(c => {
          const d = c.doc.data();
          return { k: d.k, v: d.v, t: d.t, local: c.doc.metadata.hasPendingWrites };
        });
        onDocs(changes, !snap.metadata.fromCache); // 캐시에서 온 목록은 전체가 아닐 수 있다
      }, onError);
    },
    async write(uid, docs) {
      const s = await load();
      for (let i = 0; i < docs.length; i += 400) {
        const b = s.fs.writeBatch(s.db);
        for (const d of docs.slice(i, i + 400)) b.set(s.fs.doc(s.db, 'users', uid, 'kv', encodeURIComponent(d.k)), { k: d.k, v: d.v, t: d.t });
        // 오프라인이면 commit이 서버 응답을 기다리며 멈춘다. 쌓아 두었다가 나중에 전송되므로 6초 뒤에는 대기 중으로 본다
        await Promise.race([b.commit(), new Promise(r => setTimeout(r, 6000))]);
      }
    },
  };
}

// storage: localStorage 그대로. 설정이 없으면 항상 꺼진 상태의 빈 객체를 돌려준다.
export function makeSync(env) {
  if (!syncEnabled) return { enabled: false, state: { status: 'off' }, touch() {}, start() {}, flush() {}, signIn() {}, signOut() {}, syncNow() {} };
  const core = createSync({ storage: localStorage, backend: firebaseBackend(firebaseConfig), ...env });
  return Object.assign(core, { enabled: true });
}
