// 유물 레지스트리 무결성 — 네임드마다 1개·재료 id 유일·문장 무수치가 계약이다.
import { describe, it, expect } from 'vitest';
import { ARTIFACTS, artifactById, artifactOfNamed, artifactsOfZone } from './artifacts';
import { NAMED, namedById } from './named';
import { BOUNTIES } from './bounties';

describe('artifacts 데이터 계약', () => {
  it('id·재료 id가 유일하고 네임드마다 1개다', () => {
    const ids = ARTIFACTS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const mats = ARTIFACTS.map(a => a.materialId);
    expect(new Set(mats).size).toBe(mats.length);
    const named = ARTIFACTS.map(a => a.namedId);
    expect(new Set(named).size).toBe(named.length);
    expect([...named].sort()).toEqual(NAMED.map(n => n.id).sort());
    for (const a of ARTIFACTS) expect(namedById(a.namedId)!.zones, a.id).toContain(a.zone);
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

  it('유물은 6개이고 아다마스토르의 유물은 효과가 고정인 전설 유물이다', () => {
    expect(ARTIFACTS).toHaveLength(6);
    const a = artifactOfNamed('adamastor')!;
    expect(a).toMatchObject({
      name: '마미 와타의 거울', grade: 'legendary', materialName: '흐려진 손거울',
      effects: {}, system: { namedCapBonus: 1, namedRewardCut: 0.3 },
    });
  });

  it('야스코니우스의 유물은 희귀 등급이고 입질 대기 10%를 줄인다', () => {
    const a = artifactOfNamed('jasconius')!;
    expect(a).toMatchObject({
      id: 'outer-isle-sinker', name: '바깥섬의 봉돌', grade: 'rare', zone: 'southatlantic',
      materialName: '그을린 봉돌', effects: { biteWaitCut: 0.1 },
    });
    expect(a.system).toBeUndefined();
    expect(a.lore).toBe('바깥섬 등의 그을린 자리에서 떼어 낸 돌을 깎아 만든 봉돌이다. 섬의 낚시꾼들은 이 봉돌을 단 줄 아래로 물고기들이 바깥섬 그늘을 찾아가듯 금세 모여든다고 한다.');
  });

  it('네임드 의뢰마다 그 네임드의 유물이 있다', () => {
    for (const q of BOUNTIES.filter(row => row.difficulty === 'named')) {
      expect(artifactOfNamed(q.targetFish!), q.id).toBeDefined();
    }
  });

  it('해역의 유물 목록은 그 해역 네임드의 유물이다', () => {
    expect(artifactsOfZone('southatlantic').map(a => a.namedId)).toEqual(['adamastor', 'jasconius']);
    expect(artifactsOfZone('pacific')).toHaveLength(1);
  });

  it('로어에 손으로 적은 수치가 없다', () => {
    for (const a of ARTIFACTS) {
      expect(a.lore).not.toMatch(/\d/);
      expect(artifactById(a.id)?.name).toBe(a.name);
    }
  });
});
