// 기운 얻기 탭 모델 — 체크 기본값은 게임 규칙(energyTargetOf)이 정하고, 개체 직접 선택은 그 위에 얹힌다.
import { describe, expect, it } from 'vitest';
import { FISH, newState } from '../../../game/rules/logic';
import type { FishInstance, GameState } from '../../../game/rules/logic';
import { AUTO_ENERGY_BOAT, COOKING_UNLOCK_BOAT, ENERGY_ITEM_IDS } from '../../../game/content/cooking';
import type { SpotId } from '../../../game/content/spots';
import { GUEST_LOCK_DEFAULT_LINES, UNVERIFIED_LOCK_TEXT } from '../../display/model/menuLock';
import {
  buildEnergyExtractNotice, clearSpotPicks, defaultQuickEnergyGrades, energyLabel, energyResultRows, energyRowValue, energyTotal, pickEnergyUids, selectBagEnergyEntry, selectEnergyView, selectQuickEnergyView,
} from './energy';

const home = { kind: 'base', id: 'home' } as const;
const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), boat: 5, location: home, ...over });

const fishIn = (spot: SpotId, rarity?: string) => FISH.find(f => f.spot === spot && (!rarity || f.rarity === rarity))!;
const inst = (uid: string, spot: SpotId, locked = false, rarity?: string): FishInstance =>
  ({ uid, fishId: fishIn(spot, rarity).id, form: 'normal', size: 20, caughtAt: null, spot: null, judgment: null, locked });

describe('체크 기본값', () => {
  // 배 5의 기본값: 가장 앞선 해역(인도양)만 꺼짐, 그 앞 해역(그레이트 배리어 리프 포함)은 켜짐
  const bag = [inst('a1', 'pond'), inst('a2', 'pond'), inst('b1', 'sea'), inst('c1', 'indian'), inst('d1', 'barrierreef')];

  it('가장 앞선 해역의 어종은 체크하지 않고 그 앞 해역의 어종은 체크한다', () => {
    const view = selectEnergyView(seed({ bag }), {});
    expect(view.uids.sort()).toEqual(['a1', 'a2', 'b1', 'd1']);
    expect(view.count).toBe(4);
    expect(view.energyTotal).toBe(40);
  });

  it('덮어쓴 해역은 고른 값을 따르고 덮어쓰지 않은 해역은 기본값을 따른다', () => {
    const view = selectEnergyView(seed({ bag, energyTargets: { pond: false, indian: true } }), {});
    expect(view.uids.sort()).toEqual(['b1', 'c1', 'd1']);
  });

  it('개체를 직접 고르면 해역 기본값 위에 얹힌다', () => {
    const view = selectEnergyView(seed({ bag }), { a1: false, c1: true });
    expect(view.uids.sort()).toEqual(['a2', 'b1', 'c1', 'd1']);
  });

  it('잠근 개체는 해역이 켜져 있어도 고르지 않는다', () => {
    const locked = [inst('a1', 'pond', true), inst('a2', 'pond')];
    const view = selectEnergyView(seed({ bag: locked }), {});
    expect(view.uids).toEqual(['a2']);
  });

  it('가방이 비면 행도 고른 개체도 없다', () => {
    const view = selectEnergyView(seed(), {});
    expect(view.rows).toEqual([]);
    expect(view.uids).toEqual([]);
    expect(view.count).toBe(0);
    expect(view.energyTotal).toBe(0);
  });
});

describe('등급별 얻는 기운', () => {
  it('고른 개체의 어종 등급마다 기운 화면 단위 1(저장 단위 10)씩이다', () => {
    const bag = [inst('c1', 'pond', false, 'common'), inst('c2', 'pond', false, 'common'), inst('r1', 'pond', false, 'rare')];
    const view = selectEnergyView(seed({ bag }), {});
    expect(view.byGrade).toEqual({ common: 20, rare: 10, epic: 0, legendary: 0 });
    expect(view.count).toBe(3);
    expect(view.energyTotal).toBe(30);
  });

  it('합계는 등급별 기운(저장 단위)의 합이고, 어종 행의 값은 고른 개체 수에서 규칙이 정한 산출이다', () => {
    expect(energyTotal({ common: 20, rare: 5, epic: 0, legendary: 10 })).toBe(35);
    expect(energyTotal({ common: 0, rare: 0, epic: 0, legendary: 0 })).toBe(0);
    const bag = [inst('c1', 'pond', false, 'common'), inst('c2', 'pond', false, 'common')];
    const view = selectEnergyView(seed({ bag }), {});
    expect(view.rows.map(energyRowValue)).toEqual([20]);
  });

  it('결과 줄은 얻은 등급만 등급 순서로 낸다', () => {
    expect(energyResultRows({ common: 380, rare: 0, epic: 25, legendary: 0 })).toEqual([
      { grade: 'common', count: 380 }, { grade: 'epic', count: 25 },
    ]);
  });
});

