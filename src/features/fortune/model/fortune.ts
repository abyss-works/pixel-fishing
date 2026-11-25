// 운세의 화면 표시 모델 — 접속 모달과 스탯 창 보너스 탭이 같이 쓴다.
// 운세 표시 규칙과 문구를 제공한다.
import { FORTUNE_TARGET_OF, activePotionsOf, fortuneOf, luckMultOf } from '../../../game/rules/fortune';
import type { DailyFortune, FortuneKind, FortuneTarget } from '../../../game/rules/fortune';
import type { GameState } from '../../../game/rules/logic';
import { gameDayOf } from '../../../game/rules/time';

/** 운세 대상별 보너스 표시 이름 */
export const FORTUNE_TARGET_BONUS_LABEL: Record<FortuneTarget, string> = {
  rarity: '희귀 이상 출현 확률',
  sell: '판매가',
  named: '네임드 만날 확률',
};

/** 운세 종류의 표시 묶음 — name은 정식 명칭, bonus는 보너스가 걸리는 대상의 표시명.
 *  target은 규칙의 종류와 대상 짝(FORTUNE_TARGET_OF)을 그대로 가리킨다 */
export const FORTUNE_KIND: Record<FortuneKind, { name: string; target: FortuneTarget; bonus: string }> = {
  fish: { name: '풍어운', target: FORTUNE_TARGET_OF.fish, bonus: '희귀 이상 출현 확률' },
  gold: { name: '재물운', target: FORTUNE_TARGET_OF.gold, bonus: '판매가' },
  shadow: { name: '그림자 운', target: FORTUNE_TARGET_OF.shadow, bonus: '네임드 만날 확률' },
};

/** 운세 출처 이름 — 보너스 내역과 금액 내역에 붙는 단일 표기 */
export const FORTUNE_SOURCE_LABEL = '오늘의 운세';

/** 스탯 창 보너스 탭의 출처 도움말 중 운세 설명 */
export const FORTUNE_SOURCE_HELP = '오늘의 운세는 하루마다 새로 뽑혀요. 행운 효과는 다른 보너스 다음에 곱해져요.';

/** 스탯 창 보너스 탭의 출처 도움말 중 물약 설명 */
export const POTION_SOURCE_HELP = '물약은 가방 탭에서 쓰면 하루 동안 모든 행운 효과가 커져요.';

/** 지수 등급 라벨 — 3은 적당한 운, 5는 좋은 운 */
export const FORTUNE_INDEX_LABEL: Record<DailyFortune['index'], string> = {
  3: '적당한 운',
  5: '좋은 운',
};

/** 종류와 지수별 운세 문구 */
export const FORTUNE_PHRASE: Record<FortuneKind, Record<DailyFortune['index'], string>> = {
  fish: {
    3: '물결이 맑아 찌 아래로 지나가는 비늘이 한결 또렷하다. 잔 고기 떼 사이로 보기 드문 고기의 입질이 간간이 섞여 든다.',
    5: '바람이 잦아들자 깊은 곳의 물살이 수면 아래까지 고르게 살아난다. 잔 고기만 맴돌던 어군 안에 귀한 고기들이 여럿 섞여 있다.',
  },
  gold: {
    3: '이른 아침부터 어시장에 손님이 들며 물고기 값이 고르게 올라선다. 저울 눈금이 평소보다 조금 더 후한 쪽으로 기우는 날이다.',
    5: '갓 건진 물고기가 매대에 오르자마자 시세가 한층 높게 붙는다. 상인들이 값을 깎지 않고 선선히 셈을 치르는 날이다.',
  },
  shadow: {
    3: '수면 아래 깊은 곳에서 묵직한 물결이 한 번씩 느리게 번져 온다. 곁을 맴돌던 작은 물고기들이 문득 길을 비키며 잠잠해지는 날이다.',
    5: '바람이 없는데도 깊은 곳에서 솟구친 물살이 수면을 길게 가르고 있다. 물 밑의 거대한 그림자가 여느 날보다 가까운 자리까지 자주 올라오는 하루다.',
  },
};

/** 오늘의 운세 문구 */
export function fortunePhrase(fortune: DailyFortune): string {
  return FORTUNE_PHRASE[fortune.kind][fortune.index];
}

