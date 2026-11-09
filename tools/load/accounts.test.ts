import { describe, expect, it } from 'vitest';
import { assertSecretPath, parseAccountsFile, SIGNUP_INTERVAL_MS, signupsNeeded, usableAccounts } from './accounts';

describe('SIGNUP_INTERVAL_MS', () => {
  it('10초 안에 2회를 넘지 않는다', () => {
    // 간격 g마다 만들면 10초 창에 최대 ceil(10000 / g)개가 들어간다
    expect(Math.ceil(10_000 / SIGNUP_INTERVAL_MS)).toBeLessThanOrEqual(2);
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
  it('저장소 밖 경로는 허용한다', () => {
    expect(() => assertSecretPath('/home/u/s.json', '/repo', () => false)).not.toThrow();
  });

  it('저장소 안이면서 무시되지 않는 경로는 거부한다', () => {
    expect(() => assertSecretPath('/repo/out/s.json', '/repo', () => false)).toThrow(/gitignore/);
  });

  it('저장소 안이어도 무시되는 경로는 허용한다', () => {
    expect(() => assertSecretPath('/repo/.env.accounts', '/repo', () => true)).not.toThrow();
  });
});
