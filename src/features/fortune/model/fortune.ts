// 운세의 화면 표시 모델 — 접속 모달, 운세 달력·점괘첩, 스탯 창 보너스 탭, HUD 칩이 함께 쓴다.
// 21종 운세 이름·짧은 이름·세계의 목소리 문구와 10개 보너스 채널 표시 규칙을 제공한다.
import {
  FORTUNE_CATALOG,
  FORTUNE_TARGET_OF,
  activePotionsOf,
  fortuneEffectMultOf,
  fortuneEffectsOf,
  fortuneEntryOf,
  fortuneKeyOf,
  fortuneOf,
  luckMultOf,
} from '../../../game/rules/fortune';
import type {
  DailyFortune,
  FortuneEffect,
  FortuneKind,
  FortuneTarget,
} from '../../../game/rules/fortune';
import type { GameState } from '../../../game/rules/logic';
import { gameDayOf } from '../../../game/rules/time';
import type { FortuneDiscoveredEntry, FortuneHistory } from '../../../platform/api';

/** 운세 대상별 보너스 표시 이름 (10개 보너스 채널) */
export const FORTUNE_TARGET_BONUS_LABEL: Record<FortuneTarget, string> = {
  rarity: '희귀 이상 출현 비중',
  sell: '판매가',
  named: '네임드 조우 확률',
  biteWait: '입질 대기',
  bigCatch: '월척 출현 확률',
  fame: '명성 획득',
  mutation: '돌연변이 출현 비중',
  night: '밤 어종 출현 비중',
  energy: '생명의 기운 획득량',
  legendary: '전설 출현 비중',
};

interface FortuneDisplayMeta {
  readonly kind: FortuneKind;
  readonly index: 3 | 5;
  readonly name: string;
  readonly shortName: string;
  readonly phrase: string;
}

