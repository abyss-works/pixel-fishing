// 유물 레지스트리 무결성 — 지역별 1개·재료 id 유일·문장 무수치가 계약이다.
import { describe, it, expect } from 'vitest';
import { ARTIFACTS, artifactById, artifactOfZone } from './artifacts';
import { BOUNTIES } from './bounties';

describe('artifacts 데이터 계약', () => {
  it('id·재료 id가 유일하고 해역별 1개다', () => {
    const ids = ARTIFACTS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const mats = ARTIFACTS.map(a => a.materialId);
    expect(new Set(mats).size).toBe(mats.length);
    const zones = ARTIFACTS.map(a => a.zone);
    expect(new Set(zones).size).toBe(zones.length);
    for (const a of ARTIFACTS) {
      expect(['pacific', 'seasia', 'indian', 'madagascar', 'southatlantic']).toContain(a.zone);
    }
  });

  it('등급 — 시스템 효과(고정 보너스·페널티)는 전설, 낚시·결투 결과를 바꾸는 유물(변이 확률·결투 가속)은 영웅, 나머지는 희귀', () => {
    for (const a of ARTIFACTS) {
      const decisive = a.effects.mutationWeight !== undefined || a.effects.duelSpeedupCut !== undefined;
      expect(a.grade).toBe(a.system ? 'legendary' : decisive ? 'epic' : 'rare');
    }
  });

  it('유물은 5개이고 남대서양 유물은 효과가 고정인 전설 유물이다', () => {
    expect(ARTIFACTS).toHaveLength(5);
    const a = artifactOfZone('southatlantic')!;
    expect(a).toMatchObject({
      name: '마미 와타의 거울', grade: 'legendary', materialName: '흐려진 손거울',
      effects: {}, system: { namedCapBonus: 1, namedRewardCut: 0.3 },
    });
  });

  it('네임드 의뢰가 있는 해역마다 유물이 있다', () => {
    const zones = new Set(BOUNTIES.filter(q => q.difficulty === 'named').map(q => q.zone));
    for (const z of zones) expect(artifactOfZone(z)).toBeDefined();
  });

  it('로어에 손으로 적은 수치가 없다', () => {
    for (const a of ARTIFACTS) {
      expect(a.lore).not.toMatch(/\d/);
      expect(artifactById(a.id)?.name).toBe(a.name);
    }
  });
});
