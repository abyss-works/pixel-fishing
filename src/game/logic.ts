// 순수 게임 규칙 — DOM 의존 없음.
// 수치 튜닝은 balance.ts, 콘텐츠는 data/ (이 파일은 기존 import 경로 호환을 위해 re-export).
// 상대경로에 .js 확장자 필수 — 이 파일은 api/save.ts(Vercel Node 함수, 순수 ESM 로더)가
// 그대로 import한다. Vite(브라우저 빌드)는 확장자 없어도 되지만 Node ESM은 필수라
// 둘 다 만족시키려면 .js로 적어야 한다(소스는 .ts, 컴파일 결과가 .js).
import {
  JUDGMENT_MULT, ROD,
  MUTATION_RATE, SIZE_MEAN_BASE, SIZE_MEAN_PER_PRICE, SIZE_STD_RATIO, BIG_CATCH_PERCENTILE,
  VARIANT_PRICE_MULT,
} from './balance.js';
import { RARITY, RARITY_ORDER } from '../data/rarity.js';
import type { RarityId } from '../data/rarity.js';
import { rarityWeightOf } from '../data/spots.js';
import type { SpotId, SpotRegionId } from '../data/spots.js';
import type { LocationRef } from '../data/places.js';
import { FISH } from '../data/fish.js';
import type { Fish, FormId } from '../data/fish.js';
import { BOATS, MAX_BOAT, WALK_BAG_CAP, boatAt } from '../data/boats.js';
import { canBuyBoat, canFish, canUpgradeRod } from './rules.js';

export { JUDGMENT_MULT };
export { RARITY, RARITY_ORDER } from '../data/rarity.js';
export type { Rarity, RarityId } from '../data/rarity.js';
export { SPOTS, powerReqOf, rarityWeightOf } from '../data/spots.js';
export type { Spot, SpotId } from '../data/spots.js';
export { FISH } from '../data/fish.js';
export type { Fish, FormId } from '../data/fish.js';
export { BOATS, MAX_BOAT, WALK_BAG_CAP, boatNameOf } from '../data/boats.js';
export type { Boat } from '../data/boats.js';
export { COUPONS } from '../data/coupons.js';
export { canBuyBoat, canFish, canUpgradeRod, REJECT_TEXT } from './rules.js';
export type { RejectReason, RuleCheck } from './rules.js';

export type Judgment = 'perfect' | 'good' | 'normal' | 'auto';

/** 가방/전시대의 물고기 개체 — 잡는 순간의 문맥을 통째로 새긴다 (세이브 v8).
    팔면 개체는 소멸하고 종×폼별 집계(dex)와 서버 records에 기록만 남는다. */
export interface FishInstance {
  uid: string;                // 개체 식별자 — 판매/전시/이벤트가 이 값으로 개체를 가리킨다
  fishId: string;
  form: FormId;
  size: number | null;        // cm. null = v7 이관 개체 "크기 미상"
  caughtAt: string | null;    // ISO datetime — 명패·부패도·통계 대비
  spot: SpotId | null;        // 포획 수역
  judgment: Judgment | null;  // perfect/normal/auto — 명패 플레이버·통계
  locked: boolean;            // 실수 판매 방지 — 개체 단위 (구버전은 어종 단위였다)
}

/** 종×폼별 도감 기록 — 개체가 사라져도 남는 집계 */
export interface FormRecord {
  count: number;
  maxSize: number | null;   // 역대 최대(cm). null = 크기 미상 기록뿐
  first: string | null;     // 처음 잡은 날 YYYY-MM-DD
}

export interface GameState {
  v: 8;
  gold: number;
  fame: number; // 명성 — 무한 누적, 직접 상태 변화 없음, 구매 시 하한 검증용
  boat: number; // 0(없음, 마을 낚시만)~4
  rod: number;  // 1~∞ (무한 강화, 스탯은 점근 수렴)
  bag: FishInstance[];      // 잡은 개체 목록 (미판매)
  exhibit: FishInstance[];  // 전시대 — v8은 필드만 신설(항상 빈 배열), 액션·UI는 전시 릴리즈에서
  /** 도감 = 종 → 폼 → 기록. 폼이 늘어도 키 하나만 늘어난다 (구 병렬 Record 6개를 흡수) */
  dex: Record<string, Partial<Record<FormId, FormRecord>>>;
  coupons: string[];              // 사용한 쿠폰 코드
  /** 마지막으로 있던 곳 — 새로고침하면 여기서 재개한다(좌표 없이 지역 spawn에서).
   *  전에는 클라 `useState`였어서 태평양에서 새로고침하면 집으로 돌아갔다. */
  location: LocationRef;
  /** 가 본 지역 — 업적("모든 지역 방문")의 근거. events가 아니라 상태에 두는 이유:
   *  events는 보관주기 정책 대상이라 지워지면 진행도가 증발한다
   *  (decisions/save-instancing.md — 통계 수명을 스트림 수명과 분리). */
  visited: SpotRegionId[];
  /** 획득한 아티팩트 id — **슬롯도 장착도 없다.** 한 번 얻으면 영구 적용이라 소유 목록이면 끝.
   *  v8 시점엔 필드만 파둔다(전시대 `exhibit`와 같은 방식) — 이관을 한 번으로 끝내기 위해. */
  artifacts: string[];
}

export interface RodStats {
  biteMin: number; // 입질 최소 대기(초)
  biteMax: number; // 입질 최대 대기(초)
  sweep: number;   // 타이밍 바 커서가 끝까지 가는 시간(초) = 챔질 가능 시간
}

