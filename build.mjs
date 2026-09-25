// content/ 아래의 JSON 파일을 검사하고 목록(content/index.json)을 만든다.
//   node build.mjs            경고만 출력
//   node build.mjs --strict   경고가 있으면 실패(exit 1)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalize, kindOf } from './assets/schema.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.join(ROOT, 'content');
const hidden = n => n.startsWith('_') || n.startsWith('.');
const nat = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' }).compare;
const label = n => n.replace(/^\d+[_.\-]+\s*(?=\S)/, ''); // "01_영어" → "영어" ("3142 5회"는 그대로)

async function walk(dir, rel = []) {
  let ents;
  try { ents = await fs.readdir(dir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of ents) {
    if (hidden(e.name)) continue;
    if (e.isDirectory()) out.push(...(await walk(path.join(dir, e.name), [...rel, e.name])));
    else if (/\.json$/i.test(e.name) && !(rel.length === 0 && e.name === 'index.json')) out.push([...rel, e.name]);
  }
  return out;
}

export async function build() {
  const sets = [], problems = [];
  for (const parts of await walk(CONTENT)) {
    const rel = parts.join('/');
    let raw;
    try {
      raw = JSON.parse((await fs.readFile(path.join(CONTENT, ...parts), 'utf8')).replace(/^﻿/, ''));
    } catch (e) {
      problems.push({ file: rel, errors: [`JSON 문법 오류 — ${e.message}`] });
      continue;
    }
    const { set, errors } = normalize(raw, rel);
    if (errors.length) problems.push({ file: rel, errors });
    if (!set) continue;
    const n = { p: set.passages.length, q: set.questions.length, v: set.vocab.length };
    if (!n.p && !n.q && !n.v) {
      problems.push({ file: rel, errors: ['본문·문제·단어가 하나도 없어 제외됨'] });
      continue;
    }
    const k = {};
    for (const q of set.questions) k[kindOf(q)] = (k[kindOf(q)] || 0) + 1;
    sets.push({ path: rel, dir: parts.slice(0, -1).map(label), title: set.title, subtitle: set.subtitle, n, k, _k: parts, _o: set.order ?? Infinity });
  }

  sets.sort((a, b) =>
    nat(a._k.slice(0, -1).join('/'), b._k.slice(0, -1).join('/'))
    || a._o - b._o
    || nat(a._k.at(-1), b._k.at(-1)));

  return {
    index: { sets: sets.map(({ _k, _o, ...s }) => s) },
    problems,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { index, problems } = await build();
  await fs.writeFile(path.join(CONTENT, 'index.json'), JSON.stringify(index, null, 1) + '\n');
  for (const p of problems) {
    for (const e of p.errors) {
      console.log(process.env.GITHUB_ACTIONS ? `::warning file=content/${p.file}::${e}` : `⚠ ${p.file}: ${e}`);
    }
  }
  console.log(`✓ ${index.sets.length}개 → content/index.json`);
  if (problems.length && process.argv.includes('--strict')) process.exit(1);
}
