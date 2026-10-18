import { describe, expect, it } from 'vitest';
import { selectTraceCard } from './trace';
import { CHALLENGE_WINDOW_MS } from '../../../game/rules/balance';

const issued = '2026-10-16T00:00:00.000Z';
const now = Date.parse(issued) + 8 * 60_000;
const snap = (over: Partial<Parameters<typeof selectTraceCard>[0] & object> = {}) => ({
  acceptsToday: 0, namedToday: 0, progress: [], tickets: [], ...over,
});

describe('흔적 카드 선택', () => {
  it('스냅샷이 없거나 도전권이 없으면 카드가 없다', () => {
    expect(selectTraceCard(null, 'pacific', now)).toBeNull();
    expect(selectTraceCard(snap(), 'pacific', now)).toBeNull();
  });

  it('유효한 도전권은 네임드·흔적·남은 분(올림)을 든다 — 의뢰 구역 안이면 here', () => {
    const card = selectTraceCard(snap({ tickets: [{ questId: 'pacific-named-megalodon', issuedAt: issued }] }), 'deep', now)!;
    expect(card.named.id).toBe('megalodon');
    expect(card.named.trace).toContain('그물');
    expect(card.leftMins).toBe(CHALLENGE_WINDOW_MS / 60_000 - 8);
    expect(card.here).toBe(true); // 해구는 태평양의 하위 존이다
    expect(card.done).toBe(false);
  });

  it('의뢰 구역 밖이면 here가 아니고 구역 이름을 준다', () => {
    const card = selectTraceCard(snap({ tickets: [{ questId: 'pacific-named-megalodon', issuedAt: issued }] }), 'indian', now)!;
    expect(card.here).toBe(false);
    expect(card.zoneName).toBe('태평양');
  });

  it('만료된 도전권과 시계를 아직 안 찍은 때(nowMs 0)는 카드가 없다', () => {
    const tickets = [{ questId: 'pacific-named-megalodon', issuedAt: issued }];
    expect(selectTraceCard(snap({ tickets }), 'pacific', Date.parse(issued) + CHALLENGE_WINDOW_MS + 1)).toBeNull();
    expect(selectTraceCard(snap({ tickets }), 'pacific', 0)).toBeNull();
  });

  it('토벌을 마친 네임드 의뢰는 도전권이 없어도 보상 안내 카드로 남는다', () => {
    const card = selectTraceCard(snap({ progress: [{ questId: 'pacific-named-megalodon', progress: 1 }] }), null, 0)!;
    expect(card.done).toBe(true);
    expect(card.named.name).toBe('메갈로돈');
  });
});