const FORTUNE_DISPLAY_LIST: readonly FortuneDisplayMeta[] = [
  {
    kind: 'fish',
    index: 3,
    name: '잔물결 풍어운',
    shortName: '잔물결',
    phrase: '잔잔한 물결 위로 찌가 흐트러짐 없이 뜬다. 작은 고기 떼 곁으로 보기 드문 고기의 입질이 간간이 걸려든다.',
  },
  {
    kind: 'fish',
    index: 5,
    name: '만선 풍어운',
    shortName: '만선풍어',
    phrase: '깊은 물줄기가 트이면서 굵은 어군이 수면 가까이 모여든다. 던진 찌 아래로 귀한 고기들이 연달아 모습을 비춘다.',
  },
  {
    kind: 'gold',
    index: 3,
    name: '잔돈 재물운',
    shortName: '잔돈운',
    phrase: '어시장 매대 앞에 손님 발길이 하나둘 이어진다. 상인들이 셈을 맞추며 값을 조금씩 더 후하게 쳐 준다.',
  },
  {
    kind: 'gold',
    index: 5,
    name: '황금 저울운',
    shortName: '황금저울',
    phrase: '매대 위에 물고기를 올리자마자 상인들이 값을 높여 부른다. 저울 접시가 무겁게 내려앉으며 셈이 시원하게 떨어진다.',
  },
  {
    kind: 'bite',
    index: 3,
    name: '순풍 조류운',
    shortName: '순풍조류',
    phrase: '등 뒤에서 맑은 순풍이 불어 낚싯줄이 매끄럽게 풀린다. 물결을 탄 미끼를 고기들이 여느 때보다 일찍 찾아든다.',
  },
  {
    kind: 'bite',
    index: 5,
    name: '물때 호조운',
    shortName: '물때호조',
    phrase: '물때가 절묘하게 맞아떨어지며 사방에서 물보라가 인다. 찌가 물에 닿자마자 기다릴 틈 없이 입질이 들어온다.',
  },
  {
    kind: 'big',
    index: 3,
    name: '묵직한 찌운',
    shortName: '묵직한찌',
    phrase: '수면에 뜬 찌가 천천히 무게를 실으며 아래로 잠긴다. 낚아 올린 고기 가운데 씨알 굵은 월척이 심심찮게 섞여 나온다.',
  },
  {
    kind: 'big',
    index: 5,
    name: '대어 기운',
    shortName: '대어기운',
    phrase: '물살을 가르는 굵은 등지느러미가 물 아래로 여럿 비친다. 낚싯대가 깊게 휘어지며 큼지막한 월척들이 줄지어 올라온다.',
  },
  {
    kind: 'fame',
    index: 3,
    name: '소소한 명성운',
    shortName: '소소명성',
    phrase: '포구 주변 사람들이 오늘의 조과를 눈여겨본다. 낚아 올린 물고기마다 입소문을 타고 이름이 조금씩 퍼진다.',
  },
  {
    kind: 'fame',
    index: 5,
    name: '바다의 명예운',
    shortName: '바다명예',
    phrase: '어느 포구에 닿아도 뱃사람들이 먼저 다가와 조과를 묻는다. 건져 올린 어획 소식이 항구마다 빠르게 퍼져 나가며 명성이 높아진다.',
  },
  {
    kind: 'shadow',
    index: 3,
    name: '얕은 그림자 운',
    shortName: '그림자',
    phrase: '수면 아래를 스치는 커다란 윤곽이 이따금 물빛을 가린다. 놀란 작은 물고기들이 잠시 흩어졌다가 이내 제자리로 돌아온다.',
  },
  {
    kind: 'shadow',
    index: 5,
    name: '심해 그림자 운',
    shortName: '큰그림자',
    phrase: '수면 위로 깊은 바닥에서 솟은 물결이 길게 굽이친다. 물 밑을 지나는 거대한 그림자가 여느 때보다 얕은 자리까지 자주 비친다.',
  },
  {
    kind: 'mutation',
    index: 3,
    name: '묘한 물빛 운',
    shortName: '묘한물빛',
    phrase: '물결이 꺾이는 자리마다 비늘 빛깔이 평소와 조금 다르게 비친다. 같은 무리 안에서 색이 살짝 어긋난 고기가 드물게 잡힌다.',
  },
  {
    kind: 'mutation',
    index: 5,
    name: '오색 물빛 운',
    shortName: '오색물빛',
    phrase: '물빛이 여러 갈래로 번지며 수면 아래에 낯선 광택이 감돈다. 본래 빛깔을 벗어나 진주빛이나 백은빛으로 물든 고기들이 바늘에 걸린다.',
  },
  {
    kind: 'night',
    index: 3,
    name: '초승달 밤운',
    shortName: '초승달밤',
    phrase: '가느다란 달빛이 물 위에 비치자 낮에 잠잠하던 어군이 움직인다. 어둠이 내린 물속에서 밤에만 깨어나는 고기들이 하나둘 미끼를 문다.',
  },
  {
    kind: 'night',
    index: 5,
    name: '만월 밤바다 운',
    shortName: '만월바다',
    phrase: '둥근 보름달이 수면 전체를 환하게 비춘다. 어둠이 내린 뒤에는 밤에 사는 고기들이 낮 물고기보다 먼저 어군 앞자리에 모여든다.',
  },
  {
    kind: 'energy',
    index: 3,
    name: '맑은 기운',
    shortName: '맑은기운',
    phrase: '건져 올린 물고기마다 비늘에 맑은 윤기가 흐른다. 부엌에서 생명의 기운을 모아 담을 때 평소보다 조금 더 넉넉하게 손에 남는다.',
  },
  {
    kind: 'energy',
    index: 5,
    name: '넘치는 기운',
    shortName: '기운충만',
    phrase: '낚아 올린 고기마다 싱싱한 생기가 물기 아래서 세차게 뛴다. 부엌에서 생명의 기운을 거둘 때마다 손끝에 묵직한 온기가 한가득 모인다.',
  },
  {
    kind: 'golden-scale',
    index: 5,
    name: '금비늘 운',
    shortName: '금비늘',
    phrase: '물결 너머에서 옛이야기로만 듣던 금빛 비늘이 한 번씩 번뜩인다. 좀처럼 모습을 비추지 않던 진귀한 물고기가 찌 가까이 다가오는 날이다.',
  },
  {
    kind: 'mirage',
    index: 5,
    name: '신기루 운',
    shortName: '신기루',
    phrase: '아지랑이 낀 수면 아래로 낯선 색채의 큰 등지느러미가 천천히 떠오른다. 옛이야기로만 전하던 물고기마저 본래와 다른 빛깔로 바늘을 찾는 하루다.',
  },
  {
    kind: 'grand-catch',
    index: 5,
    name: '만선 대길',
    shortName: '만선대길',
    phrase: '깊은 곳에서 솟은 커다란 그림자를 따라 귀한 고기 떼가 찌 아래로 몰려든다. 항구에 닿자마자 어시장 상인들이 그날 잡힌 물고기에 가장 후한 값을 매긴다.',
  },
];

