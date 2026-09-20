import { normalize } from './schema.js';

const TITLE = document.title;
const app = document.getElementById('app');
const CIRC = '①②③④⑤⑥⑦⑧⑨⑩';
const MODES = ['en', 'both', 'ko'];
const MODE_LABEL = { en: 'EN', both: 'EN·KO', ko: 'KO' };
const SIZES = [16, 18, 20, 22];
const FINE = matchMedia('(pointer: fine)').matches;

/* ── icons ── */
const I = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  retry: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  swap: '<path d="M7 20V4M3 8l4-4 4 4M17 4v16M13 16l4 4 4-4"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  grip: '<path d="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01" stroke-width="2.6"/>',
};
const icon = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`;

/* ── utils ── */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const enc = encodeURIComponent;
const next = (arr, v) => arr[(arr.indexOf(v) + 1) % arr.length];
const shuffle = a => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const focus = el => { if (FINE && el) el.focus({ preventScroll: true }); };

// **굵게** __밑줄__ ==형광펜== *기울임*
function md(s) {
  return esc(s)
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<b>$1</b>')
    .replace(/(?<![_\w])__(?=[^_\s])(.+?)(?<=[^_\s])__(?![_\w])/g, '<u>$1</u>')
    .replace(/==(?=\S)(.+?)(?<=\S)==/g, '<mark>$1</mark>')
    .replace(/(?<![*\w])\*(?=\S)(.+?)(?<=\S)\*(?![*\w])/g, '<i>$1</i>')
    .replace(/\n/g, '<br>');
}

const norm = s => String(s).normalize('NFC').toLowerCase()
  .replace(/[‘’`´]/g, "'").replace(/[“”]/g, '"')
  .replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '').trim();

