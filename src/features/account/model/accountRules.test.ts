import { describe, expect, it } from 'vitest';
import { ACCOUNT_NUDGE_FAME, MIN_PASSWORD_LENGTH, passwordLongEnough, shouldNudgeAccount } from './accountRules';

const base = { configured: true, accountChecked: true, signedIn: false, fame: ACCOUNT_NUDGE_FAME, lastNudgedDay: null, today: '2030-03-04' };

describe('계정 만들기 넛지', () => {
  it('명성 기준을 넘은 게스트에게 그날 처음 띄운다', () => {
    expect(shouldNudgeAccount(base)).toBe(true);
  });

  it('같은 날 이미 띄웠으면 다시 띄우지 않는다', () => {
    expect(shouldNudgeAccount({ ...base, lastNudgedDay: '2030-03-04' })).toBe(false);
  });

  it('날짜가 바뀌면 다시 띄운다', () => {
    expect(shouldNudgeAccount({ ...base, lastNudgedDay: '2030-03-03' })).toBe(true);
  });

  it('명성이 기준에 못 미치면 띄우지 않는다', () => {
    expect(shouldNudgeAccount({ ...base, fame: ACCOUNT_NUDGE_FAME - 1 })).toBe(false);
  });

  it('계정 사용자에게는 띄우지 않는다', () => {
    expect(shouldNudgeAccount({ ...base, signedIn: true })).toBe(false);
  });

  it('계정 여부를 아직 확인하지 못했으면 띄우지 않는다 — 계정 사용자를 게스트로 오인하지 않는다', () => {
    expect(shouldNudgeAccount({ ...base, accountChecked: false })).toBe(false);
  });

  it('클라우드 미설정이면 띄우지 않는다', () => {
    expect(shouldNudgeAccount({ ...base, configured: false })).toBe(false);
  });
});

describe('비밀번호 길이', () => {
  it(`${MIN_PASSWORD_LENGTH}자 이상만 통과한다`, () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(passwordLongEnough('1234567')).toBe(false);
    expect(passwordLongEnough('12345678')).toBe(true);
  });
});