const FORTUNE_DISPLAY_BY_KEY = new Map<string, FortuneDisplayMeta>(
  FORTUNE_DISPLAY_LIST.map(item => [fortuneKeyOf(item.kind, item.index), item]),
);

type FortuneRef = Pick<DailyFortune, 'kind' | 'index'> & { day?: string };

function displayMetaOf(fortune: FortuneRef): FortuneDisplayMeta {
  const normalizedIndex: 3 | 5 = fortuneEntryOf(fortune.kind, fortune.index)?.index
    ?? (fortuneEntryOf(fortune.kind, 5) ? 5 : fortune.index);
  return FORTUNE_DISPLAY_BY_KEY.get(fortuneKeyOf(fortune.kind, normalizedIndex))
    ?? FORTUNE_DISPLAY_BY_KEY.get(fortuneKeyOf(fortune.kind, 5))!;
}

/** 운세 종류의 대표 표시 묶음 — 강도 구분이 없는 참조용 */
export const FORTUNE_KIND: Record<FortuneKind, { name: string; target: FortuneTarget }> = {
  fish: { name: '풍어운', target: FORTUNE_TARGET_OF.fish },
  gold: { name: '재물운', target: FORTUNE_TARGET_OF.gold },
  bite: { name: '순풍 조류운', target: FORTUNE_TARGET_OF.bite },
  big: { name: '묵직한 찌운', target: FORTUNE_TARGET_OF.big },
  fame: { name: '소소한 명성운', target: FORTUNE_TARGET_OF.fame },
  shadow: { name: '그림자 운', target: FORTUNE_TARGET_OF.shadow },
  mutation: { name: '오색 물빛 운', target: FORTUNE_TARGET_OF.mutation },
  night: { name: '만월 밤바다 운', target: FORTUNE_TARGET_OF.night },
  energy: { name: '넘치는 기운', target: FORTUNE_TARGET_OF.energy },
  'golden-scale': { name: '금비늘 운', target: FORTUNE_TARGET_OF['golden-scale'] },
  mirage: { name: '신기루 운', target: FORTUNE_TARGET_OF.mirage },
  'grand-catch': { name: '만선 대길', target: FORTUNE_TARGET_OF['grand-catch'] },
};

/** 종류별 대표 짧은 이름 */
export const FORTUNE_SHORT_NAME: Record<FortuneKind, string> = {
  fish: '풍어운',
  gold: '재물운',
  bite: '순풍조류',
  big: '묵직한찌',
  fame: '소소명성',
  shadow: '그림자',
  mutation: '오색물빛',
  night: '만월바다',
  energy: '기운충만',
  'golden-scale': '금비늘',
  mirage: '신기루',
  'grand-catch': '만선대길',
};

