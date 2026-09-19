// 학습 자료 JSON 정규화·검증. 브라우저(app.js)와 Node(build.mjs)가 함께 쓴다.

export const TYPES = ['choice', 'ox', 'short', 'blank', 'order', 'self'];
const ALIAS = {
  mcq: 'choice', multiple: 'choice', tf: 'ox', truefalse: 'ox', text: 'short',
  fill: 'blank', cloze: 'blank', arrange: 'order', sequence: 'order', essay: 'self', write: 'self',
};
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩';

const str = v => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const list = v => (v == null ? [] : Array.isArray(v) ? v : [v]);

// 빈 줄 = 문단 구분, 줄바꿈 하나 = 문장(단위) 구분
export function splitParas(s) {
  return str(s).replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/)
    .map(p => p.split('\n').map(x => x.trim()).filter(Boolean))
    .filter(p => p.length);
}

// 본문과 해석을 줄 단위로 맞춘다. 줄 수가 다르면 문단 단위로 묶는다.
function toUnits(text, tr, lines) {
  const P = splitParas(text), T = splitParas(tr);
  return P.map((p, i) => {
    const t = T[i] || [];
    if (!T.length || t.length === p.length) return p.map((en, j) => ({ en, ko: t[j] || '' }));
    const sep = lines ? '\n' : ' ';
    return [{ en: p.join(sep), ko: t.join(sep) }];
  });
}

function vocab(v, where, err) {
  return list(v).map((x, i) => {
    let w, m, ex;
    if (Array.isArray(x)) [w, m, ex] = x;
    else if (x && typeof x === 'object') { w = x.word ?? x.w; m = x.meaning ?? x.m; ex = x.example ?? x.ex; }
    w = str(w).trim(); m = str(m).trim(); ex = str(ex).trim();
    if (!w || !m) { err(`${where}[${i}]: 단어와 뜻이 모두 있어야 함`); return null; }
    return { w, m, ex };
  }).filter(Boolean);
}

function question(q, e) {
  if (!q || typeof q !== 'object' || Array.isArray(q)) return e('{ } 객체여야 함');
  let type = str(q.type).toLowerCase();
  type = ALIAS[type] || type;
  if (!type) {
    type = q.choices ? 'choice' : typeof q.answer === 'boolean' ? 'ox' : q.items ? 'order'
      : /\{\{.+?\}\}/.test(str(q.text)) ? 'blank' : 'short';
  }
  if (!TYPES.includes(type)) return e(`알 수 없는 type "${q.type}"`);
  const o = { type, prompt: str(q.prompt ?? q.question), context: str(q.context), explanation: str(q.explanation), passage: '' };

  switch (type) {
    case 'choice': {
      const ch = list(q.choices).map(str);
      if (ch.length < 2) return e('choices가 2개 이상 필요');
      const ans = list(q.answer).map(a => {
        const s = str(a).trim();
        return CIRCLED.includes(s) && s.length === 1 ? CIRCLED.indexOf(s) + 1 : Number(s);
      });
      if (!ans.length || ans.some(a => !Number.isInteger(a) || a < 1 || a > ch.length)) return e(`answer는 1~${ch.length} 사이 번호`);
      o.choices = ch;
      o.answer = [...new Set(ans)];
      break;
    }
    case 'ox': {
      const s = str(q.answer).trim();
      const v = q.answer === true || /^(o|t|true|참|○)$/i.test(s) ? true
        : q.answer === false || /^(x|f|false|거짓|×)$/i.test(s) ? false : null;
      if (v === null) return e('answer는 true 또는 false');
      o.answer = v;
      break;
    }
    case 'short': {
      const a = list(q.answer).map(str).filter(Boolean);
      if (!a.length) return e('answer 필요');
      o.answer = a;
      break;
    }
    case 'blank': {
      const t = str(q.text);
      if (!/\{\{.+?\}\}/.test(t)) return e('text 안에 {{정답}} 형태의 빈칸이 필요');
      o.text = t;
      break;
    }
    case 'order': {
      const it = list(q.items).map(str).filter(Boolean);
      if (it.length < 2) return e('items가 2개 이상 필요');
      o.items = it;
      o.given = str(q.given);
      break;
    }
    case 'self':
      o.answer = list(q.answer).map(str).filter(Boolean);
      break;
  }
  return o;
}

export function normalize(raw, path = '') {
  const errors = [];
  const err = m => { errors.push(m); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { set: null, errors: ['최상위는 { } 객체여야 함'] };

  const base = path.split('/').pop().replace(/\.json$/i, '');
  const set = {
    title: str(raw.title) || base,
    subtitle: str(raw.subtitle),
    order: typeof raw.order === 'number' ? raw.order : null,
    passages: [], questions: [], vocab: [],
  };

  const ids = new Set();
  list(raw.passages ?? raw.passage).forEach((p, i) => {
    if (typeof p === 'string') p = { text: p };
    if (!p || typeof p !== 'object' || !str(p.text).trim()) return err(`passages[${i}]: text 필요`);
    const id = str(p.id) || `p${i + 1}`;
    if (ids.has(id)) err(`passages[${i}]: id "${id}" 중복`);
    ids.add(id);
    const lines = p.layout === 'lines';
    set.passages.push({
      id, lines,
      title: str(p.title), source: str(p.source),
      hasKo: !!str(p.translation).trim(),
      paras: toUnits(p.text, p.translation, lines),
      vocab: vocab(p.vocab, `passages[${i}].vocab`, err),
    });
  });

  set.vocab = [...set.passages.flatMap(p => p.vocab), ...vocab(raw.vocab, 'vocab', err)];

  const only = set.passages.length === 1 ? set.passages[0].id : '';
  const qids = new Set();
  list(raw.questions).forEach((q, i) => {
    const e = m => err(`questions[${i}]: ${m}`);
    const o = question(q, e);
    if (!o) return;
    o.id = str(q.id) || String(i + 1);
    if (qids.has(o.id)) e(`id "${o.id}" 중복`);
    qids.add(o.id);
    if (q.passage != null) {
      if (ids.has(str(q.passage))) o.passage = str(q.passage);
      else e(`passage "${q.passage}"에 해당하는 본문 없음`);
    } else o.passage = only;
    set.questions.push(o);
  });

  return { set, errors };
}