const store = {
  get(k, d) { try { const v = localStorage.getItem('study:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('study:' + k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
};
const prog = path => ({ q: {}, c: {}, ...store.get('p:' + path, {}) });
const saveProg = (path, p) => store.set('p:' + path, p);

/* ── data ── */
let manifest;
const sets = new Map();
const url = p => 'content/' + p.split('/').map(enc).join('/');

async function getJSON(u) {
  const r = await fetch(u, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${r.status} ${decodeURIComponent(u)}`);
  const t = await r.text();
  try { return JSON.parse(t.replace(/^﻿/, '')); }
  catch (e) { throw new Error(`${decodeURIComponent(u)}\n${e.message}`); }
}
async function loadManifest() { return (manifest ??= await getJSON('content/index.json')); }
async function loadSet(path) {
  if (!sets.has(path)) {
    const { set, errors } = normalize(await getJSON(url(path)), path);
    if (errors.length) console.warn(path, errors);
    if (!set) throw new Error(`${path}\n${errors.join('\n')}`);
    sets.set(path, set);
  }
  return sets.get(path);
}

/* ── router ── */
let onKey = null;
document.addEventListener('keydown', e => {
  if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
  onKey?.(e);
});
addEventListener('hashchange', route);
route();

async function route() {
  onKey = null;
  document.querySelectorAll('.sheet').forEach(s => s.remove());
  const [v = '', p = ''] = location.hash.replace(/^#\/?/, '').split('/');
  const path = decodeURIComponent(p);
  try {
    if (!v || !path) await home();
    else {
      const set = await loadSet(path);
      const has = { r: set.passages.length, q: set.questions.length, c: set.vocab.length };
      const first = Object.keys(has).find(k => has[k]);
      if (!first) throw new Error(`${path}\n∅`);
      if (!has[v]) return location.replace(`#/${first}/${enc(path)}`);
      document.title = set.title;
      ({ r: reader, q: quiz, c: cards })[v](set, path);
    }
  } catch (e) { fail(e); }
  scrollTo(0, 0);
}

function fail(e) {
  console.error(e);
  app.innerHTML = `<header class="top"><a class="ib" href="#/" aria-label="홈">${icon('back')}</a></header><pre class="err">${esc(e.message || e)}</pre>`;
}

function shell(set, path, tab) {
  const tabs = [['r', '본문', set.passages.length], ['q', '문제', set.questions.length], ['c', '단어', set.vocab.length]].filter(t => t[2]);
  app.innerHTML = `<div class="head">
    <header class="top"><a class="ib" href="#/" aria-label="홈">${icon('back')}</a><h1>${esc(set.title)}</h1><div class="tools"></div></header>
    ${tabs.length > 1 ? `<nav class="tabs">${tabs.map(([k, l, n]) => `<a href="#/${k}/${enc(path)}" class="${k === tab ? 'on' : ''}">${l}<small>${n}</small></a>`).join('')}</nav>` : ''}
  </div><main></main>`;
  const main = app.querySelector('main');
  main.onclick = null;
  return main;
}

/* ── home ── */
let prefetched = false;
async function home() {
  document.title = TITLE;
  const { sets: list = [] } = await loadManifest();
  const groups = new Map();
  for (const s of list) {
    const k = s.dir.join(' / ');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  app.innerHTML = `<header class="top home"><h1>${esc(TITLE)}</h1></header><main>${
    [...groups].map(([g, items]) => `<section class="grp">${g ? `<h2>${esc(g)}</h2>` : ''}<div class="list">${items.map(row).join('')}</div></section>`).join('')
    || '<p class="empty">content / *.json</p>'}</main>`;

  if (!prefetched && navigator.serviceWorker?.controller) {
    prefetched = true;
    setTimeout(() => list.forEach(s => fetch(url(s.path)).catch(() => {})), 1500);
  }
}

function row(s) {
  const p = prog(s.path);
  const done = Object.values(p.q).filter(v => v === 1).length;
  const meta = [s.subtitle && esc(s.subtitle), s.n.p && `본문 ${s.n.p}`, s.n.q && `문제 ${s.n.q}`, s.n.v && `단어 ${s.n.v}`].filter(Boolean).join(' · ');
  return `<a class="row" href="#/s/${enc(s.path)}"><div class="t">${esc(s.title)}</div><div class="m"><span>${meta}</span>${
    s.n.q ? `<i class="pbar"><b style="width:${Math.min(100, (100 * done) / s.n.q)}%"></b></i>` : ''}</div></a>`;
}

/* ── reader ── */
function passageHTML(p) {
  const unit = u => `<span class="u${u.ko ? ' k' : ''}"><span class="en">${md(u.en)}</span>${u.ko ? `<span class="ko">${md(u.ko)}</span>` : ''}</span>`;
  return `<article class="psg${p.lines ? ' lines' : ''}">${p.title ? `<h2>${md(p.title)}</h2>` : ''}${
    p.paras.map(par => `<p>${par.map(unit).join(' ')}</p>`).join('')}${
    p.source ? `<div class="src">${md(p.source)}</div>` : ''}</article>`;
}

function bindUnits(el) {
  el.addEventListener('click', e => {
    const u = e.target.closest('.u.k');
    if (u && !String(getSelection())) u.classList.toggle('open');
  });
}

function reader(set, path) {
  const main = shell(set, path, 'r');
  const tools = app.querySelector('.tools');
  const anyKo = set.passages.some(p => p.hasKo);
  let mode = anyKo ? store.get('mode', 'en') : 'en';
  let fs = store.get('fs', 18);

  tools.innerHTML = `${anyKo ? '<button class="ib txt" data-a="mode"></button>' : ''}<button class="ib txt" data-a="fs">Aa</button>`;
  main.innerHTML = set.passages.map(passageHTML).join('');
  bindUnits(main);

  const apply = () => {
    main.className = `m-${mode}`;
    main.style.setProperty('--fs', fs + 'px');
    const b = tools.querySelector('[data-a=mode]');
    if (b) b.textContent = MODE_LABEL[mode];
  };
  apply();

  tools.onclick = e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'mode') {
      mode = next(MODES, mode);
      store.set('mode', mode);
      main.querySelectorAll('.u.open').forEach(u => u.classList.remove('open'));
    } else if (a === 'fs') {
      fs = next(SIZES, fs);
      store.set('fs', fs);
    }
    apply();
  };
}

function sheet(p) {
  if (!p) return;
  let mode = 'en';
  const d = document.createElement('div');
  d.className = 'sheet';
  d.innerHTML = `<div class="scrim"></div><div class="panel">
    <div class="ph">${p.hasKo ? `<button class="ib txt" data-a="mode">${MODE_LABEL[mode]}</button>` : ''}<span></span><button class="ib" data-a="close" aria-label="닫기">${icon('x')}</button></div>
    <div class="pb m-${mode}" style="--fs:${store.get('fs', 18)}px">${passageHTML(p)}</div></div>`;
  document.body.append(d);
  requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('in')));

  const body = d.querySelector('.pb');
  bindUnits(body);
  const prevKey = onKey;
  const close = () => { onKey = prevKey; d.classList.remove('in'); setTimeout(() => d.remove(), 250); };
  onKey = e => { if (e.key === 'Escape') close(); };
  d.onclick = e => {
    if (e.target.classList.contains('scrim')) return close();
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'close') close();
    if (a === 'mode') {
      mode = next(MODES, mode);
      body.className = `pb m-${mode}`;
      body.querySelectorAll('.u.open').forEach(u => u.classList.remove('open'));
      e.target.closest('[data-a]').textContent = MODE_LABEL[mode];
    }
  };
}

