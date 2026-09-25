import { inContext, forms, findGloss } from '../assets/dict.js';
import assert from 'node:assert/strict';

let n = 0, fail = 0;
const test = (name, fn) => { n++; try { fn(); console.log('✓', name); } catch (e) { fail++; console.log('✗', name, '\n   ', e.message.split('\n')[0]); } };

const KO = '우리는 우리 자신을 안심시킬 수 있습니다. 소방 훈련이나 삶의 혼란조차도 우리에게 정상적인 예절을 깨고 상을 주는 것 같습니다.';

test('문맥: 어간이 바뀌는 활용도 인정 (안심시키다 ↔ 안심시킬)', () => assert.ok(inContext('안심시키다', KO)));
test('문맥: 문장에 없는 뜻은 인정하지 않음', () => { for (const c of ['믿음', '먹다', '붕괴', '분열']) assert.ok(!inContext(c, KO), c); });
test('문맥: 한 글자 뜻은 조사가 붙은 어절일 때만 (예⊄예절, 열⊄열차)', () => {
  assert.ok(!inContext('예', KO)); assert.ok(!inContext('훈', KO));
  assert.ok(inContext('삶', KO)); assert.ok(inContext('상', KO));
});
test('문맥: 용언 어미 (포기하다 ↔ 포기합니다)', () => assert.ok(inContext('포기하다', '그들은 너무 일찍 포기합니다.')));
test('어형: 활용형과 기본형이 같은 것으로 매칭', () => {
  const E = [{ w: 'require', m: '필요로 하다' }, { w: 'give up', m: '포기하다' }, { w: 'be likely to', m: '~할 것 같다' }];
  for (const t of ['requires', 'required', 'Giving up', 'give up', 'be likely to']) assert.ok(findGloss(t, E), t);
  assert.equal(findGloss('likely', E), null);
  assert.ok(forms('stopped').has('stop') && forms('studies').has('study') && forms('running').has('run'));
});

console.log(`\n${n - fail}/${n} 통과`);
process.exit(fail ? 1 : 0);
