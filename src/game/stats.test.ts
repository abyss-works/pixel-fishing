// 스탯 서비스 — 파생 내역({base, mods, value})과 단일 출구 계약 (next.md 1)
import { describe, expect, it } from 'vitest';
import { BOATS, newState } from './logic';
import { AUTO_COMMON_BOOST, WALK_SPEED } from './balance';
import { autoBoost, autoPenaltyHelpText, moveSpeed, powerZones, powerHelpText, rodAxes, rodPower } from './stats';

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
    expect(axes.sweep.value).toBe(1);      // Lv1 sweep 1s
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

describe('파워 수치화 — 해역 게이트가 레벨 하드코딩 대신 보는 숫자', () => {
  it('1~100 점근, 레벨에 단조 증가', () => {
    expect(rodPower(s())).toBe(1);
    expect(rodPower(s({ rod: 50 }))).toBeGreaterThan(rodPower(s({ rod: 10 })));
    expect(rodPower(s({ rod: 1000000 }))).toBeLessThanOrEqual(100);
    expect(rodPower(s({ rod: 1000000 }))).toBeGreaterThan(90);
  });
});

describe('해역 파워 게이트 — 선형 존 보너스 + 투트랙 미달 페널티 (사용자 확정 2026-08-25)', () => {
  // 파워표: L1=1 · L4=32 · L5=38 · L6=43 · L10=58 (deep 요구 40, seasia 요구 60)
  it('초과 — 총 보너스 = 초과%p, 초과 30 미만은 빨간 없음, mult=1', () => {
    const z = powerZones(s({ rod: 6 }), 'deep');          // P43, 초과 3
    expect(z.mult).toBe(1);
    expect(z.yellow).toBe(3);
    expect(z.red).toBe(0);
    expect(z.biteExtra).toBe(0);
  });

  it('사용자 예시 — 초과 50: 빨간 20 + 노란 30 / 초과 100: 빨간 20 + 노란 80', () => {
    const fifty = powerZones(s({ rod: 60 }), 'deep');       // P90 — 초과 50
    expect(fifty.red).toBe(20);
    expect(fifty.yellow).toBe(30);
    const hundred = powerZones(s({ rod: 100000 }), 'sea');  // P100, 요구 없음 — 초과 100
    expect(hundred.red).toBe(20);
    expect(hundred.yellow).toBe(80);
  });

  it('빨간 존 — 초과 30부터 열리고 2배 책정·상한 20%', () => {
    const g = powerZones(s({ rod: 100 }), 'dragonhole');  // P94, 초과 34
    expect(g.red).toBe(20);
    const below = powerZones(s({ rod: 6 }), 'deep');      // 초과 3 — 미개방
    expect(below.red).toBe(0);
  });

  it('미달 — 존 0, 일반 가중치 지수 페널티(2^(부족÷10+1)), 입질 +부족/5초', () => {
    const near = powerZones(s({ rod: 5 }), 'deep');       // 부족 2
    expect(near).toMatchObject({ yellow: 0, red: 0, mult: 2, biteExtra: 0.4 });
    const mid = powerZones(s({ rod: 4 }), 'dragonhole');  // 부족 28
    expect(mid).toMatchObject({ mult: 8, biteExtra: 5.6 });
    const far = powerZones(s({ rod: 1 }), 'dragonhole');  // 부족 59 — 캡 없음
    expect(far.mult).toBe(64);
    expect(far.biteExtra).toBe(11.8);
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
