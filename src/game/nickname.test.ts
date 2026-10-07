// 닉네임 규칙 — 정본은 mgmt/spec/account.md 5절.
// 검증은 game/ 순수층에 둔다: 리듀서(setNickname)·클라 사전 체크가 공유한다.
import { describe, it, expect } from 'vitest';
import { checkNickname, nicknameWeight, pickGuestName } from './nickname';
import { NICK_ADJ, NICK_FISH } from '../data/nicknames';

describe('nicknameWeight', () => {
  it('한글 2 · 영문/숫자/구분자 1로 잰다', () => {
    expect(nicknameWeight('참치')).toBe(4);
    expect(nicknameWeight('tuna')).toBe(4);
    expect(nicknameWeight('a-_')).toBe(3);
  });
});

describe('checkNickname', () => {
  it('가중치 2~16을 통과시킨다', () => {
    expect(checkNickname('참치').ok).toBe(true);
    expect(checkNickname('a').ok).toBe(false); // 1
    expect(checkNickname('가나다라마바사아자').ok).toBe(false); // 18
  });

  it('공백·이모지·특수문자를 거부한다', () => {
    expect(checkNickname('날치 알').ok).toBe(false);
    expect(checkNickname('tuna!').ok).toBe(false);
    expect(checkNickname('').ok).toBe(false);
  });

  it('구분자만으로 된 이름은 거부한다', () => {
    expect(checkNickname('__').ok).toBe(false);
    expect(checkNickname('-_-').ok).toBe(false);
    expect(checkNickname('a_').ok).toBe(true);
  });

  it('문자열이 아니면 거부한다', () => {
    expect(checkNickname(null).ok).toBe(false);
    expect(checkNickname(7).ok).toBe(false);
  });
});

describe('pickGuestName', () => {
  it('형용사_어종 형태를 만든다', () => {
    const name = pickGuestName(() => 0);
    expect(name).toContain('_');
    expect(checkNickname(name).ok).toBe(true);
  });

  it('모든 형용사_어종 조합이 규칙을 통과한다', () => {
    for (const a of NICK_ADJ) for (const f of NICK_FISH) {
      expect(checkNickname(`${a}_${f}`).ok, `${a}_${f}`).toBe(true);
    }
  });
});