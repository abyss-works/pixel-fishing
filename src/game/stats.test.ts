// 스탯 서비스 — 파생 내역({base, mods, value})과 단일 출구 계약 (next.md 1)
import { describe, expect, it } from 'vitest';
import { BOATS, newState } from './logic';
import { AUTO_COMMON_BOOST, WALK_SPEED } from './balance';
import { autoBoost, autoPenaltyHelpText, moveSpeed, powerZones, zonesFor, powerHelpText, rodAxes, rodPower } from './stats';
import { manualPowerBonus, relativeIdleBoost } from './power';

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
});

describe('낚싯대 축 — 파워(레벨) 단일 입력 (roadmap 2.1)', () => {
  it('곡선 값을 그대로 담고 mods는 비어 있다(환경 기여 미도입)', () => {
    const axes = rodAxes(s());
    expect(axes.sweep.value).toBe(1.4);      // 전 레벨 1.4초 고정
    expect(axes.biteMax.mods).toEqual([]);
  });

  it('강화하면 점근 방향으로 움직인다', () => {
    expect(rodAxes(s({ rod: 50 })).biteMin.value).toBeLessThan(
      rodAxes(s()).biteMin.value,
    );
    expect(rodAxes(s({ rod: 50 })).biteMax.value).toBeLessThan(8);
  });
});

describe('방치 부스트 — 내역이 기여를 설명한다', () => {
  it('Lv1은 기본값(×10)이고 낚싯대 기여는 0', () => {
    const b = autoBoost(s());
    expect(b.base).toBe(AUTO_COMMON_BOOST.from);
    expect(b.value).toBe(AUTO_COMMON_BOOST.from);
    expect(b.mods[0].delta).toBe(0);
  });

  it('강화할수록 to(×4) 방향으로 단조 감소, 상한을 넘지 않는다', () => {
    const a = autoBoost(s({ rod: 10 })).value;
    const b = autoBoost(s({ rod: 100 })).value;
    expect(a).toBeLessThan(AUTO_COMMON_BOOST.from);
    expect(b).toBeLessThan(a);
    expect(b).toBeGreaterThan(AUTO_COMMON_BOOST.to);
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

describe('해역 파워 게이트 — 선형 존 보너스 + 투트랙 미달 페널티 (사용자 확정 2026-08-25)', () => {
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

  it('미달 — 존 0, 일반 가중치 지수 페널티(2^(부족÷10+1), 상한 ×16), 입질 +부족/4초', () => {
    const near = zonesFor(38, 40); // 부족 2
    expect(near).toMatchObject({ yellow: 0, red: 0, mult: 2, biteExtra: 0.5 });
    const mid = zonesFor(32, 60); // 부족 28
    expect(mid).toMatchObject({ mult: 8, biteExtra: 7 });
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

describe('도움말 문장 — 담백한 정보 제공형, 수치 금지 (writing-voice.md)', () => {
  it('두 문장 모두 숫자를 쓰지 않는다 — 수치는 행이 보여준다', () => {
    expect(powerHelpText()).not.toMatch(/\d/);
    expect(autoPenaltyHelpText()).not.toMatch(/\d/);
  });

  it('파워는 해역별 요구 차이를, 페널티는 방치의 결과를 사실로 알린다', () => {
    expect(powerHelpText()).toContain('요구하는 파워가 달라서');
    expect(autoPenaltyHelpText()).toContain('희귀한 어종이 잘 걸리지 않는다');
  });
});

describe('파워 계단 스케일링 (game/power.ts)', () => {
  it('수동 보정 — 초과 5당 ×0.1, 최대 ×2.0, 미달은 무보정', () => {
    expect(manualPowerBonus(10, 10)).toBe(1.0);   // 진입 = 무보정
    expect(manualPowerBonus(14, 10)).toBe(1.0);   // 5 미만은 같은 칸
    expect(manualPowerBonus(15, 10)).toBe(1.1);   // 첫 단계
    expect(manualPowerBonus(40, 10)).toBe(1.6);
    expect(manualPowerBonus(60, 10)).toBe(2.0);   // 10단계 = 상한
    expect(manualPowerBonus(200, 10)).toBe(2.0);  // 넘쳐도 상한 유지
    expect(manualPowerBonus(5, 20)).toBe(1.0);    // 미달 — 페널티 축(powerZones) 소관
  });

  it('방치 완화 — 기존 계약 그대로(진입 ×10, 초과 5당 −1, 하한 ×4)', () => {
    expect(relativeIdleBoost(40, 40)).toBe(AUTO_COMMON_BOOST.from);
    expect(relativeIdleBoost(43, 40)).toBe(AUTO_COMMON_BOOST.from);
    expect(relativeIdleBoost(45, 40)).toBe(9);
    expect(relativeIdleBoost(65, 40)).toBe(5);
    expect(relativeIdleBoost(70, 40)).toBe(AUTO_COMMON_BOOST.to);
    expect(relativeIdleBoost(10, 40)).toBe(AUTO_COMMON_BOOST.from); // 미달도 완화 아님
  });
});
