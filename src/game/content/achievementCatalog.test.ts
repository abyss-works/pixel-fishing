import { describe, it, expect } from 'vitest';
import {
  ACHIEVEMENT_CATALOG, ACHIEVEMENT_RULES, ACHIEVEMENTS,
} from './achievements';
import { ARTIFACTS } from './artifacts';
import { BOUNTIES } from './bounties';
import { FISH } from './fish';
import type { FormId } from './fish';
import { RARITY_ORDER } from './rarity';
import { HATS } from './wardrobe';
import { ZONES, topZoneOfSpot } from './zones';

const CURRENT_IDS = [
  'zone-basic-pacific', 'zone-full-pacific',
  'zone-basic-seasia', 'zone-full-seasia',
  'zone-basic-indian', 'zone-full-indian',
  'zone-basic-madagascar', 'zone-full-madagascar',
  'zone-basic-southatlantic', 'zone-full-southatlantic',
  'variant-village', 'variant-pacific', 'variant-seasia', 'variant-indian',
  'variant-madagascar', 'variant-southatlantic', 'variant-all',
  'grade-legendary', 'night-normal', 'night-variant', 'big-50',
  'named-all', 'artifact-all', 'catch-100000',
] as const;

const FISH_FORMS: readonly FormId[] = ['normal', 'variant'];
const NAMED_QUESTS = BOUNTIES.filter(q => q.difficulty === 'named');

const fishInZone = (zone: string) => FISH.filter(f => topZoneOfSpot(f.spot) === zone);

describe('업적 카탈로그', () => {
  it('현재 24개 id와 순서가 그대로다', () => {
    expect(ACHIEVEMENTS.map(a => a.id)).toEqual([...CURRENT_IDS]);
    expect(ACHIEVEMENT_RULES.map(r => r.id)).toEqual([...CURRENT_IDS]);
    expect(ACHIEVEMENT_CATALOG.map(e => e.rule.id)).toEqual([...CURRENT_IDS]);
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

  it('구역 도감 목표 수는 그 구역의 일반 폼 어종 수다', () => {
    for (const zone of ['pacific', 'seasia', 'indian', 'madagascar', 'southatlantic'] as const) {
      const all = fishInZone(zone);
      const basic = all.filter(f => f.rarity !== 'legendary');
      const target = (id: string) => ACHIEVEMENT_CATALOG.find(e => e.rule.id === id)!.target;
      expect(target(`zone-basic-${zone}`)).toBe(basic.length);
      expect(target(`zone-full-${zone}`)).toBe(all.length);
    }
  });

  it('수집·네임드·유물·횟수 목표 수가 기존 정의와 같다', () => {
    const target = (id: string) => ACHIEVEMENT_CATALOG.find(e => e.rule.id === id)!.target;
    for (const zone of ['village', 'pacific', 'seasia', 'indian', 'madagascar', 'southatlantic'] as const) {
      expect(target(`variant-${zone}`)).toBe(fishInZone(zone).length);
    }
    expect(target('variant-all')).toBe(FISH.length);
    expect(target('grade-legendary')).toBe(FISH.filter(f => f.rarity === 'legendary').length);
    expect(target('night-normal')).toBe(FISH.filter(f => f.night === true).length);
    expect(target('night-variant')).toBe(FISH.filter(f => f.night === true).length);
    expect(target('big-50')).toBe(50);
    expect(target('catch-100000')).toBe(100_000);
    expect(target('named-all')).toBe(NAMED_QUESTS.length);
    expect(target('artifact-all')).toBe(ARTIFACTS.length);
  });

  it('모든 선택자가 알려진 갈래와 데이터 값을 쓴다', () => {
    const zoneIds = new Set<string>(ZONES.map(z => z.id));
    const rarityIds = new Set<string>(RARITY_ORDER);
    for (const rule of ACHIEVEMENT_RULES) {
      const selector = rule.selector;
      expect(['fish', 'named', 'artifact', 'hat'], rule.id).toContain(selector.kind);
      if (selector.kind !== 'fish') continue;
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
      expect(['discover', 'counterSet', 'counter', 'set', 'bigSpecies', 'catchCount'], rule.id)
        .toContain(metric.kind);
      if (metric.kind === 'discover') expect(FISH_FORMS, rule.id).toContain(metric.form);
      if (metric.kind === 'counterSet') expect(metric.prefix.length, rule.id).toBeGreaterThan(0);
      if (metric.kind === 'counter') expect(metric.key.length, rule.id).toBeGreaterThan(0);
      if (metric.kind === 'set') expect(['named', 'artifact'], rule.id).toContain(metric.field);
    }
  });

  it('모든 보상이 유효하다 — 골드는 양수, 모자는 옷장의 업적 모자와 1:1', () => {
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
    expect(ACHIEVEMENT_RULES.filter(r => r.reward.kind === 'gold')).toHaveLength(10);
    expect(ACHIEVEMENT_RULES.filter(r => r.reward.kind === 'hat')).toHaveLength(14);
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
