// 의뢰 템플릿 무결성 — 수량표와 보상표를 검증한다.
// 2절(라이선스 표)의 수치 계약을 강제한다. 표가 여기서 깨지면 수배 UI와
// 서버 판정이 조용히 틀린 값을 쓴다.
import { describe, it, expect } from 'vitest';
import {
  BOUNTIES, BOUNTY_LICENSE_FAME, BOUNTY_PORT_ZONE, bountyById, bountyKindOf, dailyQuestFor, portOfZone, zoneOfPort,
} from './bounties';
import { RARITY } from './rarity';
import { BOATS } from './boats';
import { subtreeSpots } from './zones';

// spec 3절 수량표 (EV 반올림)
const COUNTS: Record<string, Record<string, number>> = {
  easy: { common: 250, rare: 10, epic: 2 },
  normal: { common: 500, rare: 20, epic: 5, legendary: 1 },
  hard: { common: 1000, rare: 40, epic: 10, legendary: 2 },
};
// spec 5절 보상표 (스케일링 규칙: 난이도 ≈ 판매가 평균 15배, 네임드 = 어려움 5배)
const REWARDS: Record<string, Record<string, number>> = {
  pacific: { easy: 20000, normal: 40000, hard: 80000, named: 400000 },
  seasia: { easy: 80000, normal: 150000, hard: 300000, named: 1500000 },
  indian: { easy: 150000, normal: 350000, hard: 700000, named: 3500000 },
  madagascar: { easy: 225000, normal: 500000, hard: 1000000, named: 5000000 },
  southatlantic: { easy: 300000, normal: 675000, hard: 1350000, named: 6750000 },
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
    expect(BOUNTY_LICENSE_FAME).toEqual({ pacific: 3000, seasia: 10500, indian: 72000, madagascar: 300000, southatlantic: 600000 });
  });

  it('라이선스 명성은 구역 진입 배 명성 요구치의 3배다 — 진입 배는 구역 첫 해역을 여는 배', () => {
    for (const zone of Object.keys(BOUNTY_LICENSE_FAME) as (keyof typeof BOUNTY_LICENSE_FAME)[]) {
      const entryTier = Math.min(...subtreeSpots(zone).map(s => s.boatTier));
      // 진입 배의 명성 요구치가 0이면(태평양) 명성 요구치가 0보다 큰 첫 배가 기준이다
      const base = BOATS.find(b => b.tier >= entryTier && b.fameReq > 0)!;
      expect(BOUNTY_LICENSE_FAME[zone], zone).toBe(base.fameReq * 3);
    }
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

describe('남대서양 현상금', () => {
  it('의뢰 구역 5개, 수배 창구는 월비스베이항, 네임드는 아다마스토르 하나다', () => {
    expect(new Set(BOUNTIES.map(q => q.zone)).size).toBe(5);
    expect(BOUNTY_PORT_ZONE.walvisbay).toBe('southatlantic');
    const named = BOUNTIES.filter(q => q.zone === 'southatlantic' && q.difficulty === 'named');
    expect(named.map(q => q.targetFish)).toEqual(['adamastor']);
    expect(named[0].reward).toBe(6750000);
  });
});

describe('의뢰의 갈래', () => {
  it('네임드는 named, 난이도 의뢰는 모두 general이다', () => {
    expect(bountyKindOf(bountyById('pacific-named-megalodon')!)).toBe('named');
    for (const q of BOUNTIES.filter(row => row.difficulty !== 'named')) {
      expect(bountyKindOf(q), q.id).toBe('general');
    }
  });
});

describe('항구와 해역의 대응', () => {
  it('해역마다 수배 창구 항구가 하나씩 있고 portOfZone과 zoneOfPort가 서로 역이다', () => {
    for (const [port, zone] of Object.entries(BOUNTY_PORT_ZONE)) {
      expect(zoneOfPort(port)).toBe(zone);
      expect(portOfZone(zone)).toBe(port);
    }
  });

  it('모든 의뢰 해역에 창구 항구가 있다', () => {
    for (const zone of new Set(BOUNTIES.map(q => q.zone))) {
      expect(portOfZone(zone), zone).toBeDefined();
    }
  });
});
