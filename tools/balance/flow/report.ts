// 플레이 흐름 시뮬레이션 명령의 인자 해석, 실행, 출력.
// 계산은 각 지표 모듈이 하고 여기서는 모아서 표로 찍는다. 같은 인자의 출력은 항상 같다(시각을 쓰지 않고 난수는 시드를 고정한다).
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { zoneById } from '../../../src/game/content/zones';
import { BOUNTY_ZONES } from '../../../src/game/content/bounties';
import type { BountyTier } from '../../../src/game/content/bounties';
import { FIRST_CATCH_EPIC_AT, FIRST_CATCH_LEGEND_MAX, FIRST_CATCH_LEGEND_MIN } from '../../../src/game/rules/firstCatch';
import { entryLevel } from '../model';
import { FAME_RATIO_LIMIT, OPENING_LIMIT_SEC, PERFECT_LIMIT } from '../gates';
import type { GateVerdict } from '../gates';
import { gatesReport, verdictCounts, verdictList } from './gateReport';
import type { GatesReport } from './gateReport';
import { applyOverride, loadOverride } from './override';
import type { FlowOverride } from './override';
import { DAY_HOURS } from './progress';
import type { Achieved, FlowAxis, RatePlan } from './progress';
import { transitionReport } from './transitions';
import type { TransitionReport } from './transitions';
import { daysReport } from './days';
import type { DaysReport } from './days';
import { OPENING_TARGET_SEC, simulateOpening } from './opening';
import type { Judgment, OpeningResult } from './opening';
import { evReport } from './ev';
import type { EvReport } from './ev';
import { DEFAULT_SEED, DEFAULT_TRIALS, openingDist, rewardDist, transitionDist } from './dist';
import type { OpeningDist, RewardDistRow, TransitionDist } from './dist';
import { rewardPlan, rewardRows } from './achievement';
import type { RewardRow } from './achievement';
import type { Dist } from './sample';
import { TRAVEL_MATERIAL, TRAVEL_SAMPLE_DAYS, TRAVEL_SAMPLE_START, travelRows } from './travel';
import type { TravelRow } from './travel';
import { OFFSETS, earlyEntry, huntCost, incomeByOffset, returnTrips } from './exception';
import type { EarlyEntryRow, HuntRow, IncomeRow, ReturnTrip } from './exception';
import { BOATS } from '../../../src/game/content/boats';
import { RARITY, RARITY_ORDER } from '../../../src/game/content/rarity';
import type { RarityId } from '../../../src/game/content/rarity';
import { DEFAULT_UNITS, NO_EFFECT, checkEffect, dexRows, earlyRows, gradeBoostOf, incomeRows, supplyRows } from './effects';
import type { DexTimes, Effect, EffectsReport } from './effects';
import { COOKING_UNLOCK_BOAT } from '../../../src/game/content/cooking';
import { BAIT_WINDOW_MIN, LUNCH_HOURS, MIN_VISIT_HOURS, RECIPES, bagSupplyRows, baitEffect, effectPlan, parseCostSpec, recipeRows, recipesCovered, windowRows, withCostOverrides } from './cooking';
import type { BagSupplyRow, CostOverrides, RecipeRow, WindowRow } from './cooking';

export type Command = 'transition' | 'days' | 'opening' | 'exception' | 'ev' | 'gates' | 'dist' | 'travel' | 'effects' | 'window' | 'recipes' | 'achievements';
/** 명령을 생략하면 내는 지표 명령 — gates(판정), dist(몬테카를로), travel(이동 측정)은 이름을 줄 때만 실행한다 */
export const COMMANDS: readonly Command[] = ['transition', 'days', 'opening', 'exception', 'ev'];
const NAMED_COMMANDS: readonly Command[] = [...COMMANDS, 'gates', 'dist', 'travel', 'effects', 'window', 'recipes', 'achievements'];
/** 진행 업적 보상을 넣은 관측을 내는 명령 */
const REWARD_COMMANDS: readonly Command[] = ['transition', 'days', 'dist'];
/** achievements 명령이 보상 비율을 주지 않았을 때 내는 기본 비율(%) */
export const DEFAULT_REWARD_PERCENTS: readonly number[] = [20, 25, 30];
/** 효과 옵션을 받는 명령 */
const EFFECT_COMMANDS: readonly Command[] = ['effects', 'window', 'transition', 'days', 'gates'];
/** 효과를 넣은 진행 시뮬레이션(관측용)을 내는 명령 */
const PLAN_COMMANDS: readonly Command[] = ['transition', 'days', 'gates'];

export interface FlowOptions {
  commands: Command[];
  override: string | null;
  json: boolean;
  /** 전설 보장 번호. null이면 제품 범위의 처음, 가운데, 끝 번호를 모두 낸다 */
  legendAt: number | null;
  axis: FlowAxis;
  /** --axis를 직접 줬는가. window의 재료 모으기 방식이 recipes와 같은 규칙(줬으면 그 방식, 아니면 방치)을 따르게 한다 */
  axisGiven: boolean;
  maxDays: number;
  help: boolean;
  /** dist의 난수 시드와 시도 횟수 */
  seed: number;
  trials: number;
  /** effects의 효과 매개변수, 재는 낚싯대 레벨 여유(진입 레벨에 더한다), 분해 재료의 등급별 단위 */
  effect: Effect;
  margin: number;
  units: Record<RarityId, number>;
  /** window의 효과 창 길이(분) */
  windowMinutes: number;
  /** recipes의 레시피 거름(없으면 전부), effects와 window에서는 그 레시피의 효과를 효과 옵션에 채운다 */
  recipe: string | null;
  /** recipes의 가방 공급 시간(시간) */
  hours: number;
  /** recipes, window: 레시피 기운 수량 덮어쓰기(레시피 id별 등급별 개수). 측정 입력만 바꾸고 콘텐츠는 바꾸지 않는다 */
  cost: Record<string, Partial<Record<RarityId, number>>>;
  /** recipes의 집 기운 얻기 공급: 수동 낚시 비율(0~1), 집에 들르는 간격(시간), 공급의 낚싯대 레벨 여유. null이면 지정 안 함 */
  manualShare: number | null;
  visitHours: number | null;
  rodOffset: number | null;
  /** transition, gates: 일반 의뢰와 네임드 토벌을 매일 수행하는 경우로 잰다 */
  bounty: boolean;
  /** transition, days, gates: 효과가 걸리기 시작하는 배 단계. null이면 인도양을 여는 배 */
  fromBoat: number | null;
  /** transition, days, gates: --recipe의 재료 판매 손실을 비용으로 넣는다 */
  withCost: boolean;
  /** 진행 업적 보상 비율(0 초과 1 이하). achievements는 여러 개, transition, days, dist는 하나다. 비어 있으면 보상을 넣지 않는다 */
  rewards: number[];
  /** 기본 업적이 받는 몫(0 이상 1 이하). 나머지는 네임드 업적이 받는다. null이면 주지 않았다 */
  rewardSplit: number | null;
}

export const HELP = `사용: pnpm balance:flow [transition|days|opening|exception|ev|gates|dist|travel|effects|window|recipes|achievements] [옵션]
명령을 생략하면 gates, dist, travel, effects를 뺀 다섯 가지를 모두 낸다.

명령
  transition  해역 전환(효과 옵션을 주면 효과를 넣은 관측값과 효과 없음 대비 차이를 함께 낸다): 전환 골드(다음 진입 레벨까지 강화비 + 새 배 가격)와 비중, 전환 시간(실질 낚시 시간)과 8시간 환산 일수, 배 명성 대기
  days        해역별 누적 실질 낚시 시간과 8시간 환산 일수, 마지막 해역 레벨업 시간. 일반 의뢰와 네임드 토벌 수행 여부별(효과 옵션을 주면 효과를 넣은 관측값과 효과 없음 대비 차이를 함께 낸다)
  opening     최초 10분: 수동 낚시로 첫 바다 해역에 닿는 시간. 영웅 1회와 전설 1회 보장
  exception   예외 흐름: 진입 레벨 -4부터 +4까지 수입, 조기 진입, 낮은 지역으로 돌아옴, 네임드 토벌 비용
  ev          방치 EV: 해역별 방치 시간당 기대 골드(딱렙, 다음 진입 직전), 구역 대표 EV, 의뢰·토벌 보상의 EV 시간 환산과 목표 대비 차이, 새 보상과 변화율. 항상 방치 기준이다
  dist        분포: 같은 규칙과 상수로 캐치마다 뽑는 몬테카를로. 최초 10분(영웅 보장, 전설 보장, 첫 바다 해역 도착 시각)과 해역 전환 시간의 p10, 중앙값, p90, 평균을 해석 기댓값과 함께 낸다. p90이 운이 나쁜(느린) 쪽이다
  travel      이동 시간 관측: 가방이 차면 거점에 가서 팔고 돌아오는 왕복이 낚시 시간에서 차지하는 비중을 해역별로 잰다. 다른 명령의 시간에 넣지 않는다
  effects     요리 효과: 효과를 넣었을 때 해역별 수입(골드·명성 변화, 네임드 조우), 도감 완성 시간(몬테카를로), 낚시 1시간 분해 재료 공급을 효과 없음과 견준다. 효과는 아래 옵션으로 준다. 수동 낚시(미끼 슬롯)는 --axis manual로 잰다
  window      시간 제한 효과의 창: 등급 미끼 같은 미끼 슬롯 효과를 한 번 쓰는 창(기본 ${BAIT_WINDOW_MIN}분) 안의 등급별 기대 캐치 수와 골드, 명성 증가, 창 하나가 도감 완성 시간을 줄이는 양. 수동 GOOD이 기본이다
  recipes     레시피 순손익: 재료로 쓴 물고기의 판매 손실 대 효과 지속 동안의 수입 증가(해역별), 집 기운 얻기 공급(가장 앞선 해역보다 앞 해역에서 낚아 가방에 남은 개체를 해역 기본 선택대로 기운으로 바꾼 등급별 개수)과 그 기운으로 만들 수 있는 레시피 수. 재료는 --axis 방식(기본 방치)으로 그 해역에서만 모은다
  achievements  진행 업적 보상: 구역마다 보상 기준 전환(그 구역의 마지막 해역에서 다음 지역 첫 해역으로 넘어가는 전환)의 전환 골드와 배 명성 요구치에 보상 비율을 곱하고 의뢰 보상과 같은 자릿수 반올림을 한 구역 보상 크기(진행 업적 두 개를 합친 값). --reward-split을 주면 두 업적이 나눈 금액도 낸다. 비율은 --reward(기본 ${DEFAULT_REWARD_PERCENTS.join(', ')})로 바꿔 잰다
  gates       게이트 검사와 전환 시간 판정: 이동 직후 수입, PERFECT 이상치, 배 명성 대기 ÷ 골드 대기, 최초 10분 도달, 지역 진입 전환의 목표 범위와 리프 이후 전환의 순서 조건. 판정은 통과, 예외, 개선, 위반이다.
              같은 지역 안의 전환은 범위를 판정하지 않고 전환 시간과 요구 파워 간격을 함께 낸다. 위반이 하나라도 있으면 종료 코드 1. 전환 시간은 항상 방치 기준이다.
              효과 옵션을 주면 이동 직후 수입(낮 풀, 낮밤 혼합)과 전환 시간만 효과를 넣어 관측하고(효과 없음 값을 함께 낸다) 종료 코드는 판정에 따르지 않는다

옵션
  --override <파일>  배 가격, 명성 요구치, 해역 요구 파워, 해역 어종 가격 배율을 덮어쓰는 JSON. 형식은
                     {"boats":{"2":{"price":2500,"fameReq":800}},"spots":{"sea":{"powerReq":35,"priceMult":0.85}}}
                     priceMult는 그 해역 어종 판매가에 곱하고 가격 사다리(일반 정수, 희귀 이상 앞 두 자리)로 맞춘다
  --json             표 대신 JSON으로 낸다
  --legend-at <N>    opening의 전설 보장 캐치 번호(${FIRST_CATCH_LEGEND_MIN}에서 ${FIRST_CATCH_LEGEND_MAX}). 생략하면 ${FIRST_CATCH_LEGEND_MIN}, ${Math.round((FIRST_CATCH_LEGEND_MIN + FIRST_CATCH_LEGEND_MAX) / 2)}, ${FIRST_CATCH_LEGEND_MAX}를 모두 낸다
  --axis <idle|manual|perfect>  낚시 방식. 기본 idle(방치). manual은 GOOD 판정(파워 미달 해역은 무판정). perfect는 effects, window에서만: 빨간 존이 열렸는지와 관계없이 PERFECT 다이얼을 적용한 상한이고 effects는 방치 대비 비율 열을 더한다
  --max-days <N>     시뮬레이션 최대 일수(하루는 실질 낚시 ${DAY_HOURS}시간). 기본 365
  --seed <N>         dist의 난수 시드(정수). 기본 ${DEFAULT_SEED}. 같은 시드, 시도 횟수, 인자의 출력은 항상 같다
  --trials <N>       dist의 시도 횟수(1 이상 정수). 기본 ${DEFAULT_TRIALS}
  --bite <N>         effects: 입질 대기 단축 %(0 이상 100 미만). 기본 0
  --rare <N>         effects: 희귀 이상 등급 가중치 증가 %(0 이상). 기본 0
  --epic <N>         effects: 영웅 이상(영웅, 전설) 등급 가중치 증가 %(0 이상). 희귀에는 걸지 않는다. 기본 0
  --legendary <N>    effects: 전설 등급 가중치 증가 %(0 이상). --rare, --epic과 등급별로 합산한다. 기본 0
  --variant <N>      effects: 돌연변이 가중치 증가 %(0 이상). 유물과 같은 경로로 돌연변이 가중치에 곱한다. 기본 0
  --size <N>         effects: 크기 증가 %(-100 초과). 판매가와 도감 완성 조건이 크기를 쓰지 않아 다른 값은 변하지 않는다. 기본 0
  --move <N>         effects: 이동 속도 증가 %(-100 초과). 낚시 시간당 수입은 그대로이고 판매 왕복을 넣은 수입 변화만 달라진다. 기본 0
  --named <N>        effects: 네임드 조우 가중치 증가 %(0 이상). 수입은 그대로이고 조우 기대 시간만 변한다. 네임드 의뢰가 있고 출현 해역이 맞는 해역만 낸다. 기본 0
  --margin <N>       effects: 해역 진입 레벨에 더하는 낚싯대 레벨(-4 이상 정수). 기본 0, 여유 스펙은 4. 음수면 레벨 1 미만이 되는 해역은 건너뛰고 조기 진입 비교 표를 더한다
  --units <a,b,c,d>  effects: 분해 재료의 등급별 단위(일반,희귀,영웅,전설). 기본 1,5,25,125. 명세에 등급 사이 환산 비율이 없어 재료 점수를 견주는 데만 쓰는 값이다
  --bait <rare|epic|legendary>  effects, window: 등급 미끼(기운으로 제작하는 미끼 요리) 효과를 효과 옵션에 채운다. 수동 캐치에만 걸린다(희귀 이상 +20%, 영웅 이상 +40%, 전설 +60%. 요리 명세 값)
  --reward <N>       achievements: 보상 비율 %(0 초과 100 이하). 쉼표로 여러 개를 줄 수 있다(기본 ${DEFAULT_REWARD_PERCENTS.join(',')}). transition, days, dist: 하나만 주면 진행 업적을 채울 때 보상(골드와 명성)을 한 번에 지급하는 관측용 시뮬레이션을 더하고 보상 없는 값을 함께 낸다(--reward-split 필요, 효과 옵션과 함께 쓸 수 없다)
  --reward-split <0~1>  achievements: 주면 기본 업적과 네임드 업적이 나눈 금액을 낸다. transition, days, dist: 기본 업적이 받는 몫(나머지는 네임드 업적). 직접 준다
  --bounty           transition, gates: 일반 의뢰와 네임드 토벌을 매일 수행하는 경우로 잰다(생략하면 수행하지 않는 경우). days는 두 경우를 모두 낸다
  --from-boat <N>    transition, days, gates: 효과가 걸리기 시작하는 배 단계(0 이상 정수). 기본은 인도양을 여는 배(증기선)
  --with-cost        transition, days, gates: --recipe의 재료로 쓴 물고기의 판매 손실을 하루(실질 낚시 8시간) 한 번의 비용으로 넣는다. 재료가 나오지 않는 해역은 만들 수 없어 효과도 비용도 없다
  --window <분>      window: 효과 창 길이. 기본 ${BAIT_WINDOW_MIN}
  --recipe <id>      recipes: 그 레시피만(${RECIPES.map(r => r.id).join(', ')}). effects, window: 그 레시피의 효과를 효과 옵션에 채운다
  --hours <N>        recipes: 가방을 비우고 판매 없이 낚는 시간(시간). 기본 ${LUNCH_HOURS}
  --cost <id=등급:수량,...>  recipes, window: 레시피의 기운 수량을 덮어써 잰다(수량은 소수 첫째 자리까지, 예: 0.5. 등급은 common, rare, epic, legendary. 적지 않은 등급은 0). 여러 번 줄 수 있고 레시피마다 한 번이다. 예: --cost cook-bait-epic=common:50,epic:4. window에서는 --recipe로 고른 레시피만 받고 재료 비용과 창의 순손익을 더한다
  --manual-share <0~1>  recipes: 집 기운 얻기 공급의 낚시 중 수동 낚시 비율. 나머지는 방치다. 생략하면 --axis 방식으로만 낚는다
  --visit-hours <N>  recipes: 집에 들러 가방을 기운으로 바꾸고 비우는 간격(시간). 한 구간이 가방 용량을 넘으면 개체를 놓아준다. 생략하면 --hours 전체에 한 번 들른다
  --rod-offset <N>   recipes: 집 기운 얻기 공급의 낚싯대 레벨(해역 진입 레벨 기준 -4 이상 정수). 생략하면 --margin을 따른다. 순손익 표는 --margin을 따른다
  --seed, --trials   effects, window의 도감 완성 시간에도 쓴다
  --help             이 도움말
`;