/* ── question types ── */
// 각 타입: (q, el, changed) → { ready(), check() → {ok, show?} | {pending, show}, key?(e), next?(target) }
const KIND = {
  choice(q, el, changed) {
    const multi = q.answer.length > 1, sel = new Set();
    let lock = false;
    el.innerHTML = `<div class="opts">${q.choices.map((c, i) => `<button class="opt" data-i="${i + 1}"><span class="n">${CIRC[i] || i + 1}</span><span>${md(c)}</span></button>`).join('')}</div>`;
    const btns = [...el.querySelectorAll('.opt')];
    const pick = i => {
      if (lock) return;
      if (sel.has(i)) sel.delete(i);
      else { if (!multi) sel.clear(); sel.add(i); }
      btns.forEach(b => b.classList.toggle('sel', sel.has(+b.dataset.i)));
      changed();
    };
    el.onclick = e => { const b = e.target.closest('.opt'); if (b) pick(+b.dataset.i); };
    return {
      ready: () => sel.size > 0,
      key: e => { const n = +e.key; if (n >= 1 && n <= q.choices.length) pick(n); },
      check() {
        lock = true;
        btns.forEach(b => {
          const i = +b.dataset.i;
          b.disabled = true;
          if (q.answer.includes(i)) b.classList.add('ok');
          else if (sel.has(i)) b.classList.add('bad');
        });
        return { ok: sel.size === q.answer.length && q.answer.every(i => sel.has(i)) };
      },
    };
  },

  ox(q, el, changed) {
    let v = null, lock = false;
    el.innerHTML = '<div class="opts ox"><button class="opt" data-v="1">O</button><button class="opt" data-v="0">X</button></div>';
    const btns = [...el.querySelectorAll('.opt')];
    const pick = x => {
      if (lock) return;
      v = x;
      btns.forEach(b => b.classList.toggle('sel', (b.dataset.v === '1') === v));
      changed();
    };
    el.onclick = e => { const b = e.target.closest('.opt'); if (b) pick(b.dataset.v === '1'); };
    return {
      ready: () => v !== null,
      key: e => { if (/^[oO1]$/.test(e.key)) pick(true); else if (/^[xX0]$/.test(e.key)) pick(false); },
      check() {
        lock = true;
        btns.forEach(b => {
          const bv = b.dataset.v === '1';
          b.disabled = true;
          if (bv === q.answer) b.classList.add('ok');
          else if (bv === v) b.classList.add('bad');
        });
        return { ok: v === q.answer };
      },
    };
  },

  short(q, el, changed) {
    el.innerHTML = '<input class="inp" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done">';
    const inp = el.firstChild;
    inp.oninput = changed;
    focus(inp);
    return {
      ready: () => inp.value.trim() !== '',
      check() {
        inp.readOnly = true;
        const ok = q.answer.some(a => norm(a) === norm(inp.value));
        inp.classList.add(ok ? 'ok' : 'bad');
        return { ok, show: ok && q.answer.length === 1 ? '' : q.answer.map(md).join(' <span class="or">/</span> ') };
      },
    };
  },

  blank(q, el, changed) {
    const keys = [];
    el.innerHTML = `<div class="blank">${q.text.split(/\{\{(.+?)\}\}/).map((s, i) => {
      if (i % 2 === 0) return md(s);
      const alts = s.split('|').map(x => x.trim()).filter(Boolean);
      keys.push(alts);
      const w = Math.max(3, ...alts.map(a => a.length));
      return `<input class="bl" style="width:calc(${w}ch + 1.2em)" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="next">`;
    }).join('')}</div>`;
    const ins = [...el.querySelectorAll('.bl')];
    ins.forEach(i => { i.oninput = changed; });
    focus(ins[0]);
    return {
      ready: () => ins.some(i => i.value.trim()),
      next(t) {
        const k = ins.indexOf(t);
        if (k < 0) return false;
        const n = ins.slice(k + 1).find(i => !i.value.trim());
        if (n) n.focus();
        return !!n;
      },
      check() {
        let all = true;
        ins.forEach((inp, k) => {
          inp.readOnly = true;
          const ok = keys[k].some(a => norm(a) === norm(inp.value));
          all &&= ok;
          inp.classList.add(ok ? 'ok' : 'bad');
          if (!ok) inp.insertAdjacentHTML('afterend', `<span class="fix">${esc(keys[k][0])}</span>`);
        });
        return { ok: all };
      },
    };
  },

  order(q, el, changed) {
    const items = q.items, chips = items.every(s => s.length <= 30);
    const pool = shuffle(items.map((_, i) => i));
    if (pool.every((k, i) => items[k] === items[i])) pool.push(pool.shift());
    const picked = [];
    let lock = false;
    const it = (k, cls, j) => `<button class="it ${cls}" data-k="${k}">${
      !chips && j != null ? `<span class="grip">${icon('grip')}</span><span class="n">${j + 1}</span>` : ''}<span>${md(items[k])}</span></button>`;
    const draw = () => {
      el.innerHTML = `${q.given ? `<div class="ctx">${md(q.given)}</div>` : ''}<div class="ord${chips ? ' chips' : ''}">
        <div class="slots">${picked.map((k, j) => it(k, 'in', j)).join('')}</div>
        <div class="pool">${pool.map(k => it(k, picked.includes(k) ? 'used' : '')).join('')}</div></div>`;
      if (!chips) sortable(el.querySelector('.slots'), picked, changed, () => lock);
    };
    draw();
    let dragged = false;
    el.addEventListener('dragdone', () => { dragged = true; });
    el.onclick = e => {
      const b = e.target.closest('.it');
      if (lock || !b || e.target.closest('.grip')) return;
      if (dragged) { dragged = false; return; }
      const k = +b.dataset.k;
      if (b.classList.contains('in')) picked.splice(picked.indexOf(k), 1);
      else if (!picked.includes(k)) picked.push(k);
      draw();
      changed();
    };
    return {
      ready: () => picked.length === items.length,
      check() {
        lock = true;
        const ok = picked.every((k, j) => items[k] === items[j]);
        el.querySelectorAll('.slots .it').forEach((b, j) => b.classList.add(items[+b.dataset.k] === items[j] ? 'ok' : 'bad'));
        el.querySelector('.pool').remove();
        const show = chips ? md(items.join(' ')) : `<ol class="sol">${items.map(s => `<li>${md(s)}</li>`).join('')}</ol>`;
        return { ok, show: ok ? '' : show };
      },
    };
  },

  self(q, el) {
    el.innerHTML = '<textarea class="inp" rows="4" spellcheck="false"></textarea>';
    return {
      ready: () => true,
      check() {
        el.firstChild.readOnly = true;
        return { pending: true, show: q.answer.map(md).join('<br>') };
      },
    };
  },
};