describe('비교 표', () => {
  it('등급 순서로 네 줄이고 지금 보유와 기운을 얻은 뒤의 수(저장 단위)를 나란히 준다', () => {
    const bag = [inst('a1', 'pond'), inst('a2', 'pond'), inst('b1', 'sea', false, 'rare')];
    const game = seed({ bag, items: { [ENERGY_ITEM_IDS.common]: 35, [ENERGY_ITEM_IDS.epic]: 4 } });
    const view = selectEnergyView(game, {});
    expect(view.compare.map(r => [r.grade, r.label, r.current, r.after])).toEqual([
      ['common', '생명의 기운(일반)', 35, 55], ['rare', '생명의 기운(희귀)', 0, 10],
      ['epic', '생명의 기운(영웅)', 4, 4], ['legendary', '생명의 기운(전설)', 0, 0],
    ]);
  });

  it('고른 개체가 없어도 네 줄은 그대로고 값만 같다', () => {
    const view = selectEnergyView(seed({ items: { [ENERGY_ITEM_IDS.rare]: 7 } }), {});
    expect(view.compare.map(r => [r.current, r.after])).toEqual([[0, 0], [7, 7], [0, 0], [0, 0]]);
  });

  it('얻은 뒤의 수는 지금 보유에 합계를 더한 값과 같다', () => {
    const bag = [inst('a1', 'pond'), inst('c1', 'indian', false, 'legendary')];
    const view = selectEnergyView(seed({ bag, boat: 7, energyTargets: { indian: true } }), {});
    const gained = view.compare.reduce((sum, r) => sum + r.after - r.current, 0);
    expect(gained).toBe(view.energyTotal);
  });
});

describe('해역 토글은 그 해역 행만 다시 정한다', () => {
  const bag = [inst('a1', 'pond'), inst('a2', 'pond'), inst('b1', 'sea')];

  it('그 해역 개체의 직접 선택만 지우고 다른 해역의 직접 선택은 둔다', () => {
    const picks = { a1: false, b1: false };
    expect(clearSpotPicks(picks, bag, 'pond')).toEqual({ b1: false });
  });

  it('지운 뒤 그 해역 행은 바뀐 기본값을 따르고 다른 해역 행은 직접 고른 대로다', () => {
    const picks = clearSpotPicks({ a1: false, b1: false }, bag, 'pond');
    const off = selectEnergyView(seed({ bag, energyTargets: { pond: false } }), picks);
    expect(off.uids).toEqual([]);       // 연못은 꺼짐으로 덮어썼고 바다는 직접 해제했다
    const on = selectEnergyView(seed({ bag, energyTargets: { pond: true } }), picks);
    expect(on.uids.sort()).toEqual(['a1', 'a2']);
  });

  it('덮어쓰기 없는 해역을 지워도 다른 개체의 선택은 그대로다', () => {
    const picks = { a1: false };
    expect(clearSpotPicks(picks, bag, 'sea')).toEqual({ a1: false });
  });
});

describe('체크 갱신', () => {
  it('지정한 개체를 모두 같은 값으로 고른다', () => {
    expect(pickEnergyUids({ a1: false }, ['a1', 'a2'], true)).toEqual({ a1: true, a2: true });
  });
});

describe('해역 칩', () => {
  it('배로 갈 수 있는 해역만 가장 앞선 해역부터 보이고 기본 여부와 덮어쓴 여부를 함께 준다', () => {
    const view = selectEnergyView(seed({ boat: 5, energyTargets: { pond: false } }), {});
    expect(view.spots.map(s => s.id)).toEqual(['indian', 'barrierreef', 'coron', 'dragonhole', 'deep', 'sea', 'river', 'pond']);
    const byId = Object.fromEntries(view.spots.map(s => [s.id, s]));
    expect(byId.indian).toMatchObject({ on: false, defaultOn: false, overridden: false });
    expect(byId.coron).toMatchObject({ on: true, defaultOn: true, overridden: false });
    expect(byId.pond).toMatchObject({ on: false, defaultOn: true, overridden: true });
    expect(view.hasOverride).toBe(true);
  });

  it('기본값과 같은 값으로 덮어쓴 해역도 덮어쓴 해역이다', () => {
    const view = selectEnergyView(seed({ boat: 5, energyTargets: { indian: false, pond: true } }), {});
    const byId = Object.fromEntries(view.spots.map(s => [s.id, s]));
    expect(byId.indian).toMatchObject({ on: false, defaultOn: false, overridden: true });
    expect(byId.pond).toMatchObject({ on: true, defaultOn: true, overridden: true });
    expect(view.hasOverride).toBe(true);
  });

  it('덮어쓴 해역이 없으면 되돌릴 것이 없다', () => {
    expect(selectEnergyView(seed(), {}).hasOverride).toBe(false);
  });
});

