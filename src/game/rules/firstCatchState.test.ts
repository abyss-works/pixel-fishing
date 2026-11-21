// 첫 경험 보장 상태의 세이브 읽기 — 이전 세이브는 끝남, 캐치가 없는 세이브는 대상, 구 단일 객체는 해역별 구조로 이관.
import { describe, it, expect } from 'vitest';
import { endedFirstCatch, firstCatchOfLegacy, needsLegacyFirstCatchMigration, newFirstCatch } from './firstCatch';
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

  it('migrate: 새 해역별 구조는 보존하고 손상되면 이전 세이브 규칙을 따른다', () => {
    const saved = {
      pond: { n: 6, legendAt: 14, epic: false, legend: true },
      river: { n: 0, legendAt: 0, epic: true, legend: true },
    };
    expect(migrate({ v: 8, firstCatch: saved }).firstCatch).toEqual(saved);
    expect(migrate({ v: 8, fame: 9, firstCatch: { pond: { n: -1, legendAt: 99 } } }).firstCatch).toEqual(endedFirstCatch());
    expect(migrate({ v: 8, fame: 9, firstCatch: { n: -1, legendAt: 99 } }).firstCatch).toEqual(endedFirstCatch());
  });

  it('migrate: 구 단일 객체 세이브를 해역별 구조로 이관한다', () => {
    expect(migrate({ v: 8, firstCatch: { n: 12, legendAt: 12, epic: false, legend: false } }).firstCatch)
      .toEqual(endedFirstCatch());

    // 진행 중 + 강 어획 없음: 연못에 진행 상태(legendAt 10~15 보정), 강은 활성화
    expect(migrate({ v: 8, firstCatch: { n: 6, legendAt: 19, epic: false, legend: true } }).firstCatch).toEqual({
      pond: { n: 6, legendAt: 15, epic: false, legend: true },
      river: newFirstCatch().river,
    });

    // 진행 중 + legendAt 미결정(0): 0 유지
    expect(migrate({ v: 8, firstCatch: { n: 0, legendAt: 0, epic: true, legend: true } }).firstCatch).toEqual({
      pond: { n: 0, legendAt: 0, epic: true, legend: true },
      river: newFirstCatch().river,
    });

    // 진행 중 + 이미 강 어종 도감 기록 있음: 강은 종료 처리
    expect(migrate({
      v: 8,
      dex: { sweetfish: { normal: { count: 1, maxSize: 20, first: null } } },
      firstCatch: { n: 6, legendAt: 14, epic: false, legend: true },
    }).firstCatch).toEqual({
      pond: { n: 6, legendAt: 14, epic: false, legend: true },
      river: endedFirstCatch().river,
    });
  });

  it('needsLegacyFirstCatchMigration: 진행 중인 구 단일 객체만 풀 경로 이관 대상으로 판정한다', () => {
    expect(needsLegacyFirstCatchMigration({ n: 3, legendAt: 14, epic: true, legend: true })).toBe(true);
    expect(needsLegacyFirstCatchMigration({ n: 6, legendAt: 14, epic: false, legend: true })).toBe(true);
    expect(needsLegacyFirstCatchMigration({ n: 12, legendAt: 12, epic: false, legend: false })).toBe(false);
    expect(needsLegacyFirstCatchMigration(newFirstCatch())).toBe(false);
    expect(needsLegacyFirstCatchMigration(endedFirstCatch())).toBe(false);
    expect(needsLegacyFirstCatchMigration(undefined)).toBe(false);
    expect(needsLegacyFirstCatchMigration(null)).toBe(false);
    expect(needsLegacyFirstCatchMigration({ n: -1, legendAt: 12, epic: true, legend: true })).toBe(false);
  });

  it('newState는 보장 대상이다', () => {
    expect(newState().firstCatch).toEqual(newFirstCatch());
  });
});