/** 운세 종류별 적용 대상 대표 표시명 */
export const FORTUNE_EFFECT_TARGET_LABEL: Record<FortuneKind, string> = {
  fish: FORTUNE_TARGET_BONUS_LABEL.rarity,
  gold: FORTUNE_TARGET_BONUS_LABEL.sell,
  bite: FORTUNE_TARGET_BONUS_LABEL.biteWait,
  big: FORTUNE_TARGET_BONUS_LABEL.bigCatch,
  fame: FORTUNE_TARGET_BONUS_LABEL.fame,
  shadow: FORTUNE_TARGET_BONUS_LABEL.named,
  mutation: FORTUNE_TARGET_BONUS_LABEL.mutation,
  night: FORTUNE_TARGET_BONUS_LABEL.night,
  energy: FORTUNE_TARGET_BONUS_LABEL.energy,
  'golden-scale': FORTUNE_TARGET_BONUS_LABEL.legendary,
  mirage: '전설, 돌연변이 출현 비중',
  'grand-catch': '희귀 이상, 판매가, 네임드 조우',
};

/** 운세 출처 이름 — 보너스 내역과 금액 내역에 붙는 단일 표기 */
export const FORTUNE_SOURCE_LABEL = '오늘의 운세';

/** 스탯 창 보너스 탭의 출처 도움말 중 운세 설명 */
export const FORTUNE_SOURCE_HELP = '오늘의 운세는 하루마다 새로 뽑혀요. 행운 효과는 다른 보너스 다음에 곱해져요.';

/** 스탯 창 보너스 탭의 출처 도움말 중 비약 설명 */
export const POTION_SOURCE_HELP = '비약은 가방 탭에서 사용하면 하루 동안 모든 행운 효과가 커져요.';

/** 강도 등급 라벨 — 3은 적당한 운, 5는 좋은 운 */
export const FORTUNE_INDEX_LABEL: Record<DailyFortune['index'], string> = {
  3: '적당한 운',
  5: '좋은 운',
};

const phraseFor = (kind: FortuneKind, index: 3 | 5): string =>
  displayMetaOf({ kind, index }).phrase;

/** 종류와 강도별 운세 문구 (세계의 목소리) */
export const FORTUNE_PHRASE: Record<FortuneKind, Record<DailyFortune['index'], string>> = {
  fish: { 3: phraseFor('fish', 3), 5: phraseFor('fish', 5) },
  gold: { 3: phraseFor('gold', 3), 5: phraseFor('gold', 5) },
  bite: { 3: phraseFor('bite', 3), 5: phraseFor('bite', 5) },
  big: { 3: phraseFor('big', 3), 5: phraseFor('big', 5) },
  fame: { 3: phraseFor('fame', 3), 5: phraseFor('fame', 5) },
  shadow: { 3: phraseFor('shadow', 3), 5: phraseFor('shadow', 5) },
  mutation: { 3: phraseFor('mutation', 3), 5: phraseFor('mutation', 5) },
  night: { 3: phraseFor('night', 3), 5: phraseFor('night', 5) },
  energy: { 3: phraseFor('energy', 3), 5: phraseFor('energy', 5) },
  'golden-scale': { 3: phraseFor('golden-scale', 5), 5: phraseFor('golden-scale', 5) },
  mirage: { 3: phraseFor('mirage', 5), 5: phraseFor('mirage', 5) },
  'grand-catch': { 3: phraseFor('grand-catch', 5), 5: phraseFor('grand-catch', 5) },
};

/** 21종 정식 운세 이름 */
export function fortuneName(fortune: FortuneRef): string {
  return displayMetaOf(fortune).name;
}

/** 21종 달력·HUD 칩 짧은 이름 */
export function fortuneShortName(fortune: FortuneRef): string {
  return displayMetaOf(fortune).shortName;
}

