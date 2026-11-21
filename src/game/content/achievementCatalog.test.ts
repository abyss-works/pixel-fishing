import { describe, it, expect } from 'vitest';
import {
  ACHIEVEMENT_CATALOG, ACHIEVEMENT_RULES, ACHIEVEMENTS,
} from './achievements';
import { ARTIFACTS } from './artifacts';
import { BOUNTIES } from './bounties';
import { FISH } from './fish';
import type { FormId } from './fish';
import { RARITY_ORDER } from './rarity';
import { SPOTS } from './spots';
import { HATS } from './wardrobe';
import { ZONES, topZoneOfSpot } from './zones';

const FISH_FORMS: readonly FormId[] = ['normal', 'variant'];
const NAMED_QUESTS = BOUNTIES.filter(q => q.difficulty === 'named');

const fishInZone = (zone: string) => FISH.filter(f => topZoneOfSpot(f.spot) === zone);
const fishInSpot = (spot: string) => FISH.filter(f => f.spot === spot);

describe('업적 카탈로그', () => {
  it('진행 26종과 치장 41종 총 67종이 규칙·카탈로그·정의로 1:1 대응한다', () => {
    expect(ACHIEVEMENTS).toHaveLength(67);
    expect(ACHIEVEMENT_RULES).toHaveLength(67);
    expect(ACHIEVEMENT_CATALOG).toHaveLength(67);
    expect(ACHIEVEMENTS.map(a => a.id)).toEqual(ACHIEVEMENT_RULES.map(r => r.id));
    expect(ACHIEVEMENT_CATALOG.map(e => e.rule.id)).toEqual(ACHIEVEMENT_RULES.map(r => r.id));
  });

  it('id가 중복되지 않는다', () => {
    expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(new Set(ACHIEVEMENT_RULES.map(r => r.id)).size).toBe(ACHIEVEMENT_RULES.length);
  });

  it('모든 규칙의 목표 수가 데이터에서 계산되어 0보다 크다', () => {
    for (const entry of ACHIEVEMENT_CATALOG) {
      expect(Number.isInteger(entry.target), entry.rule.id).toBe(true);
      expect(entry.target, entry.rule.id).toBeGreaterThan(0);
    }
  });

  it('해역 진행 업적 목표 수는 그 해역의 일반 폼 어종 수다', () => {
    const target = (id: string) => ACHIEVEMENT_CATALOG.find(e => e.rule.id === id)!.target;
    for (const spot of SPOTS) {
      const all = fishInSpot(spot.id);
      const basic = all.filter(f => f.rarity !== 'legendary');
      expect(target(`spot-basic-${spot.id}`), spot.id).toBe(basic.length);
      expect(target(`spot-full-${spot.id}`), spot.id).toBe(all.length);
    }
  });

  it('치장 업적 목표 수가 콘텐츠 데이터와 일치한다', () => {
    const target = (id: string) => ACHIEVEMENT_CATALOG.find(e => e.rule.id === id)!.target;
    for (const zone of ['village', 'pacific', 'seasia', 'indian', 'madagascar', 'southatlantic'] as const) {
      expect(target(`variant-${zone}`)).toBe(fishInZone(zone).length);
    }
    expect(target('variant-all')).toBe(FISH.length);
    expect(target('grade-legendary')).toBe(FISH.filter(f => f.rarity === 'legendary').length);
    expect(target('night-normal')).toBe(fishInZone('pacific').filter(f => f.night === true).length);
    expect(target('night-variant')).toBe(fishInZone('pacific').filter(f => f.night === true).length);
    for (const zone of ['seasia', 'indian', 'madagascar', 'southatlantic'] as const) {
      const count = fishInZone(zone).filter(f => f.night === true).length;
      expect(target(`night-${zone}-normal`), zone).toBe(count);
      expect(target(`night-${zone}-variant`), zone).toBe(count);
    }
    expect(target('big-50')).toBe(50);
    expect(target('big-100-hat')).toBe(100);
    expect(target('catch-100000')).toBe(100_000);
    expect(target('named-all')).toBe(NAMED_QUESTS.length);
    expect(target('artifact-all')).toBe(ARTIFACTS.length);
    for (const namedId of ['megalodon', 'leviathan', 'ananta', 'elder-sixgill', 'adamastor', 'jasconius']) {
      expect(target(`named-${namedId}-1`)).toBe(1);
      expect(target(`named-${namedId}-5`)).toBe(5);
      expect(target(`named-${namedId}-10`)).toBe(10);
    }
  });

  it('모든 선택자가 알려진 갈래와 데이터 값을 쓴다', () => {
    const zoneIds = new Set<string>(ZONES.map(z => z.id));
    const spotIds = new Set<string>(SPOTS.map(s => s.id));
    const rarityIds = new Set<string>(RARITY_ORDER);
    for (const rule of ACHIEVEMENT_RULES) {
      const selector = rule.selector;
      expect(['fish', 'named', 'artifact', 'hat'], rule.id).toContain(selector.kind);
      if (selector.kind !== 'fish') continue;
      if (selector.spot !== undefined) expect(spotIds.has(selector.spot), rule.id).toBe(true);
      if (selector.zone !== undefined) expect(zoneIds.has(selector.zone), rule.id).toBe(true);
      if (selector.night !== undefined) expect(typeof selector.night, rule.id).toBe('boolean');
      if (selector.form !== undefined) expect(FISH_FORMS, rule.id).toContain(selector.form);
      const rarities = selector.rarity === undefined
        ? []
        : typeof selector.rarity === 'string' ? [selector.rarity] : selector.rarity;
      for (const rarity of rarities) expect(rarityIds.has(rarity), rule.id).toBe(true);
    }
  });

  it('모든 측정 방식이 알려진 갈래이고 필드가 채워져 있다', () => {
    for (const rule of ACHIEVEMENT_RULES) {
      const metric = rule.metric;
      expect(['discover', 'counterSet', 'counter', 'set', 'namedClearCount', 'bigSpecies', 'catchCount'], rule.id)
        .toContain(metric.kind);
      if (metric.kind === 'discover') expect(FISH_FORMS, rule.id).toContain(metric.form);
      if (metric.kind === 'counterSet') expect(metric.prefix.length, rule.id).toBeGreaterThan(0);
      if (metric.kind === 'counter') expect(metric.key.length, rule.id).toBeGreaterThan(0);
      if (metric.kind === 'set') expect(['named', 'artifact'], rule.id).toContain(metric.field);
      if (metric.kind === 'namedClearCount') expect(metric.questId.length, rule.id).toBeGreaterThan(0);
    }
  });

  it('모든 보상이 유효하다 — 골드는 양수(26종), 모자는 옷장의 업적 모자와 1:1(41종)', () => {
    for (const rule of ACHIEVEMENT_RULES) {
      const reward = rule.reward;
      if (reward.kind === 'gold') {
        expect(Number.isInteger(reward.gold), rule.id).toBe(true);
        expect(reward.gold, rule.id).toBeGreaterThan(0);
      } else {
        const hat = HATS.find(h => h.id === reward.hatId);
        expect(hat, rule.id).toBeDefined();
        expect(hat!.source, rule.id).toBe('achievement');
        expect(hat!.achievementId, rule.id).toBe(rule.id);
      }
    }
    expect(ACHIEVEMENT_RULES.filter(r => r.reward.kind === 'gold')).toHaveLength(26);
    expect(ACHIEVEMENT_RULES.filter(r => r.reward.kind === 'hat')).toHaveLength(41);
  });

  it('카탈로그 정의가 규칙의 표시 필드를 그대로 옮긴다', () => {
    for (const entry of ACHIEVEMENT_CATALOG) {
      const { rule, def } = entry;
      expect(def.id).toBe(rule.id);
      expect(def.tab).toBe(rule.tab);
      expect(def.name).toBe(rule.name);
      expect(def.desc).toBe(rule.desc);
      expect(def.reward).toEqual(rule.reward);
    }
    expect(ACHIEVEMENTS).toEqual(ACHIEVEMENT_CATALOG.map(e => e.def));
  });
});
