import { normalize, kindOf, KIND_ORDER } from './schema.js';
import { tokens, forms, findGloss, lookup, translate } from './dict.js';

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
  next: '<path d="M9 18l6-6-6-6"/>',
  home: '<path d="M3 11l9-8 9 8M5 9.5V20h5v-6h4v6h5V9.5"/>',
  checks: '<path d="M2 12l5 5L17 6M13 16l2 2L22 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
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
  if (e.key === 'Escape' && LK) return clearSel();
  onKey?.(e);
});
// 화면을 떠날 때의 스크롤 위치를 주소별로 기억해 두었다가, 본문·목록으로 돌아오면 복원한다.
const scrollMem = new Map();
let curHash = location.hash;
addEventListener('hashchange', () => {
  scrollMem.set(curHash, scrollY);
  curHash = location.hash;
  route();
});

async function route() {
  onKey = null;
  clearSel();
  document.querySelectorAll('.sheet').forEach(s => s.remove());
  const [v = '', p = '', t = ''] = location.hash.replace(/^#\/?/, '').split('/');
  const path = decodeURIComponent(p);
  let keep = false;
  try {
    if (v === 'm') await mix();
    else if (v === 'w') { if (p) wbView(p, t || 'l'); else wordbooks(); }
    else if (!v || !path) { await home(); keep = true; }
    else {
      const [set] = await Promise.all([loadSet(path), loadManifest()]);
      const has = { r: set.passages.length, q: set.questions.length, c: set.vocab.length };
      const first = Object.keys(has).find(k => has[k]);
      if (!first) throw new Error(`${path}\n∅`);
      if (!has[v]) return location.replace(`#/${first}/${enc(path)}`);
      document.title = set.title;
      ({ r: reader, q: quiz, c: cards })[v](set, path);
      keep = v === 'r';
    }
  } catch (e) { fail(e); }
  scrollTo(0, keep ? scrollMem.get(location.hash) ?? 0 : 0);
}

function fail(e) {
  console.error(e);
  app.innerHTML = `<header class="top"><a class="ib" href="#/" aria-label="홈">${icon('home')}</a></header><pre class="err">${esc(e.message || e)}</pre>`;
}

function shell(set, path, tab) {
  const tabs = [['r', '본문', set.passages.length], ['q', '문제', set.questions.length], ['c', '단어', set.vocab.length]].filter(t => t[2]);
  const all = manifest?.sets || [], at = all.findIndex(s => s.path === path);
  const hop = d => {
    const t = all[at + d], ic = icon(d < 0 ? 'back' : 'next'), lb = d < 0 ? '이전 지문' : '다음 지문';
    return t ? `<a class="nb" href="#/${tab}/${enc(t.path)}" aria-label="${lb}">${ic}</a>` : `<span class="nb off">${ic}</span>`;
  };
  const nav = at >= 0 && all.length > 1;
  app.innerHTML = `<div class="head">
    <header class="top"><a class="ib" href="#/" aria-label="홈">${icon('home')}</a><h1><button data-a="pick" aria-label="지문 목록">${esc(set.title)}</button></h1><div class="tools"></div></header>
    ${nav || tabs.length > 1 ? `<nav class="tabs">${nav ? hop(-1) : ''}${
      tabs.length > 1 ? tabs.map(([k, l, n]) => `<a href="#/${k}/${enc(path)}" class="${k === tab ? 'on' : ''}">${l}<small>${n}</small></a>`).join('') : '<span class="sp"></span>'}${nav ? hop(1) : ''}</nav>` : ''}
  </div><main></main>`;
  app.querySelector('.head').onclick = e => { if (e.target.closest('[data-a=pick]')) picker(path, tab); };
  const main = app.querySelector('main');
  main.onclick = null;
  return main;
}

// 제목을 누르면 홈으로 돌아가지 않고 다른 지문으로 바로 이동
function picker(path, tab) {
  const groups = new Map();
  for (const s of manifest.sets) {
    const k = s.dir.join(' / ');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const o = overlay('', [...groups].map(([g, items]) => `<section class="grp">${g ? `<h2>${esc(g)}</h2>` : ''}<div class="list">${
    items.map(s => row(s, `#/${tab}/${enc(s.path)}`, s.path === path ? ' cur' : '')).join('')}</div></section>`).join(''));
  o.d.addEventListener('click', e => { if (e.target.closest('a')) o.close(); });
  const cur = o.body.querySelector('.cur');
  if (cur) o.panel.scrollTop = cur.getBoundingClientRect().top - o.panel.getBoundingClientRect().top + o.panel.scrollTop - o.panel.clientHeight / 2;
}

// 아래에서 올라오는 시트 공통
function overlay(head, body, cls = '', style = '') {
  const d = document.createElement('div');
  d.className = 'sheet';
  d.innerHTML = `<div class="scrim"></div><div class="panel"><div class="ph">${head}<span></span><button class="ib" data-a="close" aria-label="닫기">${icon('x')}</button></div><div class="pb ${cls}" style="${style}">${body}</div></div>`;
  document.body.append(d);
  requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('in')));
  const prevKey = onKey;
  const o = { d, panel: d.querySelector('.panel'), body: d.querySelector('.pb'), onClose: null };
  o.close = () => { o.onClose?.(); onKey = prevKey; d.classList.remove('in'); setTimeout(() => d.remove(), 250); };
  onKey = e => { if (e.key === 'Escape') o.close(); };
  d.addEventListener('click', e => { if (e.target.classList.contains('scrim') || e.target.closest('[data-a=close]')) o.close(); });
  return o;
}

/* ── home ── */
let prefetched = false;
let picking = false; // 홈에서 랜덤 학습할 지문을 고르는 중인지
async function home() {
  document.title = TITLE;
  const { sets: list = [] } = await loadManifest();
  const usable = new Set(list.filter(s => s.n.q).map(s => s.path));
  const sel = new Set(store.get('sel', []).filter(p => usable.has(p)));
  const groups = new Map();
  for (const s of list) {
    const k = s.dir.join(' / ');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const gp = [...groups.values()].map(items => items.filter(s => usable.has(s.path)).map(s => s.path));
  const kinds = [...new Set(list.flatMap(s => Object.keys(s.k || {})))].sort((a, b) => {
    const i = KIND_ORDER.indexOf(a), j = KIND_ORDER.indexOf(b);
    return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || a.localeCompare(b, 'ko');
  });
  const off = new Set(store.get('kindsOff', [])); // 꺼 둔 유형

  const section = ([g, items], gi) => {
    const head = !g ? '' : picking && gp[gi].length
      ? `<button class="gh" data-g="${gi}"><h2>${esc(g)}</h2><span class="chk">${icon('check')}</span></button>`
      : `<h2>${esc(g)}</h2>`;
    const rows = items.map(s => picking
      ? `<button class="row pk${usable.has(s.path) ? '' : ' dis'}" data-p="${esc(s.path)}"><span class="chk">${icon('check')}</span><span class="bd">${rowBody(s)}</span></button>`
      : row(s)).join('');
    return `<section class="grp">${head}<div class="list">${rows}</div></section>`;
  };

  app.innerHTML = `<header class="top home"><h1>${esc(TITLE)}</h1><a class="ib" href="#/w" aria-label="단어장">${icon('book')}</a>${usable.size ? `<button class="ib${picking ? ' on' : ''}" data-a="pick" aria-label="랜덤 학습">${icon(picking ? 'x' : 'shuffle')}</button>` : ''}</header><main>${
    picking && kinds.length ? `<div class="kchips">${kinds.map(k => `<button class="kc" data-kind="${esc(k)}">${esc(k)}<small></small></button>`).join('')}</div>` : ''}${
    [...groups].map(section).join('') || '<p class="empty">content / *.json</p>'}</main>${
    picking ? `<div class="dock"><div class="in"><button class="btn sq" data-a="all" aria-label="전체 선택">${icon('checks')}</button><button class="btn primary" data-a="start" aria-label="시작">${icon('play')}<b class="num"></b></button></div></div>` : ''}`;

  app.querySelector('.top').onclick = e => {
    if (!e.target.closest('[data-a=pick]')) return;
    picking = !picking;
    home();
  };

  if (picking) {
    const inKinds = s => (s.k ? Object.entries(s.k).reduce((t, [k, v]) => t + (off.has(k) ? 0 : v), 0) : s.n.q);
    const count = () => list.reduce((t, s) => t + (sel.has(s.path) ? inKinds(s) : 0), 0);
    const startBtn = app.querySelector('[data-a=start]'), allBtn = app.querySelector('[data-a=all]');
    const refresh = () => {
      app.querySelectorAll('[data-p]').forEach(r => r.classList.toggle('on', sel.has(r.dataset.p)));
      app.querySelectorAll('[data-g]').forEach(h => { const ps = gp[+h.dataset.g]; h.classList.toggle('on', ps.every(p => sel.has(p))); });
      const n = count();
      startBtn.disabled = !n;
      startBtn.querySelector('.num').textContent = n || '';
      allBtn.classList.toggle('on', usable.size > 0 && sel.size === usable.size);
      const base = list.filter(s => (sel.size ? sel.has(s.path) : usable.has(s.path)));
      app.querySelectorAll('[data-kind]').forEach(c => {
        const n = base.reduce((t, s) => t + (s.k?.[c.dataset.kind] || 0), 0);
        c.classList.toggle('on', !off.has(c.dataset.kind));
        c.classList.toggle('z', !n);
        c.querySelector('small').textContent = n;
      });
      store.set('sel', [...sel]);
    };
    const flip = ps => { const all = ps.every(p => sel.has(p)); ps.forEach(p => (all ? sel.delete(p) : sel.add(p))); };
    app.querySelector('main').onclick = e => {
      const r = e.target.closest('[data-p]'), g = e.target.closest('[data-g]'), kc = e.target.closest('[data-kind]');
      if (kc) { const k = kc.dataset.kind; if (off.has(k)) off.delete(k); else off.add(k); store.set('kindsOff', [...off]); }
      else if (r && usable.has(r.dataset.p)) flip([r.dataset.p]);
      else if (g) flip(gp[+g.dataset.g]);
      else return;
      refresh();
    };
    app.querySelector('.dock').onclick = e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'all') { flip([...usable]); refresh(); }
      else if (a === 'start' && count()) location.hash = '#/m';
    };
    refresh();
  }

  if (!prefetched && navigator.serviceWorker?.controller) {
    prefetched = true;
    setTimeout(() => list.forEach(s => fetch(url(s.path)).catch(() => {})), 1500);
  }
}

function rowBody(s) {
  const p = prog(s.path);
  const done = Object.values(p.q).filter(v => v === 1).length;
  const meta = [s.subtitle && esc(s.subtitle), s.n.p && `본문 ${s.n.p}`, s.n.q && `문제 ${s.n.q}`, s.n.v && `단어 ${s.n.v}`].filter(Boolean).join(' · ');
  return `<div class="t">${esc(s.title)}</div><div class="m"><span>${meta}</span>${
    s.n.q ? `<i class="pbar"><b style="width:${Math.min(100, (100 * done) / s.n.q)}%"></b></i>` : ''}</div>`;
}

function row(s, href = `#/s/${enc(s.path)}`, cls = '') {
  return `<a class="row${cls}" href="${href}">${rowBody(s)}</a>`;
}

/* ── reader ── */
function passageHTML(p) {
  const unit = u => `<span class="u${u.ko ? ' k' : ''}"><span class="en">${md(u.en)}</span>${u.ko ? `<span class="ko">${md(u.ko)}</span>` : ''}</span>`;
  return `<article class="psg${p.lines ? ' lines' : ''}" data-pid="${esc(p.id)}">${p.title ? `<h2>${md(p.title)}</h2>` : ''}${
    p.paras.map(par => `<p>${par.map(unit).join(' ')}</p>`).join('')}${
    p.source ? `<div class="src">${md(p.source)}</div>` : ''}</article>`;
}

function reader(set, path) {
  const main = shell(set, path, 'r');
  const tools = app.querySelector('.tools');
  const anyKo = set.passages.some(p => p.hasKo);
  let mode = anyKo ? store.get('mode', 'en') : 'en';
  let fs = store.get('fs', 18);

  tools.innerHTML = `${anyKo ? '<button class="ib txt" data-a="mode"></button>' : ''}<button class="ib txt" data-a="fs">Aa</button>`;
  main.innerHTML = set.passages.map(passageHTML).join('');
  main.classList.add('m-' + mode);
  bindWords(main, { set, path });

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

const sheetMem = new Map(); // 본문 시트를 닫을 때의 스크롤 위치
function sheet(p, key, ctx) {
  if (!p) return;
  let mode = 'en';
  const o = overlay(p.hasKo ? `<button class="ib txt" data-a="mode">${MODE_LABEL[mode]}</button>` : '', passageHTML(p), `m-${mode}`, `--fs:${store.get('fs', 18)}px`);
  bindWords(o.body, ctx);
  o.panel.scrollTop = sheetMem.get(key) ?? 0;
  o.onClose = () => { sheetMem.set(key, o.panel.scrollTop); if (SEL?.root === o.body) clearSel(); };
  o.d.addEventListener('click', e => {
    const b = e.target.closest('[data-a=mode]');
    if (!b) return;
    mode = next(MODES, mode);
    o.body.className = `pb m-${mode}`;
    o.body.querySelectorAll('.u.open').forEach(u => u.classList.remove('open'));
    b.textContent = MODE_LABEL[mode];
  });
}

/* ── 단어 선택 · 뜻 조회 · 단어장 ── */
const tidy = s => s.replace(/\s+/g, ' ').trim();
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
const net = () => store.get('net', true);

const wb = {
  books: () => store.get('wb', []),
  put: b => store.set('wb', b),
  ensure() {
    let b = wb.books();
    if (!b.length) { b = [{ id: uid(), name: '내 단어장', words: [] }]; wb.put(b); }
    return b;
  },
  cur() { const b = wb.ensure(); return b.find(x => x.id === store.get('wbcur', '')) || b[0]; },
  find: id => wb.books().find(b => b.id === id),
  // 같은 단어(구)가 이미 있으면 뜻을 갱신한다. 새로 추가했으면 true
  save(bookId, e) {
    const all = wb.books(), b = all.find(x => x.id === bookId);
    const at = b.words.findIndex(x => norm(x.w) === norm(e.w));
    if (at >= 0) b.words[at] = { ...b.words[at], ...e };
    else b.words.push({ id: uid(), t: Date.now(), ...e });
    wb.put(all);
    return at < 0;
  },
  has: (bookId, text) => !!wb.find(bookId)?.words.some(x => norm(x.w) === norm(text)),
};

// 본문의 영어 단어를 눌러 볼 수 있게 <span class="w">로 감싼다
function wrapWords(root) {
  for (const en of root.querySelectorAll('.en')) {
    const tw = document.createTreeWalker(en, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (tw.nextNode()) nodes.push(tw.currentNode);
    for (const n of nodes) {
      const t = n.nodeValue;
      if (!/[A-Za-z]/.test(t)) continue;
      const frag = document.createDocumentFragment();
      let last = 0;
      for (const m of t.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*/g)) {
        if (m.index > last) frag.append(t.slice(last, m.index));
        const s = document.createElement('span');
        s.className = 'w';
        s.textContent = m[0];
        frag.append(s);
        last = m.index + m[0].length;
      }
      if (last < t.length) frag.append(t.slice(last));
      n.replaceWith(frag);
    }
    const spans = sentenceSpans(en.textContent), rr = document.createRange();
    rr.setStart(en, 0);
    for (const w of en.querySelectorAll('.w')) {
      rr.setEndBefore(w);
      const off = rr.toString().length;
      w.dataset.s = Math.max(0, spans.findIndex(([a, b]) => off >= a && off < b));
    }
  }
}

// 단어장에 저장한 단어는 본문에서 표시해 준다
function markSaved(root) {
  const have = new Set(wb.books().flatMap(b => b.words).filter(x => tokens(x.w).length === 1).flatMap(x => [...forms(x.w)]));
  root.querySelectorAll('.w').forEach(w => w.classList.toggle('has', have.size > 0 && [...forms(w.textContent)].some(f => have.has(f))));
}

let SEL = null;  // { root, ctx, unit, ws } 지금 선택된 단어들
let LK = null;   // 뜻 패널 { el, ro, q, picked, touched }
let lkSeq = 0, lkTimer = 0;

function setSel(root, ctx, unit, ws) {
  document.querySelectorAll('.w.sel').forEach(w => w.classList.remove('sel'));
  ws.forEach(w => w.classList.add('sel'));
  if (!ws.length) { SEL = null; closeLookup(); return; }
  SEL = { root, ctx, unit, ws };
  openLookup();
}
const clearSel = () => setSel(null, null, null, []);

// 탭: 단어 선택 → 다른 단어를 탭하면 그 사이가 구로 선택 → 끝 단어를 탭하면 줄어듦. 마우스는 끌어서도 선택
function bindWords(root, ctx) {
  wrapWords(root);
  markSaved(root);
  let lastDrag = 0;
  const wordsOf = (u, s) => [...u.querySelectorAll('.en .w')].filter(x => x.dataset.s === s); // 같은 문장의 단어들

  root.addEventListener('click', e => {
    if (Date.now() - lastDrag < 300) return;
    const u = e.target.closest('.u');
    if (!u) { if (SEL) clearSel(); return; }
    const w = e.target.closest('.w');
    const blurred = root.classList.contains('m-ko') && u.classList.contains('k') && !u.classList.contains('open');
    if (blurred || !w) {
      if (u.classList.contains('k')) u.classList.toggle('open');
      else if (SEL) clearSel();
      return;
    }
    const ws = wordsOf(u, w.dataset.s), i = ws.indexOf(w);
    let next;
    if (!SEL || SEL.unit !== u || SEL.ws[0].dataset.s !== w.dataset.s) next = [w];
    else {
      const idx = SEL.ws.map(x => ws.indexOf(x)), lo = Math.min(...idx), hi = Math.max(...idx);
      if (i >= lo && i <= hi) next = lo === hi ? [] : i === lo ? ws.slice(lo + 1, hi + 1) : i === hi ? ws.slice(lo, hi) : [w];
      else next = ws.slice(Math.min(lo, i), Math.max(hi, i) + 1);
    }
    setSel(root, ctx, u, next);
  });

  root.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const w = e.target.closest('.w');
    if (!w) return;
    const u = w.closest('.u'), ws = wordsOf(u, w.dataset.s), a = ws.indexOf(w);
    let dragged = false;
    const move = ev => {
      const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.w');
      if (!t || t.closest('.u') !== u || t.dataset.s !== w.dataset.s) return;
      const b = ws.indexOf(t);
      if (b === a && !dragged) return;
      dragged = true;
      setSel(root, ctx, u, ws.slice(Math.min(a, b), Math.max(a, b) + 1));
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      if (dragged) lastDrag = Date.now();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });
}

// 뜻을 이미 적어 둔 곳: 이 지문의 vocab, 세트의 vocab, 저장해 둔 단어장
function glossFor(ctx) {
  const set = ctx?.set;
  const pid = SEL?.unit.closest('.psg')?.dataset.pid;
  const own = [...(set?.passages.find(p => p.id === pid)?.vocab || []), ...(set?.vocab || [])].map(x => ({ ...x, tag: '지문' }));
  const saved = wb.books().flatMap(b => b.words).map(x => ({ ...x, tag: '저장' }));
  return [...own, ...saved];
}

// 문단 텍스트를 문장 구간 [시작, 끝]으로 나눈다. 약어(J. B. S., Mr. 등) 뒤는 문장 끝으로 보지 않는다
function sentenceSpans(full) {
  const spans = [];
  let start = 0;
  for (const m of full.matchAll(/(?<=[.!?]["')’”]?)\s+(?=[A-Z"“(])/g)) {
    if (/(?:\s|^)[A-Z]\.$|\b(?:Mr|Mrs|Ms|Dr|St|vs|etc)\.$|\be\.g\.$|\bi\.e\.$/.test(full.slice(start, m.index))) continue;
    spans.push([start, m.index]);
    start = m.index + m[0].length;
  }
  spans.push([start, full.length]);
  return spans;
}

// 문단(.en) 안에서 first 단어가 속한 문장. 문단 전체가 한 문장이면 single = true
function sentenceAt(en, first) {
  const full = en.textContent, spans = sentenceSpans(full);
  const k = +first.dataset.s || 0, [a, b] = spans[k] || spans[0];
  return { text: tidy(full.slice(a, b)), single: spans.length === 1 };
}

function openLookup() {
  const { ws, unit, ctx } = SEL;
  const r = document.createRange();
  r.setStartBefore(ws[0]);
  r.setEndAfter(ws.at(-1));
  let text = tidy(r.toString());
  const sFirst = [...unit.querySelectorAll('.en .w')].find(x => x.dataset.s === ws[0].dataset.s); // 이 문장의 첫 단어
  if (ws[0] === sFirst && /^[A-Z][a-z'’-]+$/.test(tokens(text)[0] || '')) text = text[0].toLowerCase() + text.slice(1); // 문장 첫 단어의 대문자 보정
  const sen = sentenceAt(unit.querySelector('.en'), ws[0]);
  const koFull = tidy(unit.querySelector('.ko')?.textContent || '');
  const q = { text, sentence: sen.text, ko: sen.single ? koFull : '', koFull, ctx }; // 해석이 문단 단위면 문장 해석은 온라인으로 받는다
  const lk = ensurePanel();
  lk.q = q;
  lk.picked = new Set();
  lk.touched = false;
  const el = lk.el;
  el.querySelector('.lk-t').textContent = text;
  el.querySelector('.lk-tag').textContent = '';
  el.querySelector('.lk-in').value = '';
  el.querySelector('.lk-b').innerHTML = '<i class="lk-spin"></i>';
  paintBook();
  const seq = ++lkSeq;
  clearTimeout(lkTimer);
  lkTimer = setTimeout(() => runLookup(q, seq), 220);
}

async function runLookup(q, seq) {
  const hit = findGloss(q.text, glossFor(q.ctx));
  const st = { hit, groups: [], main: '', best: hit ? hit.m : '', sentenceKo: q.ko, err: '', loading: true };
  fillLookup(q, st);
  try {
    if (!net()) { st.sentenceKo = q.koFull; if (!hit) st.err = '오프라인'; }
    else if (hit) { if (!q.ko) st.sentenceKo = await translate(q.sentence); }
    else Object.assign(st, await lookup(q.text, q.sentence, q.ko));
  } catch { st.sentenceKo ||= q.koFull; st.err = navigator.onLine ? '조회 실패' : '오프라인'; }
  if (seq !== lkSeq) return;
  st.loading = false;
  fillLookup(q, st);
}

function ensurePanel() {
  if (LK) return LK;
  const el = document.createElement('div');
  el.className = 'lookup';
  el.innerHTML = `<div class="lk-h"><b class="lk-t"></b><span class="lk-tag"></span><button class="ib" data-a="lkx" aria-label="닫기">${icon('x')}</button></div>
    <div class="lk-b"></div>
    <div class="lk-f"><input class="lk-in" placeholder="뜻" autocomplete="off" spellcheck="false"><button class="lk-bk" data-a="lkbook" aria-label="단어장 선택"></button><button class="btn primary lk-sv" data-a="lksave" aria-label="저장">${icon('check')}</button></div>`;
  document.body.append(el);
  document.body.classList.add('lk');
  const ro = new ResizeObserver(() => {
    document.documentElement.style.setProperty('--lk', el.offsetHeight + 'px');
    if (!SEL) return;
    const rc = SEL.ws[0].getBoundingClientRect(), lim = innerHeight - el.offsetHeight - 14; // 선택한 단어가 패널에 가리지 않게
    if (rc.bottom > lim) (SEL.root.closest('.panel') || window).scrollBy(0, rc.bottom - lim + 10);
  });
  ro.observe(el);
  LK = { el, ro, q: null, picked: new Set(), touched: false };
  el.querySelector('.lk-in').addEventListener('input', () => { LK.touched = true; });
  el.addEventListener('click', e => {
    const mc = e.target.closest('.mc'), a = e.target.closest('[data-a]')?.dataset.a;
    if (mc) {
      const m = mc.dataset.m;
      if (LK.picked.has(m)) LK.picked.delete(m); else LK.picked.add(m);
      el.querySelector('.lk-in').value = [...LK.picked].join(', ');
      LK.touched = true;
      mc.classList.toggle('on');
    } else if (a === 'lkx') clearSel();
    else if (a === 'lkbook') bookPicker(paintBook);
    else if (a === 'lksave') saveLookup();
  });
  return LK;
}

function closeLookup() {
  if (!LK) return;
  clearTimeout(lkTimer);
  LK.ro.disconnect();
  LK.el.remove();
  LK = null;
  document.body.classList.remove('lk');
  document.documentElement.style.removeProperty('--lk');
}

function paintBook() {
  if (!LK?.q) return;
  const book = wb.cur();
  LK.el.querySelector('.lk-bk').textContent = book.name;
  LK.el.querySelector('.lk-sv').classList.toggle('done', wb.has(book.id, LK.q.text));
}

function fillLookup(q, st) {
  if (!LK || LK.q !== q) return;
  const el = LK.el, all = st.groups.flatMap(g => g.items.map(i => i.w));
  let h = '';
  const mainChip = st.main && !all.includes(st.main) ? `<div class="lk-g"><button class="mc" data-m="${esc(st.main)}">${esc(st.main)}</button></div>` : '';
  const hasCtx = st.groups.some(g => g.items.some(i => i.ctx));
  if (st.hit) h += `<div class="lk-hit"><b>${md(st.hit.m)}</b>${st.hit.ex ? `<span>${md(st.hit.ex)}</span>` : ''}</div>`;
  else if (!hasCtx) h += mainChip;
  h += st.groups.map(g => `<div class="lk-g"><small>${esc(g.pos)}</small>${g.items.map(i => `<button class="mc${i.ctx ? ' ctx' : ''}" data-m="${esc(i.w)}">${esc(i.w)}</button>`).join('')}</div>`).join('');
  if (!st.hit && hasCtx) h += mainChip;
  if (st.loading) h += '<i class="lk-spin"></i>';
  if (st.err) h += `<div class="lk-err">${esc(st.err)}</div>`;
  if (st.sentenceKo) h += `<div class="lk-s">${esc(st.sentenceKo)}</div>`;
  el.querySelector('.lk-b').innerHTML = h;
  el.querySelector('.lk-tag').textContent = st.hit ? st.hit.tag : '';
  const inp = el.querySelector('.lk-in');
  if (!LK.touched && st.best) { inp.value = st.best; LK.picked = new Set([st.best]); }
  el.querySelectorAll('.mc').forEach(c => c.classList.toggle('on', LK.picked.has(c.dataset.m)));
  paintBook();
}

function saveLookup() {
  const { q } = LK, inp = LK.el.querySelector('.lk-in'), m = inp.value.trim();
  if (!m) { inp.focus(); return; }
  const book = wb.cur();
  const isNew = wb.save(book.id, { w: q.text, m, ex: q.sentence, src: q.ctx?.set?.title || '', path: q.ctx?.path || '' });
  const root = SEL?.root;
  toast(`${q.text} → ${book.name}${isNew ? '' : ' (수정)'}`);
  clearSel();
  if (root) markSaved(root);
}

let toastT = 0;
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.append(t); }
  t.textContent = msg;
  t.classList.add('in');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('in'), 1800);
}

function bookPicker(done) {
  const books = wb.ensure(), cur = wb.cur().id;
  const o = overlay('', `<div class="list">${books.map(b => `<button class="row bk${b.id === cur ? ' cur' : ''}" data-id="${b.id}"><div class="t">${esc(b.name)}</div><div class="m"><span>${b.words.length}</span></div></button>`).join('')}<button class="row bk" data-id="+"><div class="t">${icon('plus')}</div></button></div>`);
  o.d.classList.add('over');
  o.d.addEventListener('click', e => {
    const r = e.target.closest('[data-id]');
    if (!r) return;
    let id = r.dataset.id;
    if (id === '+') {
      const name = prompt('새 단어장 이름');
      if (!name?.trim()) return;
      const all = wb.ensure();
      id = uid();
      all.push({ id, name: name.trim(), words: [] });
      wb.put(all);
    }
    store.set('wbcur', id);
    o.close();
    done?.();
  });
}

/* ── 단어장 화면 ── */
const WB_MODES = { mean: '뜻', spell: '철자', both: '혼합' };
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wbTop = (title, tools = '', back = '#/w', titleAttr = '') => `<header class="top"><a class="ib" href="${back}" aria-label="뒤로">${icon('back')}</a><h1>${titleAttr ? `<button ${titleAttr}>${esc(title)}</button>` : esc(title)}</h1><div class="tools">${tools}</div></header>`;

function wordbooks() {
  document.title = '단어장';
  const books = wb.ensure();
  app.innerHTML = `<div class="head">${wbTop('단어장',
    `<button class="ib txt${net() ? '' : ' off'}" data-a="net" aria-label="온라인 사전">${net() ? 'ONLINE' : 'OFFLINE'}</button><button class="ib" data-a="new" aria-label="새 단어장">${icon('plus')}</button>`, '#/')}</div>
    <main><div class="list">${books.map(b => `<a class="row" href="#/w/${b.id}"><div class="t">${esc(b.name)}</div><div class="m"><span>${b.words.length}</span></div></a>`).join('')}</div></main>`;
  app.querySelector('.tools').onclick = e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'net') { store.set('net', !net()); wordbooks(); }
    else if (a === 'new') {
      const name = prompt('새 단어장 이름');
      if (!name?.trim()) return;
      const all = wb.ensure(), id = uid();
      all.push({ id, name: name.trim(), words: [] });
      wb.put(all);
      location.hash = `#/w/${id}`;
    }
  };
}