/** 낚싯대 여유의 하한(진입 레벨보다 낮게 재는 최대 레벨 수) */
const MIN_MARGIN_ABS = 4;

const EFFECT_FLAGS = ['--bite', '--rare', '--epic', '--legendary', '--variant', '--size', '--move', '--named', '--margin', '--units', '--bait'] as const;
const VALUE_FLAGS = ['--override', '--legend-at', '--axis', '--max-days', '--seed', '--trials', '--window', '--recipe', '--hours', '--from-boat', '--cost', '--manual-share', '--visit-hours', '--rod-offset', '--reward', '--reward-split', ...EFFECT_FLAGS] as const;

/** 옵션을 받는 명령. 여기 없는 옵션은 모든 명령에서 쓸 수 있다 */
const FLAG_COMMANDS: Record<string, readonly Command[]> = {
  ...Object.fromEntries(EFFECT_FLAGS.map(f => [f, EFFECT_COMMANDS])),
  '--margin': ['effects', 'window', 'recipes'], '--units': ['effects'], '--window': ['window'], '--hours': ['recipes'],
  '--cost': ['recipes', 'window'], '--manual-share': ['recipes'], '--visit-hours': ['recipes'], '--rod-offset': ['recipes'], '--recipe': ['recipes', 'effects', 'window', ...PLAN_COMMANDS],
  '--bounty': ['transition', 'gates'], '--from-boat': PLAN_COMMANDS, '--with-cost': PLAN_COMMANDS,
  '--reward': ['achievements', ...REWARD_COMMANDS], '--reward-split': ['achievements', ...REWARD_COMMANDS],
};
const BOOL_FLAGS = ['--json', '--help', '--bounty', '--with-cost'] as const;

function numberOf(flag: string, raw: string): number {
  const v = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(v)) throw new Error(`${flag}에는 숫자가 필요합니다: ${raw}`);
  return v;
}

export function parseArgs(argv: readonly string[]): FlowOptions {
  const o: FlowOptions = {
    commands: [], override: null, json: false, legendAt: null, axis: 'idle', axisGiven: false, maxDays: 365, help: false,
    seed: DEFAULT_SEED, trials: DEFAULT_TRIALS, effect: { ...NO_EFFECT }, margin: 0, units: { ...DEFAULT_UNITS }, windowMinutes: BAIT_WINDOW_MIN,
    recipe: null, hours: LUNCH_HOURS, cost: {}, manualShare: null, visitHours: null, rodOffset: null, bounty: false, fromBoat: null, withCost: false,
    rewards: [], rewardSplit: null,
  };
  const given: string[] = [];
  let axisGiven = false, bait: string | null = null;
  let command: Command | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if ((BOOL_FLAGS as readonly string[]).includes(a)) {
        if (a === '--json') o.json = true;
        else if (a === '--help') o.help = true;
        else { given.push(a); if (a === '--bounty') o.bounty = true; else o.withCost = true; }
        continue;
      }
      if (!(VALUE_FLAGS as readonly string[]).includes(a)) throw new Error(`알 수 없는 옵션입니다: ${a} (--help 참고)`);
      const raw = argv[++i];
      if (raw === undefined || raw.startsWith('--')) throw new Error(`${a}에는 값이 필요합니다`);
      if ((EFFECT_FLAGS as readonly string[]).includes(a)) {
        given.push(a);
        if (a === '--bait') bait = raw;
        else if (a === '--units') {
          const parts = raw.split(',').map(x => numberOf(a, x));
          if (parts.length !== RARITY_ORDER.length || parts.some(x => x < 0)) throw new Error('--units에는 등급 수만큼 0 이상 숫자를 쉼표로 줘야 합니다');
          RARITY_ORDER.forEach((g, k) => { o.units[g] = parts[k]; });
        } else if (a === '--margin') {
          o.margin = numberOf(a, raw);
          if (!Number.isInteger(o.margin) || o.margin < -MIN_MARGIN_ABS) throw new Error(`--margin은 -${MIN_MARGIN_ABS} 이상의 정수여야 합니다`);
        } else {
          const v = numberOf(a, raw);
          if (a === '--bite') o.effect.bite = v / 100;
          else if (a === '--rare') o.effect.rare = v / 100;
          else if (a === '--epic') o.effect.epic = v / 100;
          else if (a === '--legendary') o.effect.legendary = v / 100;
          else if (a === '--variant') o.effect.variant = v / 100;
          else if (a === '--size') o.effect.size = v / 100;
          else if (a === '--move') o.effect.move = v / 100;
          else o.effect.named = v / 100;
        }
        continue;
      }
      if (a === '--reward') {
        given.push(a);
        o.rewards = raw.split(',').map(x => numberOf(a, x) / 100);
        if (o.rewards.some(x => !(x > 0 && x <= 1))) throw new Error('--reward는 0 초과 100 이하여야 합니다(%)');
      } else if (a === '--reward-split') {
        given.push(a);
        o.rewardSplit = numberOf(a, raw);
        if (!(o.rewardSplit >= 0 && o.rewardSplit <= 1)) throw new Error('--reward-split은 0 이상 1 이하여야 합니다');
      } else if (a === '--window') {
        given.push(a);
        o.windowMinutes = numberOf(a, raw);
        if (!(o.windowMinutes > 0)) throw new Error('--window는 0보다 커야 합니다(분)');
      } else if (a === '--hours') {
        given.push(a);
        o.hours = numberOf(a, raw);
        if (!(o.hours > 0)) throw new Error('--hours는 0보다 커야 합니다(시간)');
      } else if (a === '--cost') {
        given.push(a);
        const { id, cost } = parseCostSpec(raw);
        if (Object.hasOwn(o.cost, id)) throw new Error(`--cost에 같은 레시피가 두 번 있습니다: ${id}`);
        o.cost[id] = cost;
      } else if (a === '--manual-share') {
        given.push(a);
        o.manualShare = numberOf(a, raw);
        if (!(o.manualShare >= 0 && o.manualShare <= 1)) throw new Error('--manual-share는 0 이상 1 이하여야 합니다');
      } else if (a === '--visit-hours') {
        given.push(a);
        o.visitHours = numberOf(a, raw);
        if (!(o.visitHours >= MIN_VISIT_HOURS)) throw new Error(`--visit-hours는 ${MIN_VISIT_HOURS} 이상이어야 합니다(시간)`);
      } else if (a === '--rod-offset') {
        given.push(a);
        o.rodOffset = numberOf(a, raw);
        if (!Number.isInteger(o.rodOffset) || o.rodOffset < -MIN_MARGIN_ABS) throw new Error(`--rod-offset은 -${MIN_MARGIN_ABS} 이상의 정수여야 합니다`);
      } else if (a === '--from-boat') {
        given.push(a);
        o.fromBoat = numberOf(a, raw);
        if (!Number.isInteger(o.fromBoat) || o.fromBoat < 0) throw new Error('--from-boat는 0 이상의 정수여야 합니다');
      } else if (a === '--recipe') {
        given.push(a);
        o.recipe = raw;
      } else if (a === '--override') o.override = raw;
      else if (a === '--legend-at') o.legendAt = numberOf(a, raw);
      else if (a === '--seed') {
        o.seed = numberOf(a, raw);
        if (!Number.isInteger(o.seed)) throw new Error('--seed는 정수여야 합니다');
      } else if (a === '--trials') {
        o.trials = numberOf(a, raw);
        if (!Number.isInteger(o.trials) || o.trials < 1) throw new Error('--trials는 1 이상의 정수여야 합니다');
      } else if (a === '--max-days') {
        o.maxDays = numberOf(a, raw);
        if (!Number.isInteger(o.maxDays) || o.maxDays < 1) throw new Error('--max-days는 1 이상의 정수여야 합니다');
      } else {
        if (raw !== 'idle' && raw !== 'manual' && raw !== 'perfect') throw new Error('--axis는 idle, manual, perfect 중 하나여야 합니다');
        o.axis = raw;
        axisGiven = true;
      }
      continue;
    }
    if (!(NAMED_COMMANDS as readonly string[]).includes(a)) throw new Error(`알 수 없는 명령입니다: ${a} (--help 참고)`);
    if (command) throw new Error('명령은 하나만 고를 수 있습니다');
    command = a as Command;
  }
  for (const f of given) {
    const allowed = FLAG_COMMANDS[f];
    if (!(command && allowed.includes(command))) throw new Error(`${f}은 ${allowed.join(', ')} 명령에서만 쓸 수 있습니다`);
  }
  if (command === 'achievements') {
    if (o.rewards.length === 0) o.rewards = DEFAULT_REWARD_PERCENTS.map(x => x / 100);
  } else if (command !== null && REWARD_COMMANDS.includes(command)) {
    if (o.rewards.length > 1) throw new Error(`${command}에서 --reward는 하나만 줄 수 있습니다`);
    if (o.rewards.length === 1 && o.rewardSplit === null) throw new Error('--reward에는 --reward-split이 필요합니다(기본 업적이 받는 몫, 0 이상 1 이하)');
    if (o.rewards.length === 0 && o.rewardSplit !== null) throw new Error('--reward-split은 --reward와 함께 써야 합니다');
    if (o.rewards.length === 1 && (o.recipe !== null || given.some(f => (EFFECT_FLAGS as readonly string[]).includes(f)))) {
      throw new Error('--reward는 효과 옵션(--recipe, --bait와 효과 값)과 함께 쓸 수 없습니다');
    }
  }
  if (o.recipe !== null) {
    const recipe = RECIPES.find(r => r.id === o.recipe);
    if (!recipe) throw new Error(`알 수 없는 레시피입니다: ${o.recipe} (${RECIPES.map(r => r.id).join(', ')} 중 하나)`);
    if (command !== 'recipes') for (const k of Object.keys(recipe.effect) as (keyof Effect)[]) if (recipe.effect[k] !== 0) o.effect[k] = recipe.effect[k];
  }
  withCostOverrides(RECIPES, o.cost);
  for (const id of Object.keys(o.cost)) {
    if (o.recipe !== id && (command === 'window' || o.recipe !== null)) throw new Error(`--cost의 레시피는 --recipe로 고른 레시피(${o.recipe ?? '없음'})와 같아야 합니다: ${id}`);
  }
  if (bait !== null) {
    const b = baitEffect(bait);
    for (const k of Object.keys(b) as (keyof Effect)[]) if (b[k] !== 0) o.effect[k] = b[k];
  }
  const recipeRow = o.recipe === null ? undefined : RECIPES.find(r => r.id === o.recipe);
  const baitSlot = bait !== null || recipeRow?.kind === 'bait';
  const lunchSlot = recipeRow?.kind === 'lunch' || (command !== null && PLAN_COMMANDS.includes(command) && given.some(f => EFFECT_FLAGS.includes(f as never)));
  if (command !== null && PLAN_COMMANDS.includes(command)) {
    if (baitSlot) throw new Error('미끼 슬롯 효과(--bait, 미끼 요리 레시피)는 수동 캐치에만 걸리고 transition, days, gates는 방치 기준이라 쓸 수 없습니다. window나 effects --axis manual을 쓰세요');
    if (lunchSlot && o.axis !== 'idle') throw new Error('도시락 효과는 방치 캐치에만 걸리므로 --axis와 함께 쓸 수 없습니다(방치 기준)');
  } else if (command === 'effects' || command === 'window') {
    if (!axisGiven && (baitSlot || lunchSlot)) o.axis = baitSlot ? 'manual' : 'idle';
    if (baitSlot && o.axis === 'idle') throw new Error('미끼 슬롯 효과는 수동 캐치에만 걸립니다. --axis manual 또는 perfect와 함께 쓰세요');
    if (lunchSlot && o.axis !== 'idle') throw new Error('도시락 효과는 방치 캐치에만 걸립니다. --axis idle과 함께 쓰세요');
  }
  if (o.axis === 'perfect' && !(command === 'effects' || command === 'window')) throw new Error('--axis perfect는 effects, window 명령에서만 쓸 수 있습니다');
  o.axisGiven = axisGiven;
  if (o.withCost && o.recipe === null) throw new Error('--with-cost에는 --recipe가 필요합니다');
  if (command === 'window' && !axisGiven && !lunchSlot) o.axis = 'manual';
  checkEffect(o.effect);
  o.commands = command ? [command] : [...COMMANDS];
  return o;
}