/* ── quiz ── */
let S = null;

function quiz(set, path) {
  const main = shell(set, path, 'q');
  const qs = set.questions;
  if (S?.set === set && S.i < S.list.length) ask();
  else overview(null);

  function overview(score) {
    S = null;
    const p = prog(path);
    const st = q => (p.q[q.id] === 1 ? 'ok' : p.q[q.id] === 0 ? 'bad' : '');
    const right = qs.filter(q => st(q) === 'ok').length;
    const wrong = qs.filter(q => st(q) === 'bad');
    const shuf = store.get('shuf', false);
    main.innerHTML = `<div class="start">
      <div class="big${score ? ' fresh' : ''}">${score ? score[0] : right}<span>/${score ? score[1] : qs.length}</span></div>
      <div class="dots">${qs.map((q, i) => `<button class="${st(q)}" data-i="${i}">${i + 1}</button>`).join('')}</div>
    </div>
    <div class="dock"><div class="in">
      <button class="btn sq${shuf ? ' on' : ''}" data-a="shuf" aria-label="섞기">${icon('shuffle')}</button>
      ${wrong.length ? `<button class="btn" data-a="wrong">오답 ${wrong.length}</button>` : ''}
      <button class="btn primary" data-a="all" aria-label="시작">${icon('play')}</button>
    </div></div>`;
    const order = l => (store.get('shuf', false) ? shuffle(l) : l);
    main.onclick = e => {
      const t = e.target.closest('[data-a],[data-i]');
      if (!t) return;
      if (t.dataset.i) return begin(qs.slice(+t.dataset.i));
      const a = t.dataset.a;
      if (a === 'shuf') { const v = !store.get('shuf', false); store.set('shuf', v); t.classList.toggle('on', v); }
      if (a === 'wrong') begin(order(wrong));
      if (a === 'all') begin(order(qs));
    };
    onKey = e => { if (e.key === 'Enter') begin(order(qs)); };
  }

  function begin(list) {
    S = { set, list, i: 0, res: [] };
    ask();
  }

  function ask() {
    scrollTo(0, 0);
    const q = S.list[S.i], n = S.list.length;
    main.innerHTML = `<div class="qtop"><span class="cnt">${S.i + 1}<small>/${n}</small></span><i class="pbar"><b style="width:${(100 * S.i) / n}%"></b></i>${
      q.passage ? `<button class="ib" data-a="psg" aria-label="본문">${icon('book')}</button>` : ''}<button class="ib" data-a="quit" aria-label="그만">${icon('x')}</button></div>
    <div class="qcard">${q.prompt ? `<div class="prompt">${md(q.prompt)}</div>` : ''}${q.context ? `<div class="ctx">${md(q.context)}</div>` : ''}<div class="qb"></div><div class="fb" hidden></div></div>
    <div class="dock"><div class="in"><button class="btn primary" data-a="go">확인</button></div></div>`;

    const card = main.querySelector('.qcard'), fb = main.querySelector('.fb'), dock = main.querySelector('.dock .in');
    const go = () => dock.querySelector('[data-a=go]');
    const ctl = KIND[q.type](q, main.querySelector('.qb'), () => { if (go()) go().disabled = !ctl.ready(); });
    go().disabled = !ctl.ready();
    let phase = 'ask', shown = '';

    const feedback = ok => {
      fb.innerHTML = `${ok == null ? '' : `<span class="verdict ${ok ? 'ok' : 'bad'}">${icon(ok ? 'check' : 'x')}</span>`}${
        shown ? `<div class="ans">${shown}</div>` : ''}${ok != null && q.explanation ? `<div class="exp">${md(q.explanation)}</div>` : ''}`;
      fb.hidden = false;
      requestAnimationFrame(() => fb.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    };
    const done = ok => {
      phase = 'done';
      S.res[S.i] = ok;
      const p = prog(path);
      p.q[q.id] = ok ? 1 : 0;
      saveProg(path, p);
      card.classList.add(ok ? 'ok' : 'bad');
      feedback(ok);
      dock.innerHTML = `<button class="btn primary" data-a="go">${S.i + 1 < n ? '다음' : '결과'}</button>`;
      document.activeElement?.blur?.();
    };
    const submit = () => {
      if (phase === 'ask') {
        if (!ctl.ready()) return;
        const r = ctl.check();
        shown = r.show || '';
        if (r.pending) {
          phase = 'self';
          feedback(null);
          dock.innerHTML = `<button class="btn bad" data-a="no" aria-label="틀림">${icon('x')}</button><button class="btn ok" data-a="yes" aria-label="맞음">${icon('check')}</button>`;
        } else done(r.ok);
      } else if (phase === 'done') {
        S.i++;
        if (S.i < n) ask();
        else overview([S.res.filter(Boolean).length, n]);
      }
    };

    main.onclick = e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'go') submit();
      else if ((a === 'yes' || a === 'no') && phase === 'self') done(a === 'yes');
      else if (a === 'quit') overview(null);
      else if (a === 'psg') sheet(set.passages.find(p => p.id === q.passage));
    };
    onKey = e => {
      if (e.key === 'Enter') {
        if (e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        if (phase === 'ask' && ctl.next?.(e.target)) return;
        if (phase === 'self') return;
        submit();
      } else if (phase === 'self' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        done(e.key === 'ArrowRight');
      } else if (phase === 'ask' && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) ctl.key?.(e);
    };
  }
}

