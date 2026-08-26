// 스탯 서비스 — 파생 스탯의 단일 출구 (next.md 1, v0.6.1)
// UI가 규칙을 재구현해 드리프트하는 것을 막는다(선례: rules.ts). 모든 파생은
// { base, mods[], value }를 담는다 — 기여 내역 구조. `항해 속도 115 = 통통배 115 ·
// 밤 −15 · 어선 조명 +15`처럼 환경 요소가 생기면 mods 행 하나로 얹힌다(아직 없음).
//
// 표시 원칙(사용자 확정 2026-08-24): 낚싯대는 **파워 한 축**이고 나머지 성능은 전부
// 계산값이다. 시간 항목은 스탯창에 내지 않고, PERFECT 존·희귀 어드밴티지 등은 수역별로
// 다르게 갈 예정이라 절대값 표를 만들지 않는다 — 파워의 도움말로만 보여준다.
//
// 순수 곡선(rodStats·boatSpeed)은 logic에 남긴다: AdminPanel 가상 레벨 표와
// FacilityModal 미리보기(rod+1)가 여전히 레벨만으로 계산해야 하므로(next.md 주의).
import { autoCommonBoost } from './fishing.js';
import { relativeIdleBoost, manualPowerBonus, MANUAL_POWER_BONUS } from './power.js';
import { boatSpeed, rodStats } from './logic.js';
import type { GameState } from './logic.js';
import { AUTO_COMMON_BOOST, WALK_SPEED } from './balance.js';
import type { SpotId } from '../data/spots.js';
import { SPOTS } from '../data/spots.js';

export interface StatMod {
  id: string;    // 기여 원 식별자 — 낚싯대/밤/아티팩트…
  label: string; // 스탯창 표시명
  delta: number; // value = base + Σ delta
}

export interface Stat {
  base: number;
  mods: StatMod[];
  value: number;
}

const stat = (base: number, mods: StatMod[] = []): Stat => ({
  base, mods, value: mods.reduce((v, m) => v + m.delta, base),
});

export type Movement = 'walk' | 'sail';

// 이동 속도(px/s) — 씬 movement로 분기. 마을 도보는 배와 무관한 고정값.
export function moveSpeed(state: GameState, movement: Movement): Stat {
  return stat(movement === 'walk' ? WALK_SPEED : boatSpeed(state));
}

// 낚싯대 축 — 파워(레벨) 하나에서 파생되는 어드밴티지 (roadmap 2.1).
// 렌더(타이밍 바)가 쓴다; 스탯창에는 절대값을 나열하지 않는다(표시 원칙 주석).
// ⚠️ 구 zone 축은 폐기 — 존은 이제 수역 파워 게이트(powerZones)가 전담한다.
export interface RodAxes {
  biteMin: Stat;
  biteMax: Stat;
  sweep: Stat;
}

export function rodAxes(state: GameState): RodAxes {
  const st = rodStats(state.rod);
  return {
    biteMin: stat(st.biteMin),
    biteMax: stat(st.biteMax),
    sweep: stat(st.sweep),
  };
}

/** 현재 해역 대비 유효 입질 대기 — 상대치. 초과 시 더 빠르고 미달 시 느리다.
 *  진입 파워 대비로 보간: 진입에서 base, 10배 파워에서 30% 빠름. 미달은 powerZones의 biteExtra를 그대로 쓴다.
 */