export interface SpotInfo { id: SpotId; name: string; powerReq: number; entryLevel: number }

export interface FlowResult {
  options: { axis: FlowAxis; legendAt: number | null; maxDays: number; override: FlowOverride | null;
    seed: number; trials: number;
    /** transition, gates를 일반 의뢰와 네임드 토벌을 모두 수행하는 경우로 잰 결과인가 */
    bounty: boolean;
    /** 효과를 넣은 진행 시뮬레이션(transition, days, gates)일 때의 효과 설명 */
    plan: { label: string; fromBoat: number; recipe: string | null; withCost: boolean; bounty: boolean } | null;
    /** 진행 업적 보상을 넣은 관측일 때의 보상 비율과 기본 업적의 몫 */
    reward: { ratio: number; split: number } | null;
    /** 계산 당시의 해역 표시 값 — 덮어쓰기를 되돌린 뒤에도 표 라벨이 덮어쓴 값으로 나오게 담아 둔다 */
    spots: SpotInfo[];
  };
  transition?: TransitionReport;
  days?: DaysReport;
  opening?: OpeningResult[];
  ev?: EvReport;
  gates?: GatesReport;
  dist?: { opening: OpeningDist[]; transition: TransitionDist[]; reward?: { ratio: number; split: number; rows: RewardDistRow[] } };
  achievements?: { ratios: number[]; split: number | null; rows: RewardRow[] };
  travel?: { rows: TravelRow[]; sampleDays: number };
  effects?: EffectsReport;
  window?: {
    effect: Effect; minutes: number; margin: number; trials: number; seed: number; rows: WindowRow[];
    /** --recipe와 --cost를 준 경우: 덮어쓴 기운 수량으로 모은 재료의 판매 손실, 모으는 시간, 창의 골드 증가에서 뺀 순손익 */
    material?: {
      recipe: string; cost: Partial<Record<RarityId, number>>;
      /** 재료를 모으는 낚시 방식과 레시피의 효과 지속(시간). 순손익은 recipes와 같은 기준(그 레시피의 효과 x 슬롯 지속)이다 */
      axis: FlowAxis; hours: number;
      rows: { spot: SpotId; level: number; loss: number; collectHours: number | null; gain: number; net: number | null }[];
    };
  };
  recipes?: {
    axis: FlowAxis; margin: number; hours: number; trials: number; seed: number; rows: RecipeRow[]; bag: BagSupplyRow[];
    /** 옵션을 준 경우에만 담는다 */
    costOverrides?: CostOverrides; manualShare?: number; visitHours?: number; rodOffset?: number;
  };
  exception?: { income: IncomeRow[]; earlyEntry: EarlyEntryRow[]; returnTrips: ReturnTrip[]; huntCost: HuntRow[] };
}

/** 전설 보장 번호 후보 — 지정하면 그 번호, 아니면 제품 범위의 처음, 가운데, 끝 */
const legendCandidates = (legendAt: number | null): number[] =>
  legendAt !== null ? [legendAt] : [FIRST_CATCH_LEGEND_MIN, Math.round((FIRST_CATCH_LEGEND_MIN + FIRST_CATCH_LEGEND_MAX) / 2), FIRST_CATCH_LEGEND_MAX];

export function runFlow(o: FlowOptions): FlowResult {
  const override = o.override ? loadOverride(o.override) : null;
  const restore = override ? applyOverride(override) : () => {};
  try {
    const planOn = PLAN_COMMANDS.some(c => o.commands.includes(c) && o.commands.length === 1) && (o.recipe !== null || (Object.keys(o.effect) as (keyof Effect)[]).some(k => o.effect[k] !== 0));
    const fromBoat = o.fromBoat ?? COOKING_UNLOCK_BOAT;
    const recipe = o.recipe === null ? undefined : RECIPES.find(r => r.id === o.recipe);
    const plan: RatePlan | undefined = planOn ? effectPlan({ effect: o.effect, fromBoat, recipe: o.withCost ? recipe : undefined }) : undefined;
    const rewardOn = o.rewards.length === 1 && o.rewardSplit !== null && o.commands.length === 1 && REWARD_COMMANDS.some(c => o.commands.includes(c));
    const reward = rewardOn ? rewardPlan(o.rewards[0], o.rewardSplit!) : undefined;
    const res: FlowResult = { options: { axis: o.axis, legendAt: o.legendAt, maxDays: o.maxDays, override,
      seed: o.seed, trials: o.trials,
      bounty: o.bounty,
      plan: planOn ? { label: effectLabel(o.effect), fromBoat, recipe: o.recipe, withCost: o.withCost, bounty: o.bounty } : null,
      reward: rewardOn ? { ratio: o.rewards[0], split: o.rewardSplit! } : null,
      spots: SPOTS.map(sp => ({ id: sp.id, name: sp.name, powerReq: sp.powerReq ?? 0, entryLevel: entryLevel(sp.id) })) } };
    const sim = { axis: o.axis, maxDays: o.maxDays };
    if (o.commands.includes('transition')) res.transition = transitionReport({ ...sim, bounty: o.bounty, plan, reward });
    if (o.commands.includes('days')) res.days = daysReport({ ...sim, plan, reward });
    if (o.commands.includes('opening')) {
      const judgments: Judgment[] = ['normal', 'good'];
      res.opening = judgments.flatMap(judgment => [null, ...legendCandidates(o.legendAt)].map(legendAt => simulateOpening({ judgment, legendAt })));
    }
    if (o.commands.includes('dist')) {
      res.dist = {
        opening: (['normal', 'good'] as const).map(judgment => openingDist({ judgment, trials: o.trials, seed: o.seed })),
        transition: transitionDist({ trials: o.trials, seed: o.seed, ...sim }),
        ...(rewardOn ? { reward: { ratio: o.rewards[0], split: o.rewardSplit!, rows: rewardDist({ trials: o.trials, seed: o.seed, ratio: o.rewards[0], basicShare: o.rewardSplit!, ...sim }) } } : {}),
      };
    }
    if (o.commands.includes('achievements')) {
      res.achievements = { ratios: o.rewards, split: o.rewardSplit, rows: rewardRows({ ratios: o.rewards, ...(o.rewardSplit === null ? {} : { split: o.rewardSplit }) }) };
    }
    if (o.commands.includes('travel')) res.travel = { rows: travelRows(), sampleDays: TRAVEL_SAMPLE_DAYS };
    if (o.commands.includes('effects')) {
      const trips = new Map(travelRows().map(t => [t.spot, { bagCap: t.bagCap, tripSec: t.tripSec }] as const));
      res.effects = {
        effect: o.effect, units: o.units, margin: o.margin, trials: o.trials, seed: o.seed,
        income: incomeRows({ axis: o.axis, effect: o.effect, margin: o.margin, trips }),
        dex: dexRows({ axis: o.axis, effect: o.effect, margin: o.margin, trials: o.trials, seed: o.seed }),
        supply: supplyRows({ axis: o.axis, effect: o.effect, margin: o.margin, units: o.units }),
        early: earlyRows({ axis: o.axis, effect: o.effect, margin: o.margin }),
      };
    }
    if (o.commands.includes('window')) {
      const rows = windowRows({ axis: o.axis, effect: o.effect, margin: o.margin, minutes: o.windowMinutes, trials: o.trials, seed: o.seed });
      res.window = { effect: o.effect, minutes: o.windowMinutes, margin: o.margin, trials: o.trials, seed: o.seed, rows };
      const costed = withCostOverrides(RECIPES, o.cost).find(r => r.id === o.recipe && Object.hasOwn(o.cost, r.id));
      const gather: FlowAxis = o.axisGiven ? o.axis : 'idle';
      if (costed) {
        res.window.material = {
          recipe: costed.id, cost: costed.cost,
          axis: gather, hours: costed.hours,
          rows: recipeRows({ axis: gather, margin: o.margin, recipes: [costed] }).map(r => ({ spot: r.spot, level: r.level, loss: r.loss, collectHours: r.collectHours, gain: r.gain, net: r.net })),
        };
      }
    }
    if (o.commands.includes('recipes')) {
      const recipes = withCostOverrides(o.recipe === null ? RECIPES : RECIPES.filter(r => r.id === o.recipe), o.cost);
      res.recipes = {
        axis: o.axis, margin: o.margin, hours: o.hours, trials: o.trials, seed: o.seed,
        rows: recipeRows({ axis: o.axis, margin: o.margin, recipes }),
        bag: bagSupplyRows({
          axis: o.axis, margin: o.rodOffset ?? o.margin, hours: o.hours, trials: o.trials, seed: o.seed,
          ...(o.manualShare === null ? {} : { manualShare: o.manualShare }), ...(o.visitHours === null ? {} : { visitHours: o.visitHours }),
        }),
        ...(Object.keys(o.cost).length > 0 ? { costOverrides: o.cost } : {}),
        ...(o.manualShare === null ? {} : { manualShare: o.manualShare }), ...(o.visitHours === null ? {} : { visitHours: o.visitHours }),
        ...(o.rodOffset === null ? {} : { rodOffset: o.rodOffset }),
      };
    }
    if (o.commands.includes('ev')) res.ev = evReport();
    if (o.commands.includes('gates')) res.gates = gatesReport({ maxDays: o.maxDays, legendAts: legendCandidates(o.legendAt), bounty: o.bounty, plan });
    if (o.commands.includes('exception')) {
      res.exception = {
        income: incomeByOffset(o.axis), earlyEntry: earlyEntry(o.axis), returnTrips: returnTrips(o.axis), huntCost: huntCost(o.axis),
      };
    }
    return res;
  } finally {
    restore();
  }
}