// 낚싯대 성장 곡선 t: 레벨 1 → 0, 레벨 ∞ → 1 (계수는 balance.ROD)
// ⚠️ 구 zone 스탯(레벨당 PERFECT 존 확대)은 폐기됐다 — 존은 이제 전부 수역 파워 게이트의
// 초과 보너스에서 온다(stats.powerZones). 낚싯대는 파워 하나로 존 간접 성장(파워 상승 → 초과 증가).
export function rodCurveT(level: number): number {
  return 1 - 1 / (1 + ROD.curveK * (level - 1));
}

// 낚싯대 = 무한 강화. 스탯은 점근 수렴(상한 없음, 효율 체감) — 무한 플레이 원칙.
export function rodStats(level: number): RodStats {
  const t = rodCurveT(level);
  const lerp = (r: { from: number; to: number }) => r.from + (r.to - r.from) * t;
  return {
    biteMin: lerp(ROD.biteMin),
    biteMax: lerp(ROD.biteMax),
    sweep: lerp(ROD.sweep),
  };
}

export function upgradeCost(level: number): number {
  return Math.round(ROD.costBase * Math.pow(ROD.costGrowth, level - 1));
}

// 챔질 판정: 커서 위치(0~1)가 중앙 존 안이면 GOOD, 그 안의 빨간 존(red 개방 시)이면 PERFECT.
// 존 폭은 바 길이 대비 비율(0~1).
export function judgeTiming(pos: number, yellow: number, red = 0): Judgment {
  const off = Math.abs(pos - 0.5);
  if (red > 0 && off <= red / 2) return 'perfect';
  return off <= yellow / 2 ? 'good' : 'normal';
}

// 추첨 — **2단 구조(v0.6.6)**: balance-metrics.md 1~2절 왜곡의 수정.
//   구버그: 개체마다 등급 가중치 전액(74/20/5/1)을 부여 → 등급당 어종 수가 많은 수역일수록
//   그 등급 확률이 팽창했다(코론 EV 332.7 vs 배리어 리프 172.5 사례).
//   ① 등급 축: 등급 가중치는 그 수역의 **고정 예산**(개체 수와 무관). 수역 오버라이드가 있으면
//     그 값(spots.rarityWeight — 배리어 리프 전설 2), 없으면 글로벌 표를 쓴다(rarityWeightOf).
//     일반 다이얼(commonMult ÷ rareMult — 판정 배수·방치 부스트·해역 게이트·수동 보정 전부)은
//     일반 예산에만 곱한다. 희귀 이상 가중치 데이터는 언제나 원본 유지(단일 다이얼).
//   ② 개체 축: 같은 등급 내선 균등 배분 — 개체 가중치 기본 1(fishWeights로 가중치 부여 가능,
//     그러면 등급 내 배분이 w_i 비율이 된다. 기본값은 n과 동치라 구 균등과 동일).
// 수학적으로 "개체별 유효가중치 = 등급예산 × 다이얼 × 개체가중치"의 단일 누적 추첨과 동치라
// rng 소비는 1회 유지된다(테스트 결정성 계약). 열람용 정규화 뷰는 drawRows.

/** 추첨 시뮬레이션 옵션 — 미지정 필드는 현행 규칙값. 관리자 샌드박스 전용 오버라이드 포함. */
export interface DrawOptions {
  rareMult?: number;                     // 일반 가중치 ÷rareMult (판정 배수)
  commonMult?: number;                   // 일반 가중치 ×commonMult (방치 부스트·게이트 페널티)
  /** 등급 예산 오버라이드 — 샌드박스용(저장 안 됨). 미지 등급은 수역 값 */
  budgets?: Partial<Record<RarityId, number>>;
  /** 개체 가중치 오버라이드 — fishId → 가중치(기본 1). 등급 내 배분 비율을 바꾼다 */
  fishWeights?: Record<string, number>;
}

function drawWeights(pool: Fish[], spotId: SpotId, o: DrawOptions): number[] {
  // 개체 가중치 합을 등급별로 모은다 — 기본(전부 1)이면 합 = 개체 수라 구 균등 배분과 동치
  const fwSum = new Map<RarityId, number>();
  for (const f of pool) {
    fwSum.set(f.rarity, (fwSum.get(f.rarity) ?? 0) + (o.fishWeights?.[f.id] ?? 1));
  }
  return pool.map(f =>
    (o.budgets?.[f.rarity] ?? rarityWeightOf(spotId, f.rarity))
      * (f.rarity === 'common' ? (o.commonMult ?? 1) / (o.rareMult ?? 1) : 1)
      * ((o.fishWeights?.[f.id] ?? 1) / (fwSum.get(f.rarity) ?? 1)));
}

