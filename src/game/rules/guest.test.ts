import { describe, expect, it } from 'vitest';
import { ACTION_TYPES } from './actions';
import type { GameAction } from './actions';
import { guestActionVerdict } from './guest';

const catchAt = (spot: string) => ({ type: 'catch', spot, judgment: 'good' }) as GameAction;
const travelTo = (kind: 'region' | 'base', id: string) => ({ type: 'travel', to: { kind, id } }) as GameAction;

describe('게스트 액션 판정 (guestActionVerdict)', () => {
  it('마을 안의 낚시와 이동, 판매, 낚싯대 강화, 배 구매, 접속은 통과한다', () => {
    expect(guestActionVerdict({ type: 'boot' })).toBe('ok');
    expect(guestActionVerdict(catchAt('pond'))).toBe('ok');
    expect(guestActionVerdict(catchAt('river'))).toBe('ok');
    expect(guestActionVerdict(travelTo('region', 'village'))).toBe('ok');
    expect(guestActionVerdict(travelTo('base', 'home'))).toBe('ok');
    expect(guestActionVerdict({ type: 'sell', uids: [] })).toBe('ok');
    expect(guestActionVerdict({ type: 'upgradeRod' })).toBe('ok');
    expect(guestActionVerdict({ type: 'buyBoat' })).toBe('ok');
    expect(guestActionVerdict({ type: 'seeTutorial', id: 'x' })).toBe('ok');
    expect(guestActionVerdict({ type: 'setLocked', uids: [], locked: true })).toBe('ok');
    expect(guestActionVerdict({ type: 'autoLock' })).toBe('ok');
  });

  it('바다로 나가는 이동과 마을 밖 낚시는 마을 전용 코드로 거부한다', () => {
    expect(guestActionVerdict(travelTo('region', 'world'))).toBe('guest-village-only');
    for (const base of ['harbor', 'manila', 'colombo', 'toamasina', 'walvisbay']) {
      expect(guestActionVerdict(travelTo('base', base))).toBe('guest-village-only');
    }
    for (const spot of ['sea', 'deep', 'dragonhole', 'indian', 'benguela', 'sthelena']) {
      expect(guestActionVerdict(catchAt(spot))).toBe('guest-village-only');
    }
  });

  it('없는 수역과 모양이 틀린 이동 목적지도 통과시키지 않는다', () => {
    expect(guestActionVerdict(catchAt('nowhere'))).toBe('guest-village-only');
    expect(guestActionVerdict(travelTo('region', 'ocean'))).toBe('guest-village-only');
    expect(guestActionVerdict({ type: 'travel' } as unknown as GameAction)).toBe('guest-village-only');
  });

  it('닉네임 변경, 편지, 옷장, 의뢰, 쿠폰 같은 그 밖의 액션은 계정 전용 코드로 거부한다', () => {
    const rejected: GameAction[] = [
      { type: 'setNickname', nickname: 'x' }, { type: 'sendLetter', text: 'x' },
      { type: 'changeClothes', shirt: 0, pants: 0 }, { type: 'buyHat', hat: 'a' }, { type: 'wearHat', hat: null },
      { type: 'acceptQuest', questId: 'q', port: 'harbor' }, { type: 'deliverBounty', questId: 'q' },
      { type: 'resolveChallenge', questId: 'q', success: true, hits: 1, misses: 0 },
      { type: 'redeemCoupon', code: 'x' }, { type: 'claimRelief', code: 'x' }, { type: 'claimMail', id: 1 },
      { type: 'exhibit', uid: 'u', slot: 0 }, { type: 'exchangeArtifact', artifact: 'a' }, { type: 'levelUpArtifact', artifact: 'a' },
      { type: 'buyBait', bait: 'x' }, { type: 'setActiveBait', bait: null },
    ];
    for (const action of rejected) expect(guestActionVerdict(action), action.type).toBe('account-only');
  });

  it('개발 명령과 이사 코드는 이 판정이 다루지 않고 서버 환경과 소유자 판정에 맡긴다', () => {
    expect(guestActionVerdict({ type: 'debug', command: 'x' })).toBe('ok');
    expect(guestActionVerdict({ type: 'import', save: {} })).toBe('ok');
  });

  it('모든 액션 종류가 허용 또는 거부로 분류돼 있다', () => {
    for (const type of ACTION_TYPES) {
      const verdict = guestActionVerdict({ type } as GameAction);
      expect(['ok', 'account-only', 'guest-village-only']).toContain(verdict);
    }
  });
});
