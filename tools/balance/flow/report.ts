// 플레이 흐름 시뮬레이션 명령의 인자 해석, 실행, 출력.
// 계산은 각 지표 모듈이 하고 여기서는 모아서 표로 찍는다. 같은 인자의 출력은 항상 같다(난수와 시각을 쓰지 않는다).
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { zoneById } from '../../../src/game/content/zones';
import { FIRST_CATCH_EPIC_AT, FIRST_CATCH_LEGEND_MAX, FIRST_CATCH_LEGEND_MIN } from '../../../src/game/rules/firstCatch';
import { entryLevel } from '../model';
import { applyOverride, loadOverride } from './override';
import type { FlowOverride } from './override';
import type { FlowAxis } from './progress';
import { transitionReport } from './transitions';
import type { TransitionReport } from './transitions';
import { daysReport } from './days';
import type { DaysReport } from './days';
import { OPENING_TARGET_SEC, simulateOpening } from './opening';
import type { Judgment, OpeningResult } from './opening';
import { evReport } from './ev';
import type { EvReport } from './ev';
import { OFFSETS, earlyEntry, huntCost, incomeByOffset, returnTrips } from './exception';
import type { EarlyEntryRow, HuntRow, IncomeRow, ReturnTrip } from './exception';

export type Command = 'transition' | 'days' | 'opening' | 'exception' | 'ev';
export const COMMANDS: readonly Command[] = ['transition', 'days', 'opening', 'exception', 'ev'];

export interface FlowOptions {
  commands: Command[];
  override: string | null;
  json: boolean;
  /** 4시간 유형의 낚지 못하는 비율(%). null이면 0, 25, 50을 모두 낸다 */
  loss4h: number | null;
  /** 전설 보장 번호. null이면 제품 범위의 처음, 가운데, 끝 번호를 모두 낸다 */
  legendAt: number | null;
  axis: FlowAxis;
  maxDays: number;
  /** 깨어 있는 동안에도 가방 한도를 적용한다 */
  bagCapAwake: boolean;
  help: boolean;
}

export const HELP = `사용: pnpm balance:flow [transition|days|opening|exception|ev] [옵션]
명령을 생략하면 다섯 가지를 모두 낸다.

명령
  transition  해역 전환: 전환 골드(다음 진입 레벨까지 강화비 + 새 배 가격)와 비중, 연속 방치 소요, 배 명성 대기, 유형별 도착 일차
  days        플레이 유형(16, 8, 4, 2, 1시간)별 해역 도착 일차와 마지막 해역 레벨업 일수. 일반 의뢰와 네임드 토벌 수행 여부별
  opening     최초 10분: 수동 낚시로 첫 바다 해역에 닿는 시간. 영웅 1회와 전설 1회 보장
  exception   예외 흐름: 진입 레벨 -4부터 +4까지 수입, 조기 진입, 낮은 지역으로 돌아옴, 네임드 토벌 비용
  ev          방치 EV: 해역별 방치 시간당 기대 골드(딱렙, 다음 진입 직전), 구역 대표 EV, 의뢰·토벌 보상의 EV 시간 환산과 목표 대비 차이, 새 보상과 변화율. 항상 방치 기준이다

옵션
  --override <파일>  배 가격, 명성 요구치, 해역 요구 파워를 덮어쓰는 JSON. 형식은
                     {"boats":{"2":{"price":2500,"fameReq":800}},"spots":{"sea":{"powerReq":35}}}
  --json             표 대신 JSON으로 낸다
  --loss4h <N>       4시간 유형에서 접속해 있어도 낚지 못하는 비율(%). 근거 있는 값이 없어 생략하면 0, 25, 50(낚시 100%, 75%, 50%)을 모두 낸다
  --legend-at <N>    opening의 전설 보장 캐치 번호(${FIRST_CATCH_LEGEND_MIN}에서 ${FIRST_CATCH_LEGEND_MAX}). 생략하면 ${FIRST_CATCH_LEGEND_MIN}, ${Math.round((FIRST_CATCH_LEGEND_MIN + FIRST_CATCH_LEGEND_MAX) / 2)}, ${FIRST_CATCH_LEGEND_MAX}를 모두 낸다
  --axis <idle|manual>  깨어 있는 동안의 낚시 방식. 기본 idle(방치). manual은 GOOD 판정(파워 미달 해역은 무판정)
  --max-days <N>     시뮬레이션 최대 일수. 기본 365
  --bag-cap-awake    깨어 있는 동안에도 가방 한도를 적용한다(하루 깨어 있는 동안 팔지 않는 하한). 기본은 적용하지 않는다
  --help             이 도움말
`;

