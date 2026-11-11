// 기운 얻기 탭 모델 — 체크 기본값은 게임 규칙(energyTargetOf)이 정하고, 개체 직접 선택은 그 위에 얹힌다.
import { describe, expect, it } from 'vitest';
import { FISH, newState } from '../../../game/rules/logic';
import type { FishInstance, GameState } from '../../../game/rules/logic';
import type { SpotId } from '../../../game/content/spots';
import {
  clearSpotPicks, energyLabel, energyResultRows, pickEnergyUids, selectEnergyView,
} from './energy';

const home = { kind: 'base', id: 'home' } as const;
const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), boat: 5, location: home, ...over });

const fishIn = (spot: SpotId, rarity?: string) => FISH.find(f => f.spot === spot && (!rarity || f.rarity === rarity))!;
const inst = (uid: string, spot: SpotId, locked = false, rarity?: string): FishInstance =>
  ({ uid, fishId: fishIn(spot, rarity).id, form: 'normal', size: 20, caughtAt: null, spot: null, judgment: null, locked });

describe('체크 기본값', () => {
  // 배 5의 기본값: 가장 앞선 두 해역(그레이트 배리어 리프, 인도양)은 꺼짐, 그 앞 해역은 켜짐
  const bag = [inst('a1', 'pond'), inst('a2', 'pond'), inst('b1', 'sea'), inst('c1', 'indian'), inst('d1', 'barrierreef')];

  it('앞선 두 해역의 어종은 체크하지 않고 그 앞 해역의 어종은 체크한다', () => {
    const view = selectEnergyView(seed({ bag }), {});
    expect(view.uids.sort()).toEqual(['a1', 'a2', 'b1']);
    expect(view.total).toBe(3);
  });

  it('덮어쓴 해역은 고른 값을 따르고 덮어쓰지 않은 해역은 기본값을 따른다', () => {
    const view = selectEnergyView(seed({ bag, energyTargets: { pond: false, indian: true } }), {});
    expect(view.uids.sort()).toEqual(['b1', 'c1']);
  });

  it('개체를 직접 고르면 해역 기본값 위에 얹힌다', () => {
    const view = selectEnergyView(seed({ bag }), { a1: false, c1: true });
    expect(view.uids.sort()).toEqual(['a2', 'b1', 'c1']);
  });

  it('잠근 개체는 해역이 켜져 있어도 고르지 않고 안내 수에 센다', () => {
    const locked = [inst('a1', 'pond', true), inst('a2', 'pond')];
    const view = selectEnergyView(seed({ bag: locked }), {});
    expect(view.uids).toEqual(['a2']);
    expect(view.lockedCount).toBe(1);
  });

  it('가방이 비면 행도 고른 개체도 없다', () => {
    const view = selectEnergyView(seed(), {});
    expect(view.rows).toEqual([]);
    expect(view.uids).toEqual([]);
    expect(view.total).toBe(0);
  });
});

describe('등급별 얻는 기운', () => {
  it('고른 개체의 어종 등급마다 기운 1개씩이다', () => {
    const bag = [inst('c1', 'pond', false, 'common'), inst('c2', 'pond', false, 'common'), inst('r1', 'pond', false, 'rare')];
    const view = selectEnergyView(seed({ bag }), {});
    expect(view.byGrade).toEqual({ common: 2, rare: 1, epic: 0, legendary: 0 });
    expect(view.total).toBe(3);
  });

  it('결과 줄은 얻은 등급만 등급 순서로 낸다', () => {
    expect(energyResultRows({ common: 38, rare: 0, epic: 2, legendary: 0 })).toEqual([
      { grade: 'common', count: 38 }, { grade: 'epic', count: 2 },
    ]);
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
  it('집 거점이고 요리가 열렸으면 가능하다', () => {
    expect(selectEnergyView(seed(), {}).allowed).toEqual({ ok: true });
  });

  it('집 밖이면 게임 규칙의 거부 사유를 그대로 전한다', () => {
    const away = seed({ location: { kind: 'region', id: 'village' } });
    expect(selectEnergyView(away, {}).allowed).toEqual({ ok: false, reason: 'not-at-home' });
  });

  it('요리가 열리기 전이면 해금 거부 사유를 전한다', () => {
    expect(selectEnergyView(seed({ boat: 4 }), {}).allowed).toEqual({ ok: false, reason: 'cooking-locked' });
  });
});

describe('기운의 화면 이름', () => {
  it('이름 뒤에 등급을 괄호로 붙인다', () => {
    expect(energyLabel('common')).toBe('생명의 기운(일반)');
    expect(energyLabel('legendary')).toBe('생명의 기운(전설)');
  });
});
