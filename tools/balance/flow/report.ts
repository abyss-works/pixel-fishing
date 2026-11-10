// 플레이 흐름 시뮬레이션 명령의 인자 해석, 실행, 출력.
// 계산은 각 지표 모듈이 하고 여기서는 모아서 표로 찍는다. 같은 인자의 출력은 항상 같다(시각을 쓰지 않고 난수는 시드를 고정한다).
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { zoneById } from '../../../src/game/content/zones';
import { FIRST_CATCH_EPIC_AT, FIRST_CATCH_LEGEND_MAX, FIRST_CATCH_LEGEND_MIN } from '../../../src/game/rules/firstCatch';
import { entryLevel } from '../model';
import { gateRows } from '../gates';
import type { GateRow } from '../gates';
import { applyOverride, loadOverride } from './override';
import type { FlowOverride } from './override';
import { DAY_HOURS } from './progress';
import type { FlowAxis } from './progress';
import { transitionReport } from './transitions';
import type { TransitionReport } from './transitions';
import { daysReport } from './days';
import type { DaysReport } from './days';
import { OPENING_TARGET_SEC, simulateOpening } from './opening';
import type { Judgment, OpeningResult } from './opening';
import { evReport } from './ev';
import type { EvReport } from './ev';
import { DEFAULT_SEED, DEFAULT_TRIALS, openingDist, transitionDist } from './dist';
import type { OpeningDist, TransitionDist } from './dist';
import type { Dist } from './sample';
import { TRAVEL_MATERIAL, TRAVEL_SAMPLE_DAYS, TRAVEL_SAMPLE_START, travelRows } from './travel';
import type { TravelRow } from './travel';
import { OFFSETS, earlyEntry, huntCost, incomeByOffset, returnTrips } from './exception';
import type { EarlyEntryRow, HuntRow, IncomeRow, ReturnTrip } from './exception';

export type Command = 'transition' | 'days' | 'opening' | 'exception' | 'ev' | 'gates' | 'dist' | 'travel';
/** 명령을 생략하면 내는 지표 명령 — gates(판정), dist(몬테카를로), travel(이동 측정)은 이름을 줄 때만 실행한다 */
export const COMMANDS: readonly Command[] = ['transition', 'days', 'opening', 'exception', 'ev'];
const NAMED_COMMANDS: readonly Command[] = [...COMMANDS, 'gates', 'dist', 'travel'];

export interface FlowOptions {
  commands: Command[];
  override: string | null;
  json: boolean;
  /** 전설 보장 번호. null이면 제품 범위의 처음, 가운데, 끝 번호를 모두 낸다 */
  legendAt: number | null;
  axis: FlowAxis;
  maxDays: number;
  help: boolean;
  /** dist의 난수 시드와 시도 횟수 */
  seed: number;
  trials: number;
}

