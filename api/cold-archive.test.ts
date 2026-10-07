// 콜드 아카이브 코어 — 순수 선정 로직과 컷오프 계산. 네트워크부(PostgREST·R2)는
// 스테이징 통합 QA가 담당한다(스펙 5절).
import { describe, it, expect } from 'vitest';
import { cutoffIso, selectSavesVictims } from './cold-archive.js';

describe('selectSavesVictims — 유저별 최신 keep개 초과 + 컷오프 이전만', () => {
  // 스캔 계약 순서: user_id asc, updated_at desc
  const rows = [
    { id: 10, user_id: 'a', updated_at: '2026-10-06T00:00:00Z' },
    { id: 9, user_id: 'a', updated_at: '2026-10-01T00:00:00Z' },
    { id: 8, user_id: 'a', updated_at: '2026-09-01T00:00:00Z' },
    { id: 7, user_id: 'b', updated_at: '2026-09-01T00:00:00Z' }, // b의 유일 행 — keep 1로 보존
  ];
  it('keep=1: 최신 1행은 날짜 무관 보존, 나머지는 컷오프 이전만', () => {
    expect(selectSavesVictims(rows, 1, '2026-10-04T00:00:00Z')).toEqual([9, 8]);
  });
  it('keep=2면 2번째 행까지 보존', () => {
    expect(selectSavesVictims(rows, 2, '2026-10-04T00:00:00Z')).toEqual([8]);
  });
});

describe('cutoffIso', () => {
  it('now − days', () => {
    expect(cutoffIso(7, new Date('2026-10-07T12:00:00Z'))).toBe('2026-09-30T12:00:00.000Z');
  });
});