// ── 출력 ──
const n0 = (x: number) => Math.round(x).toLocaleString('en-US');
const pct0 = (x: number) => `${(x * 100).toFixed(0)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const hrs = (x: number) => (x < 1 / 60 ? '0분' : x < 1 ? `${Math.round(x * 60)}분` : x < 10 ? `${x.toFixed(1)}h` : `${n0(x)}h`);
/** 실질 낚시 시간(시간)과 8시간 환산 일수 표기 */
const h2 = (x: number) => `${x.toFixed(2)}시간`;
const d1 = (x: number) => `${x.toFixed(1)}일`;
const nameOf = (spot: SpotId) => SPOTS.find(s => s.id === spot)!.name;
const AXIS_LABEL: Record<FlowAxis, string> = { idle: '방치', manual: '수동 GOOD(파워 미달 해역은 무판정)', perfect: 'PERFECT 다이얼(빨간 존이 열렸는지와 관계없이 적용한 상한)' };

function table(headers: string[], rows: (string | number)[][]): string {
  return [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');
}

const BASIC_ASSUMPTION = `모든 시간은 실질 낚시 시간이다. 이동, 판매 왕복, 창 조작, 게임을 끈 시간, 접속해 있어도 낚지 못하는 시간은 넣지 않는다. 낚은 물고기는 모두 판매 수입이다. 판매는 즉시이고 미끼, 유물, 쿠폰은 넣지 않는다. 방치 사이클은 모델 사이클이다. 일수는 실질 낚시 시간 ÷ ${DAY_HOURS}이다`;

/** 효과를 넣은 진행 시뮬레이션(관측용)의 가정 */
function planAssumptions(): string[] {
  return [
    '효과는 도시락 슬롯 효과로 보고 방치 캐치에만 건다(미끼 슬롯 효과는 수동 캐치 30분 창에만 걸려 이 지표에 쓸 수 없다). 시작 배 단계 이상인 동안 그 해역의 모든 방치 캐치에 걸린다. 하루(실질 낚시 8시간)를 도시락 하나가 모두 덮는다고 본 상한이다. 그 이전 배 단계에서는 효과 없음이다',
    '효과를 넣은 값은 관측용이다. 전환 시간 목표와 게이트 판정은 효과 없는 기준 플레이어에게 맞춘 것이므로 이 값으로 판정하지 않는다',
    '재료 비용을 넣는 경우(--with-cost)는 레시피를 하루 한 번 만든다고 보고 재료로 쓴 물고기의 판매 손실을 그 해역의 방치 낚시 시간당 비용으로 센다. 그 해역에서 필요한 등급이 나오지 않으면 만들 수 없어 효과도 비용도 없다. 재료는 지금 낚는 해역에서만 모으고 이전 해역을 다시 도는 경우와 가방 한도는 넣지 않는다',
  ];
}

/** 진행 업적 보상을 넣은 진행 시뮬레이션(관측용)의 가정 */
function rewardAssumptions(): string[] {
  return [
    '업적 보상을 넣은 값은 관측용이다. 보상 없이 잰 값이 메인 지표이고 전환 시간 목표와 게이트 판정은 보상 없는 값으로 한다',
    '진행 업적은 구역의 일반 폼 도감 조건이다(기본 라이선스 조건은 전설 제외, 네임드 라이선스 조건은 전설 포함, 일반 폼만 센다). 기댓값 경로는 구역 도감 완성 확률이 라이선스 문턱(0.5)을 넘은 시점에, 표본 경로(dist)는 실제로 뽑은 일반 폼이 조건을 채운 시점에 달성한다',
    '시뮬레이션은 열린 가장 뒤 해역에서만 낚고 지나온 해역으로 돌아가 도감을 채우지 않는다. 그래서 구역을 떠나기 전에 도감을 채우지 못하면 그 업적은 채워지지 않고 지급하지 않는다',
    '보상은 달성한 시점에 골드와 명성을 한 번에 지급하고, 지급한 골드와 명성은 바로 구매에 쓴다. 구역 보상 크기와 두 업적의 나눔은 achievements 명령과 같은 값이다',
  ];
}

function assumptionText(command: Command, o: FlowResult['options'], windowMaterial = false): string {
  const lines: string[] = [BASIC_ASSUMPTION];
  if (command === 'transition') {
    lines.push('새 계정이 직전 해역에서 낚아 전환 골드를 모으고 배 명성 하한을 채운 시점에 바로 옮긴다', '명성을 기다리는 동안은 다음 해역 진입 레벨을 넘겨 강화하지 않고 골드를 쌓는다', o.bounty ? '의뢰와 토벌을 매일 수행하는 경우다' : '의뢰와 토벌은 하지 않는 경우다');
    if (o.plan) lines.push(...planAssumptions());
    if (o.reward) lines.push(...rewardAssumptions());
  } else if (command === 'days') {
    lines.push(
      '의뢰 라이선스는 그 구역 도감(일반 폼)을 모두 모았을 확률이 0.5를 넘는 날부터 쓴다. 어종은 서로 독립이고 낚은 해역에서만 쌓이며 어종 천장은 넣지 않는다',
      '지나온 해역으로 돌아가 도감을 채우지 않는다',
      '일반 의뢰는 물고기를 건네지 않고 골드 보상만 받는다. 난이도마다 그날 후보 중 끝낼 수 있는 후보의 평균으로 보고 하루 1회, 네임드 토벌도 하루 1회다',
      '네임드 결투는 항상 이기고 조우는 천장을 넣은 기대 캐치 수로 센다. 의뢰 중에는 그 구역에서 낚을 수 있는 해역을 같은 시간씩 낚고 항구 이동 시간은 넣지 않는다',
      '레벨업은 낚싯대가 그 레벨에 처음 닿은 시점에 시뮬레이션이 실제로 가진 라이선스로 계산한 정상 상태의 하루 수입으로 나눈다',
    );
    if (o.plan) lines.push(...planAssumptions());
    if (o.reward) lines.push(...rewardAssumptions());
  } else if (command === 'dist') {
    lines.push(
      '해석적 기댓값 경로와 같은 확률, 판매가, 캐치 주기, 첫 경험 보장 규칙을 캐치마다 뽑는다. 입질 대기는 범위 균등이고 어종은 낮밤 혼합 확률, 돌연변이는 전역 확률이다. 기댓값 경로에 없는 pity, 미끼, 유물은 넣지 않는다',
      `난수는 시드 고정 mulberry32이고 시도마다 같은 흐름을 이어 쓴다. 같은 시드(${o.seed}), 시도 횟수(${o.trials}), 인자의 출력은 항상 같다`,
      'p10은 빠른 쪽(운이 좋은 10%의 경계), p90은 느린 쪽(운이 나쁜 10%의 경계)이다',
      '최초 10분: 전설 보장 번호는 제품 규칙대로 시도마다 10에서 20 사이로 뽑는다. 도착 뒤에도 보장이 남으면 그 해역에서 더 낚아 보장 시각을 재고, 10분 안에 못 닿은 시도도 도착 시간에 넣는다. 해석 기댓값은 전설 보장이 가운데 번호일 때의 값이다',
      '해역 전환: 방치로 낚는 새 계정을 시도마다 처음부터 끝까지 한 번 시뮬레이션하고 전환별 시간을 모은다. 앞 해역은 전환 소요가 짧아, 캐치 가격이 한쪽으로 치우쳐 고가 어종으로 문턱을 넘은 초과분이 다음 전환으로 넘어가는 효과와 1분 단위 문턱 판정의 영향이 커서 개별 전환의 표본 평균이 기댓값과 벌어진다. 누적 소요가 긴 남인도양 이후 해역은 누적 시간으로 보면 기댓값과 일치하지만, 앞 해역은 누적으로도 표본 평균이 기댓값보다 크다',
    );
  } else if (command === 'achievements') {
    lines.push(
      '구역 보상 크기 = 보상 기준 전환의 전환 골드 x 보상 비율, 그 전환에서 사는 배 가운데 가장 높은 명성 요구치 x 보상 비율이다. 방치 EV에서 산출하지 않는다',
      '보상 기준 전환은 구역의 마지막 해역에서 다음 지역의 첫 해역으로 넘어가는 전환이다. 다음 지역이 없는 구역은 기준 전환이 없어 미정으로 낸다',
      '반올림은 의뢰 보상과 같은 자릿수 반올림이다(앞 두 자리가 5의 배수가 되게 맞춘다). 원값은 반올림 전이다',
      '보상 비율과 두 업적의 나눔은 인자로 준다. 비율을 주지 않으면 기본 비율(20%, 25%, 30%)을 낸다',
      '두 업적에 나눌 때는 반올림한 구역 보상 크기를 쓴다. 기본 업적은 구역 크기 x 몫을 반올림한 값이고 네임드 업적은 나머지라서 두 업적의 합은 구역 크기와 같다',
    );
  } else if (command === 'travel') {
    lines.push(
      '관측 전용이며 다른 명령의 시간에 넣지 않는다',
      '왕복은 가방이 찰 때마다 한 번이다: 가방이 찰 때까지 낚고, 판매 창구가 있는 거점(마을은 집 안 상자, 대양은 그 구역 항구)으로 이동해 팔고, 어군으로 돌아온다',
      `거리는 거점 출입 자리(집 문, 항구 출항 자리)에서 그 해역 어군까지의 직선거리이고 어군 위치는 ${TRAVEL_SAMPLE_START}부터 ${TRAVEL_SAMPLE_DAYS}일의 날짜 시드 배치 평균이다. 속도는 마을은 도보, 대양은 그 해역을 여는 배다`,
      `5% 기준은 근거 있는 값이 없는 가정이다(${TRAVEL_MATERIAL * 100}%)`,
      '가방 채움은 해역 진입 레벨의 방치 속도로 본다. 레벨이 오른 뒤 채움이 빨라지는 효과는 넣지 않는다. 육지를 도는 우회, 접안과 거점 안 이동, 판매 창 조작 시간은 넣지 않으므로 비중은 하한이다. 5% 한도까지 여유 열은 이런 미반영 시간이 왕복마다 이만큼 더해져도 비중이 5%를 넘지 않는 한도다',
    );
  } else if (command === 'ev') {
    lines.push(
      '방치 EV는 낮밤 혼합 방치 수입(G/h)이다. --axis와 관계없이 방치 기준이다. 의뢰와 토벌은 방치 EV에 종속된 보너스로 본다',
      '구역 대표 방치 EV는 그 구역 마지막 해역의 딱렙 EV다',
      '목표는 일반 의뢰 쉬움 1시간, 보통 2시간, 어려움 4시간, 네임드 토벌 8시간어치다',
      '새 보상은 목표 시간 곱하기 대표 EV를 앞자리가 5나 10 단위로 떨어지게 자릿수 반올림한 값이다. 해석: 정수 자릿수가 n(3 이상)이면 5 x 10^(n-2) 단위로 맞춘다(첫 두 자리가 5의 배수). 첫 두 자리가 1로 시작하면 간격이 넓어 134,000은 150,000이 된다',
      '다음 해역 진입 직전 레벨은 다음 해역 딱렙의 한 칸 아래이고, 마지막 해역은 딱렙에 여유 레벨을 더한 값이다',
    );
  } else if (command === 'effects') {
    lines.push(
      `낚시 방식은 ${AXIS_LABEL[o.axis]}이고 낮밤 혼합 기댓값이다. 돌연변이 가중치 증가는 유물과 같은 경로의 폼 가중치다. 네임드 조우는 그 구역에 네임드 의뢰가 있고 출현 해역이 맞는 해역만 낸다. 입질 대기 단축은 대기 전체(파워 미달 가산 포함)에 곱한다. 희귀 이상, 영웅 이상, 전설 가중은 제품의 등급 가중치 효과 합산에 등급별로 더한다. 영웅, 전설 도감은 그 등급 어종의 일반 폼과 돌연변이 폼을 전부 모으는 시간이다`,
      '크기는 판매가와 도감 완성 조건에 쓰이지 않아 크기 배수는 이 지표에 영향이 없다. 도감에 최대 크기 기록은 있으나 제품 규칙 모듈에 완성 조건은 없다',
      '이동 속도는 실질 낚시 시간 밖이라 낚시 시간당 수입을 바꾸지 않는다. 판매 왕복을 넣은 변화는 이동 시간 관측(travel)의 가방 용량과 왕복 시간을 쓰고, 가방 채움 시간은 같은 낚싯대 레벨과 낚시 방식의 캐치 속도로 계산한다. 입질 대기 단축도 채움 시간을 줄여 이 값에 든다',
      '도감 완성은 한 해역에서만 낚을 때이고 캐치마다 어종과 폼을 뽑는 몬테카를로다. 일반 폼 전부(전설 제외), 일반 폼 전부, 돌연변이 폼 전부, 영웅 도감 전부, 전설 도감 전부 다섯 조건을 센다. 어종 천장은 넣지 않는다',
      '분해 재료는 물고기 한 마리가 그 등급 재료 한 개이고 돌연변이 구분은 없다. 등급별 단위는 명세에 환산 비율이 없어 재료 점수를 견주는 데만 쓰는 값이다. 판매 골드는 같은 시간 모두 팔 때의 방치 기댓값이다',
    );
  } else if (command === 'window') {
    lines.push(
      `낚시 방식은 ${AXIS_LABEL[o.axis]}이고 낮밤 혼합 기댓값이다. 창 안은 효과를 넣고 창 밖은 효과 없음이다. 효과는 제품의 등급 가중치 효과 합산과 폼 가중치 경로로 적용한다`,
      '창 안의 기대 캐치 수는 그 조건의 캐치 속도 x 창 길이 x 등급 비율이고, 골드와 명성 증가는 효과 없음 대비 시간당 차이 x 창 길이다',
      '도감 단축은 한 해역에서만 낚을 때 창 하나를 먼저 쓰고 이후 효과 없이 낚는 평균 시간이 효과 없이 낚는 평균 시간보다 줄어든 양이다. 창 안의 캐치 수는 기대 캐치 수를 반올림하고, 같은 시드로 효과 없음과 짝지어 견준다. 어종 천장은 넣지 않는다',
      ...(windowMaterial
        ? [
          '재료 비용 표는 --cost로 덮어쓴 기운 수량의 재료를 그 해역 낚시로만 모으는 경우다.',
          '재료 비용 표의 효과는 그 레시피의 효과와 슬롯 지속으로 재고 recipes의 순손익과 같은 기준이다.',
          '재료를 모으는 낚시 방식은 --axis를 줬으면 그 방식이고 아니면 방치다.',
          '사람의 판정 실력은 넣지 않는다.',
        ]
        : ['등급 미끼의 제작 비용(기운)과 사람의 판정 실력은 넣지 않는다']),
    );
  } else if (command === 'recipes') {
    lines.push(
      `재료는 ${AXIS_LABEL[o.axis]} 낚시로 그 해역에서만 모으고 이전 해역을 다시 도는 경우는 넣지 않는다. 순손익 표는 비교용으로 기운 얻기가 열리기 전 해역도 낸다. 물고기 한 마리가 그 등급 기운 한 개이고, 재료로 쓴 물고기는 팔지 못한다. 판매 손실은 등급별 필요 개수 x 그 등급의 평균 판매가(돌연변이 기댓값 포함)다`,
      '효과 지속 동안의 수입 증가는 효과 없음 대비 시간당 골드(명성) 차이 x 지속이다. 도시락은 방치로, 미끼 요리는 수동 GOOD(파워 미달 해역은 무판정)로 지속 시간 내내 낚는다고 본다. 도시락은 하루 낚시가 지속보다 짧아도 지속 전체를 낚는다고 센 상한이다',
      '골드로 환산되지 않는 효과(네임드 조우, 돌연변이 도감 단축)는 순손익에 들지 않는다. 돌연변이 가중은 판매가 기댓값만 올린다',
      '재료를 모으는 시간은 필요한 등급 중 가장 느리게 모이는 등급이 정한다. 나오지 않는 등급이 필요한 해역은 모을 수 없다',      '집 기운 얻기 공급은 기운 얻기가 열리는 배 단계 이상의 배 단계마다, 그 배로 갈 수 있는 해역에서 그 배 단계의 가방 용량으로 가방을 비우고 판매 없이 정해진 시간 낚은 한 번의 낚시다. 낚싯대는 그 해역의 진입 레벨이다',
      '가방이 넘치면 제품의 개체 비교 순서(등급, 개체 판매가, 크기)대로 가장 안 특별한 개체를 놓아준다. 놓아준 개체는 기운이 되지 않는다. 크기는 순서의 마지막 기준이라 넣지 않는다. 시드 고정 몬테카를로이고 시도 평균이다',
      '가방에 남은 개체 가운데 해역 기본 선택(요리 명세 3.3)대로 기운으로 바꾼 개수가 공급이다. 배 단계로 갈 수 있는 해역 중 해역 순서로 가장 앞선 해역의 어종은 기본 선택에서 빠져 공급이 0이다. 플레이어가 기본 선택을 덮어쓰는 경우는 넣지 않는다',
      '집 기운으로 만들 수 있는 개수는 필요한 등급 중 가장 모자란 등급이 정한다',
    );
  } else if (command === 'opening') {
    lines.push('낚는 시간만 센다. 도보 이동, 판매와 구매 창 조작, 안내 시간은 넣지 않는다', '보장 캐치의 획득 연출도 일반 캐치와 같은 길이이고 보장 어종 가격은 그 해역 풀의 해당 등급 평균이다', '강화를 먼저 다 하고 배를 산다');
  } else {
    lines.push(
      `낚시 방식은 ${AXIS_LABEL[o.axis]}이고 낮밤 혼합 기댓값이다`,
      '파워 미달 해역의 줄 끊김(미끼만 훔쳐먹는 안내)은 사이클에 넣지 않는다',
      '조기 진입은 같은 배로 열리는 이전 해역과, 토벌 비용은 천장을 넣은 기대 캐치 수와 비교한다. 네임드 결투는 항상 이긴다',
    );
  }
  return ['\n가정:', ...lines.map(l => `- ${l}`)].join('\n');
}

/** 효과를 넣은 진행 시뮬레이션의 조건 한 줄 */
function planNote(o: FlowResult['options']): string {
  const p = o.plan;
  if (!p) return '';
  const boat = BOATS.find(b => b.tier === p.fromBoat)?.name;
  return `효과 ${p.label}(관측용), 배 단계 ${p.fromBoat}${boat ? `(${boat})` : ''} 이상에서 걸림${p.recipe ? `, 레시피 ${p.recipe}${p.withCost ? '의 재료 판매 손실을 하루 한 번 비용으로 넣음' : ''}` : ''}, 의뢰와 토벌 ${p.bounty ? '모두 수행' : '수행 안 함'}`;
}

/** 비교 기준 이름 — 업적 보상을 넣은 관측은 보상 없음, 효과를 넣은 관측은 효과 없음이다 */
const baseName = (o: FlowResult['options']): string => (o.reward ? '보상 없음' : '효과 없음');

/** 업적 보상을 넣은 진행 시뮬레이션의 조건 한 줄 */
function rewardNote(o: FlowResult['options']): string {
  const r = o.reward;
  if (!r) return '';
  return `진행 업적 보상 ${pct1(r.ratio)}(관측용), 기본 업적 몫 ${pct1(r.split)}, 네임드 업적 몫 ${pct1(1 - r.split)}${o.bounty ? ', 의뢰와 토벌 모두 수행' : ''}`;
}

/** 효과 없음 대비 시간 차이 표기 — 음수가 빨라진 쪽이다 */
const hoursDiff = (now: number | null, base: number | null) => (now === null || base === null ? '—' : `${now - base >= 0 ? '+' : ''}${(now - base).toFixed(2)}시간`);

function transitionText(t: TransitionReport, o: FlowResult['options']): string[] {
  const info = new Map(o.spots.map(x => [x.id, x]));
  const out: string[] = [];
  out.push('\n## 해역 전환 — 전환 골드와 비중 (다음 해역 진입 레벨까지 강화비 + 새 배 가격)');
  out.push(table(
    ['전환', '진입 Lv(요구 파워)', '새 배(가격 / 명성 요구치)', '강화 골드', '배 골드', '전환 골드', '강화 비중', '배 비중'],
    t.rows.map(r => [
      `${nameOf(r.from)} → ${nameOf(r.to)}`, `Lv${r.toLevel}(${info.get(r.to)!.powerReq})`,
      r.boats.length ? r.boats.map(b => `${b.name}(${n0(b.price)} / ${n0(b.fameReq)})`).join(' + ') : '없음',
      n0(r.upgradeGold), n0(r.boatGold), n0(r.totalGold), pct1(r.upgradeShare), pct1(r.boatShare),
    ]),
  ));
  out.push(`\n## 해역 전환 — 전환 시간 (직전 해역에서 방치로 낚을 때의 실질 낚시 시간, 낚시 방식 ${AXIS_LABEL[o.axis]})${t.complete ? '' : ' — 최대 일수 안에 끝나지 않음'}`);
  const base = t.base;
  const none = baseName(o);
  if (o.plan) out.push(`\n(${planNote(o)})`);
  else if (o.reward) out.push(`\n(${rewardNote(o)})`);
  if (!o.plan && !o.reward && o.bounty) out.push('\n(의뢰와 토벌 모두 수행, 관측용)');
  out.push(table(
    ['전환', '전환 시간', ...(base ? [`${none} 전환 시간`, '차이'] : []), '일수(÷8)', '누적 시간', ...(base ? [`${none} 누적 시간`, '누적 차이'] : []), '누적 일수(÷8)', '기다린 것(골드 · 명성 · 둘 다)', '명성 대기 ÷ 골드 대기'],
    t.timings.map((c, i) => [
      `${nameOf(c.row.from)} → ${nameOf(c.row.to)}`, h2(c.hours), ...(base ? [base[i] ? h2(base[i].hours) : '—', hoursDiff(c.hours, base[i]?.hours ?? null)] : []),
      d1(c.days), h2(c.cumulativeHours), ...(base ? [base[i] ? h2(base[i].cumulativeHours) : '—', hoursDiff(c.cumulativeHours, base[i]?.cumulativeHours ?? null)] : []), d1(c.cumulativeDays),
      `${hrs(c.waitGold)} · ${hrs(c.waitFame)} · ${hrs(c.waitBoth)}`, c.fameOverGold === null ? '—' : `${c.fameOverGold.toFixed(2)}배`,
    ]),
  ));
  if (t.achieved) out.push(...grantedText(t.achieved, '진행 업적 지급 시점 (보상을 넣은 관측)'));
  return out;
}