const VALUE_FLAGS = ['--override', '--loss4h', '--legend-at', '--axis', '--max-days'] as const;
const BOOL_FLAGS = ['--json', '--help', '--bag-cap-awake'] as const;

function numberOf(flag: string, raw: string): number {
  const v = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(v)) throw new Error(`${flag}에는 숫자가 필요합니다: ${raw}`);
  return v;
}

export function parseArgs(argv: readonly string[]): FlowOptions {
  const o: FlowOptions = {
    commands: [], override: null, json: false, loss4h: null, legendAt: null, axis: 'idle', maxDays: 365, bagCapAwake: false, help: false,
  };
  let command: Command | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if ((BOOL_FLAGS as readonly string[]).includes(a)) {
        if (a === '--json') o.json = true; else if (a === '--help') o.help = true; else o.bagCapAwake = true;
        continue;
      }
      if (!(VALUE_FLAGS as readonly string[]).includes(a)) throw new Error(`알 수 없는 옵션입니다: ${a} (--help 참고)`);
      const raw = argv[++i];
      if (raw === undefined || raw.startsWith('--')) throw new Error(`${a}에는 값이 필요합니다`);
      if (a === '--override') o.override = raw;
      else if (a === '--loss4h') o.loss4h = numberOf(a, raw);
      else if (a === '--legend-at') o.legendAt = numberOf(a, raw);
      else if (a === '--max-days') {
        o.maxDays = numberOf(a, raw);
        if (!Number.isInteger(o.maxDays) || o.maxDays < 1) throw new Error('--max-days는 1 이상의 정수여야 합니다');
      } else {
        if (raw !== 'idle' && raw !== 'manual') throw new Error('--axis는 idle 또는 manual이어야 합니다');
        o.axis = raw;
      }
      continue;
    }
    if (!(COMMANDS as readonly string[]).includes(a)) throw new Error(`알 수 없는 명령입니다: ${a} (--help 참고)`);
    if (command) throw new Error('명령은 하나만 고를 수 있습니다');
    command = a as Command;
  }
  o.commands = command ? [command] : [...COMMANDS];
  return o;
}

export interface SpotInfo { id: SpotId; name: string; powerReq: number; entryLevel: number }

export interface FlowResult {
  options: { axis: FlowAxis; loss4h: number | null; legendAt: number | null; maxDays: number; bagCapAwake: boolean; override: FlowOverride | null;
    /** 계산 당시의 해역 표시 값 — 덮어쓰기를 되돌린 뒤에도 표 라벨이 덮어쓴 값으로 나오게 담아 둔다 */
    spots: SpotInfo[];
  };
  transition?: TransitionReport;
  days?: DaysReport;
  opening?: OpeningResult[];
  ev?: EvReport;
  exception?: { income: IncomeRow[]; earlyEntry: EarlyEntryRow[]; returnTrips: ReturnTrip[]; huntCost: HuntRow[] };
}

/** 전설 보장 번호 후보 — 지정하면 그 번호, 아니면 제품 범위의 처음, 가운데, 끝 */
const legendCandidates = (legendAt: number | null): number[] =>
  legendAt !== null ? [legendAt] : [FIRST_CATCH_LEGEND_MIN, Math.round((FIRST_CATCH_LEGEND_MIN + FIRST_CATCH_LEGEND_MAX) / 2), FIRST_CATCH_LEGEND_MAX];