export const HELP = `사용: pnpm balance:flow [transition|days|opening|exception|ev|gates|dist|travel] [옵션]
명령을 생략하면 gates, dist, travel을 뺀 다섯 가지를 모두 낸다.

명령
  transition  해역 전환: 전환 골드(다음 진입 레벨까지 강화비 + 새 배 가격)와 비중, 전환 시간(실질 낚시 시간)과 8시간 환산 일수, 배 명성 대기
  days        해역별 누적 실질 낚시 시간과 8시간 환산 일수, 마지막 해역 레벨업 시간. 일반 의뢰와 네임드 토벌 수행 여부별
  opening     최초 10분: 수동 낚시로 첫 바다 해역에 닿는 시간. 영웅 1회와 전설 1회 보장
  exception   예외 흐름: 진입 레벨 -4부터 +4까지 수입, 조기 진입, 낮은 지역으로 돌아옴, 네임드 토벌 비용
  ev          방치 EV: 해역별 방치 시간당 기대 골드(딱렙, 다음 진입 직전), 구역 대표 EV, 의뢰·토벌 보상의 EV 시간 환산과 목표 대비 차이, 새 보상과 변화율. 항상 방치 기준이다
  dist        분포: 같은 규칙과 상수로 캐치마다 뽑는 몬테카를로. 최초 10분(영웅 보장, 전설 보장, 첫 바다 해역 도착 시각)과 해역 전환 시간의 p10, 중앙값, p90, 평균을 해석 기댓값과 함께 낸다. p90이 운이 나쁜(느린) 쪽이다
  travel      이동 시간 관측: 가방이 차면 거점에 가서 팔고 돌아오는 왕복이 낚시 시간에서 차지하는 비중을 해역별로 잰다. 다른 명령의 시간에 넣지 않는다
  gates       게이트 검사: 새 해역 진입 레벨의 방치 수입이 같은 레벨로 낚을 수 있는 이전 해역의 가장 좋은 값 이상인지 전환마다 판정(통과, 위반, 예외). 위반이 하나라도 있으면 종료 코드 1

옵션
  --override <파일>  배 가격, 명성 요구치, 해역 요구 파워, 해역 어종 가격 배율을 덮어쓰는 JSON. 형식은
                     {"boats":{"2":{"price":2500,"fameReq":800}},"spots":{"sea":{"powerReq":35,"priceMult":0.85}}}
                     priceMult는 그 해역 어종 판매가에 곱하고 가격 사다리(일반 정수, 희귀 이상 앞 두 자리)로 맞춘다
  --json             표 대신 JSON으로 낸다
  --legend-at <N>    opening의 전설 보장 캐치 번호(${FIRST_CATCH_LEGEND_MIN}에서 ${FIRST_CATCH_LEGEND_MAX}). 생략하면 ${FIRST_CATCH_LEGEND_MIN}, ${Math.round((FIRST_CATCH_LEGEND_MIN + FIRST_CATCH_LEGEND_MAX) / 2)}, ${FIRST_CATCH_LEGEND_MAX}를 모두 낸다
  --axis <idle|manual>  낚시 방식. 기본 idle(방치). manual은 GOOD 판정(파워 미달 해역은 무판정)
  --max-days <N>     시뮬레이션 최대 일수(하루는 실질 낚시 ${DAY_HOURS}시간). 기본 365
  --seed <N>         dist의 난수 시드(정수). 기본 ${DEFAULT_SEED}. 같은 시드, 시도 횟수, 인자의 출력은 항상 같다
  --trials <N>       dist의 시도 횟수(1 이상 정수). 기본 ${DEFAULT_TRIALS}
  --help             이 도움말
`;

const VALUE_FLAGS = ['--override', '--legend-at', '--axis', '--max-days', '--seed', '--trials'] as const;
const BOOL_FLAGS = ['--json', '--help'] as const;

function numberOf(flag: string, raw: string): number {
  const v = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(v)) throw new Error(`${flag}에는 숫자가 필요합니다: ${raw}`);
  return v;
}

export function parseArgs(argv: readonly string[]): FlowOptions {
  const o: FlowOptions = {
    commands: [], override: null, json: false, legendAt: null, axis: 'idle', maxDays: 365, help: false,
    seed: DEFAULT_SEED, trials: DEFAULT_TRIALS,
  };
  let command: Command | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if ((BOOL_FLAGS as readonly string[]).includes(a)) {
        if (a === '--json') o.json = true; else o.help = true;
        continue;
      }
      if (!(VALUE_FLAGS as readonly string[]).includes(a)) throw new Error(`알 수 없는 옵션입니다: ${a} (--help 참고)`);
      const raw = argv[++i];
      if (raw === undefined || raw.startsWith('--')) throw new Error(`${a}에는 값이 필요합니다`);
      if (a === '--override') o.override = raw;
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
        if (raw !== 'idle' && raw !== 'manual') throw new Error('--axis는 idle 또는 manual이어야 합니다');
        o.axis = raw;
      }
      continue;
    }
    if (!(NAMED_COMMANDS as readonly string[]).includes(a)) throw new Error(`알 수 없는 명령입니다: ${a} (--help 참고)`);
    if (command) throw new Error('명령은 하나만 고를 수 있습니다');
    command = a as Command;
  }
  o.commands = command ? [command] : [...COMMANDS];
  return o;
}

export interface SpotInfo { id: SpotId; name: string; powerReq: number; entryLevel: number }

