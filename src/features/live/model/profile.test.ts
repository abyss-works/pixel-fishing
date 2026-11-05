import { describe, expect, it } from 'vitest';
import { ARTIFACTS } from '../../../game/content/artifacts';
import { FISH } from '../../../game/content/fish';
import { topZoneOfSpot } from '../../../game/content/zones';
import { MAX_BOAT } from '../../../game/rules/logic';
import { powerOfLevel } from '../../../game/rules/stats';
import type { PublicProfile } from '../../../platform/api';
import { selectProfileView } from './profile';

const profile = (over: Partial<PublicProfile> = {}): PublicProfile => ({
  nickname: '갈치', boat: 3, rod: 9, fame: 100, dexFish: [], artifacts: [], account: true, ...over,
});

describe('플레이어 정보 화면 데이터', () => {
  it('해역별 도감은 최상위 해역마다 낚은 어종 수와 전체 어종 수이고, 합계가 전체 도감과 같다', () => {
    const pacific = FISH.filter(f => topZoneOfSpot(f.spot) === 'pacific').map(f => f.id);
    const view = selectProfileView(profile({ dexFish: [...pacific, 'no-such-fish'] }));
    const row = view.dex.zones.find(z => z.zone === 'pacific')!;
    expect(row).toMatchObject({ name: '태평양', found: pacific.length, total: pacific.length, complete: true });
    expect(view.dex.found).toBe(pacific.length);
    expect(view.dex.total).toBe(FISH.length);
    expect(view.dex.zones.reduce((n, z) => n + z.total, 0)).toBe(FISH.length);
    expect(view.dex.zones.every(z => z.total > 0)).toBe(true);
  });

  it('배는 이름·단계·최대 단계, 낚싯대는 레벨과 파워다', () => {
    const view = selectProfileView(profile());
    expect(view.boat).toMatchObject({ tier: 3, max: MAX_BOAT });
    expect(view.boat.name.length).toBeGreaterThan(0);
    expect(view.rod).toEqual({ level: 9, power: powerOfLevel(9) });
    expect(view.fame).toBe(100);
    expect(selectProfileView(profile({ boat: 0 })).boat.name).toBe('없음');
  });

  it('유물은 전체 유물 순서대로 칸을 두고, 가진 유물만 이름을 밝힌다', () => {
    const owned = ARTIFACTS[1].id;
    const view = selectProfileView(profile({ artifacts: [owned, 'no-such-relic'] }));
    expect(view.artifacts.owned).toBe(1);
    expect(view.artifacts.slots).toHaveLength(ARTIFACTS.length);
    expect(view.artifacts.slots[1]).toMatchObject({ id: owned, owned: true, name: ARTIFACTS[1].name, grade: ARTIFACTS[1].grade });
    expect(view.artifacts.slots[0]).toMatchObject({ owned: false, name: null });
    expect(view.artifacts.slots[0].zone.length).toBeGreaterThan(0);
  });
});
