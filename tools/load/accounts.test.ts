import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertSecretPath, estimateSignupSeconds, parseAccountsFile, SIGNUP_GAP_MS, SIGNUP_PAUSE_MS, signupDelayMs, signupsNeeded, usableAccounts,
} from './accounts';

// better-auth 속도 제한의 판정(rate-limiter decideConsume)을 옮긴 모델: 마지막 허용 요청에서 창(10초)이 지나야 개수가 초기화되고,
// 개수가 최대(3)에 닿으면 거부한다(거부는 마지막 요청 시각을 바꾸지 않는다)
function simulate(times: number[]): boolean[] {
  let count = 0;
  let last = -Infinity;
  return times.map((t) => {
    if (t - last >= 10_000) { count = 1; last = t; return true; }
    if (count >= 3) return false;
    count++; last = t; return true;
  });
}

describe('signupDelayMs', () => {
  it('한 묶음을 짧은 간격으로 만든 뒤 창이 지나도록 쉰다', () => {
    expect(signupDelayMs(1)).toBe(SIGNUP_GAP_MS);
    expect(signupDelayMs(2)).toBe(SIGNUP_PAUSE_MS);
    expect(signupDelayMs(3)).toBe(SIGNUP_GAP_MS);
    expect(signupDelayMs(4)).toBe(SIGNUP_PAUSE_MS);
  });

  it('쉬는 시간은 창(10초)보다 길다', () => {
    expect(SIGNUP_PAUSE_MS).toBeGreaterThan(10_000);
  });

  it('이 간격으로 60개를 만들어도 한 번도 거부되지 않는다', () => {
    const times: number[] = [0];
    for (let made = 1; made < 60; made++) times.push((times.at(-1) as number) + signupDelayMs(made));
    expect(simulate(times).every(Boolean)).toBe(true);
  });

  it('이전 간격(5.5초)은 같은 모델에서 거부된다', () => {
    const times = Array.from({ length: 8 }, (_, i) => i * 5500);
    expect(simulate(times).includes(false)).toBe(true);
  });

  it('소요 시간 추정은 간격의 합이다', () => {
    expect(estimateSignupSeconds(0)).toBe(0);
    expect(estimateSignupSeconds(1)).toBe(0);
    expect(estimateSignupSeconds(3)).toBeCloseTo((SIGNUP_GAP_MS + SIGNUP_PAUSE_MS) / 1000);
  });
});

describe('signupsNeeded', () => {
  it('모자란 수만 돌려준다', () => {
    expect(signupsNeeded(3, 10)).toBe(7);
    expect(signupsNeeded(10, 10)).toBe(0);
    expect(signupsNeeded(12, 10)).toBe(0);
    expect(signupsNeeded(0, 0)).toBe(0);
  });
});

describe('parseAccountsFile', () => {
  const ok = JSON.stringify({ target: 'https://a.example', accounts: [{ cookie: 'k=v' }] });

  it('올바른 파일을 읽는다', () => {
    expect(parseAccountsFile(ok)).toEqual({ target: 'https://a.example', accounts: [{ cookie: 'k=v' }] });
  });

  it.each(['', 'x', '{}', '{"target":"https://a.example"}', '{"target":"https://a.example","accounts":[{}]}',
    '{"target":"https://a.example","accounts":[{"cookie":""}]}'])('잘못된 파일 %s는 거부한다', (raw) => {
    expect(() => parseAccountsFile(raw)).toThrow();
  });
});

describe('usableAccounts', () => {
  const file = { target: 'https://a.example', accounts: [{ cookie: 'a' }, { cookie: 'b' }] };

  it('앞에서부터 필요한 수만큼 쓴다', () => {
    expect(usableAccounts(file, 'https://a.example', 2)).toEqual([{ cookie: 'a' }, { cookie: 'b' }]);
  });

  it('다른 대상의 계정은 거부한다', () => {
    expect(() => usableAccounts(file, 'https://b.example', 1)).toThrow(/대상/);
  });

  it('필요한 수보다 적으면 거부한다', () => {
    expect(() => usableAccounts(file, 'https://a.example', 3)).toThrow(/load:accounts/);
  });
});

describe('assertSecretPath', () => {
  // 실제 Git 저장소 두 개를 만든다. 테스트 프로세스의 cwd 저장소와도 다른 저장소다
  let base = '';
  let other = '';
  let bare = '';
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' });

  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), 'load-secret-'));
    other = join(base, 'other');
    bare = join(base, 'plain');
    mkdirSync(other);
    mkdirSync(bare);
    git(other, 'init', '-q');
    writeFileSync(join(other, '.gitignore'), 'ignored/\n');
  });
  afterAll(() => { rmSync(base, { recursive: true, force: true }); });

  it('다른 저장소의 무시되지 않는 경로는 거부한다', () => {
    expect(() => assertSecretPath(join(other, 'load.json'))).toThrow(/gitignore/);
  });

  it('아직 없는 하위 폴더 안의 무시되지 않는 경로도 거부한다', () => {
    expect(() => assertSecretPath(join(other, 'a', 'b', 'load.json'))).toThrow(/gitignore/);
  });

  it('다른 저장소의 무시되는 경로는 허용한다', () => {
    expect(() => assertSecretPath(join(other, 'ignored', 'load.json'))).not.toThrow();
  });

  it('어느 작업 트리에도 속하지 않는 경로는 허용한다', () => {
    expect(() => assertSecretPath(join(bare, 'load.json'))).not.toThrow();
  });

  it('현재 저장소(워크트리) 안의 무시되지 않는 경로도 거부한다', () => {
    expect(() => assertSecretPath(join(process.cwd(), 'tools', 'load', 'load.json'))).toThrow(/gitignore/);
  });
});
