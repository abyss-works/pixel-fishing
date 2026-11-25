import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, CUMULATIVE_BONUS_COUNT, CUMULATIVE_BONUS_SERIES } from '../../../game/content/achievements';
import { ARTIFACTS } from '../../../game/content/artifacts';
import { BOATS, WALK_BAG_CAP } from '../../../game/content/boats';
import { BOUNTIES } from '../../../game/content/bounties';
import { RECIPES, recipeWaitMs } from '../../../game/content/cooking';
import { FISH } from '../../../game/content/fish';
import { NAMED } from '../../../game/content/named';
import { SPOTS } from '../../../game/content/spots';
import { HATS, LOOK_PRESETS, PANTS_COLORS, SHIRT_COLORS } from '../../../game/content/wardrobe';
import { ZONE_IDS, ZONES } from '../../../game/content/zones';
import { isBigSize } from '../../../game/rules/logic';
import {
  CONTENT_AXES,
  CONTENT_CATALOG,
  filterAchievementCatalog,
  filterArtifactCatalog,
  filterBoatCatalog,
  filterBonusSeriesCatalog,
  filterBountyCatalog,
  filterFishCatalog,
  filterHatCatalog,
  filterNamedCatalog,
  filterRecipeCatalog,
  filterSpotCatalog,
  filterZoneCatalog,
} from './contentCatalog';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('관리자 콘텐츠 카탈로그 모델', () => {
  it('9개 콘텐츠 축 메타데이터가 모두 정의돼 있다', () => {
    expect(CONTENT_AXES).toHaveLength(9);
    expect(CONTENT_AXES.map(a => a.id)).toEqual([
      'fish', 'named', 'artifacts', 'achievements', 'wardrobe', 'cooking', 'boats', 'zones', 'bounties',
    ]);
  });

  it('1) 어종 120종과 밤 전용·크기 범위·돌연변이·그림체 지원 데이터를 포함한다', () => {
    expect(CONTENT_CATALOG.fish).toHaveLength(FISH.length);
    expect(CONTENT_CATALOG.fish).toHaveLength(120);

    const expectedNightCount = FISH.filter(f => f.night === true).length;
    const nightFish = CONTENT_CATALOG.fish.filter(f => f.night);
    expect(nightFish).toHaveLength(expectedNightCount);
    expect(nightFish.length).toBe(28);

    for (const item of CONTENT_CATALOG.fish) {
      expect(item.lore.length).toBeGreaterThan(0);
      expect(item.variant.name.length).toBeGreaterThan(0);
      expect(item.variant.lore.length).toBeGreaterThan(0);
      expect(item.variant.price).toBe(item.price * 2);
      expect(item.sizeRange.min).toBeGreaterThanOrEqual(1);
      expect(item.sizeRange.min).toBeLessThan(item.sizeRange.mean);
      expect(item.sizeRange.mean).toBeLessThan(item.sizeRange.max);
      expect(item.sizeRange.bigThreshold).toBeGreaterThan(item.sizeRange.mean);
      expect(isBigSize(item.fish, item.sizeRange.bigThreshold)).toBe(true);
      expect(item.artSupport.v1).toBe(true);
    }
  });

  it('2) 네임드 8종 각각 수배서·흔적·전승 4문단과 연계 보상을 가진다', () => {
    expect(CONTENT_CATALOG.named).toHaveLength(NAMED.length);
    expect(CONTENT_CATALOG.named).toHaveLength(8);

    for (const item of CONTENT_CATALOG.named) {
      expect(item.lore.length).toBeGreaterThan(0);
      expect(item.poster.length).toBeGreaterThan(0);
      expect(item.trace.length).toBeGreaterThan(0);
      expect(item.chronicle).toHaveLength(4);
      for (const p of item.chronicle) expect(p.trim().length).toBeGreaterThan(0);
      expect(item.hp).toBeGreaterThan(0);
      expect(item.rewardArtifact).not.toBeNull();
      expect(item.bountyRewardGold).toBeGreaterThan(0);
    }
  });

  it('3) 유물 8종은 Lv1~5 단계 데이터와 재료·연계 정보를 모두 가진다', () => {
    expect(CONTENT_CATALOG.artifacts).toHaveLength(ARTIFACTS.length);
    expect(CONTENT_CATALOG.artifacts).toHaveLength(8);

    for (const art of CONTENT_CATALOG.artifacts) {
      expect(art.levels).toHaveLength(5);
      expect(art.materialName.length).toBeGreaterThan(0);
      expect(art.namedName.length).toBeGreaterThan(0);
      expect(art.lore.length).toBeGreaterThan(0);
      for (const lv of art.levels) {
        expect(lv.effectLines.length).toBeGreaterThan(0);
      }
      if (art.hasLevels) {
        expect(art.levels.map(l => l.upgradeMaterialCost)).toEqual([1, 1, 2, 4, 8]);
      } else {
        expect(art.grade).toBe('legendary');
        expect(art.systemBonusLine).not.toBeNull();
        expect(art.systemPenaltyLine).not.toBeNull();
      }
    }
  });

  it('4) 업적 82종(진행 30 + 치장 52)과 누적 보너스 37계열(37종)이 정본과 일치한다', () => {
    expect(CONTENT_CATALOG.achievements).toHaveLength(ACHIEVEMENTS.length);
    expect(CONTENT_CATALOG.achievements).toHaveLength(82);
    expect(CONTENT_CATALOG.achievements.filter(a => a.tab === 'progress')).toHaveLength(30);
    expect(CONTENT_CATALOG.achievements.filter(a => a.tab === 'cosmetic')).toHaveLength(52);

    expect(CONTENT_CATALOG.bonusSeries).toHaveLength(CUMULATIVE_BONUS_SERIES.length);
    expect(CONTENT_CATALOG.cumulativeBonusCount).toBe(CUMULATIVE_BONUS_COUNT);
    expect(CONTENT_CATALOG.cumulativeBonusCount).toBe(37);
  });

  it('5) 모자 57종(상점 5 + 업적 52)과 의상 팔레트·프리셋 6종이 정본과 일치한다', () => {
    const w = CONTENT_CATALOG.wardrobe;
    expect(w.hats).toHaveLength(HATS.length);
    expect(w.hats).toHaveLength(57);
    expect(w.shopHatCount).toBe(5);
    expect(w.achievementHatCount).toBe(52);
    expect(w.shirtColors).toHaveLength(SHIRT_COLORS.length);
    expect(w.pantsColors).toHaveLength(PANTS_COLORS.length);
    expect(w.presets).toHaveLength(LOOK_PRESETS.length);
    expect(w.presets).toHaveLength(6);

    for (const h of w.hats.filter(it => it.source === 'achievement')) {
      expect(h.achievementName).not.toBeNull();
      expect(h.achievementDesc).not.toBeNull();
    }
  });

  it('6) 요리 12종(도시락 6 + 미끼 6)과 생명의 기운 4종이 정본과 일치한다', () => {
    const c = CONTENT_CATALOG.cooking;
    expect(c.recipes).toHaveLength(RECIPES.length);
    expect(c.recipes).toHaveLength(12);
    expect(c.lunchCount).toBe(6);
    expect(c.baitCount).toBe(6);
    expect(c.energies).toHaveLength(4);

    for (const r of c.recipes) {
      expect(r.costItems.length).toBeGreaterThan(0);
      expect(r.effectLines.length).toBeGreaterThan(0);
      expect(r.grade).toBe(r.recipe.grade);
      expect(r.waitMin).toBe(recipeWaitMs(r.recipe) / 60_000);
    }
    const nightBait = c.recipes.find(r => r.id === 'cook-bait-night')!;
    expect(nightBait.effectLines).toEqual([{ text: '낮에도 밤 어종이 함께 낚여요.' }]);
  });

  it('7) 배 9척과 도보 가방 상한이 정본과 일치한다', () => {
    expect(CONTENT_CATALOG.boats).toHaveLength(BOATS.length);
    expect(CONTENT_CATALOG.boats).toHaveLength(9);
    expect(CONTENT_CATALOG.walkBagCap).toBe(WALK_BAG_CAP);
    expect(CONTENT_CATALOG.boats.filter(b => b.autoEnergy).map(b => b.tier)).toEqual([9]);
  });

  it('8) 구역 17개 계층(최상위 7·하위 10), 해역 15개, 거점 7곳이 정합하다', () => {
    const z = CONTENT_CATALOG.zones;
    expect(z.zones).toHaveLength(ZONES.length);
    expect(z.zones).toHaveLength(17);
    expect(z.zones.filter(it => it.isTopLevel)).toHaveLength(ZONE_IDS.length);
    expect(z.spots).toHaveLength(SPOTS.length);
    expect(z.spots).toHaveLength(15);
    expect(z.bases).toHaveLength(7);

    const spotFishTotal = z.spots.reduce((sum, s) => sum + s.fishCount, 0);
    expect(spotFishTotal).toBe(FISH.length);
  });

  it('9) 현상금 의뢰 정본 수와 보상·대상이 일치한다', () => {
    expect(CONTENT_CATALOG.bounties).toHaveLength(BOUNTIES.length);
    for (const q of CONTENT_CATALOG.bounties) {
      expect(q.zoneName.length).toBeGreaterThan(0);
      expect(q.rewardGold).toBeGreaterThan(0);
      expect(q.count).toBeGreaterThan(0);
    }
  });

  it('검색·구역·등급·밤 전용 필터가 정확히 동작한다', () => {
    const nightOnly = filterFishCatalog(CONTENT_CATALOG.fish, { nightOnly: true });
    expect(nightOnly).toHaveLength(FISH.filter(f => f.night === true).length);
    expect(nightOnly.every(f => f.night)).toBe(true);

    const northLegend = filterFishCatalog(CONTENT_CATALOG.fish, {
      zone: 'northatlantic', rarity: 'legendary',
    });
    expect(northLegend.length).toBeGreaterThan(0);
    expect(northLegend.every(f => f.zoneId === 'northatlantic' && f.rarity === 'legendary')).toBe(true);

    const byVariantQuery = filterFishCatalog(CONTENT_CATALOG.fish, { query: '황금 붕어' });
    expect(byVariantQuery.map(f => f.id)).toContain('crucian');

    const namedPac = filterNamedCatalog(CONTENT_CATALOG.named, { zone: 'pacific' });
    expect(namedPac.map(n => n.id)).toEqual(['megalodon']);

    const artRare = filterArtifactCatalog(CONTENT_CATALOG.artifacts, { rarity: 'rare' });
    expect(artRare.every(a => a.grade === 'rare')).toBe(true);

    const achNight = filterAchievementCatalog(CONTENT_CATALOG.achievements, { nightOnly: true });
    expect(achNight.length).toBeGreaterThan(0);

    const bonusInd = filterBonusSeriesCatalog(CONTENT_CATALOG.bonusSeries, { zone: 'indian' });
    expect(bonusInd).toHaveLength(3);

    const hatSearch = filterHatCatalog(CONTENT_CATALOG.wardrobe.hats, { query: '밀짚모자' });
    expect(hatSearch.map(h => h.id)).toEqual(['straw-hat']);

    const nightBait = filterRecipeCatalog(CONTENT_CATALOG.cooking.recipes, { nightOnly: true });
    expect(nightBait.map(r => r.id)).toEqual(['cook-bait-night']);

    const plantBoat = filterBoatCatalog(CONTENT_CATALOG.boats, { query: '자동 기운' });
    expect(plantBoat.map(b => b.tier)).toEqual([9]);

    const southZones = filterZoneCatalog(CONTENT_CATALOG.zones.zones, { zone: 'southatlantic' });
    expect(southZones.map(z => z.id)).toEqual(['southatlantic', 'benguela', 'sthelena']);

    const northSpots = filterSpotCatalog(CONTENT_CATALOG.zones.spots, { zone: 'northatlantic' });
    expect(northSpots.map(s => s.id)).toEqual(['azores', 'bermuda']);

    const northBounties = filterBountyCatalog(CONTENT_CATALOG.bounties, { zone: 'northatlantic', rarity: 'legendary' });
    expect(northBounties.length).toBe(4); // 보통 전설, 어려움 전설, 네임드 2종
  });

  it('game/world/* 와 react/react-dom 을 import하지 않는다 (번들·경계 불변식)', () => {
    const raw = readFileSync(resolve(HERE, 'contentCatalog.ts'), 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(code).not.toMatch(/game\/world/);
    expect(code).not.toMatch(/from\s+['"]react(?:-dom)?(?:\/[^'"]*)?['"]/);
  });
});
