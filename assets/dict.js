// 영어 단어·구 → 한국어 뜻 조회 (화면과 무관한 로직만).
//   1) 지문/단어장에 적어 둔 뜻을 먼저 찾고
//   2) 없으면 Google 번역의 공개 엔드포인트로 사전 뜻과 문장 번역을 받아, 문장 번역에 나타나는 뜻을 앞에 세운다.

/* ── 어형 매칭 ── */
export const tokens = t => String(t).match(/[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*/g) || [];
const low = s => s.toLowerCase().replace(/[’‘]/g, "'");

// 단어의 가능한 기본형 후보 (climbed → climb, running → run, studies → study …)
export function forms(word) {
  const w = low(word).replace(/'s$/, '');
  const f = new Set([w]);
  const cut = (suf, add = '') => { if (w.length > suf.length + 2 && w.endsWith(suf)) f.add(w.slice(0, -suf.length) + add); };
  cut('s'); cut('es'); cut('ies', 'y'); cut('ied', 'y'); cut('ed'); cut('ed', 'e'); cut('d');
  cut('ing'); cut('ing', 'e'); cut('ly'); cut('ily', 'y'); cut('er'); cut('est'); cut('ier', 'y'); cut('iest', 'y');
  for (const x of [...f]) if (/([b-df-hj-np-tv-z])\1$/.test(x)) f.add(x.slice(0, -1)); // stopped → stop
  return f;
}
const meets = (a, b) => [...a].some(x => b.has(x));

// entries: [{ w, m, ex }] 에서 text(단어 또는 구)와 같은 항목을 찾는다. 어형이 달라도 찾는다.
export function findGloss(text, entries) {
  const t = tokens(text);
  if (!t.length) return null;
  const tf = t.map(forms);
  return entries.find(e => {
    const ew = tokens(e.w);
    return ew.length === t.length && ew.every((x, i) => meets(forms(x), tf[i]));
  }) || null;
}

/* ── 문맥에 맞는 뜻 고르기 ── */
// 후보 뜻(cand)이 문장 번역(ko)에 나타나는가. 용언은 어미를 떼고, 어간이 바뀌는 활용(안심시키다→안심시킬)도 인정한다.
// 한 글자 뜻은 다른 낱말 속에 우연히 들어 있을 수 있으므로("예"⊂"예절") 조사가 붙은 어절일 때만 인정한다.
const JOSA_ONLY = /^(?:으로|에서|에게|까지|부터|보다|처럼|만큼|조차도|조차|마저|은|는|이|가|을|를|의|에|와|과|도|로|만)?$/;
export function inContext(cand, ko) {
  const c = cand.replace(/\s+/g, '');
  if (!c || !ko) return false;
  if (c.length === 1) return ko.split(/\s+/).some(t => { const x = t.replace(/[.,!?"'“”‘’()…·]/g, ''); return x.startsWith(c) && JOSA_ONLY.test(x.slice(1)); });
  const k = ko.replace(/\s+/g, '');
  const core = c.replace(/(하다|되다|이다)$/, '').replace(/다$/, '');
  if (!core) return false;
  if (core.length >= 2 && k.includes(core)) return true;
  return c.endsWith('다') && core.length >= 3 && k.includes(core.slice(0, -1)); // 마지막 음절이 바뀌는 활용
}

/* ── 온라인 조회 (Google 번역 공개 엔드포인트) ── */
const KEY = 'study:dict', CAP = 400;
let mem = null;
const disk = () => {
  if (mem) return mem;
  try { mem = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { mem = {}; }
  return mem;
};
const keep = (k, v) => {
  const m = disk();
  m[k] = v;
  const ks = Object.keys(m);
  if (ks.length > CAP) for (const x of ks.slice(0, ks.length - CAP)) delete m[x];
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* 저장 불가 */ }
};

async function gt(q, withDict) {
  const ck = (withDict ? 'd|' : 't|') + q;
  const hit = disk()[ck];
  if (hit) return hit;
  const u = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dj=1&dt=t' + (withDict ? '&dt=bd' : '') + '&q=' + encodeURIComponent(q);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(u, { signal: ctl.signal });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    const out = {
      text: (j.sentences || []).map(s => s.trans || '').join('').trim(),
      dict: (j.dict || []).map(d => ({
        pos: d.pos || '',
        words: ((d.entry && d.entry.length ? [...d.entry].sort((a, b) => (b.score || 0) - (a.score || 0)).map(e => e.word) : d.terms) || []).slice(0, 7),
      })).filter(d => d.words.length),
    };
    keep(ck, out);
    return out;
  } finally { clearTimeout(timer); }
}

// text: 선택한 단어/구, sentence: 그 문장(영어), ko: 문장의 한국어 해석(있으면)
// → { main, groups: [{ pos, items: [{ w, ctx }] }], best, sentenceKo }
// "문맥에 맞다"는 표시(ctx)는 그 뜻이 문장 번역에 실제로 나타날 때만 붙인다. 근거가 없으면 표시하지 않는다.
export async function lookup(text, sentence, ko = '') {
  const short = tokens(text).length <= 3;
  const [w, s] = await Promise.all([
    gt(text, short),
    ko || !sentence || sentence === text ? null : gt(sentence, false).catch(() => null),
  ]);
  const sentenceKo = ko || (s && s.text) || '';
  const groups = w.dict.map(d => ({
    pos: d.pos,
    items: d.words.map(x => ({ w: x, ctx: inContext(x, sentenceKo) })).sort((a, b) => b.ctx - a.ctx),
  }));
  // 사전 후보 중에 문맥에 맞는 것이 없을 때, 단어 자체의 번역이 문장 번역에 나타나면 그것을 맨 앞에 세운다
  if (!groups.some(g => g.items.some(i => i.ctx)) && w.text && inContext(w.text, sentenceKo)) groups.unshift({ pos: '문맥', items: [{ w: w.text, ctx: true }] });
  const first = groups.flatMap(g => g.items).find(i => i.ctx);
  return { main: w.text, groups, best: first ? first.w : w.text, sentenceKo };
}

// 문장 등 긴 텍스트의 번역만 필요할 때
export const translate = t => gt(t, false).then(x => x.text);