export function effectiveBite(state: GameState, spotId: SpotId): { min: Stat; max: Stat } {
  const st = rodStats(state.rod);
  const entry = SPOTS.find(s => s.id === spotId)?.powerReq ?? 0;
  const power = rodPower(state);
  const baseMin = st.biteMin, baseMax = st.biteMax;

  if (power >= entry && entry > 0) {
    const upper = entry * 10;
    const t = Math.min(1, Math.max(0, (power - entry) / (upper - entry)));
    const factor = 1 - 0.3 * t; // 최대 30% 단축
    const minVal = baseMin * factor;
    const maxVal = baseMax * factor;
    return {
      min: stat(baseMin, [{ id: 'power', label: `${SPOTS.find(s => s.id === spotId)!.name} 파워 보정`, delta: minVal - baseMin }]),
      max: stat(baseMax, [{ id: 'power', label: `${SPOTS.find(s => s.id === spotId)!.name} 파워 보정`, delta: maxVal - baseMax }]),
    };
  }
  // 미달: 기존 biteExtra 그대로 가산
  const pz = powerZones(state, spotId);
  if (pz.biteExtra > 0) {
    return {
      min: stat(baseMin, [{ id: 'power', label: '파워 부족', delta: pz.biteExtra }]),
      max: stat(baseMax, [{ id: 'power', label: '파워 부족', delta: pz.biteExtra }]),
    };
  }
  return { min: stat(baseMin), max: stat(baseMax) };
}

// 방치(auto) 판정의 일반 등급 가중치 배수 — 강화할수록 수동에 가까워진다(×10 → ×4 수렴).
// 계산 자체는 fishing.autoCommonBoost가 정본(서버 리듀서도 같은 함수를 쓴다) — 여기는 내역 조립.
// 절대치 버전 (레거시, 테스트 호환). 새 코드는 spot 상대치인 autoBoostForSpot을 쓴다.
export function autoBoost(state: GameState): Stat {
  const value = autoCommonBoost(state.rod);
  return stat(AUTO_COMMON_BOOST.from, [
    { id: 'rod', label: `낚싯대 Lv.${state.rod}`, delta: value - AUTO_COMMON_BOOST.from },
  ]);
}

export function autoBoostForSpot(state: GameState, spotId: SpotId): Stat {
  const entry = SPOTS.find(s => s.id === spotId)?.powerReq ?? 0;
  const base = AUTO_COMMON_BOOST.from;
  const value = entry > 0
    ? relativeIdleBoost(rodPower(state), entry)
    : autoCommonBoost(state.rod);
  const label = entry > 0 ? `${SPOTS.find(s => s.id === spotId)!.name} 대비` : `낚싯대 Lv.${state.rod}`;
  return stat(base, [{ id: 'power', label, delta: value - base }]);
}

// 수동 파워 보정의 수역 조립 — 스탯창 표시용 내역(코어는 power.manualPowerBonus, 리듀서도 공유).
export function manualBonusForSpot(state: GameState, spotId: SpotId): Stat {
  const entry = SPOTS.find(s => s.id === spotId)?.powerReq ?? 0;
  const value = manualPowerBonus(rodPower(state), entry);
  return stat(MANUAL_POWER_BONUS.base, [
    { id: 'power', label: '수역 요구 대비 초과', delta: value - MANUAL_POWER_BONUS.base },
  ]);
}

// 파워 수치화 — 해역 게이트가 레벨 단위 하드코딩이 아니라 이 숫자 하나를 보게 한다
// (roadmap 2.1 "데이터 테이블 하나" 원칙). 레벨당 5씩 단조 증가(단순 선형).
export function rodPower(state: GameState): number {
  return powerOfLevel(state.rod);
}

// ---------- 해역 파워 게이트 (사용자 확정 2026-08-25 — 파워 기반 존, 낚싯대 zone 스탯 폐기) ----------
// 초과(파워 ≥ 요구량): 총 보너스 폭 = min(100, 초과+10)% — 기본 10%에 초과분을 더한다.
//   빨간 존이 최대 20%p를 먼저 차지하고 나머지가 노란 존이다. 예: 초과 0 → 노란 10 /
//   초과 50 → 빨간 20 + 노란 40 / 초과 100 → 20 + 80. 빨간 존은 초과 30%p부터 개방 —
//   PERFECT 판정(일반 가중치 ÷2).
// 미달(파워 < 요구량): 존 자체가 없고, 투트랙 페널티 —
//   ① 확률: 일반 가중치 ×2^(⌊부족/10⌋+1) — 급격 스케일링, 캡 없음
//   ② 시간: 입질 대기 +부족/5초
export interface PowerZone {
  power: number;      // 내 파워
  req: number;        // 수역 요구량 (0 = 제한 없음)
  yellow: number;     // 노란(PERFECT) 존 폭 % — 미달이면 0
  red: number;        // 빨간(PERFECT) 존 폭 % — 상한 20, 기본 0
  mult: number;       // 일반 가중치 배수 — 초과 시 1, 미달 시 지수 페널티(2^…)
  biteExtra: number;  // 입질 대기 추가 초 — 미달 시 부족/5, 초과 시 0
}