export function rollFish(
  spotId: SpotId, rareMult = 1, rng: () => number = Math.random, commonMult = 1,
  o: DrawOptions = {},
): Fish {
  const pool = FISH.filter(f => f.spot === spotId);

  const weights = drawWeights(pool, spotId, { ...o, rareMult, commonMult });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** 수역 추첨 모델 열람 — 관리자 대시보드 단일 출처(rollFish와 같은 산식, 다이얼 기본 중립).
 *  등급 실질확률이 어종 수와 무관하게 설계 가중치 비율과 일치함을 보여주는 게 절반의 가치다. */
export interface DrawRow {
  fish: Fish;
  rarityWeight: number;     // 등급 예산 (수역 오버라이드/샌드박스 반영)
  gradePct: number;         // 등급 실질확률 % — 설계표와 일치 (부재 등급 제외 재균등)
  individualWeight: number; // 개체 가중치 (기본 1 — fishWeights로 비율 조정 가능)
  fishPct: number;          // 개체 실질확률 %
}
export function drawRows(spotId: SpotId, o: DrawOptions = {}): DrawRow[] {
  const pool = FISH.filter(f => f.spot === spotId);
  const present = new Set<RarityId>();
  for (const f of pool) present.add(f.rarity);

  // 부재 등급은 예산에서 빠지고 나머지가 재균등한다. 샌드박스 budgets도 같은 규칙.
  const budgetTotal = RARITY_ORDER.reduce(
    (s, r) => s + (present.has(r) ? (o.budgets?.[r] ?? rarityWeightOf(spotId, r)) : 0), 0);
  const weights = drawWeights(pool, spotId, o);

  const rows = pool.map((f, i) => ({
    fish: f,
    rarityWeight: o.budgets?.[f.rarity] ?? rarityWeightOf(spotId, f.rarity),
    gradePct: 0, // 아래에서 등급 합계로 확정 — 표시·계산이 한 경로(등급 % ≡ Σ개체 %)
    individualWeight: o.fishWeights?.[f.id] ?? 1,
    fishPct: weights[i] / budgetTotal * 100,
  }));
  const gradeSum = new Map<RarityId, number>();
  for (const row of rows) {
    gradeSum.set(row.fish.rarity, (gradeSum.get(row.fish.rarity) ?? 0) + row.fishPct);
  }
  return rows.map(r => ({ ...r, gradePct: gradeSum.get(r.fish.rarity) ?? 0 }));
}

/** 수역 골드 기댓값 — rollFish와 같은 가중치 산식의 닫힌형(관리자·분석·도구 공용 모듈).
 *  다이얼 기본값 = 중립(판정 없음). 일반 폼 기준이며 변이는 공통 승수라 별도 인자 없음.
 *  budgets/fishWeights를 넘기면 관리자 샌드박스 시나리오의 EV가 된다. */
export function goldEV(
  spotId: SpotId, o: DrawOptions = {},
): number {
  const pool = FISH.filter(f => f.spot === spotId);
  const weights = drawWeights(pool, spotId, o);
  let total = 0, ev = 0;
  for (let i = 0; i < pool.length; i++) {
    total += weights[i];
    ev += weights[i] * pool[i].price;
  }
  return total > 0 ? ev / total : 0;
}

export function newState(): GameState {
  return {
    v: 8, gold: 0, fame: 0, boat: 0, rod: 1,
    bag: [], exhibit: [], dex: {},
    coupons: [],
    location: { kind: 'base', id: 'home' },
    visited: [],
    artifacts: [],
  };
}

// ---------- 도감 파생 (UI는 dex를 직접 파헤치지 않고 이 헬퍼만 읽는다) ----------

export const dexRecord = (
  state: GameState, fishId: string, form: FormId,
): FormRecord | undefined => state.dex[fishId]?.[form];

/** 종 누적 마릿수 = 전 폼 합산 (구 state.caught[id]) */
export const speciesCount = (state: GameState, fishId: string): number =>
  Object.values(state.dex[fishId] ?? {}).reduce((n, r) => n + (r?.count ?? 0), 0);

/** 종 발견 여부 — 폼 무관 (지역 탭 등 "이 종을 아는가") */
export const speciesDiscovered = (state: GameState, fishId: string): boolean =>
  speciesCount(state, fishId) > 0;

/** 폼 발견 여부 — 도감 카드의 ??? 판정 (변이만 잡았으면 일반 폼은 여전히 미발견) */
export const formDiscovered = (state: GameState, fishId: string, form: FormId): boolean =>
  (dexRecord(state, fishId, form)?.count ?? 0) > 0;

export const variantDiscovered = (state: GameState, fishId: string): boolean =>
  formDiscovered(state, fishId, 'variant');

/** 도감에 오른 종 수 (거점 라벨) */
export const dexSpeciesCount = (state: GameState): number =>
  Object.keys(state.dex).filter(id => speciesCount(state, id) > 0).length;

// ---------- 월척(크기)·변이  ----------
// 신규 어종/등급 로직 없이 기존 어종 데이터(price)에서 크기 분포를 유도하는 저비용 콘텐츠.

// 가격이 클수록(대체로 큰 어종일수록) 평균 크기도 커지는 단일 공식 — 어종별 수동 지정 없음
export function sizeParams(fish: Fish): { mean: number; std: number } {
  const mean = SIZE_MEAN_BASE + fish.price * SIZE_MEAN_PER_PRICE;
  return { mean, std: mean * SIZE_STD_RATIO };
}

// Box-Muller 변환으로 정규분포 크기(cm) 롤 — 최소 1cm
export function rollSize(fish: Fish, rng: () => number = Math.random): number {
  const { mean, std } = sizeParams(fish);
  const u1 = Math.max(rng(), Number.EPSILON); // log(0) 방지
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(mean + z * std, 1);
}

// 표준정규 CDF 근사 (Abramowitz-Stegun 7.1.26, 최대오차 1.5e-7) — 의존성 없이 순수 함수로 충분
function stdNormalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741
    + t * (-1.453152027 + t * 1.061405429))));
  const y = 1 - poly * Math.exp(-z * z);
  return 0.5 * (1 + Math.sign(z) * y);
}