const ZONE_NAME: Record<string, string> = Object.fromEntries(BOUNTY_ZONES.map(z => [z, zoneById(z)?.shortName ?? z]));
const TIER_NAME: Record<BountyTier, string> = { basic: '기본 라이선스 조건(전설 제외)', named: '네임드 라이선스 조건(전설 포함)' };

/** 업적을 채운 시점과 지급 내역 표. 구역 안에서 못 채운 업적은 따로 적는다 */
function grantedText(list: Achieved[], title: string): string[] {
  const out: string[] = [`\n## ${title}`];
  out.push(table(
    ['구역', '업적', '달성 시점(누적 시간)', '그때 낚던 해역', '지급 골드', '지급 명성'],
    list.map(a => [ZONE_NAME[a.zone], TIER_NAME[a.tier], h2(a.hours), nameOf(a.spot), a.granted ? n0(a.granted.gold) : '지급 없음', a.granted ? n0(a.granted.fame) : '지급 없음']),
  ));
  const missing = BOUNTY_ZONES.flatMap(z => (['basic', 'named'] as const).filter(t => !list.some(a => a.zone === z && a.tier === t)).map(t => `${ZONE_NAME[z]} ${t === 'basic' ? '기본' : '네임드'}`));
  if (missing.length) out.push(`(진행 중 못 채워 지급하지 않은 업적: ${missing.join(', ')})`);
  return out;
}

function daysText(d: NonNullable<FlowResult['days']>, o: FlowResult['options']): string[] {
  const out: string[] = [];
  const cell = (x: { hours: number | null; days: number | null }) => (x.hours === null ? '미도착' : `${h2(x.hours)} (${d1(x.days!)})`);
  const none = baseName(o);
  out.push('\n## 해역별 누적 도달 — 새 계정이 해역에 처음 닿기까지의 누적 실질 낚시 시간과 8시간 환산 일수');
  if (o.plan) out.push(`\n(${planNote(o)})`);
  else if (o.reward) out.push(`\n(${rewardNote(o)})`);
  const baseArrival = d.base?.arrival;
  const withBase = (r: DaysReport['arrival'][number], k: number, i: number) => {
    const b = baseArrival?.[k]?.spots[i];
    const now = r.spots[i];
    return baseArrival ? `${cell(now)} / ${none} ${b ? cell(b) : '—'} / ${hoursDiff(now.hours, b?.hours ?? null)}` : cell(now);
  };
  out.push(table(
    ['해역', '의뢰·토벌 수행 안 함', '의뢰·토벌 모두 수행'],
    SPOTS.map((s, i) => [s.name, ...d.arrival.map((r, k) => withBase(r, k, i))]),
  ));
  for (const r of d.arrival) if (r.achieved) out.push(...grantedText(r.achieved, `진행 업적 지급 시점 (보상을 넣은 관측, 의뢰·토벌 ${r.bounty ? '모두 수행' : '수행 안 함'})`));
  const incomplete = d.arrival.filter(r => !r.complete).map(r => (r.bounty ? '모두 수행' : '수행 안 함'));
  if (incomplete.length) out.push(`(최대 일수 안에 마지막 해역에 닿지 못한 경우: ${incomplete.join(', ')})`);
  for (const level of [...new Set(d.levelUp.map(r => r.level))]) {
    const rows = d.levelUp.filter(r => r.level === level);
    out.push(`\n## 마지막 해역 레벨업 — Lv${level}에서 Lv${level + 1}로 (강화 ${n0(rows[0].upgradeGold)}G)`);
    out.push(table(
      ['의뢰·토벌', '레벨 도달(누적 시간)', '쓰는 라이선스', '8시간 골드', '보상 비중', '소요 시간', '소요 일수(÷8)', ...(d.base ? [`${none} 소요 시간`, '차이'] : [])],
      rows.map(r => {
        const b = d.base?.levelUp.find(x => x.bounty === r.bounty && x.level === r.level);
        return [
          r.bounty ? '모두 수행' : '수행 안 함', r.reachedHours === null ? '—' : h2(r.reachedHours),
          r.bounty ? (r.licenses.join(', ') || '없음') : '—',
          r.dailyGold === null ? '미도달' : n0(r.dailyGold), r.bountyShare === null ? '—' : pct0(r.bountyShare),
          r.hours === null ? '미도달' : h2(r.hours), r.days === null ? '미도달' : d1(r.days),
          ...(d.base ? [b?.hours == null ? '—' : h2(b.hours), hoursDiff(r.hours, b?.hours ?? null)] : []),
        ];
      }),
    ));
  }
  return out;
}