export interface FlowResult {
  options: { axis: FlowAxis; legendAt: number | null; maxDays: number; override: FlowOverride | null;
    seed: number; trials: number;
    /** 계산 당시의 해역 표시 값 — 덮어쓰기를 되돌린 뒤에도 표 라벨이 덮어쓴 값으로 나오게 담아 둔다 */
    spots: SpotInfo[];
  };
  transition?: TransitionReport;
  days?: DaysReport;
  opening?: OpeningResult[];
  ev?: EvReport;
  gates?: GateRow[];
  dist?: { opening: OpeningDist[]; transition: TransitionDist[] };
  travel?: { rows: TravelRow[]; sampleDays: number };
  exception?: { income: IncomeRow[]; earlyEntry: EarlyEntryRow[]; returnTrips: ReturnTrip[]; huntCost: HuntRow[] };
}

/** 전설 보장 번호 후보 — 지정하면 그 번호, 아니면 제품 범위의 처음, 가운데, 끝 */
const legendCandidates = (legendAt: number | null): number[] =>
  legendAt !== null ? [legendAt] : [FIRST_CATCH_LEGEND_MIN, Math.round((FIRST_CATCH_LEGEND_MIN + FIRST_CATCH_LEGEND_MAX) / 2), FIRST_CATCH_LEGEND_MAX];

