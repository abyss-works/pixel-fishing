// 스탯 서비스 — 파생 내역({base, mods, value})과 단일 출구 계약을 검증한다.
import { describe, expect, it } from 'vitest';
import { BOATS, newState } from './logic';
import { SPOTS, powerReqOf } from '../content/spots';
import { WALK_SPEED } from './balance';
import { autoPenaltyHelpText, moveSpeed, powerZones, zonesFor, powerHelpText, rodAxes, rodPower } from './stats';

type G = ReturnType<typeof newState>;
const s = (over: Partial<G> = {}): G => ({ ...newState(), ...over });

describe('이동 속도 — 씬 movement로 분기', () => {
  it('도보는 배와 무관한 고정값', () => {
    const st = moveSpeed(s({ boat: 3 }), 'walk');
    expect(st.value).toBe(WALK_SPEED);
    expect(st.mods).toEqual([]);
  });

  it('항해는 배별 속도 — boat 0은 조각배로 강등된다(logic.boatSpeed 계약)', () => {
    expect(moveSpeed(s({ boat: 0 }), 'sail').value).toBe(BOATS[0].speed);
    expect(moveSpeed(s({ boat: 3 }), 'sail').value).toBe(BOATS[2].speed);
  });

  it('밤이면 감속 mods 1행', () => {
    const st = moveSpeed(s({ boat: 3 }), 'sail', true);
    expect(st.mods.map(m => m.id)).toEqual(['night']);
    expect(st.value).toBeCloseTo(BOATS[2].speed * 0.85, 10);
  });

  it('유물 — 해구의 이빨은 결투 유물이라 이동 속도를 바꾸지 않는다', () => {
    const st = moveSpeed(s({ boat: 3, artifacts: ['abyss-angler'] }), 'sail', true);
    expect(st.mods.map(m => m.id)).toEqual(['night']);
  });

  it('유물 — 침선의 나침반은 항해 +10%, 도보는 그대로', () => {
    expect(moveSpeed(s({ artifacts: ['wreck-compass'] }), 'walk').value).toBe(WALK_SPEED);
    expect(moveSpeed(s({ boat: 1, artifacts: ['wreck-compass'] }), 'sail').value)
      .toBeCloseTo(BOATS[0].speed * 1.1, 10);
  });
});

describe('낚싯대 축 — 파워(레벨) 단일 입력 (roadmap 2.1)', () => {
  it('곡선 값을 그대로 담고 mods는 비어 있다(환경 기여 미도입)', () => {
    const axes = rodAxes(s());
    expect(axes.sweep.value).toBe(1.4);      // 전 레벨 1.4초 고정
    expect(axes.biteMax.mods).toEqual([]);
  });

  it('강화하면 입질 대기가 줄어든다', () => {
    expect(rodAxes(s({ rod: 50 })).biteMin.value).toBeLessThan(
      rodAxes(s()).biteMin.value,
    );
    expect(rodAxes(s({ rod: 50 })).biteMax.value).toBeLessThan(8);
  });
});

describe('파워 수치화 — 레벨당 5씩 단조 증가 (선형)', () => {
  it('Lv1=10, 레벨당 +5', () => {
    expect(rodPower(s())).toBe(10);
    expect(rodPower(s({ rod: 2 }))).toBe(15);
    expect(rodPower(s({ rod: 10 }))).toBe(55);
    expect(rodPower(s({ rod: 50 }))).toBe(255);
  });
  it('단조 증가', () => {
    expect(rodPower(s({ rod: 50 }))).toBeGreaterThan(rodPower(s({ rod: 10 })));
    expect(rodPower(s({ rod: 100 }))).toBeGreaterThan(rodPower(s({ rod: 50 })));
  });
});