function openingText(rows: OpeningResult[]): string[] {
  const out: string[] = [];
  out.push(`\n## 최초 10분 — 수동 낚시로 첫 바다 해역(${nameOf(rows[0].target)})에 닿기까지, 낚는 시간만 센 값 (목표 ${OPENING_TARGET_SEC / 60}분)`);
  const stepName = (s: OpeningResult['steps'][number]) =>
    s.kind === 'guarantee' ? `${s.detail === 'epic' ? '영웅' : '전설'} 보장@${s.catches}`
      : s.kind === 'upgrade' ? `Lv${s.detail}@${s.catches}`
        : s.kind === 'boat' ? `배${s.detail}@${s.catches}` : `${s.kind === 'move' ? '이동 ' : '도착 '}${nameOf(s.detail as SpotId)}@${s.catches}`;
  out.push(table(
    ['판정', '첫 경험 보장', '도착 시간', '캐치 수', `10분까지 남는 시간`, '단계(캐치 번호)'],
    rows.map(r => {
      const a = r.arrival;
      return [
        r.options.judgment === 'good' ? 'GOOD' : '무판정',
        r.options.legendAt === null ? '보장 없음' : `영웅 ${FIRST_CATCH_EPIC_AT}번째, 전설 ${r.options.legendAt}번째`,
        a ? `${(a.seconds / 60).toFixed(1)}분` : '미도착', a ? a.catches : '—',
        a ? `${((OPENING_TARGET_SEC - a.seconds) / 60).toFixed(1)}분` : '—', r.steps.map(stepName).join(' '),
      ];
    }),
  ));
  return out;
}

const DIFFICULTY_LABEL = { easy: '쉬움', normal: '보통', hard: '어려움', named: '네임드 토벌' } as const;
const signed = (x: number) => (Math.abs(x) < 0.05 ? '0' : `${x > 0 ? '+' : ''}${x.toFixed(1)}`);

function evText(ev: EvReport, o: FlowResult['options']): string[] {
  const zoneName = (z: string) => zoneById(z as never)?.shortName ?? z;
  const out: string[] = [];
  out.push('\n## 방치 EV — 해역별 시간당 기대 골드(낮밤 혼합)');
  out.push(table(
    ['구역', '해역', '딱렙 Lv', 'EV(딱렙)', '다음 진입 직전 Lv', 'EV(다음 진입 직전)'],
    ev.spots.map(s => [
      zoneName(s.zone), nameOf(s.spot), s.entryLevel, n0(s.entryEv),
      `${s.preNextLevel}${s.preNextIsMargin ? '(여유 레벨)' : ''}`, n0(s.preNextEv),
    ]),
  ));
  out.push('\n## 구역 대표 방치 EV — 구역 마지막 해역의 딱렙 EV');
  out.push(table(['구역', '대표 EV(G/h)'], ev.zones.map(z => [zoneName(z.zone), n0(z.ev)])));
  out.push('\n## 의뢰·토벌 보상의 EV 시간 환산 — 지금 보상이 구역 대표 EV 몇 시간어치인가, 목표와의 차이');
  out.push(table(
    ['구역', '구분', '지금 보상', 'EV 시간', '목표(시간)', '차이(시간)'],
    ev.rewards.map(r => [zoneName(r.zone), DIFFICULTY_LABEL[r.difficulty], n0(r.reward), r.hours.toFixed(1), r.targetHours, signed(r.gap)]),
  ));
  out.push('\n## 새 보상 — 목표 시간 x 구역 대표 EV를 5나 10 단위 자릿수로 반올림');
  out.push(table(
    ['구역', '구분', '지금 보상', '새 보상', '변화율'],
    ev.rewards.map(r => [zoneName(r.zone), DIFFICULTY_LABEL[r.difficulty], n0(r.reward), n0(r.next), `${r.change > 0 ? '+' : ''}${(r.change * 100).toFixed(0)}%`]),
  ));
  out.push(`\n차이의 양수는 지금 보상이 목표보다 크다는 뜻이다. 덮어쓰기: ${o.override ? '있음' : '없음'}`);
  return out;
}

function exceptionText(e: NonNullable<FlowResult['exception']>, o: FlowResult['options']): string[] {
  const axis = o.axis;
  const info = new Map(o.spots.map(x => [x.id, x]));
  const out: string[] = [];
  const grid = (title: string, cell: (c: NonNullable<IncomeRow['cells'][number]>) => string) => {
    out.push(`\n### ${title}`);
    out.push(table(
      ['해역(진입 Lv)', ...OFFSETS.map(o => (o > 0 ? `+${o}` : String(o)))],
      e.income.map(r => [`${nameOf(r.spot)}(${info.get(r.spot)!.entryLevel})`, ...r.cells.map(c => (c ? cell(c) : '—'))]),
    ));
  };
  out.push(`\n## 진입 레벨 대비 수입 — 진입 레벨 -4부터 +4까지, 낚시 방식 ${AXIS_LABEL[axis]}, 낮밤 혼합`);
  grid('시간당 골드', c => n0(c.goldPerHour));
  grid('진입 레벨 수입 대비', c => pct0(c.ratioToEntry));
  grid('캐치당 전설 확률(%)', c => c.legendPct.toFixed(3));
  grid('사이클(초)', c => c.cycleSec.toFixed(2));
  out.push('\n## 조기 진입 — 같은 배로 열리는 해역에 파워가 모자란 채 들어갈 때, 같은 레벨로 낚을 수 있는 가장 좋은 이전 해역과 비교');
  out.push(table(
    ['들어간 해역', '진입 대비', '레벨', '들어간 해역 G/h', '비교 해역', '비교 해역 G/h', '비율'],
    e.earlyEntry.map(r => [nameOf(r.spot), r.offset, r.level, n0(r.goldPerHour), nameOf(r.alt), n0(r.altGoldPerHour), pct0(r.ratio)]),
  ));
  for (const t of e.returnTrips) {
    out.push(`\n## 낮은 지역으로 돌아옴 — Lv${t.level}로 낚을 때 (마지막 해역 대비)`);
    out.push(table(['해역', 'G/h', '마지막 해역 대비'], t.rows.map(r => [nameOf(r.spot), n0(r.goldPerHour), pct1(r.ratioToLast)])));
  }
  out.push('\n## 네임드 토벌 비용 — 마지막 해역 진입 레벨로 그 구역에 가서 조우할 때까지 낚는 동안 줄어드는 수입(천장을 넣은 기대 캐치 수)');
  out.push(table(
    ['구역', '보상', '조우까지', '줄어드는 수입', '줄어드는 수입 ÷ 보상'],
    e.huntCost.map(r => [zoneById(r.zone)?.shortName ?? r.zone, n0(r.reward), hrs(r.hours), n0(r.loss), pct1(r.lossOverReward)]),
  ));
  return out;
}

const minutes = (sec: number) => `${(sec / 60).toFixed(1)}분`;

/** 분포 요약을 표 칸 네 개(p10, 중앙값, p90, 평균)로 — 끝나지 않은 값은 미도달, 평균이 없으면 — */
function distCells(d: Dist | null, fmt: (x: number) => string): string[] {
  if (!d) return ['—', '—', '—', '—'];
  const f = (x: number) => (Number.isFinite(x) ? fmt(x) : '미도달');
  return [f(d.p10), f(d.p50), f(d.p90), d.mean === null ? '—' : fmt(d.mean)];
}

function distText(d: NonNullable<FlowResult['dist']>): string[] {
  const out: string[] = [];
  out.push('\n## 분포 — 최초 10분 (수동 낚시로 첫 바다 해역에 닿기까지, 낚는 시간만 센 값). p10은 빠른 쪽, p90은 느린(운이 나쁜) 쪽');
  const rows: string[][] = [];
  for (const x of d.opening) {
    const label = x.judgment === 'good' ? 'GOOD' : '무판정';
    for (const [name, dist] of [['영웅 보장', x.epic], ['전설 보장', x.legend], ['첫 바다 해역 도착', x.arrival]] as const) {
      rows.push([label, name, ...distCells(dist, minutes), String(dist ? dist.missing : x.trials)]);
    }
  }
  out.push(table(['판정', '지표', 'p10(빠른 쪽)', '중앙값', 'p90(느린 쪽)', '평균', '못 끝냄(횟수)'], rows));
  for (const x of d.opening) {
    out.push(`- ${x.judgment === 'good' ? 'GOOD' : '무판정'}: 목표 ${OPENING_TARGET_SEC / 60}분 안에 도착한 비율 ${x.within10 === null ? '—(못 끝낸 시도가 있다)' : pct1(x.within10)}, 해석 기댓값 ${Number.isFinite(x.analytic) ? minutes(x.analytic) : '미도달'}(전설 보장 가운데 번호)`);
  }
  const ratio = (mean: number | null | undefined, analytic: number | null) =>
    mean !== null && mean !== undefined && analytic !== null && analytic > 0 ? `${(mean / analytic).toFixed(2)}배` : '—';
  const header = ['전환', 'p10(빠른 쪽)', '중앙값', 'p90(느린 쪽)', '평균', '해석 기댓값', '평균 ÷ 기댓값', '못 끝냄(횟수)'];
  const transitionRows = (pick: (t: TransitionDist) => Dist | null, analytic: (t: TransitionDist) => number | null) => d.transition.map(t => {
    const dist = pick(t), a = analytic(t);
    return [`${nameOf(t.from)} → ${nameOf(t.to)}`, ...distCells(dist, hrs), a === null ? '미도달' : hrs(a), ratio(dist?.mean, a), String(dist ? dist.missing : '—')];
  });
  out.push('\n## 분포 — 해역 전환 시간 (실질 낚시 시간). p10은 빠른 쪽, p90은 느린(운이 나쁜) 쪽');
  out.push(table(header, transitionRows(t => t.hours, t => t.analyticHours)));
  out.push('\n## 분포 — 해역 전환 누적 시간 (처음부터 그 해역에 닿기까지, 누적 평균 ÷ 누적 기댓값)');
  out.push(table(['도착 해역', ...header.slice(1)], transitionRows(t => t.cumulative, t => t.analyticCumulative).map(r => [r[0].split(' → ')[1], ...r.slice(1)])));
  return out;
}

/** 진행 업적 지급 시점 분포 — 보상 없는 진행의 달성 시각과 다음 지역 첫 해역 도착, 보상을 넣었을 때의 도착과 짝지은 단축 */
function rewardDistText(r: NonNullable<NonNullable<FlowResult['dist']>['reward']>, trials: number): string[] {
  const out: string[] = [];
  out.push(`\n## 분포 — 진행 업적 달성 시각 (보상 없는 진행에서 구역 도감 조건을 채운 누적 실질 낚시 시간, 못 채운 시도는 구역을 떠날 때까지 못 채운 것). 보상 ${pct1(r.ratio)}, 기본 업적 몫 ${pct1(r.split)}`);
  out.push(table(
    ['구역', '업적', '지급(골드 / 명성)', 'p10(빠른 쪽)', '중앙값', 'p90(느린 쪽)', '평균', '채운 시도 비율', '못 채움(횟수)'],
    r.rows.map(x => [
      ZONE_NAME[x.zone], x.tier === 'basic' ? '기본' : '네임드', x.reward ? `${n0(x.reward.gold)} / ${n0(x.reward.fame)}` : '기준 전환 없음',
      ...distCells(x.achieved, hrs), x.achieved ? pct1(x.achieved.n / trials) : pct1(0), String(x.achieved ? x.achieved.missing : trials),
    ]),
  ));
  out.push('\n## 분포 — 다음 지역 첫 해역 도착 시각 (구역마다. 보상 없음과 보상을 넣은 진행을 같은 난수 흐름으로 짝지은 값, 단축은 보상 없음 - 보상 있음)');
  const zones = [...new Set(r.rows.map(x => x.zone))].map(z => r.rows.find(x => x.zone === z)!).filter(x => x.to !== null);
  const trio = (d: Dist | null) => distCells(d, hrs).slice(0, 3).join(' / ');
  out.push(table(
    ['구역', '다음 지역 첫 해역', '보상 없음(p10 / 중앙값 / p90)', '보상 있음(p10 / 중앙값 / p90)', '단축(p10 / 중앙값 / p90)', '못 닿음(보상 없음 · 있음)'],
    zones.map(x => [ZONE_NAME[x.zone], nameOf(x.to!), trio(x.arrival), trio(x.arrivalWithReward), trio(x.shortened), `${x.arrival ? x.arrival.missing : trials} · ${x.arrivalWithReward ? x.arrivalWithReward.missing : trials}`]),
  ));
  return out;
}

/** 진행 업적 보상 크기 표 */
function achievementsText(a: NonNullable<FlowResult['achievements']>): string[] {
  const out: string[] = [];
  const cell = (raw: number, v: number) => `${n0(v)} (원값 ${n0(raw)})`;
  out.push('\n## 진행 업적 보상 — 구역 보상 크기 (진행 업적 두 개를 합친 값. 반올림 값과 원값)');
  out.push(table(
    ['구역', '보상 기준 전환', '전환 골드', '배 명성 요구치', ...a.ratios.map(x => `골드 ${pct0(x)}`), ...a.ratios.map(x => `명성 ${pct0(x)}`)],
    a.rows.map(r => {
      const by = (x: number) => r.amounts.find(m => m.ratio === x);
      return [
        ZONE_NAME[r.zone], r.to ? `${nameOf(r.from)} → ${nameOf(r.to)}` : '없음(다음 지역 없음)',
        r.next ? n0(r.next.totalGold) : '미정', r.next ? n0(r.next.fameReq) : '미정',
        ...a.ratios.map(x => { const m = by(x); return m ? cell(m.rawGold, m.gold) : '미정'; }),
        ...a.ratios.map(x => { const m = by(x); return m ? cell(m.rawFame, m.fame) : '미정'; }),
      ];
    }),
  ));
  if (a.split !== null) {
    out.push(`\n## 진행 업적 보상 — 두 업적이 나눈 금액 (기본 업적 몫 ${pct1(a.split)}, 네임드 업적 몫 ${pct1(1 - a.split)}. 기본 업적은 구역 크기 x 몫을 반올림하고 네임드 업적은 나머지)`);
    out.push(table(
      ['구역', '비율', '기본 업적(골드 / 명성)', '네임드 업적(골드 / 명성)', '두 업적 합(골드 / 명성)', '구역 보상 크기(골드 / 명성)'],
      a.rows.flatMap(r => r.amounts.flatMap(m => (m.split ? [[
        ZONE_NAME[r.zone], pct0(m.ratio), `${n0(m.split.basic.gold)} / ${n0(m.split.basic.fame)}`, `${n0(m.split.named.gold)} / ${n0(m.split.named.fame)}`,
        `${n0(m.split.basic.gold + m.split.named.gold)} / ${n0(m.split.basic.fame + m.split.named.fame)}`, `${n0(m.gold)} / ${n0(m.fame)}`,
      ]] : []))),
    ));
  }
  return out;
}