/** 운세의 운 배율 — 그 운세의 대상에 규칙(luckMultOf)이 곱하는 값 그대로다 */
export function fortuneLuckMult(fortune: DailyFortune): number {
  return luckMultOf(fortune, FORTUNE_TARGET_OF[fortune.kind]);
}

/** 스탯 창 보너스 탭의 "받는 효과" 칸 문구 */
export function fortuneBonusText(fortune: DailyFortune): string {
  return `${FORTUNE_KIND[fortune.kind].bonus} +${fortune.index}%p`;
}

/** 스탯 창 보너스 탭의 툴팁 문구(무수치) */
export function fortuneBonusTip(fortune: DailyFortune): string {
  return `${FORTUNE_KIND[fortune.kind].bonus} 행운 효과가 올라가요.`;
}

/** 접속 모달의 효과 안내 문구 */
export function fortuneEffectNote(fortune: DailyFortune): string {
  return `오늘 ${FORTUNE_KIND[fortune.kind].bonus} 행운 효과가 +${fortune.index}%p 올라요.`;
}

/** 지수 칸 수 — 지수의 최댓값(5)만큼 칸을 그리고 지수만큼 채운다 */
export const FORTUNE_PIPS = 5;

/** 접속 모달의 초기화 시각 보조 안내 */
export const FORTUNE_RESET_NOTE = '새 운세는 하루마다 새로 뽑혀요.';

/** 접속 모달의 달력 메뉴 안내 */
export const FORTUNE_MENU_GUIDE_NOTE = '메뉴의 운세 항목에서 지난 달력 기록을 볼 수 있어요.';

/** 운세 달력의 일일 기록 기준 안내 */
export const FORTUNE_CALENDAR_NOTE = '매일 새벽 이후 첫 접속부터 달력에 기록돼요.';

/** 월간 달력의 요일 머리글 (월요일 시작) */
export const FORTUNE_WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const;

export type FortuneCalendarCell =
  | { kind: 'blank'; key: string }
  | {
      kind: 'day';
      key: string;
      day: string;
      dateNum: number;
      isToday: boolean;
      isFuture: boolean;
      fortune: DailyFortune | null;
    };

export interface FortuneMonthStats {
  total: number;
  byKind: Record<FortuneKind, number>;
}

export interface FortuneDayDetail {
  day: string;
  dateLabel: string;
  isToday: boolean;
  fortune: DailyFortune | null;
}

const MONTH_RE = /^(\d{4})-(\d{2})$/;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseMonthParts(month: string): { year: number; mon: number } | null {
  const m = MONTH_RE.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (!Number.isInteger(year) || !Number.isInteger(mon) || mon < 1 || mon > 12) return null;
  return { year, mon };
}

/** 기준 시각의 게임 날짜(YYYY-MM-DD) */
export function currentGameDay(nowIso: string): string {
  return gameDayOf(nowIso);
}

/** 기준 시각의 게임 날짜가 속한 월(YYYY-MM) */
export function currentGameMonth(nowIso: string): string {
  return gameDayOf(nowIso).slice(0, 7);
}

/** 게임 상태의 운세가 오늘 게임 날짜에 속하면 돌려주고, 지난 날 운세면 null이다 */
export function selectTodayFortune(fortune: DailyFortune | null, nowIso: string): DailyFortune | null {
  return fortuneOf({ fortune }, nowIso);
}

