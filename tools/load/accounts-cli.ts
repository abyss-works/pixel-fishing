// 익명 계정 준비 — 서버의 로그인 한도 안의 속도로 계정을 만들어 세션 쿠키를 파일에 둔다.
// 사용: pnpm load:accounts --target <origin> --count N --out <파일>
// 파일에 이미 있는 계정은 다시 만들지 않고 모자란 수만 더한다. 쿠키 값은 출력하지 않는다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import {
  assertSecretPath, estimateSignupSeconds, LIMITED_WAIT_MS, parseAccountsFile, signInAnonymous, signupDelayMs, signupsNeeded,
} from './accounts';
import type { AccountsFile } from './accounts';
import { parseTarget } from './plan';

async function main(): Promise<void> {
  const { values } = parseArgs({ args: process.argv.slice(2), options: { target: { type: 'string' }, count: { type: 'string' }, out: { type: 'string' } }, strict: true });
  if (!values.target) throw new Error('--target는 필수입니다');
  if (!values.out) throw new Error('--out는 필수입니다');
  const count = Number(values.count);
  if (!Number.isInteger(count) || count < 1) throw new Error('--count는 양의 정수여야 합니다');
  const target = parseTarget(values.target);
  assertSecretPath(values.out);

  const file: AccountsFile = existsSync(values.out)
    ? parseAccountsFile(readFileSync(values.out, 'utf8'))
    : { target, accounts: [] };
  if (file.target !== target) throw new Error(`기존 파일의 대상(${file.target})이 --target과 다릅니다`);

  const need = signupsNeeded(file.accounts.length, count);
  console.info(`계정 ${file.accounts.length}개 보유, ${need}개 더 만듭니다(대기만 약 ${Math.ceil(estimateSignupSeconds(need))}초).`);
  for (let made = 0; made < need;) {
    const { status, cookie } = await signInAnonymous(target);
    if (status === 429) { await delay(LIMITED_WAIT_MS); continue; }
    if (status < 200 || status >= 300 || cookie === '') throw new Error(`익명 로그인 실패 ${status}`);
    file.accounts.push({ cookie });
    writeFileSync(values.out, `${JSON.stringify(file)}\n`, { encoding: 'utf8', mode: 0o600 });
    made++;
    if (made < need) await delay(signupDelayMs(made));
  }
  console.info(`완료: 계정 ${file.accounts.length}개`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
