import { describe, expect, it } from 'vitest';
import { ACTION_TYPES } from './actions';
import type { GameAction } from './actions';
import { guestActionVerdict, guestHasNoProgress } from './guest';
import { newState } from './logic';
import type { GameState } from './logic';
import { BASE_PACKS } from '../world';

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

  it('미끼 환불 안내 닫기는 게스트에게도 열려 있다 — 이관이 게스트의 골드에도 환불을 더한다', () => {
    expect(guestActionVerdict({ type: 'dismissBaitRefund' })).toBe('ok');
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
    ];
    for (const action of rejected) expect(guestActionVerdict(action), action.type).toBe('account-only');
  });

  it('기운 얻기, 해역별 덮어쓰기, 조리, 먹기는 계정 전용이다 — 열린 목록에 넣지 않는다', () => {
    const cooking: GameAction[] = [
      { type: 'extractEnergy', uids: [] }, { type: 'setEnergyTarget', spot: 'indian', on: true },
      { type: 'resetEnergyTargets' }, { type: 'cook', recipe: 'cook-lunch-bite', count: 1 },
      { type: 'eat', item: 'cook-lunch-bite' },
    ];
    for (const action of cooking) expect(guestActionVerdict(action), action.type).toBe('account-only');
  });

  it('개발 명령과 이사 코드는 이 판정이 다루지 않고 서버 환경과 소유자 판정에 맡긴다', () => {
    expect(guestActionVerdict({ type: 'debug', command: 'x' })).toBe('ok');
    expect(guestActionVerdict({ type: 'import', save: {} })).toBe('ok');
  });

  it('모든 액션 종류가 분류돼 있고, 새 액션은 이 표에 넣어야 통과한다', () => {
    const open = [
      'boot', 'sell', 'upgradeRod', 'buyBoat', 'seeTutorial', 'setLocked', 'autoLock', 'dismissBaitRefund', 'debug', 'import',
    ];
    const villageOnly = ['travel', 'catch'];
    for (const type of ACTION_TYPES) {
      // 장소나 수역이 없는 빈 액션은 마을 밖으로 보고 거부한다
      const verdict = guestActionVerdict({ type } as GameAction);
      const expected = open.includes(type) ? 'ok' : villageOnly.includes(type) ? 'guest-village-only' : 'account-only';
      expect(verdict, type).toBe(expected);
    }
    expect(ACTION_TYPES.filter(t => !open.includes(t) && !villageOnly.includes(t)).length).toBeGreaterThan(0);
    for (const type of [...open, ...villageOnly]) expect(ACTION_TYPES, type).toContain(type);
  });

  it('마을 안으로 보는 거점은 거점 데이터의 지역이 마을인 곳이다', () => {
    for (const [id, pack] of Object.entries(BASE_PACKS)) {
      const expected = pack.region === 'village' ? 'ok' : 'guest-village-only';
      expect(guestActionVerdict(travelTo('base', id)), id).toBe(expected);
    }
  });
});

describe('버릴 진행이 없는 게스트 (guestHasNoProgress)', () => {
  const withDex = (dex: GameState['dex']): GameState => ({ ...newState(), dex });

  it('새 상태는 낚은 적이 없어 버릴 진행이 없다', () => {
    expect(guestHasNoProgress(newState())).toBe(true);
  });

  it('한 마리라도 낚았으면 진행이 있다', () => {
    expect(guestHasNoProgress(withDex({ carp: { normal: { count: 1, maxSize: null, first: '2026-01-01' } } }))).toBe(false);
  });

  it('여러 어종과 폼의 낚은 수를 합산한다 (변이 폼만 낚은 경우도 진행이다)', () => {
    expect(guestHasNoProgress(withDex({ carp: { variant: { count: 1, maxSize: 3, first: '2026-01-01' } } }))).toBe(false);
    expect(guestHasNoProgress(withDex({ carp: {}, trout: {} }))).toBe(true);
  });

  it('낚은 수가 0인 도감 행만 있으면 진행이 없다', () => {
    expect(guestHasNoProgress(withDex({ carp: { normal: { count: 0, maxSize: null, first: null } } }))).toBe(true);
  });

  it('읽을 수 없는 낚은 수는 진행이 있는 것으로 본다', () => {
    const odd = withDex({ carp: { normal: { count: Number.NaN, maxSize: null, first: null } } });
    expect(guestHasNoProgress(odd)).toBe(false);
  });
});
