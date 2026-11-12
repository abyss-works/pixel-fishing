import { describe, expect, it } from 'vitest';
import { ACCOUNT_NUDGE_FAME, MIN_PASSWORD_LENGTH, guestProgress, passwordLongEnough, shouldNudgeAccount } from './accountRules';
import { newState } from '../../../game/rules/logic';

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
    expect(MIN_PASSWORD_LENGTH).toBe(6);
    expect(passwordLongEnough('12345')).toBe(false);
    expect(passwordLongEnough('123456')).toBe(true);
  });
});

describe('게스트 진행의 판정 (guestProgress)', () => {
  const caught = { ...newState(), dex: { carp: { normal: { count: 2, maxSize: 10, first: '2030-03-04' } } } };

  it('세이브를 읽는 중에는 아직 모른다 (기본 상태의 낚은 수 0으로 판정하지 않는다)', () => {
    expect(guestProgress({ sync: 'connecting', blocked: true, game: newState() })).toBe('reading');
    expect(guestProgress({ sync: 'on', blocked: true, game: newState() })).toBe('reading');
  });

  it('세이브를 읽지 못했으면 진행이 있는 것으로 본다', () => {
    expect(guestProgress({ sync: 'error', blocked: true, game: newState() })).toBe('some');
  });

  it('읽은 뒤에는 낚은 수가 0이면 진행 없음, 아니면 진행 있음이다', () => {
    expect(guestProgress({ sync: 'on', blocked: false, game: newState() })).toBe('nothing');
    expect(guestProgress({ sync: 'on', blocked: false, game: caught })).toBe('some');
  });
});
