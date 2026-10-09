// 지명 수배 레지스트리 무결성 — 수배 의뢰(bounties)와 어긋나면 수배판·도감이
// 가리키는 대상이 없어 조용히 빈 칸이 된다.
import { describe, it, expect } from 'vitest';
import { NAMED, namedById } from './named';
import { BOUNTIES } from './bounties';

describe('named 데이터 계약', () => {
  it('id가 유일하고 출현 해역을 1곳 이상 든다', () => {
    const ids = NAMED.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of NAMED) {
      expect(n.zones.length).toBeGreaterThan(0);
      for (const z of n.zones) {
        expect(['pacific', 'seasia', 'indian']).toContain(z);
      }
    }
  });

  it('수배 의뢰의 대상 어종은 전부 레지스트리에 있다', () => {
    for (const q of BOUNTIES) {
      if (q.difficulty !== 'named') continue;
      expect(namedById(q.targetFish!), `${q.id} 대상 미등록`).toBeDefined();
    }
  });

  it('레지스트리 어종은 수배 의뢰 해역에서만 출현한다', () => {
    for (const q of BOUNTIES) {
      if (q.difficulty !== 'named') continue;
      expect(namedById(q.targetFish!)!.zones, q.id).toContain(q.zone);
    }
  });
});