// 이 크기가 해당 어종 분포에서 상위 몇 %인지 (도감 상세보기 표시용, 소수 1자리)
export function sizePercentile(fish: Fish, size: number): number {
  const { mean, std } = sizeParams(fish);
  const z = (size - mean) / std;
  return Math.round((1 - stdNormalCdf(z)) * 1000) / 10;
}

export interface CatchExtras {
  size: number;
  form: FormId;
}

// 캐치 시점 부가 롤 — 어종 추첨(rollFish)과 독립적으로 어종당 변이 1종, 확률 고정.
// rng 소비 순서 고정(크기 2회 → 폼 1회) — 바꾸면 시드 기반 테스트가 전부 깨진다
export function rollCatchExtras(fish: Fish, rng: () => number = Math.random): CatchExtras {
  return { size: rollSize(fish, rng), form: rng() < MUTATION_RATE ? 'variant' : 'normal' };
}

// ---------- 개체 (세이브 v8) ----------
// 가방은 FishInstance[] — 구 'id'/'id*' 문자열 엔트리 체계를 대체한다.

/** 폼별 판매가 배수 — 폼 추가 = 행 추가 (없으면 1배) */
const FORM_PRICE_MULT: Partial<Record<FormId, number>> = { variant: VARIANT_PRICE_MULT };

// 판매가 — 가격을 표시하는 모든 UI는 이 함수를 거친다
// (기본가 fish.price를 직접 찍으면 변이 문맥에서 틀린다 — v0.3.3 도감 가격 버그의 원인)
export function priceOf(fish: Fish, form: FormId): number {
  return fish.price * (FORM_PRICE_MULT[form] ?? 1);
}

/** 폼별 표시 이름 — 변이는 변이 이름이 곧 이름 */
export function formName(fish: Fish, form: FormId): string {
  return form === 'variant' ? fish.variant.name : fish.name;
}

export const instanceFish = (inst: FishInstance): Fish | undefined =>
  FISH.find(f => f.id === inst.fishId);

export function priceOfInstance(inst: FishInstance): number {
  const fish = instanceFish(inst);
  return fish ? priceOf(fish, inst.form) : 0;
}

export function instanceName(inst: FishInstance): string {
  const fish = instanceFish(inst);
  return fish ? formName(fish, inst.form) : inst.fishId;
}

/** 캐치 문맥 — 개체에 새겨질 "언제/어디서/어떻게" (호출자가 주입) */
export interface CatchContext {
  uid: string;
  now: string;        // ISO datetime
  spot: SpotId;
  judgment: Judgment;
}

export function makeInstance(fish: Fish, extras: CatchExtras, ctx: CatchContext): FishInstance {
  return {
    uid: ctx.uid, fishId: fish.id, form: extras.form, size: extras.size,
    caughtAt: ctx.now, spot: ctx.spot, judgment: ctx.judgment,
    locked: false, // 새로 잡힌 개체는 잠기지 않는다 — 잠금은 유저가 명시적으로 건다
  };
}

// 캐치 오버레이(획득 카드)용 종합 정보 — 순수 계산이라 로직에 두고 UI는 이 값만 그린다
export interface CatchInfo extends CatchExtras {
  percentile: number; // 크기가 이 어종 분포에서 상위 몇 %인지
  isBig: boolean;      // 상위 BIG_CATCH_PERCENTILE% 안 — "월척"
  isNew: boolean;      // 이번 캐치 전까지 도감에 없던 어종
}

export function buildCatchInfo(fish: Fish, extras: CatchExtras, isNew: boolean): CatchInfo {
  const percentile = sizePercentile(fish, extras.size);
  return { ...extras, percentile, isBig: percentile <= BIG_CATCH_PERCENTILE, isNew };
}

// 쿠폰 — 데이터는 data/coupons.ts, 검증/지급 규칙은 여기
import { COUPONS } from '../data/coupons.js';

export type CouponResult =
  | { ok: true; state: GameState; reward: { gold: number; desc: string } }
  | { ok: false; reason: 'invalid' | 'used' };

// extra — DB(coupons 테이블)에서 조회한 동적 쿠폰. 정적 COUPONS와 병합해 판정한다.
export function redeemCoupon(
  state: GameState, codeRaw: string,
  extra: Record<string, { gold: number; desc: string }> = {},
): CouponResult {
  const code = codeRaw.trim();
  const c = COUPONS[code] ?? extra[code];
  if (!c) return { ok: false, reason: 'invalid' };
  if (state.coupons.includes(code)) return { ok: false, reason: 'used' };
  return {
    ok: true,
    reward: c,
    state: { ...state, gold: state.gold + c.gold, coupons: [...state.coupons, code] },
  };
}

// ---------- 지원 코드 자산 병합 (제재 소프트 랜딩 — incidents/2026-08-24-import-abuse.md) ----------
// 운영자가 발급한 일회성 패키지(gold·fame·rod·boat·dex)를 새 계정 상태에 얹는다.
// 도감은 "기록"이라 **합산하지 않는다** — count·maxSize는 큰 값을 유지하고 first는 더 이른 날을
// 남긴다. 새 계정의 미래 캐치가 위에 더해져도 절대값 정합이 깨지지 않게 하는 게 요점이다.
// 낚싯대·배는 둘 중 큰 값(배는 상한 클램프), 골드·명성은 음수 방어 가산.

export interface ReliefGrant {
  gold: number;
  fame: number;
  rod: number;
  boat: number;
  dex: GameState['dex'];
}

const pickMaxSize = (x: number | null | undefined, y: number | null | undefined): number | null =>
  x == null ? y ?? null : y == null ? x : Math.max(x, y);