describe('해역 파워 게이트 — 선형 존 보너스 + 투트랙 미달 페널티', () => {
  it('초과 — 총 보너스 = min(100, 초과+10)% (기본 10%), 초과 30 미만은 빨간 없음, mult=1', () => {
    const z = zonesFor(43, 40); // 초과 3 → 총 13
    expect(z.mult).toBe(1);
    expect(z.yellow).toBe(13);
    expect(z.red).toBe(0);
    expect(z.biteExtra).toBe(0);
  });

  it('사용자 예시 — 초과 0→노란 10 / 초과 50: 빨간 20 + 노란 40 / 초과 100: 빨간 20 + 노란 80', () => {
    expect(zonesFor(40, 40).yellow).toBe(10); // 초과 0 → 기본 10
    const fifty = zonesFor(90, 40);  // 초과 50 → 총 60, 빨간이 20을 먼저 차지
    expect(fifty.red).toBe(20);
    expect(fifty.yellow).toBe(40);
    const hundred = zonesFor(100, 0); // 초과 100 → 총 100(캡) − 빨간 20
    expect(hundred.red).toBe(20);
    expect(hundred.yellow).toBe(80);
    // 초과 30~50 구간 — 빨간이 채우는 동안 노란은 40에서 동결된다 (red 우선 분배)
    expect(zonesFor(80, 40).yellow).toBe(40); // 초과 40 → 총 50 − red 10
    expect(zonesFor(80, 40).red).toBe(10);
  });

  it('빨간 존 — 초과 30부터 1씩 증가·상한 20 (30→0, 31→1)', () => {
    const g = zonesFor(70, 40); // 초과 30 → red 0 (경계)
    expect(g.red).toBe(0);
    const just = zonesFor(71, 40); // 초과 31 → red 1
    expect(just.red).toBe(1);
    const cap = zonesFor(94, 40); // 초과 54 → red 20 (상한)
    expect(cap.red).toBe(20);
  });

  it('미달 — 존 0, 일반 가중치 ×min(16, 2^k) (k = ⌈부족/5⌉, 낚싯대 레벨 단위), 입질 +부족/4초', () => {
    expect(zonesFor(38, 40)).toMatchObject({ yellow: 0, red: 0, mult: 2, biteExtra: 0.5 }); // 부족 2 → 1레벨
    expect(zonesFor(35, 40).mult).toBe(2);   // 부족 5 (경계) → 1레벨
    expect(zonesFor(34, 40).mult).toBe(4);   // 부족 6 → 2레벨
    expect(zonesFor(30, 40).mult).toBe(4);   // 부족 10 (경계) → 2레벨
    expect(zonesFor(29, 40).mult).toBe(8);   // 부족 11 → 3레벨
    expect(zonesFor(25, 40).mult).toBe(8);   // 부족 15 (경계) → 3레벨
    expect(zonesFor(24, 40).mult).toBe(16);  // 부족 16 → 4레벨
    expect(zonesFor(32, 60)).toMatchObject({ mult: 16, biteExtra: 7 }); // 부족 28 → 상한
    const far = zonesFor(1, 60); // 부족 59 → 상한 ×16
    expect(far.mult).toBe(16);
    expect(far.biteExtra).toBe(14.75);
  });

  it('수역 연동 — powerZones가 요구량을 반영한다', () => {
    // 연못은 10이라 Lv1(P10)과 동급 → 노란 10
    expect(powerZones(s({ rod: 1 }), 'pond').yellow).toBe(10);
    // 배리어리프는 65라 낮은 레벨에선 미달
    expect(powerZones(s({ rod: 1 }), 'barrierreef').yellow).toBe(0);
  });
});

describe('도움말 문장 — 담백한 정보 제공형, 수치 금지', () => {
  it('도움말 문장 모두 숫자를 쓰지 않는다 — 수치는 행이 보여준다', () => {
    expect(powerHelpText()).not.toMatch(/\d/);
    expect(autoPenaltyHelpText()).not.toMatch(/\d/);
  });

  it('문장마다 줄을 바꾼다', () => {
    expect(powerHelpText().split('\n')).toHaveLength(2);
    expect(autoPenaltyHelpText().split('\n')).toHaveLength(3);
  });

  it('파워는 해역별 요구 차이를, 페널티는 방치의 결과를 사실로 알린다', () => {
    expect(powerHelpText()).toContain('요구하는 파워가 달라서');
    expect(autoPenaltyHelpText()).toContain('희귀한 어종이 잘 걸리지 않아요');
  });
});

describe('해역 요구 파워', () => {
  // 해역별 진입 레벨. 요구 파워 = 10 + (진입 레벨 - 1) x 5
  const ENTRY_LEVEL = {
    pond: 1, river: 3, sea: 6, deep: 10, dragonhole: 14, coron: 18, barrierreef: 22,
    indian: 26, southindian: 31, mozstrait: 36, comorodeep: 41, benguela: 46, sthelena: 51,
  } as const;

  it('모든 해역의 요구 파워는 진입 레벨의 파워다', () => {
    expect(SPOTS.map(s => s.id).sort()).toEqual(Object.keys(ENTRY_LEVEL).sort());
    for (const [id, level] of Object.entries(ENTRY_LEVEL)) {
      expect(powerReqOf(id as keyof typeof ENTRY_LEVEL), id).toBe(10 + (level - 1) * 5);
    }
  });
  it('해역 진행 순서로 요구 파워가 오른다', () => {
    const powers = SPOTS.map(s => powerReqOf(s.id));
    for (let i = 1; i < powers.length; i++) expect(powers[i]).toBeGreaterThan(powers[i - 1]);
  });
});