const RED_MIN_EXCESS = 30; // 빨간 존이 열리는 최소 초과(%p)
const RED_CAP = 20;        // 빨간 존 폭 상한(%p)

/** 파워 게이트 규칙 상수 — AdminPanel 개발자 화면이 같은 값을 보여준다(단일 출처).
 *  값 변경은 서버 리듀서와 함께 배포돼야 한다 — 클라만 바꾸면 판정이 갈라진다. */
export const POWER_RULES = {
  redMinExcess: RED_MIN_EXCESS,
  redCap: RED_CAP,
  shortStep: 10, // 미달 페널티 구간(파워 10당 배수 2배)
  shortCap: 16,  // 미달 확률 페널티 상한 — 무캡 지수는 통제 불가라 상한을 둔다
  biteDiv: 4,    // 입질 추가 초 = 부족 파워 / 이 값
  lineCutMs: 2000, // 미달 수역 — 던진 뒤 이 시간이 지나면 물고기가 바늘을 끊어먹는다
} as const;

export function powerOfLevel(level: number): number {
  return 10 + (level - 1) * 5;
}

/** 파워·요구량만으로 존/페널티 계산 — powerZones의 순수 코어(시뮬레이터가 직접 쓴다) */
export function zonesFor(power: number, req: number): Omit<PowerZone, 'power' | 'req'> {
  const d = power - req;
  if (d >= 0) {
    // 빨간 존이 총 보너스 폭에서 **먼저** 20%p를 차지하고 나머지가 노란 초다(위 주석 예시).
    // 초과 30~50 구간에선 노란이 늘지 않고 빨간이 채운다 — 미차감 시 이중 계산(v0.6.4 수정).
    const red = d > POWER_RULES.redMinExcess ? Math.min(POWER_RULES.redCap, d - POWER_RULES.redMinExcess) : 0;
    return { yellow: Math.min(100, d + 10) - red, red, mult: 1, biteExtra: 0 };
  }
  const short = req - power;
  return {
    yellow: 0, red: 0,
    mult: Math.min(POWER_RULES.shortCap, 2 ** (Math.floor(short / POWER_RULES.shortStep) + 1)),
    biteExtra: short / POWER_RULES.biteDiv,
  };
}

export function powerZones(state: GameState, spotId: SpotId): PowerZone {
  const power = rodPower(state);
  const req = SPOTS.find(s => s.id === spotId)?.powerReq ?? 0;
  return { power, req, ...zonesFor(power, req) };
}

// 도움말 문장 — 스탯창 HelpHint가 띄운다. UI가 규칙 서술을 재작성하지 않게 서비스가 든다.
// 톤 규칙: **로어 서술체, 수치 금지**(mgmt/spec/writing-voice.md) — 숫자는 각 행이 이미
// 보여주고, 손으로 적은 수치는 밸런스를 바꾸는 순간 옛값으로 남는다(HelpPanel 선례).

export function powerHelpText(): string {
  return '강해질수록 입질은 빨라지고 바늘을 견디는 시간도 늘어난다. '
    + '다만 해역마다 요구하는 파워가 달라서, 같은 낚싯대가 다르게 듣는다.';
}

export function autoPenaltyHelpText(): string {
  return '방치로 낚을 때는 희귀한 어종이 잘 걸리지 않는다. 낚싯대가 강할수록 그 차이는 줄어든다.';
}