/* ── cards ── */
let C = null;

function cards(set, path) {
  const main = shell(set, path, 'c');
  const all = set.vocab.map((_, i) => i);
  if (C?.set !== set) deal(all);
  draw();

  function deal(idx) { C = { set, deck: shuffle(idx), i: 0, miss: [], flip: false }; }

  function draw() {
    if (C.i >= C.deck.length) return end();
    const v = set.vocab[C.deck[C.i]], rev = store.get('crev', false);
    const [f, b] = rev ? [v.m, v.w] : [v.w, v.m];
    main.innerHTML = `<div class="qtop"><span class="cnt">${C.i + 1}<small>/${C.deck.length}</small></span><i class="pbar"><b style="width:${(100 * C.i) / C.deck.length}%"></b></i><button class="ib${rev ? ' on' : ''}" data-a="rev" aria-label="앞뒤 바꾸기">${icon('swap')}</button></div>
    <div class="card${C.flip ? ' flip' : ''}" data-a="flip"><div class="f">${md(f)}</div><div class="b">${md(b)}${v.ex ? `<div class="ex">${md(v.ex)}</div>` : ''}</div></div>
    <div class="dock"><div class="in"><button class="btn bad" data-a="no" aria-label="모름">${icon('x')}</button><button class="btn ok" data-a="yes" aria-label="앎">${icon('check')}</button></div></div>`;
    swipe(main.querySelector('.card'), mark);
  }

  function mark(ok) {
    const v = set.vocab[C.deck[C.i]];
    const p = prog(path);
    p.c[v.w] = ok ? 1 : 0;
    saveProg(path, p);
    if (!ok) C.miss.push(C.deck[C.i]);
    C.i++;
    C.flip = false;
    draw();
  }

  function end() {
    const n = C.deck.length, miss = C.miss.length;
    main.innerHTML = `<div class="start"><div class="big fresh">${n - miss}<span>/${n}</span></div></div>
    <div class="dock"><div class="in">${miss ? `<button class="btn primary" data-a="miss">${icon('retry')} ${miss}</button>` : ''}<button class="btn${miss ? '' : ' primary'}" data-a="all">전체</button></div></div>`;
  }

  const flip = () => { C.flip = !C.flip; main.querySelector('.card')?.classList.toggle('flip', C.flip); };
  main.onclick = e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'flip') flip();
    else if (a === 'yes' || a === 'no') mark(a === 'yes');
    else if (a === 'rev') { store.set('crev', !store.get('crev', false)); C.flip = false; draw(); }
    else if (a === 'miss') { deal(C.miss); draw(); }
    else if (a === 'all') { deal(all); draw(); }
  };
  onKey = e => {
    if (C.i >= C.deck.length) return;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); flip(); }
    else if (e.key === 'ArrowRight') mark(true);
    else if (e.key === 'ArrowLeft') mark(false);
  };
}