function travelText(t: NonNullable<FlowResult['travel']>): string[] {
  const out: string[] = [];
  out.push('\n## 이동 시간 측정 — 판매 왕복이 낚시 시간에서 차지하는 비중');
  out.push(table(
    ['해역', '거점', '평균 거리(px)', '최장 거리(px)', '속도(px/s)', '가방', '가방 채움', '왕복', '비중', '5% 한도까지 여유(초/왕복)'],
    t.rows.map(r => [
      nameOf(r.spot), r.base, n0(r.distance), n0(r.distanceMax), r.speed, r.bagCap, hrs(r.fillSec / 3600),
      `${r.tripSec.toFixed(1)}초`, `${(r.share * 100).toFixed(2)}%`, n0(r.headroomSec),
    ]),
  ));
  const top = t.rows.reduce((a, b) => (b.share > a.share ? b : a));
  const material = t.rows.filter(r => r.share >= TRAVEL_MATERIAL);
  out.push(`\n해역별 비중의 최댓값은 ${nameOf(top.spot)}의 ${(top.share * 100).toFixed(2)}%다. ${material.length === 0
    ? `모든 해역이 ${TRAVEL_MATERIAL * 100}% 미만이다`
    : `${material.map(r => nameOf(r.spot)).join(', ')}이(가) ${TRAVEL_MATERIAL * 100}% 이상이다`}.`);
  return out;
}

function gatesText(g: GatesReport, o: FlowResult['options']): string[] {
  const poolLabel = { day: '낮 풀', mixed: '낮밤 혼합' } as const;
  const count = (verdicts: GateVerdict[]) => {
    const c = (v: GateVerdict) => verdicts.filter(x => x === v).length;
    return `통과 ${c('통과')}, 예외 ${c('예외')}, 개선 ${c('개선')}, 위반 ${c('위반')}`;
  };
  const show = (v: GateVerdict) => (v === '개선' ? '개선(예외 목록 갱신 필요)' : v);
  const dash = (v: GateVerdict | null) => (v === null ? '—' : show(v));
  const out: string[] = [];
  if (!o.plan && o.bounty) out.push('\n(의뢰와 토벌 모두 수행, 관측용. 판정은 효과와 의뢰 없는 기준 플레이어에 맞춘 것이라 종료 코드에 반영하지 않는다)');
  if (o.plan) out.push(`\n(${planNote(o)}. 판정은 효과를 넣은 관측값에 알려진 예외 목록을 적용한 참고이며 종료 코드에 반영하지 않는다)`);
  out.push('\n## 게이트 검사 — 이동 직후 수입 (새 해역 진입 레벨의 방치 G/h를 같은 레벨로 낚을 수 있는 이전 해역 중 가장 높은 값과 비교)');
  out.push(table(
    ['전환', '풀', '비교 해역', '이동 전 수입(G/h)', '이동 직후 수입(G/h)', '차이', ...(g.moveBase ? ['효과 없음 차이'] : []), '판정'],
    g.move.map((r, i) => [nameOf(r.spot), poolLabel[r.pool], r.from ? nameOf(r.from) : '없음', n0(r.before), n0(r.after), n0(r.diff), ...(g.moveBase ? [n0(g.moveBase[i].diff)] : []), show(r.verdict)]),
  ));
  out.push(`\n${count(g.move.map(r => r.verdict))}`);

  if (!g.moveBase) {
    out.push(`\n## 게이트 검사 — PERFECT 이상치 (같은 해역, 같은 낚싯대 스펙에서 PERFECT ÷ 방치 시간당 골드, 낮밤 혼합. ${PERFECT_LIMIT}배를 넘으면 위반)`);
    out.push(table(
      ['해역', '스펙', '레벨', 'PERFECT ÷ 방치', '판정'],
      g.perfect.map(r => [nameOf(r.spot), r.margin ? `여유(+${r.margin})` : '최소', r.level, `${r.ratio.toFixed(2)}배`, show(r.verdict)]),
    ));
    out.push(`\n${count(g.perfect.map(r => r.verdict))}`);
  }

  out.push(`\n## 게이트 검사 — 배 명성 대기 ÷ 골드 대기 (리프 이후 배를 사는 전환, ${FAME_RATIO_LIMIT}배 이하, 하한 없음)`);
  out.push(table(
    ['전환', '골드 대기', '명성 대기', '명성 대기 ÷ 골드 대기', '판정'],
    g.fame.map(r => [
      `${nameOf(r.from)} → ${nameOf(r.to)}`, r.goldWait === null ? '닿지 못함' : h2(r.goldWait), r.fameWait === null ? '닿지 못함' : h2(r.fameWait),
      r.ratio === null ? '—' : `${r.ratio.toFixed(2)}배`, show(r.verdict),
    ]),
  ));
  out.push(`\n${count(g.fame.map(r => r.verdict))}`);

  if (!g.moveBase) {
    out.push(`\n## 게이트 검사 — 최초 10분 도달 (새 계정이 수동 낚시로 ${OPENING_LIMIT_SEC / 60}분 안에 ${nameOf(SPOTS.find(s => s.boatTier >= 1)!.id)}에 닿는다. 전설 보장 번호 후보 중 가장 느린 값)`);
    out.push(table(
      ['판정 방식', '가장 느린 보장 번호', '도착 시간', '캐치 수', '판정'],
      g.opening.map(r => [r.judgment === 'good' ? 'GOOD' : '무판정', `전설 ${r.legendAt}번째`, r.seconds === null ? '미도착' : minutes(r.seconds), r.catches ?? '—', show(r.verdict)]),
    ));
    out.push(`\n${count(g.opening.map(r => r.verdict))}`);
  }

  out.push('\n## 전환 시간의 목표 판정 (직전 해역에서 방치로 낚을 때의 실질 낚시 시간. 범위는 지역 진입 전환만, 순서는 리프 이후의 전환 전부)');
  const kind = { observe: '관측', entry: '지역 진입', inner: '지역 안' } as const;
  out.push(table(
    ['전환', '구분', '전환 시간', ...(g.moveBase ? ['효과 없음 전환 시간', '차이'] : []), '일수(÷8)', '목표 범위', '범위 판정', '직전 전환', '순서 판정', '요구 파워 간격', '지역 진입 간격'],
    g.time.map(r => [
      `${nameOf(r.from)} → ${nameOf(r.to)}`, kind[r.kind], r.hours === null ? '닿지 못함' : h2(r.hours),
      ...(g.moveBase ? [r.baseHours == null ? '닿지 못함' : h2(r.baseHours), hoursDiff(r.hours, r.baseHours ?? null)] : []),
      r.days === null ? '—' : d1(r.days),
      r.kind === 'observe' ? '—' : r.range ? `${r.range[0]}~${r.range[1]}시간` : '범위 없음', dash(r.rangeVerdict),
      r.prevHours === null ? '—' : h2(r.prevHours), dash(r.orderVerdict), r.powerGap, r.entryPowerGap ?? '—',
    ]),
  ));
  out.push(`\n${count(g.time.flatMap(r => [r.rangeVerdict, r.orderVerdict]).filter((v): v is GateVerdict => v !== null))}`);
  const unreached = g.time.filter(r => r.hours === null).map(r => `${nameOf(r.from)} → ${nameOf(r.to)}`);
  if (unreached.length) out.push(`\n최대 일수 안에 닿지 못한 전환(판정 가능한 항목은 위반): ${unreached.join(', ')}`);
  out.push(`\n전체 — ${count(verdictList(g))}`);
  return out;
}

const signPct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;

function effectLabel(x: Effect): string {
  return [
    x.bite ? `입질 대기 -${(x.bite * 100).toFixed(0)}%` : '', x.rare ? `희귀 이상 가중 +${(x.rare * 100).toFixed(0)}%` : '',
    x.epic ? `영웅 이상 가중 +${(x.epic * 100).toFixed(0)}%` : '', x.legendary ? `전설 가중 +${(x.legendary * 100).toFixed(0)}%` : '',
    x.variant ? `돌연변이 가중치 +${(x.variant * 100).toFixed(0)}%` : '', x.size ? `크기 ${x.size > 0 ? '+' : ''}${(x.size * 100).toFixed(0)}%` : '',
    x.move ? `이동 속도 ${x.move > 0 ? '+' : ''}${(x.move * 100).toFixed(0)}%` : '', x.named ? `네임드 조우 +${(x.named * 100).toFixed(0)}%` : '',
  ].filter(Boolean).join(', ') || '효과 없음';
}

function effectsText(e: EffectsReport, o: FlowResult['options']): string[] {
  const x = e.effect;
  const label = effectLabel(x);
  const info = new Map(o.spots.map(s => [s.id, s]));
  const lv = (spot: SpotId, level: number) => `Lv${level}(요구 ${info.get(spot)!.powerReq})`;
  const out: string[] = [`\n# 요리 효과 — ${label}, 낚싯대는 해역 진입 레벨 ${e.margin >= 0 ? '+' : ''}${e.margin}`];

  out.push('\n## 효과를 넣은 수입 (실질 낚시 시간당, 효과 없음 대비)');
  const showTrip = e.income.some(r => r.tripChange !== null), showNamed = x.named !== 0;
  const incomeHead = ['해역', '낚싯대', '골드/h 기본', '골드/h 효과', '골드 변화', '명성/h 기본', '명성/h 효과', '명성 변화'];
  if (showTrip) incomeHead.push('판매 왕복 포함 골드 변화');
  const showIdle = e.income.some(r => r.overIdle !== null);
  if (showIdle) incomeHead.push('방치 대비 골드(기본 → 효과)');
  const boosted = RARITY_ORDER.filter(g => gradeBoostOf(x)[g] !== 0);
  for (const g of boosted) incomeHead.push(`${RARITY[g].name} 캐치 비율(기본 → 효과)`);
  if (showNamed) incomeHead.push('네임드 조우 기대(기본 → 효과)');
  out.push(table(incomeHead, e.income.map(r => {
    const row = [nameOf(r.spot), lv(r.spot, r.level), n0(r.goldBase), n0(r.goldWith), signPct(r.goldChange), n0(r.fameBase), n0(r.fameWith), signPct(r.fameChange)];
    if (showTrip) row.push(r.tripChange === null ? '—' : signPct(r.tripChange));
    if (showIdle) row.push(r.overIdle ? `${r.overIdle.base.toFixed(2)}배 → ${r.overIdle.with.toFixed(2)}배` : '—');
    for (const g of boosted) row.push(`${(r.grade[g].base * 100).toFixed(2)}% → ${(r.grade[g].with * 100).toFixed(2)}%`);
    if (showNamed) row.push(r.named ? `${h2(r.named.hoursBase)} → ${h2(r.named.hoursWith)}` : '없음');
    return row;
  })));

  out.push(`\n## 도감 완성 시간 (한 해역에서 낚을 때 실질 낚시 시간, 몬테카를로 시드 ${e.seed}, ${e.trials}회. 평균 / p90, 효과 없음 → 효과)`);
  const dexCell = (d: DexTimes[keyof DexTimes]) =>
    !d ? '끝나지 않음' : d.missing > 0 ? `p90 ${hrs(d.p90)}(끝내지 못한 시도 ${d.missing})` : `${hrs(d.mean!)} / ${hrs(d.p90)}`;
  const dexPair = (r: EffectsReport['dex'][number], k: keyof DexTimes) => `${dexCell(r.base[k])} → ${dexCell(r.with[k])}`;
  out.push(table(
    ['해역', '낚싯대', '어종(영웅, 전설)', '일반 폼(전설 제외)', '일반 폼 전부', '돌연변이 폼 전부', '영웅 도감 전부(일반+돌연변이)', '전설 도감 전부(일반+돌연변이)'],
    e.dex.map(r => [
      nameOf(r.spot), lv(r.spot, r.level), `${r.species}(${r.epic}, ${r.legendary})`, dexPair(r, 'noLegend'), dexPair(r, 'all'), dexPair(r, 'variant'),
      r.epic ? dexPair(r, 'epic') : '없음', r.legendary ? dexPair(r, 'legendary') : '없음',
    ]),
  ));

  out.push(`\n## 재료 공급 (낚시 1시간에 분해로 모이는 재료. 단위 ${RARITY_ORDER.map(g => `${RARITY[g].name} ${e.units[g]}`).join(', ')})`);
  out.push(table(
    ['해역', '낚싯대', ...RARITY_ORDER.map(g => `${RARITY[g].name}/h`), '점수/h', '판매 골드/h', '1000G당 점수', '효과 점수/h', '점수 변화', '효과 골드/h'],
    e.supply.map(r => [
      nameOf(r.spot), lv(r.spot, r.level), ...RARITY_ORDER.map(g => r.counts[g].toFixed(1)), n0(r.score), n0(r.gold),
      (r.score / r.gold * 1000).toFixed(1), n0(r.scoreWith), signPct(r.score === 0 ? 0 : r.scoreWith / r.score - 1), n0(r.goldWith),
    ]),
  ));

  if (e.early.length) {
    out.push('\n## 조기 진입 비교 (같은 배로 열리는 이전 해역 중 같은 레벨로 낚을 수 있는 가장 좋은 곳 대비 시간당 골드 비율, 효과를 넣을 때는 두 해역 모두에 효과를 건다)');
    out.push(table(
      ['들어간 해역', '낚싯대', '비교 해역(효과 없음)', '비율(효과 없음)', '비교 해역(효과)', '비율(효과)'],
      e.early.map(r => [nameOf(r.spot), lv(r.spot, r.level), nameOf(r.alt), pct0(r.ratioBase), nameOf(r.altWith), pct0(r.ratioWith)]),
    ));
  }
  return out;
}

