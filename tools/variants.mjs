// 본문에서 변형문제(3단락 순서배열·문장삽입)를 만들어 각 JSON에 넣는다.
//   node tools/variants.mjs          무엇이 만들어지는지만 출력
//   node tools/variants.mjs --apply  파일에 저장
// 같은 id(auto-order3, auto-insert)를 덮어쓰므로 여러 번 돌려도 중복되지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');
const APPLY = process.argv.includes('--apply');
const CIRC = '①②③④⑤';
const SKIP = ['예시.json'];

const tidy = s => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

export function sentences(text) {
  const out = [];
  for (const s of tidy(text).split(/(?<=[.!?][")'”’]?)\s+(?=[A-Z"“(])/)) {
    const prev = out.at(-1);
    if (prev && /(\s[A-Z]|\bMr|\bMrs|\bDr|\bSt|\bvs|\betc|\be\.g|\bi\.e)\.$/.test(prev)) out[out.length - 1] = prev + ' ' + s;
    else out.push(s);
  }
  return out;
}

// 도입부 한 문장 + 나머지를 세 덩어리로
function order3(S) {
  if (S.length < 6) return null;
  const intro = S[0], rest = S.slice(1), n = rest.length;
  const cut = [Math.ceil(n / 3), Math.ceil((2 * n) / 3)];
  const items = [rest.slice(0, cut[0]), rest.slice(cut[0], cut[1]), rest.slice(cut[1])].map(p => p.join(' '));
  if (items.some(t => !t)) return null;
  return { id: 'auto-order3', type: 'order', prompt: '주어진 글 다음에 이어질 순서로 배열하시오.', given: intro, items };
}

// 본문마다 같은 결과가 나오되 문항끼리는 서로 다르도록 하는 해시
const hash = t => { let h = 2166136261; for (const c of t) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return Math.abs(h); };

// 한 문장을 빼고, 들어갈 자리를 ①~⑤로 표시
function insertion(S) {
  if (S.length < 5) return null;
  const h = hash(S.join(' '));
  const cand = S.map((s, i) => [i, s]).filter(([i, s]) => i >= 2 && i <= S.length - 2 && s.length >= 40).map(([i]) => i);
  if (!cand.length) return null;
  const k = cand[h % cand.length];

  const given = S[k], rest = S.filter((_, i) => i !== k);
  const slots = Math.min(5, rest.length - 1);                // 표시할 수 있는 자리 수
  if (slots < 3) return null;
  const first = Math.min(Math.max(1, k - ((h >> 8) % slots)), rest.length - slots);
  const marked = rest.map((s, i) => (i >= first && i < first + slots ? `${CIRC[i - first]} ${s}` : s)).join(' ');

  return {
    id: 'auto-insert', type: 'choice',
    prompt: '글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳을 고르시오.',
    context: `**[주어진 문장]** ${given}\n\n${marked}`,
    choices: CIRC.slice(0, slots).split(''),
    answer: k - first + 1,
  };
}

const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(d, e.name))
    : e.name.endsWith('.json') && e.name !== 'index.json' ? [path.join(d, e.name)] : []);

let made = 0, skipped = [];
for (const file of walk(CONTENT)) {
  const rel = path.relative(CONTENT, file).replace(/\\/g, '/');
  if (SKIP.includes(path.basename(file))) continue;
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const p = (j.passages || [])[0];
  if (!p?.text) continue;

  const S = sentences(p.text);
  const add = [order3(S), insertion(S)].filter(Boolean);
  if (!add.length) { skipped.push(`${rel} (문장 ${S.length}개)`); continue; }

  j.questions = [...(j.questions || []).filter(q => !['auto-order3', 'auto-insert'].includes(q.id)), ...add];
  if (APPLY) fs.writeFileSync(file, JSON.stringify(j, null, 2) + '\n', 'utf8');
  made += add.length;
  console.log(`${rel}: ${add.map(q => (q.type === 'order' ? '순서배열' : `문장삽입(정답 ${CIRC[q.answer - 1]})`)).join(' + ')}`);
}
console.log(`\n${APPLY ? '저장함' : '미리보기'} — 문제 ${made}개`);
if (skipped.length) console.log(`문장이 모자라 건너뜀: ${skipped.join(', ')}`);