function wbView(id, tab = 'l') {
  const b = wb.find(id);
  if (!b) return location.replace('#/w');
  document.title = b.name;
  const n = b.words.length, mode = store.get('wbmode', 'mean');
  const tools = tab === 'l'
    ? `<button class="ib" data-a="copy" aria-label="내보내기">${icon('copy')}</button><button class="ib" data-a="add" aria-label="단어 추가">${icon('plus')}</button><button class="ib" data-a="del" aria-label="단어장 삭제">${icon('trash')}</button>`
    : tab === 'q' ? `<button class="ib txt" data-a="mode" aria-label="출제 방식">${WB_MODES[mode]}</button>` : '';
  app.innerHTML = `<div class="head">${wbTop(b.name, tools, '#/w', 'data-a="rename" aria-label="이름 바꾸기"')}<nav class="tabs">${
    [['l', '단어'], ['q', '시험'], ['c', '카드']].map(([k, l]) => `<a href="#/w/${id}/${k}" class="${k === tab ? 'on' : ''}">${l}<small>${n}</small></a>`).join('')}</nav></div><main></main>`;
  const main = app.querySelector('main');

  app.querySelector('.head').onclick = e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'rename') {
      const name = prompt('단어장 이름', b.name);
      if (!name?.trim()) return;
      const all = wb.books();
      all.find(x => x.id === id).name = name.trim();
      wb.put(all);
      wbView(id, tab);
    } else if (a === 'mode') { store.set('wbmode', next(Object.keys(WB_MODES), mode)); wbView(id, tab); }
    else if (a === 'add') editWord(id, null, () => wbView(id, 'l'));
    else if (a === 'copy') {
      const json = JSON.stringify({ title: b.name, vocab: b.words.map(x => (x.ex ? [x.w, x.m, x.ex] : [x.w, x.m])) }, null, 1);
      (navigator.clipboard?.writeText(json) || Promise.reject()).then(() => toast('복사됨'), () => prompt('복사하세요', json));
    } else if (a === 'del') {
      if (!confirm(`'${b.name}' 단어장을 삭제할까요?`)) return;
      wb.put(wb.books().filter(x => x.id !== id));
      location.hash = '#/w';
    }
  };

  if (!n) { main.innerHTML = `<div class="blank-state">${icon('book')}</div>`; return; }
  if (tab === 'q') quiz({ title: b.name, passages: [], vocab: [], questions: examQs(b, mode) }, 'wb:' + id, main);
  else if (tab === 'c') flash(main, { vocab: b.words }, 'wb:' + id);
  else {
    main.innerHTML = [...b.words].reverse().map(w => `<button class="wrow" data-id="${w.id}"><div class="wt">${esc(w.w)}</div><div class="wm">${esc(w.m)}</div>${w.ex ? `<div class="we">${esc(w.ex)}</div>` : ''}</button>`).join('');
    main.onclick = e => {
      const r = e.target.closest('[data-id]');
      if (r) editWord(id, b.words.find(x => x.id === r.dataset.id), () => wbView(id, 'l'));
    };
  }
}

