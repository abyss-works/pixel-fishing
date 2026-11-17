// 의뢰 템플릿 무결성 — 수량표와 보상표를 검증한다.
// 2절(라이선스 표)의 수치 계약을 강제한다. 표가 여기서 깨지면 수배 UI와
// 서버 판정이 조용히 틀린 값을 쓴다.
import { describe, it, expect } from 'vitest';
import {
  BOUNTIES, BOUNTY_PORT_ZONE, bountyById, bountyKindOf, dailyQuestFor, isQuestOffered, offeredQuestsFor,
  portOfZone, zoneOfPort,
} from './bounties';
import { RARITY } from './rarity';

// spec 3절 수량표 (EV 반올림)
const COUNTS: Record<string, Record<string, number>> = {
  easy: { common: 250, rare: 10, epic: 2 },
  normal: { common: 500, rare: 20, epic: 5, legendary: 1 },
  hard: { common: 1000, rare: 40, epic: 10, legendary: 2 },
};
// 보상표 (구역 대표 방치 EV의 쉬움 1시간, 보통 2시간, 어려움 4시간, 네임드 8시간어치)
const REWARDS: Record<string, Record<string, number>> = {
  pacific: { easy: 15000, normal: 25000, hard: 50000, named: 100000 },
  seasia: { easy: 60000, normal: 100000, hard: 250000, named: 500000 },
  indian: { easy: 200000, normal: 350000, hard: 750000, named: 1500000 },
  madagascar: { easy: 700000, normal: 1500000, hard: 3000000, named: 5500000 },
  southatlantic: { easy: 3000000, normal: 5500000, hard: 10000000, named: 25000000 },
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

  it('일일 의뢰는 네임드를 해시로 뽑지 않는다 — 네임드 난이도는 받지 않는다', () => {
    // @ts-expect-error 네임드는 offeredQuestsFor가 구역의 네임드마다 낸다
    dailyQuestFor('pacific', 'named', 'uid-1', '2026-10-09');
  });

  it('일일 의뢰 — 날짜가 바뀌면 바뀔 수 있고 pool 안에 있다', () => {
    const q = dailyQuestFor('pacific', 'easy', 'uid-1', '2026-10-10');
    expect(q?.zone).toBe('pacific');
    expect(q?.difficulty).toBe('easy');
  });
});

describe('남대서양 현상금', () => {
  it('의뢰 구역 5개, 수배 창구는 월비스베이항, 네임드는 아다마스토르와 야스코니우스 둘이다', () => {
    expect(new Set(BOUNTIES.map(q => q.zone)).size).toBe(5);
    expect(BOUNTY_PORT_ZONE.walvisbay).toBe('southatlantic');
    const named = BOUNTIES.filter(q => q.zone === 'southatlantic' && q.difficulty === 'named');
    expect(named.map(q => q.targetFish)).toEqual(['adamastor', 'jasconius']);
    expect(named.map(q => q.reward)).toEqual([25000000, 25000000]);
  });
});

describe('수배판에 내는 의뢰', () => {
  it('네임드가 둘인 구역은 네임드마다 한 항목을 모두 낸다', () => {
    const ids = offeredQuestsFor('southatlantic', 'named', 'uid-1', '2026-10-09').map(q => q.id);
    expect(ids).toEqual(['southatlantic-named-adamastor', 'southatlantic-named-jasconius']);
  });

  it('네임드가 하나인 구역과 일반 난이도는 일일 의뢰 한 건을 낸다', () => {
    expect(offeredQuestsFor('pacific', 'named', 'uid-1', '2026-10-09').map(q => q.id))
      .toEqual(['pacific-named-megalodon']);
    expect(offeredQuestsFor('pacific', 'easy', 'uid-1', '2026-10-09'))
      .toEqual([dailyQuestFor('pacific', 'easy', 'uid-1', '2026-10-09')]);
  });

  it('isQuestOffered는 그날 그 사람에게 낸 의뢰만 참이다', () => {
    const day = '2026-10-09';
    for (const uid of ['a', 'b', 'c', 'd']) {
      expect(isQuestOffered(bountyById('southatlantic-named-adamastor')!, uid, day)).toBe(true);
      expect(isQuestOffered(bountyById('southatlantic-named-jasconius')!, uid, day)).toBe(true);
      expect(isQuestOffered(bountyById('pacific-named-megalodon')!, uid, day)).toBe(true);
    }
    const easy = dailyQuestFor('pacific', 'easy', 'a', day)!;
    const other = BOUNTIES.find(q => q.zone === 'pacific' && q.difficulty === 'easy' && q.id !== easy.id)!;
    expect(isQuestOffered(easy, 'a', day)).toBe(true);
    expect(isQuestOffered(other, 'a', day)).toBe(false);
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
