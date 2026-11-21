import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../../../game/content/achievements';
import { ARTIFACTS } from '../../../game/content/artifacts';
import { FISH } from '../../../game/content/fish';
import { HATS } from '../../../game/content/wardrobe';
import { topZoneOfSpot } from '../../../game/content/zones';
import { MAX_BOAT } from '../../../game/rules/logic';
import { powerOfLevel } from '../../../game/rules/stats';
import { WORLD, WORLD_SPAWN } from '../../../game/world/regions/world';
import { zoneOf } from '../../../game/world/engine';
import type { PublicProfile } from '../../../platform/api';
import { selectProfileView } from './profile';

const profile = (over: Partial<PublicProfile> = {}): PublicProfile => ({
  nickname: '갈치',
  boat: 3,
  rod: 9,
  fame: 100,
  dexFish: [],
  dexVariant: [],
  artifacts: [],
  artifactLevels: {},
  hats: [],
  look: null,
  achievements: [],
  location: null,
  lastPos: null,
  online: false,
  liveRegion: null,
  liveZone: null,
  account: true,
  ...over,
});

describe('플레이어 정보 화면 데이터', () => {
  it('해역별 일반 도감과 돌연변이 수집 현황을 구역별로 집계하고 콘텐츠 외 id는 제외한다', () => {
    const pacific = FISH.filter(f => topZoneOfSpot(f.spot) === 'pacific').map(f => f.id);
    const village = FISH.filter(f => topZoneOfSpot(f.spot) === 'village').map(f => f.id);
    const view = selectProfileView(profile({
      dexFish: [...pacific, 'no-such-fish'],
      dexVariant: [...village, pacific[0], 'ghost-variant'],
    }));
    const pacificRow = view.dex.zones.find(z => z.zone === 'pacific')!;
    const villageRow = view.dex.zones.find(z => z.zone === 'village')!;
    expect(pacificRow).toMatchObject({
      name: '태평양',
      found: pacific.length,
      variantFound: 1,
      total: pacific.length,
      complete: true,
      variantComplete: false,
    });
    expect(villageRow).toMatchObject({
      name: '마을',
      found: 0,
      variantFound: village.length,
      total: village.length,
      complete: false,
      variantComplete: true,
    });
    expect(view.dex.found).toBe(pacific.length);
    expect(view.dex.variantFound).toBe(village.length + 1);
    expect(view.dex.total).toBe(FISH.length);
    expect(view.dex.zones.reduce((n, z) => n + z.total, 0)).toBe(FISH.length);
    expect(view.dex.zones.every(z => z.total > 0)).toBe(true);
  });

  it('배는 이름과 단계, 최대 단계이고 낚싯대는 레벨과 파워다', () => {
    const view = selectProfileView(profile());
    expect(view.boat).toMatchObject({ tier: 3, max: MAX_BOAT });
    expect(view.boat.name.length).toBeGreaterThan(0);
    expect(view.rod).toEqual({ level: 9, power: powerOfLevel(9) });
    expect(view.fame).toBe(100);
    expect(selectProfileView(profile({ boat: 0 })).boat.name).toBe('없음');
  });

  it('현재 또는 마지막 위치를 접속 상태와 저장 위치, 마지막 좌표에서 계산한다', () => {
    // 온라인 liveZone (하위 존 / 최상위 존)
    expect(selectProfileView(profile({ online: true, liveRegion: 'world', liveZone: 'deep' })).placeLabel).toBe('마리아나 해구');
    expect(selectProfileView(profile({ online: true, liveRegion: 'world', liveZone: 'pacific' })).placeLabel).toBe('태평양');
    // 온라인 마을 및 해역 미상 바다
    expect(selectProfileView(profile({ online: true, liveRegion: 'village', liveZone: null })).placeLabel).toBe('마을');
    expect(selectProfileView(profile({ online: true, liveRegion: 'world', liveZone: null })).placeLabel).toBe('바다');
    // 오프라인 거점 (집, 항구)
    expect(selectProfileView(profile({ online: false, location: { kind: 'base', id: 'home' } })).placeLabel).toBe('집');
    expect(selectProfileView(profile({ online: false, location: { kind: 'base', id: 'harbor' } })).placeLabel).toBe('부산항');
    expect(selectProfileView(profile({ online: false, location: { kind: 'base', id: 'manila' } })).placeLabel).toBe('마닐라항');
    expect(selectProfileView(profile({ online: false, location: { kind: 'base', id: 'colombo' } })).placeLabel).toBe('콜롬보항');
    expect(selectProfileView(profile({ online: false, location: { kind: 'base', id: 'toamasina' } })).placeLabel).toBe('투아마시나항');
    expect(selectProfileView(profile({ online: false, location: { kind: 'base', id: 'walvisbay' } })).placeLabel).toBe('월비스베이항');
    // 오프라인 마을
    expect(selectProfileView(profile({ online: false, location: { kind: 'region', id: 'village' } })).placeLabel).toBe('마을');
    // 오프라인 마지막 바다 좌표 -> 구역 매핑
    expect(zoneOf(WORLD, WORLD_SPAWN.x, WORLD_SPAWN.y)).toBe('pacific');
    expect(selectProfileView(profile({
      online: false,
      location: { kind: 'region', id: 'world' },
      lastPos: { region: 'world', x: WORLD_SPAWN.x, y: WORLD_SPAWN.y },
    })).placeLabel).toBe('태평양');
    // 오프라인 바다 좌표가 구역 밖이면 바다
    expect(selectProfileView(profile({
      online: false,
      lastPos: { region: 'world', x: -99999, y: -99999 },
    })).placeLabel).toBe('바다');
    // 오프라인 world 지역이지만 lastPos가 없거나 다른 지역이면 바다
    expect(selectProfileView(profile({
      online: false,
      location: { kind: 'region', id: 'world' },
      lastPos: null,
    })).placeLabel).toBe('바다');
    expect(selectProfileView(profile({
      online: false,
      location: { kind: 'region', id: 'world' },
      lastPos: { region: 'village', x: 10, y: 10 },
    })).placeLabel).toBe('바다');
    // 위치 미상
    expect(selectProfileView(profile()).placeLabel).toBeNull();
  });

  it('업적은 카탈로그에 존재하는 수령 완료(claimed) 항목만 센다', () => {
    const first = ACHIEVEMENTS[0].id;
    const second = ACHIEVEMENTS[1].id;
    const view = selectProfileView(profile({
      achievements: [first, second, first, 'removed-achievement'],
    }));
    expect(view.achievements.claimed).toBe(2);
    expect(view.achievements.total).toBe(ACHIEVEMENTS.length);
    expect(view.achievements.tabs.reduce((n, t) => n + t.claimed, 0)).toBe(2);
    expect(view.achievements.tabs.reduce((n, t) => n + t.total, 0)).toBe(ACHIEVEMENTS.length);
  });

  it('수집품은 모자(골드와 업적 분류)와 유물(희귀·영웅 Lv1~5, 전설 레벨 없음)을 집계한다', () => {
    const goldHat = HATS.find(h => h.source === 'gold')!;
    const achHat = HATS.find(h => h.source === 'achievement')!;
    const rare = ARTIFACTS.find(a => a.grade === 'rare')!;
    const epic = ARTIFACTS.find(a => a.grade === 'epic')!;
    const legend = ARTIFACTS.find(a => a.grade === 'legendary')!;
    const view = selectProfileView(profile({
      hats: [goldHat.id, achHat.id, goldHat.id, 'no-such-hat'],
      artifacts: [rare.id, epic.id, legend.id, 'no-such-relic'],
      artifactLevels: { [rare.id]: 4, [legend.id]: 3 },
    }));

    expect(view.collectibles.hats).toEqual({
      owned: 2,
      total: HATS.length,
      goldOwned: 1,
      goldTotal: HATS.filter(h => h.source === 'gold').length,
      achievementOwned: 1,
      achievementTotal: HATS.filter(h => h.source === 'achievement').length,
    });
    expect(view.collectibles.artifacts.owned).toBe(3);
    expect(view.collectibles.artifacts.total).toBe(ARTIFACTS.length);
    expect(view.collectibles.artifacts.slots).toHaveLength(ARTIFACTS.length);

    const rareSlot = view.collectibles.artifacts.slots.find(s => s.id === rare.id)!;
    const epicSlot = view.collectibles.artifacts.slots.find(s => s.id === epic.id)!;
    const legendSlot = view.collectibles.artifacts.slots.find(s => s.id === legend.id)!;
    const unownedSlot = view.collectibles.artifacts.slots.find(s => !s.owned)!;
    expect(rareSlot).toMatchObject({ owned: true, name: rare.name, grade: rare.grade, level: 4 });
    expect(epicSlot).toMatchObject({ owned: true, name: epic.name, grade: epic.grade, level: 1 });
    expect(legendSlot).toMatchObject({ owned: true, name: legend.name, grade: legend.grade, level: null });
    expect(unownedSlot).toMatchObject({ owned: false, name: null, grade: null, level: null });
    expect(unownedSlot.zone.length).toBeGreaterThan(0);
  });
});
