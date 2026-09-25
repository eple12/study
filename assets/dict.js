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
// 후보 뜻(cand)이 문장 번역(ko)에 나타나는가. 용언은 어미를 떼고 어간만 본다.
export function inContext(cand, ko) {
  const c = cand.replace(/\s+/g, '');
  const k = ko.replace(/\s+/g, '');
  if (!c || !k) return false;
  const core = c.replace(/(하다|되다|이다)$/, '').replace(/다$/, '');
  if (!core) return false;
  return (core.length >= 2 || core === c) && k.includes(core);
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

// 단어 하나의 문맥 뜻 후보: 뒤 3단어와 함께 번역한 것(없으면 앞 3단어)에서, 그 단어를 뺀 번역에 없는 어절만 남긴다.
//   "disruption of our life" → "우리 삶의 혼란"  /  "of our life" → "우리 삶의"  ⇒ "혼란"
const JOSA = /(으로|에서|에게|까지|부터|보다|처럼|만큼|이라|은|는|이|가|을|를|의|에|와|과|도|로|만)$/;
const clean = w => {
  const x = w.replace(/[.,!?"'“”‘’()…·]/g, '');
  const y = x.replace(JOSA, '');
  return y.length >= 2 ? y : x;
};
async function contextual(text, sentence) {
  const i = sentence.toLowerCase().indexOf(text.toLowerCase());
  if (i < 0) return [];
  const after = sentence.slice(i + text.length).trim().split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
  const before = sentence.slice(0, i).trim().split(/\s+/).filter(Boolean).slice(-3).join(' ');
  const [w1, w0] = after ? [text + ' ' + after, after] : before ? [before + ' ' + text, before] : ['', ''];
  if (!w0) return [];
  const [a, b] = await Promise.all([gt(w1, false), gt(w0, false)]);
  const drop = new Set(b.text.split(/\s+/).map(clean));
  return a.text.split(/\s+/).map(clean).filter(x => x.length >= 2 && !drop.has(x));
}

// text: 선택한 단어/구, sentence: 그 문장(영어), ko: 문장의 한국어 해석(있으면)
// → { main, groups: [{ pos, items: [{ w, ctx }] }], best, sentenceKo }
export async function lookup(text, sentence, ko = '') {
  const short = tokens(text).length <= 3;
  const one = tokens(text).length === 1 && sentence && sentence !== text;
  const [w, s, c] = await Promise.all([
    gt(text, short),
    ko || !sentence || sentence === text ? null : gt(sentence, false).catch(() => null),
    one ? contextual(text, sentence).catch(() => []) : [],
  ]);
  const sentenceKo = ko || (s && s.text) || '';
  const groups = w.dict.map(d => ({
    pos: d.pos,
    items: d.words.map(x => ({ w: x, ctx: inContext(x, sentenceKo) })).sort((a, b) => b.ctx - a.ctx),
  }));
  // 사전 후보에 문맥에 맞는 뜻이 없을 때, 문장 번역에도 실제로 나타나는 어절이 정확히 하나면 그것을 문맥 뜻으로 맨 앞에 세운다
  if (!groups.some(g => g.items.some(i => i.ctx))) {
    const cs = [...new Set((c || []).filter(x => inContext(x, sentenceKo)))];
    if (cs.length === 1) groups.unshift({ pos: '문맥', items: [{ w: cs[0], ctx: true }] });
  }
  const first = groups.flatMap(g => g.items).find(i => i.ctx);
  return { main: w.text, groups, best: first ? first.w : w.text, sentenceKo };
}

// 문장 등 긴 텍스트의 번역만 필요할 때
export const translate = t => gt(t, false).then(x => x.text);