// 배열 문제: 왼쪽 손잡이를 잡고 끌어서 순서 바꾸기
function sortable(box, order, changed, locked) {
  for (const g of box.querySelectorAll('.grip')) {
    g.addEventListener('pointerdown', e => {
      if (locked()) return;
      e.preventDefault();
      const node = g.closest('.it');
      const grab = e.clientY - node.getBoundingClientRect().top;
      node.classList.add('drag');
      try { g.setPointerCapture(e.pointerId); } catch { /* 캡처는 없어도 동작 */ }

      const move = ev => {
        node.style.transform = '';
        const top = node.getBoundingClientRect().top;
        const dy = ev.clientY - grab - top;
        node.style.transform = `translateY(${dy}px)`;
        const mid = top + dy + node.offsetHeight / 2;
        for (const s of box.children) {
          if (s === node) continue;
          const r = s.getBoundingClientRect();
          if (mid > r.top && mid < r.bottom) {
            box.insertBefore(node, mid < r.top + r.height / 2 ? s : s.nextSibling);
            break;
          }
        }
      };
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        removeEventListener('pointercancel', up);
        node.style.transform = '';
        node.classList.remove('drag');
        order.splice(0, order.length, ...[...box.children].map(c => +c.dataset.k));
        [...box.children].forEach((c, i) => { const n = c.querySelector('.n'); if (n) n.textContent = i + 1; });
        box.dispatchEvent(new Event('dragdone', { bubbles: true }));
        changed();
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      addEventListener('pointercancel', up);
    });
  }
}

function swipe(el, cb) {
  let x0 = null, dx = 0, moved = false;
  el.addEventListener('pointerdown', e => { x0 = e.clientX; dx = 0; moved = false; el.style.transition = 'none'; });
  el.addEventListener('pointermove', e => {
    if (x0 == null) return;
    dx = e.clientX - x0;
    if (Math.abs(dx) > 6) { moved = true; el.setPointerCapture?.(e.pointerId); }
    el.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`;
    el.dataset.lean = dx > 50 ? 'ok' : dx < -50 ? 'bad' : '';
  });
  const up = () => {
    if (x0 == null) return;
    x0 = null;
    el.style.transition = '';
    if (Math.abs(dx) > 80) {
      el.style.transform = `translateX(${dx > 0 ? 120 : -120}%) rotate(${dx > 0 ? 8 : -8}deg)`;
      el.style.opacity = '0';
      setTimeout(() => cb(dx > 0), 160);
    } else { el.style.transform = ''; el.dataset.lean = ''; }
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('click', e => { if (moved) { e.stopPropagation(); moved = false; } }, true);
}

/* ── offline ── */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
