// 지명 수배 레지스트리 무결성 — 수배 의뢰(bounties)와 어긋나면 수배판·도감이
// 가리키는 대상이 없어 조용히 빈 칸이 된다.
import { describe, it, expect } from 'vitest';
import { NAMED, namedById } from './named';
import { BOUNTIES } from './bounties';
import { topZoneOfSpot } from './zones';

describe('named 데이터 계약', () => {
  it('전승은 네 문단이고 아라비아 숫자를 쓰지 않으며 도감 로어·수배서와 문장을 공유하지 않는다', () => {
    for (const n of NAMED) {
      expect(n.chronicle, n.id).toHaveLength(4);
      for (const p of n.chronicle) {
        expect(p, n.id).not.toMatch(/[0-9]/);
        for (const sentence of p.split('. ')) {
          expect(n.lore.includes(sentence) || n.poster.includes(sentence), `${n.id}: ${sentence}`).toBe(false);
        }
      }
    }
  });

  it('id가 유일하고 출현 해역을 1곳 이상 든다', () => {
    const ids = NAMED.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of NAMED) {
      expect(n.zones.length).toBeGreaterThan(0);
      for (const z of n.zones) {
        expect(['pacific', 'seasia', 'indian', 'madagascar']).toContain(z);
      }
    }
  });

  it('결투 체력은 태평양 5에서 구역마다 1씩 늘어난다 — 뒤 구역 네임드일수록 어렵다', () => {
    expect(Object.fromEntries(NAMED.map(n => [n.zones[0], n.hp])))
      .toEqual({ pacific: 5, seasia: 6, indian: 7, madagascar: 8 });
  });

  it('출현 수역(spot)이 있으면 그 수역은 출현 해역 안에 있다', () => {
    for (const n of NAMED) {
      if (n.spot === undefined) continue;
      expect(n.zones, n.id).toContain(topZoneOfSpot(n.spot));
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

  it('수배서 본문이 있고 도감 로어와 문장을 공유하지 않는다', () => {
    for (const n of NAMED) {
      expect(n.poster.length).toBeGreaterThan(0);
      expect(n.poster).not.toBe(n.lore);
    }
  });

  it('로어와 수배서가 네임드 로어 형식을 지킨다', () => {
    const sentences = (s: string) => s.split(/(?<=다\.)\s*/).filter(Boolean);
    for (const n of NAMED) {
      for (const text of [n.lore, n.poster]) {
        expect(text, n.id).not.toMatch(/\d/);
        expect(sentences(text), n.id).toHaveLength(4);
      }
      expect(n.poster, n.id).toMatch(/토벌하고 돌아오면 수배판에서 값을 치른다\.$/);
      expect(n.poster, `${n.id} 수배서는 이름을 부르지 않는다`).not.toContain(n.name);
    }
  });

  it('흔적은 이름·수치 없는 한 문장이고 로어·수배서와 문장을 공유하지 않는다', () => {
    const sentences = (s: string) => s.split(/(?<=다\.)\s*/).filter(Boolean);
    for (const n of NAMED) {
      expect(sentences(n.trace), n.id).toHaveLength(1);
      expect(n.trace, n.id).not.toMatch(/\d/);
      expect(n.trace, n.id).not.toContain(n.name);
      expect([...sentences(n.lore), ...sentences(n.poster)], n.id).not.toContain(n.trace);
    }
  });
});