const dexCellMean = (d: DexTimes[keyof DexTimes]) => (!d ? '끝나지 않음' : d.mean === null ? `p90 ${hrs(d.p90)}(끝내지 못한 시도 ${d.missing})` : hrs(d.mean));
const minutesOf = (hours: number) => `${Math.round(Math.abs(hours) * 60)}분`;

function windowText(w: NonNullable<FlowResult['window']>, o: FlowResult['options']): string[] {
  const info = new Map(o.spots.map(s => [s.id, s]));
  const lv = (r: WindowRow) => `Lv${r.level}(요구 ${info.get(r.spot)!.powerReq})`;
  const out: string[] = [`\n# 시간 제한 효과 창 — ${effectLabel(w.effect)}, 창 ${w.minutes}분, 낚싯대는 해역 진입 레벨 ${w.margin >= 0 ? '+' : ''}${w.margin}`];
  out.push(`\n## 창 안 기대 캐치 수 (${w.minutes}분, 효과 없음 → 효과)와 수입 증가`);
  out.push(table(
    ['해역', '낚싯대', '전체', ...RARITY_ORDER.map(g => RARITY[g].name), '골드 증가', '명성 증가'],
    w.rows.map(r => [
      nameOf(r.spot), lv(r), `${r.totalBase.toFixed(1)} → ${r.totalWith.toFixed(1)}`,
      ...RARITY_ORDER.map(g => `${r.catches[g].base.toFixed(2)} → ${r.catches[g].with.toFixed(2)}`),
      n0(r.goldGain), n0(r.fameGain),
    ]),
  ));
  if (w.material) {
    const m = w.material, c = RARITY_ORDER.filter(g => m.cost[g]).map(g => `${RARITY[g].name} ${m.cost[g]}`).join(', ');
    out.push(`\n## 재료 비용 — ${m.recipe}의 덮어쓴 기운 ${c}를 ${AXIS_LABEL[m.axis]} 낚시로 그 해역에서 모을 때(효과 지속 ${m.hours >= 1 ? `${m.hours}시간` : `${m.hours * 60}분`}, 순손익 = 지속 동안의 골드 증가 - 판매 손실. recipes와 같은 기준)`);
    out.push(table(
      ['해역', '낚싯대', '재료 모으는 시간', '판매 손실(G)', '수입 증가(G)', '순손익(G)'],
      m.rows.map(r => [nameOf(r.spot), `Lv${r.level}(요구 ${info.get(r.spot)!.powerReq})`, r.collectHours === null ? '모을 수 없음' : hrs(r.collectHours), n0(r.loss), n0(r.gain), r.net === null ? '—' : (r.net >= 0 ? '+' : '') + n0(r.net)]),
    ));
  }
  out.push(`\n## 창 하나가 도감 완성 시간을 줄이는 양 (한 해역에서 낚을 때 평균 실질 낚시 시간, 몬테카를로 시드 ${w.seed}, ${w.trials}회. 효과 없음 → 창 하나 사용, 단축)`);
  const cell = (r: WindowRow, k: keyof WindowRow['saved']) => {
    const s = r.saved[k];
    return `${dexCellMean(r.dex.base[k])} → ${dexCellMean(r.dex.with[k])}${s === null ? '' : `(${s >= 0 ? '-' : '+'}${minutesOf(s)})`}`;
  };
  out.push(table(
    ['해역', '낚싯대', '영웅 도감 전부', '전설 도감 전부', '일반 폼(전설 제외)', '일반 폼 전부', '돌연변이 폼 전부'],
    w.rows.map(r => [
      nameOf(r.spot), lv(r), r.epicSpecies ? cell(r, 'epic') : '없음', r.legendarySpecies ? cell(r, 'legendary') : '없음',
      cell(r, 'noLegend'), cell(r, 'all'), cell(r, 'variant'),
    ]),
  ));
  return out;
}

function recipesText(w: NonNullable<FlowResult['recipes']>, o: FlowResult['options']): string[] {
  const info = new Map(o.spots.map(s => [s.id, s]));
  const lv = (spot: SpotId, level: number) => `Lv${level}(요구 ${info.get(spot)!.powerReq})`;
  const out: string[] = [`\n# 레시피 순손익과 기운 공급 — 재료 모으기 ${AXIS_LABEL[w.axis]}, 낚싯대는 해역 진입 레벨 ${w.margin >= 0 ? '+' : ''}${w.margin}`];
  const cost = (c: (typeof RECIPES)[number]['cost']) => RARITY_ORDER.filter(g => c[g]).map(g => `${RARITY[g].name} ${c[g]}`).join(', ');
  const recipeList = withCostOverrides(RECIPES, w.costOverrides ?? {});
  if (w.costOverrides) out.push(`\n측정 입력: 기운 수량을 덮어씀 — ${Object.entries(w.costOverrides).map(([id, c]) => `${id} ${cost(c)}`).join('; ')}. 효과와 지속은 콘텐츠 값 그대로`);
  const supplyNotes = [
    w.manualShare === undefined ? null : `수동 낚시 ${(w.manualShare * 100).toFixed(0)}%, 방치 ${((1 - w.manualShare) * 100).toFixed(0)}%(공급)`,
    w.visitHours === undefined ? null : `집에 ${w.visitHours}시간마다 들러 가방을 비움(구간이 가방 용량을 넘을 때만 놓아줌)`,
    w.rodOffset === undefined ? null : `공급의 낚싯대는 해역 진입 레벨 ${w.rodOffset >= 0 ? '+' : ''}${w.rodOffset}(순손익 표는 --margin)`,
    w.manualShare === undefined ? null : `공급의 낚시 방식은 --axis가 아니라 이 비율로 정하고 순손익 표의 재료 모으기는 ${AXIS_LABEL[w.axis]}`,
  ].filter((x): x is string => x !== null);
  if (supplyNotes.length > 0) out.push(`\n측정 입력: ${supplyNotes.join(', ')}`);
  const ids = [...new Set(w.rows.map(r => r.recipe))];
  for (const id of ids) {
    const recipe = recipeList.find(r => r.id === id)!;
    out.push(`\n## ${recipe.name}(${id}) — 기운 ${cost(recipe.cost)}, ${recipe.kind === 'lunch' ? '도시락' : '미끼 요리'} ${recipe.hours >= 1 ? `${recipe.hours}시간` : `${recipe.hours * 60}분`}, 효과 ${effectLabel(recipe.effect)}`);
    out.push(table(
      ['해역', '낚싯대', '재료 모으는 시간', '판매 손실(G)', '수입 증가(G)', '명성 증가', '순손익(G)', '증가 ÷ 손실'],
      w.rows.filter(r => r.recipe === id).map(r => [
        nameOf(r.spot), lv(r.spot, r.level), r.collectHours === null ? '모을 수 없음' : hrs(r.collectHours), n0(r.loss), n0(r.gain), n0(r.gainFame),
        r.net === null ? '—' : (r.net >= 0 ? '+' : '') + n0(r.net), r.ratio === null ? '—' : `${r.ratio.toFixed(2)}배`,
      ]),
    ));
  }
  out.push(`\n## 집 기운 얻기 공급 — 배 단계마다 가방을 비우고 판매 없이 ${w.hours}시간 낚은 뒤${w.visitHours === undefined ? '' : `(${w.visitHours}시간마다 집에 들름)`} 해역 기본 선택대로 기운으로 바꿀 때(몬테카를로 시드 ${w.seed}, ${w.trials}회 평균)`);
  out.push(table(
    ['배 단계', '해역', '낚싯대', '가방', '낚은 수', '기본 선택', ...RARITY_ORDER.map(g => `${RARITY[g].name} 기운`), '놓아준 개체', '놓아준 판매가', '기운이 된 개체 판매가'],
    w.bag.map(r => [
      `${r.boat}단계`, nameOf(r.spot), lv(r.spot, r.level), r.cap, r.catches, r.frontmost ? '제외(가장 앞선 해역)' : '대상',
      ...RARITY_ORDER.map(g => r.energy[g].toFixed(1)), RARITY_ORDER.reduce((a, g) => a + r.released[g], 0).toFixed(1), n0(r.releasedGold), n0(r.energyGold),
    ]),
  ));
  const shown = recipeList.filter(r => ids.includes(r.id));
  out.push(`\n## 집 기운으로 만들 수 있는 레시피 수 (${w.hours}시간 ${w.visitHours === undefined ? '한 번의 낚시' : `낚시, ${w.visitHours}시간마다 집에 들름`})`);
  out.push(table(
    ['배 단계', '해역', ...shown.map(r => r.name)],
    w.bag.map(r => [`${r.boat}단계`, nameOf(r.spot), ...shown.map(rc => recipesCovered(r.energy, rc).toFixed(1))]),
  ));
  return out;
}

/** 위반이 하나라도 있으면 true — gates 명령의 종료 코드 판정 */
/** 효과 관측과 의뢰 수행 관측의 gates는 기준 플레이어의 판정이 아니므로 종료 코드에 반영하지 않는다 */
export const hasViolation = (r: FlowResult): boolean =>
  r.gates !== undefined && r.gates.moveBase === undefined && !r.options.bounty && verdictCounts(r.gates)['위반'] > 0;

/** 결과를 사람이 읽는 표로 바꾼다 */
export function renderText(r: FlowResult): string {
  const o = r.options;
  const lines = [
    `# 플레이 흐름 시뮬레이션 — 낚시 방식 ${AXIS_LABEL[o.axis]}, 모든 시간은 실질 낚시 시간, 일수는 ÷ ${DAY_HOURS}, 최대 ${o.maxDays}일`,
    o.override ? `덮어쓰기: ${JSON.stringify(o.override)}` : '덮어쓰기: 없음',
  ];
  if (r.dist) lines.push(`난수: 시드 ${o.seed}, 시도 ${o.trials}회`);
  if (r.transition) lines.push(...transitionText(r.transition, o), assumptionText('transition', o));
  if (r.days) lines.push(...daysText(r.days, o), assumptionText('days', o));
  if (r.opening) lines.push(...openingText(r.opening), assumptionText('opening', o));
  if (r.exception) lines.push(...exceptionText(r.exception, o), assumptionText('exception', o));
  if (r.ev) lines.push(...evText(r.ev, o), assumptionText('ev', o));
  if (r.dist) lines.push(...distText(r.dist), assumptionText('dist', o));
  if (r.dist?.reward) lines.push(...rewardDistText(r.dist.reward, o.trials), ['\n가정:', ...rewardAssumptions().map(l => `- ${l}`), '- 보상 없는 진행과 보상을 넣은 진행은 시도마다 같은 시드에서 출발해, 지급 전 구간은 같은 난수 흐름이다. 지급 뒤에는 해역 이동 시점이 달라져 난수가 다른 캐치에 쓰인다'].join('\n'));
  if (r.achievements) lines.push(...achievementsText(r.achievements), assumptionText('achievements', o));
  if (r.travel) lines.push(...travelText(r.travel), assumptionText('travel', o));
  if (r.effects) lines.push(...effectsText(r.effects, o), assumptionText('effects', o));
  if (r.window) lines.push(...windowText(r.window, o), assumptionText('window', o, r.window.material !== undefined));
  if (r.recipes) lines.push(...recipesText(r.recipes, o), assumptionText('recipes', o));
  if (r.gates) lines.push(...gatesText(r.gates, o));
  if (r.gates && o.plan) lines.push(['\n가정:', ...planAssumptions().map(l => `- ${l}`)].join('\n'));
  return lines.join('\n');
}

export interface CliResult { stdout: string; stderr: string; exitCode: number }

/** 명령줄 인자를 실행해 출력과 종료 코드를 돌려준다. 오류와 게이트 위반은 종료 코드 1이다 */
export function runCli(argv: readonly string[]): CliResult {
  try {
    const options = parseArgs(argv);
    if (options.help) return { stdout: HELP, stderr: '', exitCode: 0 };
    const result = runFlow(options);
    return { stdout: options.json ? JSON.stringify(result, null, 2) : renderText(result), stderr: '', exitCode: hasViolation(result) ? 1 : 0 };
  } catch (e) {
    return { stdout: '', stderr: `오류: ${e instanceof Error ? e.message : String(e)}`, exitCode: 1 };
  }
}