export function runFlow(o: FlowOptions): FlowResult {
  const override = o.override ? loadOverride(o.override) : null;
  const restore = override ? applyOverride(override) : () => {};
  try {
    const res: FlowResult = { options: { axis: o.axis, loss4h: o.loss4h, legendAt: o.legendAt, maxDays: o.maxDays, bagCapAwake: o.bagCapAwake, override,
      spots: SPOTS.map(sp => ({ id: sp.id, name: sp.name, powerReq: sp.powerReq ?? 0, entryLevel: entryLevel(sp.id) })) } };
    const sim = { axis: o.axis, loss4h: o.loss4h, maxDays: o.maxDays, bagCapAwake: o.bagCapAwake };
    if (o.commands.includes('transition')) res.transition = transitionReport(sim);
    if (o.commands.includes('days')) res.days = daysReport(sim);
    if (o.commands.includes('opening')) {
      const judgments: Judgment[] = ['normal', 'good'];
      res.opening = judgments.flatMap(judgment => [null, ...legendCandidates(o.legendAt)].map(legendAt => simulateOpening({ judgment, legendAt })));
    }
    if (o.commands.includes('ev')) res.ev = evReport();
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
const nameOf = (spot: SpotId) => SPOTS.find(s => s.id === spot)!.name;
const AXIS_LABEL: Record<FlowAxis, string> = { idle: '방치', manual: '수동 GOOD(파워 미달 해역은 무판정)' };

function table(headers: string[], rows: (string | number)[][]): string {
  return [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');
}

const BAG_ASSUMPTION = (o: FlowResult['options']) => o.bagCapAwake
  ? '깨어 있는 동안에도 가방 한도를 적용한다(하루 깨어 있는 동안 한 번도 팔지 않는 하한 계산). 가방이 차면 골드만 멈추고 명성과 도감은 쌓인다'
  : '16시간 유형의 깨어 있는 시간과 짧은 유형(8시간 이하)은 깨어 있는 동안 가방이 차지 않는다고 가정한다(8시간 유형은 사용자 확인 대기). 깨어 있는 동안은 자주 판다고 보고 가방 한도를 보지 않는다(--bag-cap-awake로 한도 적용 비교)';
const LOSS_ASSUMPTION = (o: FlowResult['options']) =>
  `4시간 유형의 낚지 못하는 비율은 근거 있는 값이 없는 가정이다${o.loss4h === null ? '. 낚시 100%, 75%, 50%를 함께 낸다' : `. 이번에는 ${o.loss4h}%만 낸다`}`;
const SLEEP_ASSUMPTION = '16시간 유형은 잠든 동안 방치로 낚는다. 가방이 차면 골드만 멈추고 명성과 도감은 잠든 시간 내내 쌓인다';
const BASIC_ASSUMPTION = '판매는 즉시이고 이동, 판매 왕복, 미끼, 유물, 쿠폰은 넣지 않는다. 방치 사이클은 모델 사이클이다';

/** 마지막 해역 진입 레벨에서 유형별로 못 쓰는 라이선스(다른 유형이 가진 것 중) */
function missingLicenseText(d: NonNullable<FlowResult['days']>): string {
  const rows = d.levelUp.filter(r => r.bounty && r.level === Math.min(...d.levelUp.map(x => x.level)));
  const all = new Set(rows.flatMap(r => r.licenses));
  const parts = rows.map(r => [r.type.label, [...all].filter(l => !r.licenses.includes(l))] as const).filter(([, miss]) => miss.length > 0);
  return parts.length ? `. 그래서 마지막 해역 진입 레벨에서 못 쓰는 라이선스가 유형마다 있다(${parts.map(([label, miss]) => `${label}: ${miss.join(', ')}`).join(' / ')})` : '';
}

function assumptionText(command: Command, o: FlowResult['options'], days?: FlowResult['days']): string {
  const lines: string[] = [BASIC_ASSUMPTION];
  if (command === 'transition') {
    lines.push(LOSS_ASSUMPTION(o), BAG_ASSUMPTION(o), SLEEP_ASSUMPTION, '명성을 기다리는 동안은 다음 해역 진입 레벨을 넘겨 강화하지 않고 골드를 쌓는다', '도착 일차는 의뢰와 토벌을 하지 않는 경우다');
  } else if (command === 'days') {
    lines.push(
      LOSS_ASSUMPTION(o), BAG_ASSUMPTION(o), SLEEP_ASSUMPTION,
      '의뢰 라이선스는 그 구역 도감(일반 폼)을 모두 모았을 확률이 0.5를 넘는 날부터 쓴다. 어종은 서로 독립이고 낚은 해역에서만 쌓이며 어종 천장은 넣지 않는다',
      `지나온 해역으로 돌아가 도감을 채우지 않는다${days ? missingLicenseText(days) : ''}`,
      '일반 의뢰는 물고기를 건네지 않고 골드 보상만 받는다. 난이도마다 그날 후보 중 끝낼 수 있는 후보의 평균으로 보고 하루 1회, 네임드 토벌도 하루 1회다',
      '네임드 결투는 항상 이기고 조우는 천장을 넣은 기대 캐치 수로 센다. 의뢰 중에는 그 구역에서 낚을 수 있는 해역을 같은 시간씩 낚고 항구 이동 시간은 넣지 않는다',
      '레벨업은 낚싯대가 그 레벨에 처음 닿은 시점에 시뮬레이션이 실제로 가진 라이선스로 계산한 정상 상태의 하루 수입으로 나눈다',
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
  out.push(`\n## 해역 전환 — 연속 방치 소요 (쉬지 않고 낚을 때, 낚시 방식 ${AXIS_LABEL[o.axis]})${t.continuousComplete ? '' : ' — 최대 일수 안에 끝나지 않음'}`);
  out.push(table(
    ['전환', '연속 방치 소요', '누적', '기다린 것(골드 · 명성 · 둘 다)', '명성 대기 ÷ 골드 대기'],
    t.continuous.map(c => [
      `${nameOf(c.row.from)} → ${nameOf(c.row.to)}`, hrs(c.hours), hrs(c.cumulativeHours),
      `${hrs(c.waitGold)} · ${hrs(c.waitFame)} · ${hrs(c.waitBoth)}`, c.fameOverGold === null ? '—' : `${c.fameOverGold.toFixed(2)}배`,
    ]),
  ));
  for (const type of t.types) {
    out.push(`\n### ${type.type.label} — 낚시 방식 ${AXIS_LABEL[o.axis]}${type.complete ? '' : ' (최대 일수 안에 끝나지 않음)'}`);
    out.push(table(
      ['전환', '도착 일차', '소요 일수'],
      type.steps.map(s => {
        const from = SPOTS[SPOTS.findIndex(x => x.id === s.to) - 1].id;
        return [`${nameOf(from)} → ${nameOf(s.to)}`, `${s.day}일째`, `${s.days}일`];
      }),
    ));
  }
  return out;
}

function daysText(d: NonNullable<FlowResult['days']>): string[] {
  const out: string[] = [];
  for (const bounty of [false, true]) {
    const rows = d.arrival.filter(r => r.bounty === bounty);
    out.push(`\n## 해역 도착 일차 — 일반 의뢰와 네임드 토벌 ${bounty ? '모두 수행' : '수행 안 함'}`);
    out.push(table(
      ['해역', ...rows.map(r => r.type.label)],
      SPOTS.map((s, i) => [s.name, ...rows.map(r => (r.days[i].day === null ? '미도착' : `${r.days[i].day}일째`))]),
    ));
    const incomplete = rows.filter(r => !r.complete).map(r => r.type.label);
    if (incomplete.length) out.push(`(최대 일수 안에 마지막 해역에 닿지 못한 유형: ${incomplete.join(', ')})`);
  }
  for (const level of [...new Set(d.levelUp.map(r => r.level))]) {
    const rows = d.levelUp.filter(r => r.level === level);
    out.push(`\n## 마지막 해역 레벨업 — Lv${level}에서 Lv${level + 1}로 (강화 ${n0(rows[0].upgradeGold)}G)`);
    out.push(table(
      ['유형', '의뢰·토벌', '레벨 도달', '쓰는 라이선스', '하루 골드', '보상 비중', '소요 일수'],
      rows.map(r => [
        r.type.label, r.bounty ? '모두 수행' : '수행 안 함', r.day === null ? '—' : `${r.day}일째`,
        r.bounty ? (r.licenses.join(', ') || '없음') : '—',
        r.dailyGold === null ? '미도달' : n0(r.dailyGold), r.bountyShare === null ? '—' : pct0(r.bountyShare),
        r.days === null ? '미도달' : `${r.days.toFixed(1)}일`,
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

/** 결과를 사람이 읽는 표로 바꾼다 */
export function renderText(r: FlowResult): string {
  const o = r.options;
  const lines = [
    `# 플레이 흐름 시뮬레이션 — 낚시 방식 ${AXIS_LABEL[o.axis]}, 4시간 유형 낚지 못하는 비율 ${o.loss4h === null ? '0%, 25%, 50%' : `${o.loss4h}%`}, 최대 ${o.maxDays}일`,
    o.override ? `덮어쓰기: ${JSON.stringify(o.override)}` : '덮어쓰기: 없음',
  ];
  if (r.transition) lines.push(...transitionText(r.transition, o), assumptionText('transition', o));
  if (r.days) lines.push(...daysText(r.days), assumptionText('days', o, r.days));
  if (r.opening) lines.push(...openingText(r.opening), assumptionText('opening', o));
  if (r.exception) lines.push(...exceptionText(r.exception, o), assumptionText('exception', o));
  if (r.ev) lines.push(...evText(r.ev, o), assumptionText('ev', o));
  return lines.join('\n');
}
