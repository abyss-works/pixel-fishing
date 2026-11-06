// 첫 경험 보장 상태의 세이브 읽기 — 이전 세이브는 끝남, 캐치가 없는 세이브는 대상.
import { describe, it, expect } from 'vitest';
import { endedFirstCatch, firstCatchOfLegacy, newFirstCatch } from './firstCatch';
import { newState, migrate } from './logic';

describe('이전 세이브 판정', () => {
  it('캐치가 없는 세이브(도감 비고 명성 0)는 보장 대상, 하나라도 있으면 끝남', () => {
    expect(firstCatchOfLegacy(0, 0)).toEqual(newFirstCatch());
    expect(firstCatchOfLegacy(5, 0)).toEqual(endedFirstCatch());
    expect(firstCatchOfLegacy(0, 3)).toEqual(endedFirstCatch());
  });
  it('migrate: 필드가 없는 빈 세이브는 대상, 캐치가 있던 세이브는 끝남', () => {
    expect(migrate({ v: 8 }).firstCatch).toEqual(newFirstCatch());
    expect(migrate({ v: 8, fame: 5 }).firstCatch).toEqual(endedFirstCatch());
    expect(migrate({ v: 8, dex: { carp: { normal: { count: 1, maxSize: 1, first: null } } } }).firstCatch).toEqual(endedFirstCatch());
  });
  it('migrate: 저장된 값은 보존하고 손상되면 끝남이 아니라 이전 세이브 규칙을 따른다', () => {
    const saved = { n: 6, legendAt: 14, epic: false, legend: true };
    expect(migrate({ v: 8, firstCatch: saved }).firstCatch).toEqual(saved);
    expect(migrate({ v: 8, fame: 9, firstCatch: { n: -1, legendAt: 99 } }).firstCatch).toEqual(endedFirstCatch());
  });
  it('newState는 보장 대상이다', () => {
    expect(newState().firstCatch).toEqual(newFirstCatch());
  });
});