/** 오늘의 운세 문구 (세계의 목소리) */
export function fortunePhrase(fortune: FortuneRef): string {
  return displayMetaOf(fortune).phrase;
}

/** 독립 곱연산 배수 표기("×1.05", "×1.10", "×2.00") */
export function formatLuckMult(mult: number): string {
  const rounded = Math.round(mult * 1e4) / 1e4;
  const two = Math.round(rounded * 100) / 100;
  return Math.abs(rounded - two) < 1e-6 ? `×${rounded.toFixed(2)}` : `×${rounded}`;
}

/** 운세의 대표 곱연산 배수 — 단일 효과는 그 대상의 배수, 복합 대길은 첫 효과 배수를 돌려준다 */
export function fortuneLuckMult(fortune: FortuneRef): number {
  const first = fortuneEffectsOf(fortune)[0];
  return first ? first.mult : 1;
}

/** 오늘의 운세 대표 곱연산 배수 문자열 */
export function fortuneLuckMultText(fortune: FortuneRef): string {
  return formatLuckMult(fortuneLuckMult(fortune));
}

/** 운세의 대상별 효과 행 목록 (단일 1행, 신기루 운 2행, 만선 대길 3행) */
export function fortuneEffectRows(
  fortune: FortuneRef,
): { label: string; value: string; accent: boolean }[] {
  return fortuneEffectsOf(fortune).map(eff => ({
    label: FORTUNE_TARGET_BONUS_LABEL[eff.target],
    value: formatLuckMult(eff.mult),
    accent: true,
  }));
}

/** 오늘의 운세 창·달력 상세 요약 카드 줄 */
export function fortuneModalRows(
  fortune: FortuneRef,
): { label: string; value: string; accent?: boolean }[] {
  const effects = fortuneEffectsOf(fortune);
  if (effects.length === 1) {
    return [
      { label: '적용 대상', value: FORTUNE_TARGET_BONUS_LABEL[effects[0].target] },
      { label: '행운 효과', value: formatLuckMult(effects[0].mult), accent: true },
    ];
  }
  return effects.map(eff => ({
    label: FORTUNE_TARGET_BONUS_LABEL[eff.target],
    value: formatLuckMult(eff.mult),
    accent: true,
  }));
}

/** 스탯 창·HUD 칩 요약의 "받는 효과" 문구 */
export function fortuneBonusText(fortune: FortuneRef): string {
  return fortuneEffectsOf(fortune)
    .map(eff => `${FORTUNE_TARGET_BONUS_LABEL[eff.target]} ${formatLuckMult(eff.mult)}`)
    .join(', ');
}

/** 스탯 창 보너스 탭의 툴팁 문구(무수치) */
export function fortuneBonusTip(fortune: FortuneRef): string {
  const effects = fortuneEffectsOf(fortune);
  if (effects.length > 1) return '여러 행운 효과가 함께 올라가요.';
  const target = effects[0]?.target ?? FORTUNE_TARGET_OF[fortune.kind];
  return `${FORTUNE_TARGET_BONUS_LABEL[target]} 행운 효과가 올라가요.`;
}

/** 강도 칸 수 — 강도의 최댓값(5)만큼 칸을 그리고 강도만큼 채운다 */
export const FORTUNE_PIPS = 5;
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

export interface FortuneDayDetail {
  day: string;
  dateLabel: string;
  isToday: boolean;
  fortune: DailyFortune | null;
}

export type FortuneDiscoveredItem = FortuneDiscoveredEntry;

export interface FortuneCollectionItem {
  key: string;
  kind: FortuneKind;
  index: 3 | 5;
  name: string;
  shortName: string;
  strengthLabel: string;
  phrase: string;
  effects: readonly FortuneEffect[];
  discovered: boolean;
  count: number;
  firstDay: string | null;
}

export interface FortuneCollectionView {
  items: readonly FortuneCollectionItem[];
  discoveredCount: number;
  totalCount: number;
}

