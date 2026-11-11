import { describe, expect, it } from 'vitest';
import { COOKING_UNLOCK_BOAT } from '../../../game/content/cooking';
import { facilityGuestAllowed, facilityProgress, GUEST_LOCK_TEXT, menuLock, progressLines } from './menuLock';

const base = { feature: '부엌', guestAllowed: true, progress: undefined };

describe('메뉴 카드 잠금 사유', () => {
  it('게스트에게 닫힌 기능은 게스트 잠금이다', () => {
    expect(menuLock({ ...base, guest: true, guestAllowed: false })).toEqual({ kind: 'guest', lines: [GUEST_LOCK_TEXT] });
  });

  it('게스트에게 열린 기능은 게스트라도 잠기지 않는다', () => {
    expect(menuLock({ ...base, guest: true })).toEqual({ kind: 'none' });
  });

  it('계정이고 진행 조건을 채우지 못하면 구역 형식의 진행 조건 잠금이다', () => {
    expect(menuLock({ ...base, guest: false, guestAllowed: false, progress: { met: false, boat: 5 } })).toEqual({
      kind: 'progress',
      lines: ['인도양 항로가 열리면 부엌을 쓸 수 있어요.', '인도양 항로는 증기선(5단계)부터 열려요.'],
    });
  });

  it('조사는 받침에 맞춘다', () => {
    const r = menuLock({ ...base, feature: '옷장', guest: false, progress: { met: false, boat: 3 } });
    expect(r.kind === 'progress' && r.lines[0]).toBe('동남아 항로가 열리면 옷장을 쓸 수 있어요.');
  });

  it('진행 조건을 채웠으면 잠기지 않는다', () => {
    expect(menuLock({ ...base, guest: false, progress: { met: true, boat: 5 } })).toEqual({ kind: 'none' });
  });

  it('둘 다 걸리면 게스트 잠금이 우선한다', () => {
    const r = menuLock({ ...base, guest: true, guestAllowed: false, progress: { met: false, boat: 5 } });
    expect(r.kind).toBe('guest');
  });

  it('구역에 들어서는 배 단계가 아니면 던지지 않고 배 단계 형식 한 줄이다', () => {
    const r = menuLock({ ...base, guest: false, progress: { met: false, boat: 4 } });
    expect(r.kind === 'progress' && r.lines).toHaveLength(1);
    expect(r.kind === 'progress' && r.lines[0]).toMatch(/^.+\(4단계\)(이|가) 되면 부엌을 쓸 수 있어요\.$/);
  });
});

describe('진행 조건 문안의 어순', () => {
  it('기능을 주제로 쓰면 첫 줄만 기능 이름이 앞에 온다', () => {
    expect(progressLines('부엌', 5, 'topic')).toEqual([
      '부엌은 인도양 항로가 열리면 쓸 수 있어요.',
      '인도양 항로는 증기선(5단계)부터 열려요.',
    ]);
    expect(progressLines('옷장', 3, 'topic')[0]).toBe('옷장은 동남아 항로가 열리면 쓸 수 있어요.');
  });
});

describe('거점 카드의 게스트 허용', () => {
  it('옷장은 게스트에게 닫혀 있고 작업대는 열려 있다(게스트 규칙 판정)', () => {
    expect(facilityGuestAllowed('wardrobe')).toBe(false);
    expect(facilityGuestAllowed('rod')).toBe(true);
  });

  it('부엌은 요리 액션이 계정 전용이라 게스트에게 닫혀 있다', () => {
    expect(facilityGuestAllowed('kitchen')).toBe(false);
  });
});

describe('거점 카드의 진행 조건', () => {
  it('부엌은 요리가 열리는 배 단계부터 열린다', () => {
    expect(facilityProgress('kitchen', COOKING_UNLOCK_BOAT - 1)).toEqual({ met: false, boat: COOKING_UNLOCK_BOAT });
    expect(facilityProgress('kitchen', COOKING_UNLOCK_BOAT)).toEqual({ met: true, boat: COOKING_UNLOCK_BOAT });
  });

  it('진행 조건이 없는 카드는 조건을 내지 않는다', () => {
    expect(facilityProgress('wardrobe', 0)).toBeUndefined();
  });
});
