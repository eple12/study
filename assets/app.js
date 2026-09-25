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
  next: '<path d="M9 18l6-6-6-6"/>',
  home: '<path d="M3 11l9-8 9 8M5 9.5V20h5v-6h4v6h5V9.5"/>',
  checks: '<path d="M2 12l5 5L17 6M13 16l2 2L22 7"/>',
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
// 화면을 떠날 때의 스크롤 위치를 주소별로 기억해 두었다가, 본문·목록으로 돌아오면 복원한다.
const scrollMem = new Map();
let curHash = location.hash;
addEventListener('hashchange', () => {
  scrollMem.set(curHash, scrollY);
  curHash = location.hash;
  route();
});
route();

async function route() {
  onKey = null;
  document.querySelectorAll('.sheet').forEach(s => s.remove());
  const [v = '', p = ''] = location.hash.replace(/^#\/?/, '').split('/');
  const path = decodeURIComponent(p);
  let keep = false;
  try {
    if (v === 'm') await mix();
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

  const section = ([g, items], gi) => {
    const head = !g ? '' : picking && gp[gi].length
      ? `<button class="gh" data-g="${gi}"><h2>${esc(g)}</h2><span class="chk">${icon('check')}</span></button>`
      : `<h2>${esc(g)}</h2>`;
    const rows = items.map(s => picking
      ? `<button class="row pk${usable.has(s.path) ? '' : ' dis'}" data-p="${esc(s.path)}"><span class="chk">${icon('check')}</span><span class="bd">${rowBody(s)}</span></button>`
      : row(s)).join('');
    return `<section class="grp">${head}<div class="list">${rows}</div></section>`;
  };

  app.innerHTML = `<header class="top home"><h1>${esc(TITLE)}</h1>${usable.size ? `<button class="ib${picking ? ' on' : ''}" data-a="pick" aria-label="랜덤 학습">${icon(picking ? 'x' : 'shuffle')}</button>` : ''}</header><main>${
    [...groups].map(section).join('') || '<p class="empty">content / *.json</p>'}</main>${
    picking ? `<div class="dock"><div class="in"><button class="btn sq" data-a="all" aria-label="전체 선택">${icon('checks')}</button><button class="btn primary" data-a="start" aria-label="시작">${icon('play')}<b class="num"></b></button></div></div>` : ''}`;

  app.querySelector('.top').onclick = e => {
    if (!e.target.closest('[data-a=pick]')) return;
    picking = !picking;
    home();
  };

  if (picking) {
    const count = () => list.reduce((t, s) => t + (sel.has(s.path) ? s.n.q : 0), 0);
    const startBtn = app.querySelector('[data-a=start]'), allBtn = app.querySelector('[data-a=all]');
    const refresh = () => {
      app.querySelectorAll('[data-p]').forEach(r => r.classList.toggle('on', sel.has(r.dataset.p)));
      app.querySelectorAll('[data-g]').forEach(h => { const ps = gp[+h.dataset.g]; h.classList.toggle('on', ps.every(p => sel.has(p))); });
      const n = count();
      startBtn.disabled = !n;
      startBtn.querySelector('.num').textContent = n || '';
      allBtn.classList.toggle('on', usable.size > 0 && sel.size === usable.size);
      store.set('sel', [...sel]);
    };
    const flip = ps => { const all = ps.every(p => sel.has(p)); ps.forEach(p => (all ? sel.delete(p) : sel.add(p))); };
    app.querySelector('main').onclick = e => {
      const r = e.target.closest('[data-p]'), g = e.target.closest('[data-g]');
      if (r && usable.has(r.dataset.p)) flip([r.dataset.p]);
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

const sheetMem = new Map(); // 본문 시트를 닫을 때의 스크롤 위치
function sheet(p, key) {
  if (!p) return;
  let mode = 'en';
  const o = overlay(p.hasKo ? `<button class="ib txt" data-a="mode">${MODE_LABEL[mode]}</button>` : '', passageHTML(p), `m-${mode}`, `--fs:${store.get('fs', 18)}px`);
  bindUnits(o.body);
  o.panel.scrollTop = sheetMem.get(key) ?? 0;
  o.onClose = () => sheetMem.set(key, o.panel.scrollTop);
  o.d.addEventListener('click', e => {
    const b = e.target.closest('[data-a=mode]');
    if (!b) return;
    mode = next(MODES, mode);
    o.body.className = `pb m-${mode}`;
    o.body.querySelectorAll('.u.open').forEach(u => u.classList.remove('open'));
    b.textContent = MODE_LABEL[mode];
  });
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
// S = { set?, mix?, src?, list: [{q, set, path}], i, res: [], snaps: [] }
let S = null;

function quiz(set, path) {
  const main = shell(set, path, 'q');
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
  const src = loaded.flatMap((set, k) => set.questions.map(q => ({ q, set, path: paths[k] })));
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
    let phase = 'ask', shown = '', ctl = null;

    const saved = S.snaps[S.i];
    if (saved) { // 이미 푼 문제로 돌아온 경우: 채점된 모습 그대로
      phase = 'done';
      card.className = saved.cls;
      card.innerHTML = saved.html;
      dock.innerHTML = arrows(`<button class="btn primary" data-a="go">${nextLabel}</button>`);
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
      dock.innerHTML = arrows(`<button class="btn primary" data-a="go">${nextLabel}</button>`);
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
      else if (a === 'prev') step(-1);
      else if (a === 'skip') step(1);
      else if (a === 'quit') { S.leave(); exit(); }
      else if (a === 'psg') sheet(ps, `${path}#${ps.id}`);
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