describe('확정 가능 판정', () => {
  it('판매 시설이 있는 거점이고 요리가 열렸으면 가능하다', () => {
    expect(selectEnergyView(seed(), {}).allowed).toEqual({ ok: true });
    expect(selectEnergyView(seed({ location: { kind: 'base', id: 'harbor' } }), {}).allowed).toEqual({ ok: true });
  });

  it('판매 시설이 있는 거점 밖이면 게임 규칙의 거부 사유를 그대로 전한다', () => {
    const away = seed({ location: { kind: 'region', id: 'village' } });
    expect(selectEnergyView(away, {}).allowed).toEqual({ ok: false, reason: 'not-at-sale-base' });
  });

  it('요리가 열리기 전이면 해금 거부 사유를 전한다', () => {
    expect(selectEnergyView(seed({ boat: 4 }), {}).allowed).toEqual({ ok: false, reason: 'energy-locked' });
  });
});

describe('기운의 화면 이름', () => {
  it('이름 뒤에 등급을 괄호로 붙인다', () => {
    expect(energyLabel('common')).toBe('생명의 기운(일반)');
    expect(energyLabel('legendary')).toBe('생명의 기운(전설)');
  });
});

describe('가방 하단 기운 얻기 진입 조건', () => {
  const sea = { kind: 'region', id: 'world' } as const;
  const village = { kind: 'region', id: 'village' } as const;
  const harbor = { kind: 'base', id: 'harbor' } as const;

  it('계정 상태 잠금(게스트, 확인 실패)을 위치와 배 단계보다 먼저 확인한다', () => {
    expect(selectBagEnergyEntry({ boat: AUTO_ENERGY_BOAT, location: home }, 'guest')).toEqual({
      ok: false, lines: [...GUEST_LOCK_DEFAULT_LINES],
    });
    expect(selectBagEnergyEntry({ boat: AUTO_ENERGY_BOAT, location: sea }, 'guest')).toEqual({
      ok: false, lines: [...GUEST_LOCK_DEFAULT_LINES],
    });
    expect(selectBagEnergyEntry({ boat: 0, location: home }, 'unverified')).toEqual({
      ok: false, lines: [UNVERIFIED_LOCK_TEXT],
    });
    expect(selectBagEnergyEntry({ boat: AUTO_ENERGY_BOAT, location: sea }, 'unverified')).toEqual({
      ok: false, lines: [UNVERIFIED_LOCK_TEXT],
    });
  });

  it('거점이면 요리 해금 시 활성, 미해금 시 진행 조건 툴팁을 낸다', () => {
    expect(selectBagEnergyEntry({ boat: COOKING_UNLOCK_BOAT, location: home }, 'account')).toEqual({ ok: true });
    expect(selectBagEnergyEntry({ boat: COOKING_UNLOCK_BOAT, location: harbor }, 'account')).toEqual({ ok: true });
    expect(selectBagEnergyEntry({ boat: COOKING_UNLOCK_BOAT - 1, location: home }, 'account')).toEqual({
      ok: false,
      lines: ['인도양 항로가 열리면 기운 얻기를 할 수 있어요.', '인도양 항로는 증기선(5단계)부터 열려요.'],
    });
  });

  it('바다나 마을 필드면 가공 플랜트선 이상일 때만 활성, 미만이면 장소 거부 사유를 낸다', () => {
    expect(selectBagEnergyEntry({ boat: AUTO_ENERGY_BOAT, location: sea }, 'account')).toEqual({ ok: true });
    expect(selectBagEnergyEntry({ boat: AUTO_ENERGY_BOAT, location: village }, 'account')).toEqual({ ok: true });
    expect(selectBagEnergyEntry({ boat: AUTO_ENERGY_BOAT - 1, location: sea }, 'account')).toEqual({
      ok: false,
      lines: ['집이나 항구 또는 가공 플랜트선에서만 할 수 있어요.'],
    });
    expect(selectBagEnergyEntry({ boat: COOKING_UNLOCK_BOAT, location: village }, 'account')).toEqual({
      ok: false,
      lines: ['집이나 항구 또는 가공 플랜트선에서만 할 수 있어요.'],
    });
  });
});