/** 월 문자열(YYYY-MM)을 delta개월 앞뒤로 이동한다 */
export function shiftFortuneMonth(month: string, delta: number): string {
  const parsed = parseMonthParts(month);
  if (!parsed) return month;
  const d = new Date(Date.UTC(parsed.year, parsed.mon - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 월 문자열(YYYY-MM)을 화면 표시용 한글 월 제목으로 바꾼다 */
export function formatFortuneMonth(month: string): string {
  const parsed = parseMonthParts(month);
  if (!parsed) return month;
  return `${parsed.year}년 ${parsed.mon}월`;
}

/** 날짜 문자열(YYYY-MM-DD)을 화면 표시용 한글 날짜로 바꾼다 */
export function formatFortuneDay(day: string): string {
  const m = DAY_RE.exec(day);
  if (!m) return day;
  return `${Number(m[1])}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}

/** 최초 기록 월과 비교해 이전 달로 이동할 수 있는지 판정한다 */
export function canGoPrevFortuneMonth(month: string, firstMonth: string | null): boolean {
  return firstMonth !== null && month > firstMonth;
}

/** 현재 게임 월과 비교해 다음 달로 이동할 수 있는지 판정한다 */
export function canGoNextFortuneMonth(month: string, currentMonth: string): boolean {
  return month < currentMonth;
}

/** 월요일 시작 기준으로 해당 월의 달력 셀(앞 빈 칸 + 날짜 칸)을 만든다 */
export function buildFortuneCalendarCells(
  month: string,
  days: readonly DailyFortune[],
  todayDay: string,
): FortuneCalendarCell[] {
  const parsed = parseMonthParts(month);
  if (!parsed) return [];
  const { year, mon } = parsed;
  const firstWeekday = (new Date(Date.UTC(year, mon - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const byDay = new Map(days.map(d => [d.day, d]));

  const cells: FortuneCalendarCell[] = [];
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ kind: 'blank', key: `blank-${i}` });
  }
  for (let dateNum = 1; dateNum <= daysInMonth; dateNum++) {
    const day = `${month}-${String(dateNum).padStart(2, '0')}`;
    cells.push({
      kind: 'day',
      key: day,
      day,
      dateNum,
      isToday: day === todayDay,
      isFuture: day > todayDay,
      fortune: byDay.get(day) ?? null,
    });
  }
  return cells;
}

/** 해당 월에 기록된 운세의 총 일수와 종류별 횟수를 집계한다 */
export function selectFortuneMonthStats(days: readonly DailyFortune[]): FortuneMonthStats {
  const byKind: Record<FortuneKind, number> = { fish: 0, gold: 0, shadow: 0 };
  const seen = new Set<string>();
  for (const d of days) {
    if (seen.has(d.day)) continue;
    seen.add(d.day);
    byKind[d.kind]++;
  }
  return { total: seen.size, byKind };
}

/** 월과 기록을 바탕으로 기본 선택 날짜를 정한다. 현재 선택이 같은 달의 유효한 날짜면 유지한다 */
export function resolveSelectedFortuneDay(
  month: string,
  days: readonly DailyFortune[],
  todayDay: string,
  currentSelected?: string | null,
): string | null {
  if (currentSelected && currentSelected.startsWith(`${month}-`) && currentSelected <= todayDay) {
    return currentSelected;
  }
  if (todayDay.startsWith(`${month}-`)) return todayDay;
  return days.length > 0 ? days[days.length - 1].day : null;
}

/** 선택된 날짜의 상세 표시 모델(날짜 라벨, 오늘 여부, 운세 기록)을 만든다 */
export function selectFortuneDayDetail(
  day: string | null,
  days: readonly DailyFortune[],
  todayDay: string,
): FortuneDayDetail | null {
  if (day === null) return null;
  const fortune = days.find(d => d.day === day) ?? null;
  return {
    day,
    dateLabel: formatFortuneDay(day),
    isToday: day === todayDay,
    fortune,
  };
}

/** 접속 모달의 요약 표 줄 — 적용 대상과 행운 효과 */
export function fortuneSummaryRows(fortune: DailyFortune): { label: string; value: string; accent?: boolean }[] {
  return [
    { label: '적용 대상', value: FORTUNE_KIND[fortune.kind].bonus },
    { label: '행운 효과', value: `+${fortune.index}%p`, accent: true },
  ];
}

export interface SellLuckBreakdown {
  mult: number;
  fortuneBonus: number;
  potions: { id: string; name: string; bonus: number }[];
}

/** 판매에 적용되는 오늘의 운세·물약 합산 운 배율과 출처별 비율 */
export function selectSellLuck(
  game: Pick<GameState, 'fortune'> & Partial<Pick<GameState, 'potions'>>,
  now: string,
): SellLuckBreakdown {
  const fortune = fortuneOf(game, now);
  const day = gameDayOf(now);
  const mult = luckMultOf(fortune, 'sell', game.potions, day);
  const fortuneBonus = fortune !== null && FORTUNE_TARGET_OF[fortune.kind] === 'sell' ? fortune.index / 100 : 0;
  const potions = activePotionsOf(game.potions, now)
    .map(p => ({ id: p.id, name: p.name, bonus: p.effects.luck?.sell ?? 0 }))
    .filter(p => p.bonus > 0);
  return { mult, fortuneBonus, potions };
}