export interface FortuneCatalogOption {
  key: string;
  kind: FortuneKind;
  index: 3 | 5;
  name: string;
  summary: string;
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

/** 월과 기록을 바탕으로 기본 선택 날짜를 정한다. 기록이 있는 날짜만 선택 가능하며 기록이 없으면 null이다 */
export function resolveSelectedFortuneDay(
  month: string,
  days: readonly DailyFortune[],
  todayDay: string,
  currentSelected?: string | null,
): string | null {
  const recorded = new Set(days.map(d => d.day));
  if (currentSelected && currentSelected.startsWith(`${month}-`) && currentSelected <= todayDay && recorded.has(currentSelected)) {
    return currentSelected;
  }
  if (todayDay.startsWith(`${month}-`) && recorded.has(todayDay)) return todayDay;
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

/** 서버 운세 이력 응답에서 누적 발견 점괘 목록을 읽는다 */
export function fortuneHistoryDiscovered(history: FortuneHistory | null): readonly FortuneDiscoveredEntry[] {
  return Array.isArray(history?.discovered) ? history.discovered : [];
}

/** 21종 운세 카탈로그와 계정 누적 발견 기록을 결합해 점괘첩 수집 모델을 만든다 */
export function selectFortuneCollection(discovered: readonly FortuneDiscoveredItem[]): FortuneCollectionView {
  const byKey = new Map<string, { count: number; firstDay: string }>();
  for (const raw of discovered) {
    const entry = fortuneEntryOf(raw.kind, raw.index) ?? fortuneEntryOf(raw.kind, 5);
    if (!entry) continue;
    const key = fortuneKeyOf(entry.kind, entry.index);
    const prev = byKey.get(key);
    const count = Math.max(0, raw.count);
    if (!prev) {
      byKey.set(key, { count, firstDay: raw.firstDay });
    } else {
      const earlier = raw.firstDay && (!prev.firstDay || raw.firstDay < prev.firstDay) ? raw.firstDay : prev.firstDay;
      byKey.set(key, { count: prev.count + count, firstDay: earlier });
    }
  }

  const items: FortuneCollectionItem[] = FORTUNE_CATALOG.map(entry => {
    const key = fortuneKeyOf(entry.kind, entry.index);
    const rec = byKey.get(key);
    const meta = displayMetaOf(entry);
    const found = rec !== undefined && rec.count > 0;
    return {
      key,
      kind: entry.kind,
      index: entry.index,
      name: meta.name,
      shortName: meta.shortName,
      strengthLabel: FORTUNE_INDEX_LABEL[entry.index],
      phrase: meta.phrase,
      effects: entry.effects,
      discovered: found,
      count: found ? rec.count : 0,
      firstDay: found ? rec.firstDay : null,
    };
  });

  return {
    items,
    discoveredCount: items.filter(i => i.discovered).length,
    totalCount: items.length,
  };
}

/** 개발 도구 운세 전환 UI용 21종 카탈로그 선택지 */
export function selectFortuneCatalogOptions(): readonly FortuneCatalogOption[] {
  return FORTUNE_CATALOG.map(entry => {
    const meta = displayMetaOf(entry);
    return {
      key: fortuneKeyOf(entry.kind, entry.index),
      kind: entry.kind,
      index: entry.index,
      name: meta.name,
      summary: fortuneBonusText(entry),
    };
  });
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
  const sellMult = fortuneEffectMultOf(fortune, 'sell');
  const fortuneBonus = sellMult !== 1 ? Math.round((sellMult - 1) * 1e9) / 1e9 : 0;
  const potions = activePotionsOf(game.potions, now)
    .map(p => ({ id: p.id, name: p.name, bonus: p.effects.luck?.sell ?? 0 }))
    .filter(p => p.bonus > 0);
  return { mult, fortuneBonus, potions };
}