describe('간소화 기운 얻기 모델 (selectQuickEnergyView)', () => {
  it('기본 전체 등급 선택 시 미잠금 물고기만 등급별로 모으고 잠긴 개체는 제외한다', () => {
    const bag = [
      inst('c1', 'pond', false, 'common'),
      inst('c2', 'indian', false, 'common'), // 해역 기본값과 무관하게 미잠금이면 모두 포함
      inst('cLocked', 'pond', true, 'common'),
      inst('r1', 'sea', false, 'rare'),
      inst('e1', 'deep', true, 'epic'),
    ];
    const game = seed({
      bag,
      items: { [ENERGY_ITEM_IDS.common]: 25, [ENERGY_ITEM_IDS.rare]: 10 },
    });
    const view = selectQuickEnergyView(game, defaultQuickEnergyGrades());

    expect(view.uids).toEqual(['c1', 'c2', 'r1']);
    expect(view.count).toBe(3);
    expect(view.unlockedCount).toBe(3);
    expect(view.lockedCount).toBe(2);
    expect(view.reason).toBeNull();
    expect(view.byGrade).toEqual({ common: 20, rare: 10, epic: 0, legendary: 0 });
    expect(view.energyTotal).toBe(30);
    expect(view.chips).toEqual([
      { grade: 'common', name: '일반', fishCount: 2, on: true },
      { grade: 'rare', name: '희귀', fishCount: 1, on: true },
      { grade: 'epic', name: '영웅', fishCount: 0, on: false },
      { grade: 'legendary', name: '전설', fishCount: 0, on: false },
    ]);
    expect(view.tiles).toEqual([
      { grade: 'common', itemId: ENERGY_ITEM_IDS.common, label: '생명의 기운(일반)', gain: 20, current: 25, after: 45, gainText: '+2', currentText: '2.5', afterText: '4.5', on: true },
      { grade: 'rare', itemId: ENERGY_ITEM_IDS.rare, label: '생명의 기운(희귀)', gain: 10, current: 10, after: 20, gainText: '+1', currentText: '1', afterText: '2', on: true },
      { grade: 'epic', itemId: ENERGY_ITEM_IDS.epic, label: '생명의 기운(영웅)', gain: 0, current: 0, after: 0, gainText: '+0', currentText: '0', afterText: '0', on: false },
      { grade: 'legendary', itemId: ENERGY_ITEM_IDS.legendary, label: '생명의 기운(전설)', gain: 0, current: 0, after: 0, gainText: '+0', currentText: '0', afterText: '0', on: false },
    ]);
  });

  it('특정 등급을 끄면 그 등급 개체와 기운 획득량이 0이 되고 나머지 등급만 남는다', () => {
    const bag = [inst('c1', 'pond', false, 'common'), inst('r1', 'sea', false, 'rare')];
    const view = selectQuickEnergyView(seed({ bag }), new Set(['rare']));
    expect(view.uids).toEqual(['r1']);
    expect(view.count).toBe(1);
    expect(view.byGrade).toEqual({ common: 0, rare: 10, epic: 0, legendary: 0 });
    expect(view.chips.find(c => c.grade === 'common')?.on).toBe(false);
    expect(view.tiles.find(t => t.grade === 'common')?.gain).toBe(0);
  });

  it('가방이 비거나 모두 잠겨 있으면 unlockedCount와 count가 0이다', () => {
    const view = selectQuickEnergyView(seed({ bag: [inst('c1', 'pond', true, 'common')] }), new Set(['common', 'rare', 'epic', 'legendary']));
    expect(view.unlockedCount).toBe(0);
    expect(view.lockedCount).toBe(1);
    expect(view.count).toBe(0);
    expect(view.uids).toEqual([]);
  });

  it('확정 불가 상태면 거부 사유 문구를 reason으로 내보내고 결과 알림 행을 조립한다', () => {
    const locked = selectQuickEnergyView(seed({ boat: 4 }), defaultQuickEnergyGrades());
    expect(locked.reason).toBe('인도양 항로가 열리면 기운 얻기를 할 수 있어요.');
    expect(buildEnergyExtractNotice({ common: 25, rare: 0, epic: 10, legendary: 0 })).toEqual({
      kind: 'facility.energyExtracted',
      text: '생명의 기운 3.5개를 얻었어요!',
      toastText: '생명의 기운 3.5개 획득!',
      replaceKey: 'energy-extract',
      tip: {
        target: '3.5',
        rows: [
          { label: '생명의 기운(일반)', value: '+2.5' },
          { label: '생명의 기운(영웅)', value: '+1' },
        ],
      },
    });
  });
});