export function runFlow(o: FlowOptions): FlowResult {
  const override = o.override ? loadOverride(o.override) : null;
  const restore = override ? applyOverride(override) : () => {};
  try {
    const res: FlowResult = { options: { axis: o.axis, legendAt: o.legendAt, maxDays: o.maxDays, override,
      seed: o.seed, trials: o.trials,
      spots: SPOTS.map(sp => ({ id: sp.id, name: sp.name, powerReq: sp.powerReq ?? 0, entryLevel: entryLevel(sp.id) })) } };
    const sim = { axis: o.axis, maxDays: o.maxDays };
    if (o.commands.includes('transition')) res.transition = transitionReport(sim);
    if (o.commands.includes('days')) res.days = daysReport(sim);
    if (o.commands.includes('opening')) {
      const judgments: Judgment[] = ['normal', 'good'];
      res.opening = judgments.flatMap(judgment => [null, ...legendCandidates(o.legendAt)].map(legendAt => simulateOpening({ judgment, legendAt })));
    }
    if (o.commands.includes('dist')) {
      res.dist = {
        opening: (['normal', 'good'] as const).map(judgment => openingDist({ judgment, trials: o.trials, seed: o.seed })),
        transition: transitionDist({ trials: o.trials, seed: o.seed, ...sim }),
      };
    }
    if (o.commands.includes('travel')) res.travel = { rows: travelRows(), sampleDays: TRAVEL_SAMPLE_DAYS };
    if (o.commands.includes('ev')) res.ev = evReport();
    if (o.commands.includes('gates')) res.gates = gateRows();
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
const AXIS_LABEL: Record<FlowAxis, string> = { idle: '방치', manual: '수동 GOOD(파워 미달 해역은 무판정)' };

function table(headers: string[], rows: (string | number)[][]): string {
  return [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');
}

const BASIC_ASSUMPTION = `모든 시간은 실질 낚시 시간이다. 이동, 판매 왕복, 창 조작, 게임을 끈 시간, 접속해 있어도 낚지 못하는 시간은 넣지 않는다. 낚은 물고기는 모두 판매 수입이다. 판매는 즉시이고 미끼, 유물, 쿠폰은 넣지 않는다. 방치 사이클은 모델 사이클이다. 일수는 실질 낚시 시간 ÷ ${DAY_HOURS}이다`;

function assumptionText(command: Command, o: FlowResult['options']): string {
  const lines: string[] = [BASIC_ASSUMPTION];
  if (command === 'transition') {
    lines.push('새 계정이 직전 해역에서 낚아 전환 골드를 모으고 배 명성 하한을 채운 시점에 바로 옮긴다', '명성을 기다리는 동안은 다음 해역 진입 레벨을 넘겨 강화하지 않고 골드를 쌓는다', '의뢰와 토벌은 하지 않는 경우다');
  } else if (command === 'days') {
    lines.push(
      '의뢰 라이선스는 그 구역 도감(일반 폼)을 모두 모았을 확률이 0.5를 넘는 날부터 쓴다. 어종은 서로 독립이고 낚은 해역에서만 쌓이며 어종 천장은 넣지 않는다',
      '지나온 해역으로 돌아가 도감을 채우지 않는다',
      '일반 의뢰는 물고기를 건네지 않고 골드 보상만 받는다. 난이도마다 그날 후보 중 끝낼 수 있는 후보의 평균으로 보고 하루 1회, 네임드 토벌도 하루 1회다',
      '네임드 결투는 항상 이기고 조우는 천장을 넣은 기대 캐치 수로 센다. 의뢰 중에는 그 구역에서 낚을 수 있는 해역을 같은 시간씩 낚고 항구 이동 시간은 넣지 않는다',
      '레벨업은 낚싯대가 그 레벨에 처음 닿은 시점에 시뮬레이션이 실제로 가진 라이선스로 계산한 정상 상태의 하루 수입으로 나눈다',
    );
  } else if (command === 'dist') {
    lines.push(
      '해석적 기댓값 경로와 같은 확률, 판매가, 캐치 주기, 첫 경험 보장 규칙을 캐치마다 뽑는다. 입질 대기는 범위 균등이고 어종은 낮밤 혼합 확률, 돌연변이는 전역 확률이다. 기댓값 경로에 없는 pity, 미끼, 유물은 넣지 않는다',
      `난수는 시드 고정 mulberry32이고 시도마다 같은 흐름을 이어 쓴다. 같은 시드(${o.seed}), 시도 횟수(${o.trials}), 인자의 출력은 항상 같다`,
      'p10은 빠른 쪽(운이 좋은 10%의 경계), p90은 느린 쪽(운이 나쁜 10%의 경계)이다',
      '최초 10분: 전설 보장 번호는 제품 규칙대로 시도마다 10에서 20 사이로 뽑는다. 도착 뒤에도 보장이 남으면 그 해역에서 더 낚아 보장 시각을 재고, 10분 안에 못 닿은 시도도 도착 시간에 넣는다. 해석 기댓값은 전설 보장이 가운데 번호일 때의 값이다',
      '해역 전환: 방치로 낚는 새 계정을 시도마다 처음부터 끝까지 한 번 시뮬레이션하고 전환별 시간을 모은다. 앞 해역은 전환 소요가 짧아, 캐치 가격이 한쪽으로 치우쳐 고가 어종으로 문턱을 넘은 초과분이 다음 전환으로 넘어가는 효과와 1분 단위 문턱 판정의 영향이 커서 개별 전환의 표본 평균이 기댓값과 벌어진다. 누적 소요가 긴 남인도양 이후 해역은 누적 시간으로 보면 기댓값과 일치하지만, 앞 해역은 누적으로도 표본 평균이 기댓값보다 크다',
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
  out.push(table(
    ['전환', '전환 시간', '일수(÷8)', '누적 시간', '누적 일수(÷8)', '기다린 것(골드 · 명성 · 둘 다)', '명성 대기 ÷ 골드 대기'],
    t.timings.map(c => [
      `${nameOf(c.row.from)} → ${nameOf(c.row.to)}`, h2(c.hours), d1(c.days), h2(c.cumulativeHours), d1(c.cumulativeDays),
      `${hrs(c.waitGold)} · ${hrs(c.waitFame)} · ${hrs(c.waitBoth)}`, c.fameOverGold === null ? '—' : `${c.fameOverGold.toFixed(2)}배`,
    ]),
  ));
  return out;
}

function daysText(d: NonNullable<FlowResult['days']>): string[] {
  const out: string[] = [];
  const cell = (x: { hours: number | null; days: number | null }) => (x.hours === null ? '미도착' : `${h2(x.hours)} (${d1(x.days!)})`);
  out.push('\n## 해역별 누적 도달 — 새 계정이 해역에 처음 닿기까지의 누적 실질 낚시 시간과 8시간 환산 일수');
  out.push(table(
    ['해역', '의뢰·토벌 수행 안 함', '의뢰·토벌 모두 수행'],
    SPOTS.map((s, i) => [s.name, ...d.arrival.map(r => cell(r.spots[i]))]),
  ));
  const incomplete = d.arrival.filter(r => !r.complete).map(r => (r.bounty ? '모두 수행' : '수행 안 함'));
  if (incomplete.length) out.push(`(최대 일수 안에 마지막 해역에 닿지 못한 경우: ${incomplete.join(', ')})`);
  for (const level of [...new Set(d.levelUp.map(r => r.level))]) {
    const rows = d.levelUp.filter(r => r.level === level);
    out.push(`\n## 마지막 해역 레벨업 — Lv${level}에서 Lv${level + 1}로 (강화 ${n0(rows[0].upgradeGold)}G)`);
    out.push(table(
      ['의뢰·토벌', '레벨 도달(누적 시간)', '쓰는 라이선스', '8시간 골드', '보상 비중', '소요 시간', '소요 일수(÷8)'],
      rows.map(r => [
        r.bounty ? '모두 수행' : '수행 안 함', r.reachedHours === null ? '—' : h2(r.reachedHours),
        r.bounty ? (r.licenses.join(', ') || '없음') : '—',
        r.dailyGold === null ? '미도달' : n0(r.dailyGold), r.bountyShare === null ? '—' : pct0(r.bountyShare),
        r.hours === null ? '미도달' : h2(r.hours), r.days === null ? '미도달' : d1(r.days),
      ]),
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

function gatesText(rows: GateRow[]): string[] {
  const poolLabel = { day: '낮 풀', mixed: '낮밤 혼합' } as const;
  const out: string[] = ['\n## 게이트 검사 — 이동 직후 수입 (새 해역 진입 레벨의 방치 G/h를 같은 레벨로 낚을 수 있는 이전 해역 중 가장 높은 값과 비교)'];
  out.push(table(
    ['전환', '풀', '비교 해역', '이동 전 수입(G/h)', '이동 직후 수입(G/h)', '차이', '판정'],
    rows.map(r => [nameOf(r.spot), poolLabel[r.pool], r.from ? nameOf(r.from) : '없음', n0(r.before), n0(r.after), n0(r.diff), r.verdict === '개선' ? '개선(예외 목록 갱신 필요)' : r.verdict]),
  ));
  const count = (v: GateRow['verdict']) => rows.filter(r => r.verdict === v).length;
  out.push(`\n통과 ${count('통과')}, 예외 ${count('예외')}, 개선 ${count('개선')}, 위반 ${count('위반')}`);
  return out;
}

/** 위반이 하나라도 있으면 true — gates 명령의 종료 코드 판정 */
export const hasViolation = (r: FlowResult): boolean => (r.gates ?? []).some(g => g.verdict === '위반');

/** 결과를 사람이 읽는 표로 바꾼다 */
export function renderText(r: FlowResult): string {
  const o = r.options;
  const lines = [
    `# 플레이 흐름 시뮬레이션 — 낚시 방식 ${AXIS_LABEL[o.axis]}, 모든 시간은 실질 낚시 시간, 일수는 ÷ ${DAY_HOURS}, 최대 ${o.maxDays}일`,
    o.override ? `덮어쓰기: ${JSON.stringify(o.override)}` : '덮어쓰기: 없음',
  ];
  if (r.dist) lines.push(`난수: 시드 ${o.seed}, 시도 ${o.trials}회`);
  if (r.transition) lines.push(...transitionText(r.transition, o), assumptionText('transition', o));
  if (r.days) lines.push(...daysText(r.days), assumptionText('days', o));
  if (r.opening) lines.push(...openingText(r.opening), assumptionText('opening', o));
  if (r.exception) lines.push(...exceptionText(r.exception, o), assumptionText('exception', o));
  if (r.ev) lines.push(...evText(r.ev, o), assumptionText('ev', o));
  if (r.dist) lines.push(...distText(r.dist), assumptionText('dist', o));
  if (r.travel) lines.push(...travelText(r.travel), assumptionText('travel', o));
  if (r.gates) lines.push(...gatesText(r.gates));
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