function editWord(bookId, w, done) {
  const o = overlay('', `<div class="frm"><input name="w" placeholder="word" value="${esc(w?.w || '')}" autocomplete="off" spellcheck="false"><input name="m" placeholder="뜻" value="${esc(w?.m || '')}" autocomplete="off"><textarea name="ex" rows="3" placeholder="예문" spellcheck="false">${esc(w?.ex || '')}</textarea>
    <div class="acts">${w ? `<button class="btn bad" data-a="del" aria-label="삭제">${icon('trash')}</button>` : ''}<button class="btn primary" data-a="ok" aria-label="저장">${icon('check')}</button></div></div>`);
  o.d.classList.add('over');
  o.d.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a !== 'ok' && a !== 'del') return;
    const all = wb.books(), b = all.find(x => x.id === bookId);
    if (a === 'del') b.words = b.words.filter(x => x.id !== w.id);
    else {
      const f = k => o.body.querySelector(`[name=${k}]`).value.trim();
      if (!f('w') || !f('m')) return;
      const e2 = { w: f('w'), m: f('m'), ex: f('ex') };
      if (w) Object.assign(b.words.find(x => x.id === w.id), e2);
      else b.words.push({ id: uid(), t: Date.now(), ...e2 });
    }
    wb.put(all);
    o.close();
    done?.();
  });
}

