// 의뢰 템플릿 무결성 — spec/bounty-hunting.md 3절(수량표)·5절(보상표)·
// 2절(라이선스 표)의 수치 계약을 강제한다. 표가 여기서 깨지면 수배 UI와
// 서버 판정이 조용히 틀린 값을 쓴다.
import { describe, it, expect } from 'vitest';
import { BOUNTIES, BOUNTY_LICENSE_FAME, dailyQuestFor } from './bounties';
import { RARITY } from './rarity';

// spec 3절 수량표 (EV 반올림)
const COUNTS: Record<string, Record<string, number>> = {
  easy: { common: 250, rare: 10, epic: 2 },
  normal: { common: 500, rare: 20, epic: 5, legendary: 1 },
  hard: { common: 1000, rare: 40, epic: 10, legendary: 2 },
};
// spec 5절 보상표
const REWARDS: Record<string, Record<string, number>> = {
  pacific: { easy: 500, normal: 1500, hard: 4000, named: 8000 },
  seasia: { easy: 2000, normal: 6000, hard: 15000, named: 30000 },
  indian: { easy: 8000, normal: 25000, hard: 80000, named: 160000 },
};

describe('bounties 데이터 계약', () => {
  it('의뢰 id가 유일하다', () => {
    const ids = BOUNTIES.map(q => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('등급 의뢰의 수량·보상이 spec 표와 일치한다', () => {
    for (const q of BOUNTIES) {
      if (q.difficulty === 'named') continue;
      expect(q.grade !== null, `${q.id} 등급 누락`).toBe(true);
      expect(q.count, `${q.id} 수량`).toBe(COUNTS[q.difficulty][q.grade!]);
      expect(q.reward, `${q.id} 보상`).toBe(REWARDS[q.zone][q.difficulty]);
    }
  });

  it('쉬움 풀에 전설이 없다 — 전설 EV(약 55분)가 30분 시간帯를 넘는다', () => {
    expect(BOUNTIES.filter(q => q.difficulty === 'easy').map(q => q.grade))
      .not.toContain('legendary');
  });

  it('네임드 의뢰는 대상 어종을 들고 등급 의뢰와 섞이지 않는다', () => {
    const named = BOUNTIES.filter(q => q.difficulty === 'named');
    expect(named.length).toBeGreaterThan(0);
    for (const q of named) {
      expect(q.targetFish, `${q.id} 대상 어종`).toMatch(/\w+/);
      expect(q.grade, `${q.id} 등급 null`).toBeNull();
      expect(q.count, `${q.id} 수량 1`).toBe(1);
      expect(q.reward, `${q.id} 보상`).toBe(REWARDS[q.zone].named);
    }
  });

  it('라이선스 명성이 spec 2절 표와 일치한다', () => {
    expect(BOUNTY_LICENSE_FAME).toEqual({ pacific: 1500, seasia: 15000, indian: 70000 });
  });

  it('등급 키는 실재 등급만 쓴다', () => {
    for (const q of BOUNTIES) {
      if (q.grade !== null) expect(RARITY[q.grade], `${q.id} 미등록 등급`).toBeDefined();
    }
  });

  it('일일 의뢰 — 같은 사람·날짜·해역·난이도는 항상 같은 의뢰다', () => {
    const a = dailyQuestFor('pacific', 'easy', 'uid-1', '2026-10-09');
    const b = dailyQuestFor('pacific', 'easy', 'uid-1', '2026-10-09');
    expect(a?.id).toBe(b?.id);
  });

  it('일일 의뢰 — 날짜가 바뀌면 바뀔 수 있고 pool 안에 있다', () => {
    const q = dailyQuestFor('pacific', 'easy', 'uid-1', '2026-10-10');
    expect(q?.zone).toBe('pacific');
    expect(q?.difficulty).toBe('easy');
  });
});
