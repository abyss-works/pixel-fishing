// 우편 보내기 CLI — 관리자 대시보드의 보내기와 같은 데이터 모듈(planMail·deliverMail)을 쓴다.
// 사용: pnpm mail:send <요청 JSON 파일> [--send]
//   요청 JSON: { "title": "...", "body": "...", "target": { "kind": "users", "recipients": [{ "userId": "...", "gold": 0 }] } }
//              또는 target { "kind": "all", "gold": 0 }
//   --send가 없으면 미리보기만 하고 쓰지 않는다. DATABASE_URL(보낼 DB 직접 연결)이 있어야 한다.
import { readFileSync } from 'node:fs';
import { createDatabase } from '../api/_db/client';
import { deliverMail, parseMailRequest, planMail } from '../api/_data/mailbox';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const send = args.includes('--send');
if (!file) {
  console.error('요청 JSON 파일 경로가 필요합니다. 사용: pnpm mail:send <파일> [--send]');
  process.exit(2);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL이 없습니다.');
  process.exit(2);
}
const request = parseMailRequest(JSON.parse(readFileSync(file, 'utf8')));
if (!request) {
  console.error('요청 JSON의 형태가 맞지 않습니다.');
  process.exit(2);
}

const database = createDatabase({ connectionString: url, max: 1 });
try {
  const plan = send
    ? await deliverMail(database.db, request, new Date().toISOString())
    : await planMail(database.db, request);
  if (plan.problems.length > 0) {
    console.error(`보내지 않았습니다. 문제: ${plan.problems.join(', ')}`);
    process.exitCode = 1;
  } else {
    const p = plan.preview!;
    console.log(`대상 ${p.count}명, 골드 합계 ${p.totalGold.toLocaleString()}G`);
    if (p.missing.length > 0) console.log(`계정이 없어 빠지는 대상 ${p.missing.length}명: ${p.missing.join(', ')}`);
    console.log(send ? `보냈습니다: ${(plan as { sent: number }).sent}통` : '미리보기입니다. 보내려면 --send를 붙이세요.');
  }
} finally {
  await database.pool.end();
}