const pickEarliest = (x: string | null | undefined, y: string | null | undefined): string | null =>
  x == null ? y ?? null : y == null ? x : x <= y ? x : y;

export function applyRelief(state: GameState, r: ReliefGrant): GameState {
  const dex: GameState['dex'] = {};
  const fishIds = new Set([...Object.keys(state.dex), ...Object.keys(r.dex)]);
  for (const fishId of fishIds) {
    const forms = new Set([
      ...Object.keys(state.dex[fishId] ?? {}),
      ...Object.keys(r.dex[fishId] ?? {}),
    ]);
    for (const form of forms) {
      const a = state.dex[fishId]?.[form as FormId];
      const b = r.dex[fishId]?.[form as FormId];
      if (!a && !b) continue;
      dex[fishId] = {
        ...dex[fishId],
        [form]: {
          count: Math.max(a?.count ?? 0, b?.count ?? 0),
          maxSize: pickMaxSize(a?.maxSize, b?.maxSize),
          first: pickEarliest(a?.first, b?.first),
        },
      };
    }
  }
  return {
    ...state,
    gold: state.gold + Math.max(0, r.gold),
    fame: state.fame + Math.max(0, r.fame),
    rod: Math.max(state.rod, r.rod),
    boat: Math.min(Math.max(state.boat, r.boat), MAX_BOAT),
    dex,
  };
}

// 도감 기록에서 명성 소급 계산 — **마이그레이션 전용**(v3→v4 보상: 명성 도입 전 유저에게
// 잡은 만큼 전부 인정). 구 "fame = computeFame(caught) 불변식"은 폐기됐다: 서버 권위에서
// 상태를 만드는 쪽이 서버라 클라 변조 검증이 성립하지 않고, v8 도감은 폼별로 쪼개져 있다.
// 인자는 v3 시점 스키마(종→마릿수)라 그대로 둔다 — 마이그레이션 체인 내부에서만 호출된다.
export function computeFame(caught: Record<string, number>): number {
  let fame = 0;
  for (const [id, n] of Object.entries(caught)) {
    const f = FISH.find(x => x.id === id);
    if (f && typeof n === 'number') fame += RARITY[f.rarity].fame * n;
  }
  return fame;
}

// ---------- 세이브 마이그레이션 체인  ----------
// 스키마가 바뀔 때마다 "vN → vN+1" 함수 하나를 추가한다. 옛 세이브는 순차 적용으로
// 항상 최신 스키마에 도달 — 하위호환 절대 규칙의 구현.

type AnySave = Record<string, unknown>;

const safeCaught = (s: AnySave): Record<string, number> =>
  typeof s.caught === 'object' && s.caught !== null ? (s.caught as Record<string, number>) : {};

const safeRecord = <T>(v: unknown): Record<string, T> =>
  typeof v === 'object' && v !== null ? (v as Record<string, T>) : {};

// uid: 개체 식별자 생성기 — v7→v8이 구 가방 엔트리를 개체로 합성할 때만 쓴다
const MIGRATIONS: Record<number, (s: AnySave, uid: () => string) => AnySave> = {
  // v1(xp 시절, v 필드 없음) → v2: 배 시스템 도입 — 기존 유저에게 조각배 증정
  1: s => ({ ...s, v: 2, boat: typeof s.boat === 'number' ? s.boat : 1 }),
  // v2 → v3: 배 0단계(없음) 허용 — 필드 변화 없음
  2: s => ({ ...s, v: 3 }),
  // v3 → v4: 명성 도입(도감에서 소급 계산) + 쿠폰 기록
  3: s => ({
    ...s,
    v: 4,
    fame: typeof s.fame === 'number' ? s.fame : computeFame(safeCaught(s)),
    coupons: [],
    location: { kind: 'base', id: 'home' },
    visited: [],
    artifacts: [],
  }),
  // v4 → v5: 어종 잠금 도입 (전부 판매 제외 목록)
  4: s => ({ ...s, v: 5, locked: [] }),
  // v5 → v6: 월척(크기)·변이·첫 조우일 도입 — 병렬 신규 필드, caught 무변경 
  5: s => ({ ...s, v: 6, maxSize: {}, mutated: {}, firstCaught: {} }),
  // v6 → v7: 변이를 "종만 같고 다른 개체"로 분리 (v0.3.3) — mutated(boolean)를 흡수해
  // variantCaught(마릿수)로 승격. 발견만 기록됐던 구세이브는 최소 추정치 1마리로 시딩.
  // 크기/첫 조우일 기록은 폼 구분 없이 쌓였던 것이라 일반 폼 기록으로 간주(근사), 변이 기록은 빈 시작.
  6: s => ({
    ...s,
    v: 7,
    variantCaught: Object.fromEntries(
      Object.entries(safeRecord<boolean>(s.mutated)).filter(([, v]) => v).map(([id]) => [id, 1])),
    variantMaxSize: {},
    variantFirstCaught: {},
    mutated: undefined,
  }),
  // v7 → v8: 물고기를 개체화(FishInstance)하고 병렬 Record 6개를 dex(종→폼→기록)로 접는다.
  // 구 가방 엔트리('carp'/'carp*')는 종·폼만 알 수 있으므로 나머지는 null = "크기 미상" 개체로
  // 합성한다(UI가 폴백을 그린다). 도감 집계는 무손실 — 일반 폼 마릿수 = caught − variantCaught.
  7: (s, uid) => {
    const caught = safeCaught(s);
    const vCaught = safeRecord<number>(s.variantCaught);
    const maxSize = safeRecord<number>(s.maxSize);
    const vMaxSize = safeRecord<number>(s.variantMaxSize);
    const firstCaught = safeRecord<string>(s.firstCaught);
    const vFirstCaught = safeRecord<string>(s.variantFirstCaught);

    const dex: GameState['dex'] = {};
    // 종 목록 = caught ∪ variantCaught (변이만 기록된 손상 세이브도 흡수)
    for (const id of new Set([...Object.keys(caught), ...Object.keys(vCaught)])) {
      const total = typeof caught[id] === 'number' ? caught[id] : 0;
      const vn = Math.max(vCaught[id] ?? 0, 0);
      const normal = Math.max(total - vn, 0); // 음수 클램프 — 손상 세이브 위생
      const forms: Partial<Record<FormId, FormRecord>> = {};
      if (normal > 0) {
        forms.normal = {
          count: normal, maxSize: maxSize[id] ?? null, first: firstCaught[id] ?? null,
        };
      }
      if (vn > 0) {
        forms.variant = {
          count: vn, maxSize: vMaxSize[id] ?? null, first: vFirstCaught[id] ?? null,
        };
      }
      if (forms.normal || forms.variant) dex[id] = forms;
    }

    const bag = (Array.isArray(s.bag) ? s.bag : [])
      .filter((e): e is string => typeof e === 'string')
      .map((e): FishInstance => {
        const fishId = e.endsWith('*') ? e.slice(0, -1) : e;
        return {
          uid: uid(),
          fishId,
          form: e.endsWith('*') ? 'variant' : 'normal',
          size: null, caughtAt: null, spot: null, judgment: null, // 이관 개체 = 크기 미상
          // 어종 잠금(v5~v7) → 개체 잠금. 잠갔던 종의 개체는 전부 잠긴 채로 넘어온다
          locked: Array.isArray(s.locked) && s.locked.includes(fishId),
        };
      });

    return {
      ...s, v: 8, bag, exhibit: [], dex, locked: undefined,
      caught: undefined, maxSize: undefined, firstCaught: undefined,
      variantCaught: undefined, variantMaxSize: undefined, variantFirstCaught: undefined,
    };
  },
};

const safeStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

// 위치 위생 — 모르는 값이면 집으로. 지역 id 목록을 여기서 검사하지 않는 이유:
// 어느 지역이 존재하는지는 world 소관이고 game은 그걸 보지 않는다(의존 단방향).
// 없는 지역이 들어와도 부팅 시 App이 팩을 못 찾으면 집으로 떨어진다.
function safeLocation(v: unknown): LocationRef {
  const l = v as Partial<LocationRef> | undefined;
  if (l && typeof l.id === 'string') {
    if (l.kind === 'region') return { kind: 'region', id: l.id as SpotRegionId };
    if (l.kind === 'base') return { kind: 'base', id: l.id === 'harbor' ? 'harbor' : 'home' };
  }
  return { kind: 'base', id: 'home' };
}

// 개체 위생 — uid/fishId/form이 성립하지 않는 항목은 버린다 (손상 세이브·수입 방어)
function safeInstances(v: unknown, uid: () => string): FishInstance[] {
  if (!Array.isArray(v)) return [];
  const out: FishInstance[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const i = raw as Partial<FishInstance>;
    if (typeof i.fishId !== 'string') continue;
    out.push({
      uid: typeof i.uid === 'string' && i.uid ? i.uid : uid(),
      fishId: i.fishId,
      form: i.form === 'variant' ? 'variant' : 'normal',
      size: typeof i.size === 'number' ? i.size : null,
      caughtAt: typeof i.caughtAt === 'string' ? i.caughtAt : null,
      spot: typeof i.spot === 'string' ? i.spot : null,
      judgment: i.judgment === 'perfect' || i.judgment === 'normal' || i.judgment === 'auto'
        ? i.judgment : null,
      locked: i.locked === true,
    });
  }
  return out;
}

// 도감 위생 — 종→폼→기록 3중 구조 검사. 모르는 폼 키는 버리지 않고 통과시킨다
// (미래 폼이 붙은 세이브를 구 코드가 열었다가 되돌아와도 기록이 날아가지 않게)
function safeDex(v: unknown): GameState['dex'] {
  const out: GameState['dex'] = {};
  for (const [id, forms] of Object.entries(safeRecord<unknown>(v))) {
    if (typeof forms !== 'object' || forms === null) continue;
    const kept: Partial<Record<FormId, FormRecord>> = {};
    for (const [form, rec] of Object.entries(forms as Record<string, unknown>)) {
      if (typeof rec !== 'object' || rec === null) continue;
      const r = rec as Partial<FormRecord>;
      if (typeof r.count !== 'number' || r.count <= 0) continue;
      kept[form as FormId] = {
        count: r.count,
        maxSize: typeof r.maxSize === 'number' ? r.maxSize : null,
        first: typeof r.first === 'string' ? r.first : null,
      };
    }
    if (Object.keys(kept).length > 0) out[id] = kept;
  }
  return out;
}

/** uidGen: 이관 개체에 붙일 식별자 생성기 — 순수성 유지를 위한 주입 지점
    (기본값만 전역 crypto를 읽는다. Node 19+/모든 근래 브라우저에 존재) */