// 단어장으로 시험 문제를 만든다: 뜻(영→한 객관식), 철자(한→영 직접 입력), 혼합
function examQs(book, mode) {
  const W = book.words, qs = [];
  for (const e of W) {
    if (mode !== 'spell') {
      const opts = shuffle([e, ...shuffle(W.filter(x => x.id !== e.id && norm(x.m) !== norm(e.m))).slice(0, 4)]);
      if (opts.length >= 2) {
        qs.push({
          id: 'm:' + e.id, type: 'choice', kind: '뜻', passage: '', prompt: `**${e.w}**`,
          context: e.ex ? e.ex.replace(new RegExp(reEsc(e.w), 'i'), m => `**${m}**`) : '',
          choices: opts.map(x => x.m), answer: [opts.indexOf(e) + 1], explanation: '',
        });
      }
    }
    if (mode !== 'mean' || W.length < 2) {
      qs.push({ id: 's:' + e.id, type: 'short', kind: '철자', passage: '', prompt: e.m, context: '', answer: [e.w], explanation: e.ex || '' });
    }
  }
  return qs;
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
    const picked = [...pool]; // 처음에는 전부 선택된(놓인) 상태. 탭하면 선택/취소, 끌면 순서 변경
    let lock = false, lastDrag = 0;
    const it = (k, j) => `<button class="it${j == null ? '' : ' in'}" data-k="${k}">${
      chips || j == null ? '' : `<span class="grip">${icon('grip')}</span><span class="n">${j + 1}</span>`}<span>${md(items[k])}</span></button>`;
    const draw = () => {
      const rest = pool.filter(k => !picked.includes(k));
      el.innerHTML = `${q.given ? `<div class="ctx">${md(q.given)}</div>` : ''}<div class="ord${chips ? ' chips' : ''}">
        <div class="otool"><button class="ib" data-o="none" aria-label="모두 선택 취소">${icon('x')}</button><button class="ib" data-o="all" aria-label="모두 선택">${icon('checks')}</button></div>
        <div class="slots">${picked.map((k, j) => it(k, j)).join('')}</div>
        ${rest.length ? `<div class="pool">${rest.map(k => it(k)).join('')}</div>` : ''}</div>`;
      sortable(el.querySelector('.slots'), picked, changed, () => lock, chips, () => { lastDrag = Date.now(); });
    };
    draw();
    el.onclick = e => {
      if (lock) return;
      const o = e.target.closest('[data-o]')?.dataset.o;
      if (o) {
        if (o === 'none') picked.length = 0;
        else picked.push(...pool.filter(k => !picked.includes(k)));
        draw();
        changed();
        return;
      }
      const b = e.target.closest('.it');
      if (!b || e.target.closest('.grip') || Date.now() - lastDrag < 350) return;
      const k = +b.dataset.k, at = picked.indexOf(k);
      if (at >= 0) picked.splice(at, 1); else picked.push(k);
      draw();
      changed();
    };
    return {
      ready: () => picked.length === items.length,
      check() {
        lock = true;
        const ok = picked.every((k, j) => items[k] === items[j]);
        el.querySelectorAll('.slots .it').forEach((b, j) => b.classList.add(items[+b.dataset.k] === items[j] ? 'ok' : 'bad'));
        el.querySelector('.otool')?.remove();
        el.querySelector('.pool')?.remove();
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
// S = { set?, mix?, src?, list: [{q, set, path}], i, res: [], snaps: [] }
let S = null;

function quiz(set, path, host) {
  const main = host || shell(set, path, 'q');
  const qs = set.questions;
  const hooks = {
    exit: () => overview(null),
    finish: () => overview([S.res.filter(Boolean).length, S.list.length]),
  };
  if (S?.set === set && S.i < S.list.length) play(main, S, hooks);
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
    S = { set, list: list.map(q => ({ q, set, path })), i: 0, res: [], snaps: [] };
    play(main, S, hooks);
  }
}

// 선택한 지문들의 문제를 끝없이 섞어서 보여 준다. 한 바퀴 안에서는 겹치지 않는다.
async function mix() {
  const { sets: list = [] } = await loadManifest();
  const want = new Set(store.get('sel', []));
  const paths = list.filter(s => s.n.q && want.has(s.path)).map(s => s.path);
  if (!paths.length) return location.replace('#/');
  const loaded = await Promise.all(paths.map(loadSet));
  const off = new Set(store.get('kindsOff', []));
  const src = loaded.flatMap((set, k) => set.questions.filter(q => !off.has(kindOf(q))).map(q => ({ q, set, path: paths[k] })));
  if (!src.length) return location.replace('#/');
  document.title = TITLE;
  app.innerHTML = '<main></main>';
  S = { mix: true, src, list: [], i: 0, res: [], snaps: [] };
  deal(S);
  play(app.querySelector('main'), S, { exit: () => { picking = true; location.hash = '#/'; } });
}

function deal(s) {
  const round = shuffle(s.src), last = s.list.at(-1);
  if (last && round.length > 1 && round[0] === last) round.push(round.shift()); // 바퀴가 바뀔 때 같은 문제가 연속되지 않게
  s.list.push(...round);
}

function play(main, S, { exit, finish }) {
  const mixed = !!S.mix;
  const step = d => {
    if (d < 0) { if (S.i > 0) goto(S.i - 1); return; }
    if (!mixed && S.i + 1 >= S.list.length) return finish();
    goto(S.i + 1);
  };
  const goto = i => { S.leave?.(); S.i = i; show(); };
  show();

  function show() {
    scrollTo(0, 0);
    if (S.i >= S.list.length) deal(S);
    const { q, set, path } = S.list[S.i];
    const n = mixed ? S.src.length : S.list.length;
    const pos = mixed ? S.i % n : S.i, round = mixed ? Math.floor(S.i / n) : 0;
    const lastQ = !mixed && S.i === S.list.length - 1;
    const ps = q.passage ? set.passages.find(p => p.id === q.passage) : null;

    main.innerHTML = `<div class="qtop"><span class="cnt">${pos + 1}<small>/${n}</small></span>${round ? `<span class="round">${icon('retry')}${round + 1}</span>` : ''}<i class="pbar"><b style="width:${(100 * pos) / n}%"></b></i>${
      ps ? `<button class="ib" data-a="psg" aria-label="본문">${icon('book')}</button>` : ''}<button class="ib" data-a="quit" aria-label="그만">${icon('x')}</button></div>${
      mixed ? `<div class="from">${esc(set.title)}</div>` : ''}
    <div class="qcard">${q.prompt ? `<div class="prompt">${md(q.prompt)}</div>` : ''}${q.context ? `<div class="ctx">${md(q.context)}</div>` : ''}<div class="qb"></div><div class="fb" hidden></div></div>
    <div class="dock"><div class="in"></div></div>`;

    const card = main.querySelector('.qcard'), fb = main.querySelector('.fb'), dock = main.querySelector('.dock .in');
    const arrows = mid => `<button class="btn sq" data-a="prev" aria-label="이전 문제"${S.i === 0 ? ' disabled' : ''}>${icon('back')}</button>${mid}<button class="btn sq" data-a="skip" aria-label="다음 문제">${icon('next')}</button>`;
    const goBtn = () => dock.querySelector('[data-a=go]');
    const nextLabel = lastQ ? '결과' : '다음';
    const doneMid = bad => `${bad ? `<button class="btn" data-a="retry" aria-label="다시 풀기">${icon('retry')}</button>` : ''}<button class="btn primary" data-a="go">${nextLabel}</button>`;
    let phase = 'ask', shown = '', ctl = null;

    const saved = S.snaps[S.i];
    if (saved) { // 이미 푼 문제로 돌아온 경우: 채점된 모습 그대로
      phase = 'done';
      card.className = saved.cls;
      card.innerHTML = saved.html;
      dock.innerHTML = arrows(doneMid(card.classList.contains('bad')));
    } else {
      dock.innerHTML = arrows('<button class="btn primary" data-a="go">확인</button>');
      ctl = KIND[q.type](q, card.querySelector('.qb'), () => { if (goBtn()) goBtn().disabled = !ctl.ready(); });
      goBtn().disabled = !ctl.ready();
    }

    // 다른 문제로 떠날 때 채점된 화면을 저장해 두었다가, 돌아오면 그대로 보여 준다
    S.leave = () => {
      if (phase !== 'done') return;
      card.querySelectorAll('input').forEach(i => i.setAttribute('value', i.value));
      card.querySelectorAll('textarea').forEach(t => { t.textContent = t.value; });
      S.snaps[S.i] = { cls: card.className, html: card.innerHTML };
    };

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
      dock.innerHTML = arrows(doneMid(!ok));
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
          dock.innerHTML = arrows(`<button class="btn bad" data-a="no" aria-label="틀림">${icon('x')}</button><button class="btn ok" data-a="yes" aria-label="맞음">${icon('check')}</button>`);
        } else done(r.ok);
      } else if (phase === 'done') step(1);
    };

    main.onclick = e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'go') submit();
      else if ((a === 'yes' || a === 'no') && phase === 'self') done(a === 'yes');
      else if (a === 'retry') { delete S.snaps[S.i]; show(); }
      else if (a === 'prev') step(-1);
      else if (a === 'skip') step(1);
      else if (a === 'quit') { S.leave(); exit(); }
      else if (a === 'psg') sheet(ps, `${path}#${ps.id}`, { set, path });
    };
    onKey = e => {
      const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      const lr = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
      if (e.key === 'Enter') {
        if (e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        if (phase === 'ask' && ctl.next?.(e.target)) return;
        if (phase === 'self') return;
        submit();
      } else if (phase === 'self' && lr) done(e.key === 'ArrowRight');
      else if (lr && !typing) step(e.key === 'ArrowRight' ? 1 : -1);
      else if (phase === 'ask' && !typing) ctl.key?.(e);
    };
  }
}

