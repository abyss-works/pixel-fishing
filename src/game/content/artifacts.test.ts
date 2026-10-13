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
      expect(['pacific', 'seasia', 'indian']).toContain(a.zone);
    }
  });

  it('당분간 희귀만 둔다', () => {
    for (const a of ARTIFACTS) expect(a.grade).toBe('rare');
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
