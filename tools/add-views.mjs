// 원본 시험 문제에 "문제에 맞는 본문"(view)을 채운다. 문제 화면의 📖 버튼이 이 글을 보여 준다.
//   node tools/add-views.mjs            미리보기
//   node tools/add-views.mjs --apply    저장
// 대상: content/영어/기말/20xx년 10월 (원본 문제 = id 가 ak.. 이 아니고 auto-.. 가 아닌 것). 규칙:
//   빈칸추론   깔끔한 본문에서 정답 부분을 ＿＿＿＿＿＿＿＿ 로 뚫음
//   어법·어휘·무관한 문장   context 의 ①~⑤, (a)~(e) 표시를 지운 글 (틀린 단어·무관한 문장이 그대로 있는 시험지 모습)
//   문장삽입   context 의 본문에서 번호 표시를 지우고 "주어진 문장"은 뺀 글
// 그 밖의 문제(주제·제목·순서배열·요약 등)는 view 없이 두어 깔끔한 본문을 보여 준다. 이미 view 가 있으면 건드리지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const BLANK = '＿＿＿＿＿＿＿＿';
const MARK = /[①②③④⑤⑥⑦⑧⑨⑩]\s?|\(\s*[①②③④⑤]\s*\)\s?|\([a-e]\)\s?/g;

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function viewOf(q, p1) {
  const prompt = q.prompt || '', ctx = q.context || '';
  if (q.type !== 'choice') return '';
  if (/빈칸/.test(prompt) && !/요약/.test(prompt) && /_{3,}/.test(ctx)) {
    // 문맥 속 빈칸 앞뒤 글로 깔끔한 본문에서 그 자리를 찾아, 빈칸에 들어간 부분을 뚫는다
    const m = ctx.match(/^(.*?)_{3,}(.*)$/s);
    if (!m) return '';
    const before = m[1].trim().split(/\s+/).filter(Boolean).slice(-4).join(' ');
    const after = m[2].trim().split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
    const head = before ? esc(before) + '\\s+' : '(?<=^|[.!?]["\')]?\\s+)';
    const tail = after ? (/^[.,;:!?]/.test(after) ? '(?=' + esc(after) + ')' : '(?=\\s+' + esc(after) + ')') : '(?=[.!?]|$)';
    const hit = p1.match(new RegExp(head + '(.{3,160}?)' + tail, 'i'));
    if (!hit) return '';
    const at = hit.index + hit[0].length - hit[1].length;
    return p1.slice(0, at) + BLANK + p1.slice(at + hit[1].length);
  }
  if (/어법상|낱말의 쓰임|전체 흐름과 관계/.test(prompt) && ctx) return ctx.replace(MARK, '').replace(/\s+\n/g, '\n').trim();
  if (/주어진 문장이 들어가기/.test(prompt) && ctx.includes('\n\n')) return ctx.split('\n\n').slice(1).join('\n\n').replace(MARK, '').trim();
  return '';
}

let n = 0, miss = [];
for (const y of ['2024', '2025', '2026']) {
  const dir = path.join(ROOT, 'content', '영어', '기말', `${y}년 10월`);
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
    const fp = path.join(dir, f), doc = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const p1 = doc.passages[0].text;
    let ch = false;
    for (const q of doc.questions) {
      if (q.view || /^(ak\d\d-|auto-)/.test(q.id || '')) continue;
      if (q.id === undefined && q.type === 'order') continue;
      const v = viewOf(q, p1);
      if (/빈칸/.test(q.prompt || '') && !/요약/.test(q.prompt || '') && !v) miss.push(`${y} ${f}`);
      if (v) { q.view = v; ch = true; n++; }
    }
    if (ch && APPLY) fs.writeFileSync(fp, JSON.stringify(doc, null, 2) + '\n');
  }
}
console.log(`view 추가 ${n}개${APPLY ? ' (저장됨)' : ' (미리보기)'}${miss.length ? ` / 빈칸 위치 못 찾음: ${miss.join(', ')}` : ''}`);