/* ── cards ── */
let C = null;

function cards(set, path) { flash(shell(set, path, 'c'), set, path); }

function flash(main, set, path) {
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

// 배열 문제: 끌어서 순서 바꾸기. 목록형은 왼쪽 손잡이, 칩형(flow)은 칩 자체를 잡는다.
// 화면 위·아래 가장자리로 가져가면 페이지가 따라서 스크롤된다.
function sortable(box, order, changed, locked, flow, onDrag) {
  for (const h of box.querySelectorAll(flow ? '.it' : '.grip')) {
    h.addEventListener('pointerdown', e => {
      if (locked() || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      const node = h.closest('.it');
      const r0 = node.getBoundingClientRect();
      const gx = e.clientX - r0.left, gy = e.clientY - r0.top;
      const sx = e.clientX, sy = e.clientY;
      let px = sx, py = sy, raf = 0, moved = false;
      try { h.setPointerCapture(e.pointerId); } catch { /* 캡처는 없어도 동작 */ }

      const renum = () => [...box.children].forEach((c, i) => { const n = c.querySelector('.n'); if (n) n.textContent = i + 1; });
      const place = () => {
        node.style.transform = '';
        const r = node.getBoundingClientRect();
        node.style.transform = `translate(${px - gx - r.left}px, ${py - gy - r.top}px)`;
        for (const s of box.children) {
          if (s === node) continue;
          const b = s.getBoundingClientRect();
          if (px > b.left && px < b.right && py > b.top && py < b.bottom) {
            const before = flow ? px < b.left + b.width / 2 : py < b.top + b.height / 2;
            box.insertBefore(node, before ? s : s.nextSibling);
            renum();
            break;
          }
        }
      };
      const tick = () => {
        raf = 0;
        const zone = Math.min(120, innerHeight * 0.25);
        const up = zone - py, down = py - (innerHeight - zone - 20);
        const v = up > 0 ? -Math.max(4, Math.min(1, up / zone) * 22) : down > 0 ? Math.max(4, Math.min(1, down / zone) * 22) : 0;
        if (!v) return;
        const y0 = scrollY;
        scrollBy(0, v);
        if (scrollY !== y0) place();
        raf = setTimeout(tick, 16);
      };
      const move = ev => {
        px = ev.clientX; py = ev.clientY;
        if (!moved) {
          if (Math.hypot(px - sx, py - sy) < 6) return; // 탭은 드래그로 치지 않음
          moved = true;
          node.classList.add('drag');
          document.body.classList.add('dragging');
        }
        place();
        if (!raf) raf = setTimeout(tick, 16);
      };
      const end = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', end);
        removeEventListener('pointercancel', end);
        clearTimeout(raf);
        node.style.transform = '';
        node.classList.remove('drag');
        document.body.classList.remove('dragging');
        if (!moved) return;
        order.splice(0, order.length, ...[...box.children].map(c => +c.dataset.k));
        onDrag?.();
        changed();
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', end);
      addEventListener('pointercancel', end);
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

route();

/* ── offline ── */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