export function migrate(raw: unknown, uidGen: () => string = () => crypto.randomUUID()): GameState {
  const base = newState();
  if (typeof raw !== 'object' || raw === null) return base;
  let s: AnySave = { ...(raw as AnySave) };
  let v = typeof s.v === 'number' ? s.v : 1;
  while (v < base.v) {
    const step = MIGRATIONS[v];
    if (!step) break;
    s = step(s, uidGen);
    v++;
  }
  // 최종 위생 처리 — 손상된 필드는 기본값으로
  return {
    ...base,
    gold: typeof s.gold === 'number' ? s.gold : 0,
    fame: typeof s.fame === 'number' ? s.fame : 0,
    boat: typeof s.boat === 'number' ? s.boat : 0,
    rod: typeof s.rod === 'number' ? s.rod : 1,
    bag: safeInstances(s.bag, uidGen),
    exhibit: safeInstances(s.exhibit, uidGen),
    dex: safeDex(s.dex),
    coupons: safeStrings(s.coupons),
    location: safeLocation(s.location),
    visited: safeStrings(s.visited) as SpotRegionId[],
    artifacts: safeStrings(s.artifacts),
  };
}

// ---------- 상태 변경 ----------

// 로컬 기준 오늘 날짜 — toISOString은 UTC라 KST 오전 9시 전 캐치가 전날로 찍힌다
export function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 개체를 가방에 넣고 도감(dex)을 갱신한다 — 폼 분기 없이 dex[id][form] 키 접근 하나.
// today는 주입(순수성): caughtAt(ISO/UTC)에서 날짜를 잘라 쓰면 KST 오전 9시 전 캐치가
// 전날로 찍힌다 (v0.3.1 firstCaught UTC 버그 재발 금지).
export function addCatch(
  state: GameState, inst: FishInstance, fish: Fish, today: string = localDate(),
): GameState {
  const prev = state.dex[inst.fishId]?.[inst.form];
  const rec: FormRecord = {
    count: (prev?.count ?? 0) + 1,
    maxSize: inst.size === null
      ? (prev?.maxSize ?? null)
      : Math.max(prev?.maxSize ?? 0, inst.size),
    first: prev?.first ?? today, // 최초 1회만
  };
  return {
    ...state,
    bag: [...state.bag, inst],
    dex: { ...state.dex, [inst.fishId]: { ...state.dex[inst.fishId], [inst.form]: rec } },
    fame: state.fame + RARITY[fish.rarity].fame,
  };
}

// ---------- 가방 용량 ----------
// "가장 안 특별한" 순서 — 놓아줄 후보를 고르는 단일 기준.
// 등급 → 폼(변이가 더 특별) → 크기 → uid(결정성). 크기 미상(이관 개체)은 가장 작은 것 취급:
// 정보가 없는 개체를 붙들고 있을 이유가 없고, 기록은 어차피 records에 남는다.
const blandness = (i: FishInstance): [number, number, number, string] => {
  const fish = instanceFish(i);
  return [
    fish ? RARITY[fish.rarity].order : -1, // 삭제된 어종은 맨 먼저 (표시도 안 되는 개체)
    i.form === 'variant' ? 1 : 0,
    i.size ?? -1,
    i.uid,
  ];
};

/** 이 가방에 실제로 적용되는 상한 — **래칫**이다. 이미 상한을 넘겨 들고 있으면 그 수가 상한이 된다.
 *
 * v0.4.0 가방은 어종 문자열 배열이라 수천 마리를 쌓아둔 유저가 있다. 고정 상한을 그대로 들이대면
 * 이관 후 **첫 캐치 한 번에 수천 마리가 골드 0원에 방생된다** — 방생은 명성만 남기는데 명성은
 * 이미 받은 뒤라 순수 손실이다. 상한의 뜻은 "더 담지 못한다"지 "몰수한다"가 아니다.
 *
 * 래칫이면 자산을 하나도 건드리지 않고 의미가 성립한다: 넘겨 든 유저는 **늘리지 못할 뿐**이고,
 * 팔아서 기본 상한 아래로 내려오면 그때부터 평소 규칙이 적용된다. 골드를 지어내지도 않는다.
 */
export const bagCapacity = (boat: number, bag: readonly FishInstance[]): number =>
  Math.max(capOfBoat(boat), bag.length);

// boat는 상태에서 항상 0..MAX_BOAT로 정규화되지만, 방어적으로 범위 밖이면 클램프한다.
// 맨발(0)은 BOATS 행이 없으므로 WALK_BAG_CAP, 이상은 행의 bagCap을 쓴다.
const capOfBoat = (boat: number): number =>
  boat < 1 ? WALK_BAG_CAP : boatAt(boat)!.bagCap;

/** 넘친 만큼 놓아줄 개체를 고른다 — 잠근 개체는 절대 후보가 아니다 */
export function overflowUids(bag: readonly FishInstance[], capacity: number): string[] {
  const over = bag.length - capacity;
  if (over <= 0) return [];
  const candidates = bag.filter(i => !i.locked)
    .sort((a, b) => {
      const x = blandness(a), y = blandness(b);
      return (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]) || x[3].localeCompare(y[3]);
    });
  // 전부 잠갔으면 놓아줄 게 없다 — 상한을 넘긴 채로 둔다.
  // 잠금은 유저가 개체마다 명시적으로 건 것이고, 여기서 캐치를 거부하면 실패 페널티가 된다.
  return candidates.slice(0, over).map(i => i.uid);
}

/** 방생 — 개체만 사라진다. 명성·도감은 잡는 순간 이미 확정됐으므로 건드리지 않는다 */
export function release(state: GameState, uids: readonly string[]): GameState {
  if (uids.length === 0) return state;
  const gone = new Set(uids);
  return { ...state, bag: state.bag.filter(i => !gone.has(i.uid)) };
}

