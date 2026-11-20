// 아잉카 변형문제를 변환한 JSON(배열)을 기말 지문 파일의 questions 뒤에 합친다.
//   node tools/merge-aingka.mjs 2024 out/q24_AB.json out/q24_CD.json        (미리보기)
//   node tools/merge-aingka.mjs 2024 out/q24_AB.json out/q24_CD.json --apply
// 입력 원소: { pdf, orig, tag, type, prompt, context?, choices?, answer, text?, explanation?, view }
//   orig(원래 시험 번호) → content/영어/기말/{year}년 10월/{orig}번.json (41은 41-42번.json). 그 파일이 없으면 건너뜀.
// id 는 ak{yy}-{pdf} (step 이 있으면 ak{yy}-s{step}-{no}). 실행할 때마다 그 연도의 기존 ak{yy}- 문제를 지우고 다시 넣으므로 같은 연도의 입력 파일은 항상 한꺼번에 넘길 것.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [year, ...rest] = process.argv.slice(2);
const APPLY = rest.includes('--apply');
const inputs = rest.filter(a => !a.startsWith('--'));
if (!/^\d{4}$/.test(year || '') || !inputs.length) { console.error('사용법: node tools/merge-aingka.mjs <연도> <json...> [--apply]'); process.exit(1); }

const dir = path.join(ROOT, 'content', '영어', '기말', `${year}년 10월`);
const yy = year.slice(2);
const fileFor = orig => path.join(dir, orig === 41 || orig === 42 ? '41-42번.json' : `${orig}번.json`);

const all = inputs.flatMap(f => JSON.parse(fs.readFileSync(f, 'utf8')));
const byFile = new Map(), skipped = [];
for (const q of all) {
  const f = fileFor(q.orig);
  if (!fs.existsSync(f)) { skipped.push(`${q.pdf}번(orig ${q.orig})`); continue; }
  if (!byFile.has(f)) byFile.set(f, []);
  byFile.get(f).push(q);
}

// 2026 처럼 단계(step)별로 번호가 다시 시작하면 step+no 로 구분한다
const idOf = q => (q.step ? `ak${yy}-s${q.step}-${q.no ?? q.pdf}` : `ak${yy}-${q.pdf}`);
const FIELDS = ['type', 'prompt', 'context', 'choices', 'answer', 'text', 'explanation', 'view', 'tag'];
let added = 0;
for (const [f, qs] of byFile) {
  const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
  doc.questions = (doc.questions || []).filter(q => !(q.id || '').startsWith(`ak${yy}-`)); // 이 연도에서 이전에 합친 변형문제는 모두 교체
  for (const q of qs.sort((a, b) => String(a.step || '').localeCompare(String(b.step || '')) || a.pdf - b.pdf)) {
    const o = { id: idOf(q) };
    for (const k of FIELDS) if (q[k] !== undefined && q[k] !== '') o[k] = q[k];
    doc.questions.push(o);
    added++;
  }
  console.log(`${path.basename(f)}: +${qs.length}`);
  if (APPLY) fs.writeFileSync(f, JSON.stringify(doc, null, 2) + '\n');
}
console.log(`합계 ${added}문제${APPLY ? ' 저장' : ' (미리보기, --apply 로 저장)'}${skipped.length ? ` / 건너뜀: ${skipped.join(', ')}` : ''}`);