export function bagValue(state: GameState): number {
  return state.bag.reduce((s, i) => s + priceOfInstance(i), 0);
}

// 판매 가능액 = 가방 중 잠기지 않은 개체만 (잠금 = 실수 판매 방지, R1b)
export function sellableValue(state: GameState): number {
  return state.bag
    .filter(i => !i.locked)
    .reduce((s, i) => s + priceOfInstance(i), 0);
}

// 선택 판매 — uid로 개체를 지목한다 (판매의 원자 단위 = 개체).
// 잠근 개체는 uid가 와도 팔리지 않는다(이중 방어)
export function sellSelected(state: GameState, uids: readonly string[]): GameState {
  const want = new Set(uids);
  const sold = state.bag.filter(i => want.has(i.uid) && !i.locked);
  const soldUids = new Set(sold.map(i => i.uid));
  return {
    ...state,
    gold: state.gold + sold.reduce((s, i) => s + priceOfInstance(i), 0),
    bag: state.bag.filter(i => !soldUids.has(i.uid)),
  };
}

// 전부 판매 — 잠근 개체는 가방에 남는다
export function sellAll(state: GameState): GameState {
  return sellSelected(state, state.bag.map(i => i.uid));
}

// 장소 이동 — 위치를 기록하고, 지역이면 방문 목록에 넣는다.
// **게이트를 여기서 검증하지 않는다.** 낚시는 `canFish`가 서버에서 배 단계를 재검증하므로
// 클라가 못 갈 지역을 주장해도 얻는 게 없다. 이 액션의 목적은 보안이 아니라
// **새로고침 후 재개 위치**와 **방문 기록**이다.
export function travel(state: GameState, to: LocationRef): GameState {
  const visited = to.kind === 'region' && !state.visited.includes(to.id)
    ? [...state.visited, to.id]
    : state.visited;
  return { ...state, location: to, visited };
}

// 개체 잠금 토글 — uid 목록을 받아 **일괄 지정**한다.
// 목록을 받는 이유: 가방 행 머리의 "이 종 전부 잠금"이 개체 N개를 한 액션으로 바꿔야 하고,
// 토글이 아니라 지정이라야 부분 잠금 상태에서 눌러도 결과가 예측 가능하다.
export function setLocked(state: GameState, uids: readonly string[], locked: boolean): GameState {
  const want = new Set(uids);
  return {
    ...state,
    bag: state.bag.map(i => (want.has(i.uid) && i.locked !== locked ? { ...i, locked } : i)),
  };
}

/** 자동 잠금 후보 — 어종×폼별 **가장 큰 개체**의 uid (v0.6.4).
 *  "잠그는 것도 일이다": 종별 최고 기록을 한 번에 판매 보호한다.
 *  - 그룹 최대가 이미 잠겨 있으면 그 그룹은 건너뛴다 — 목표(최대 1마리 보호)가 이미 달성됐고,
 *    눌렀을 때 결과가 변하지 않는 게 예측 가능성이다. 다른 개체의 기존 잠금은 절대 건드리지 않는다
 *    (잠금 해제는 이 함수 책임이 아니다 — 적용도 setLocked(uids, true) 하나뿐).
 *  - 크기 미상(null)은 최소 취급(blandness와 같은 규약), 동률은 uid 사전순으로 결정적.
 *  선택은 이 순수 함수, 적용은 기존 액션 — 서버 권위 경로 재사용(v0.5.0). */
export function autoLockUids(bag: readonly FishInstance[]): string[] {
  const bigger = (a: FishInstance, b: FishInstance): boolean => {
    const as = a.size ?? -1, bs = b.size ?? -1;
    return as > bs || (as === bs && a.uid.localeCompare(b.uid) < 0);
  };
  const top = new Map<string, FishInstance>();
  for (const i of bag) {
    const k = `${i.fishId}|${i.form}`;
    const cur = top.get(k);
    if (!cur || bigger(i, cur)) top.set(k, i);
  }
  return [...top.values()].filter(i => !i.locked).map(i => i.uid).sort();
}

// 아래 셋은 **판정을 rules.ts에 위임**한다  — 규칙의 단일 근원은 거기 하나다.
// 여기 남는 것은 "허용됐을 때 상태를 어떻게 바꾸는가"뿐. 반환 형태(null)는 기존 계약 유지.

// 낚싯대 강화: 골드 박치기, 상한 없음 (무한 골드 싱크)
export function tryUpgrade(state: GameState): GameState | null {
  if (!canUpgradeRod(state).ok) return null;
  return { ...state, gold: state.gold - upgradeCost(state.rod), rod: state.rod + 1 };
}

// 배 구매: 골드 차감 + 명성 하한 검증(명성은 소모하지 않음). boat 0 → 조각배부터.
export function tryBuyBoat(state: GameState): GameState | null {
  if (!canBuyBoat(state).ok) return null;
  const next = BOATS[state.boat]; // tier = boat+1
  return { ...state, gold: state.gold - next.price, boat: next.tier };
}

// 해역 낚시 자격: 배 단계 (마을 연못/강은 0 = 항상 가능)
export function canFishSpot(state: GameState, spotId: SpotId): boolean {
  return canFish(state, spotId).ok;
}

// 항해 속도 — 배가 있어야 대양에 나갈 수 있으므로 boat>=1 전제
export function boatSpeed(state: GameState): number {
  return BOATS[Math.max(state.boat, 1) - 1].speed;
}
