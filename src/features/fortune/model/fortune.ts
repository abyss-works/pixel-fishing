// 운세의 화면 표시 모델 — 접속 모달과 스탯 창 보너스 탭이 같이 쓴다.
// 종류 명칭·지수 등급·문구는 명세와 1:1로 맞춘다.
import { FORTUNE_TARGET_OF, luckMultOf } from '../../../game/rules/fortune';
import type { DailyFortune, FortuneKind, FortuneTarget } from '../../../game/rules/fortune';
import { GAME_DAY_RESET_HOUR_KST, GAME_DAY_RESET_TEXT } from '../../../game/rules/time';

/** 운세 종류의 표시 묶음 — name은 정식 명칭, bonus는 보너스가 걸리는 대상의 표시명.
 *  target은 규칙의 종류와 대상 짝(FORTUNE_TARGET_OF)을 그대로 가리킨다 */
export const FORTUNE_KIND: Record<FortuneKind, { name: string; target: FortuneTarget; bonus: string }> = {
  fish: { name: '풍어운', target: FORTUNE_TARGET_OF.fish, bonus: '희귀 이상 등급 가중치' },
  gold: { name: '재물운', target: FORTUNE_TARGET_OF.gold, bonus: '판매가' },
  shadow: { name: '그림자 운', target: FORTUNE_TARGET_OF.shadow, bonus: '네임드 조우 가중치' },
};

/** 운세 출처 이름 — 보너스 내역과 금액 내역에 붙는 단일 표기 */
export const FORTUNE_SOURCE_LABEL = '오늘의 운세';

/** 스탯 창 보너스 탭의 출처 도움말 중 운세 설명 */
export const FORTUNE_SOURCE_HELP = `오늘의 운세는 ${GAME_DAY_RESET_TEXT}에 새로 뽑혀요. 운 배율은 다른 보너스 다음에 곱해져요.`;

/** 지수 등급 라벨 — 3은 적당한 운, 5는 좋은 운 */
export const FORTUNE_INDEX_LABEL: Record<DailyFortune['index'], string> = {
  3: '적당한 운',
  5: '좋은 운',
};

/** 종류와 지수별 확정 문구 */
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
  return `${FORTUNE_KIND[fortune.kind].bonus}에 운 배율이 적용돼요.`;
}

/** 접속 모달의 효과 안내 문구 */
export function fortuneEffectNote(fortune: DailyFortune): string {
  return `오늘 ${FORTUNE_KIND[fortune.kind].bonus}의 운 배율이 +${fortune.index}%p 올라요.`;
}

/** 지수 칸 수 — 지수의 최댓값(5)만큼 칸을 그리고 지수만큼 채운다 */
export const FORTUNE_PIPS = 5;

/** 접속 모달의 초기화 시각 보조 안내 */
export const FORTUNE_RESET_NOTE = `새 운세는 매일 새벽 ${GAME_DAY_RESET_HOUR_KST}시에 다시 정해져요.`;

/** 접속 모달의 요약 표 줄 — 적용 대상과 운 배율 */
export function fortuneSummaryRows(fortune: DailyFortune): { label: string; value: string; accent?: boolean }[] {
  return [
    { label: '적용 대상', value: FORTUNE_KIND[fortune.kind].bonus },
    { label: '운 배율', value: `+${fortune.index}%p`, accent: true },
  ];
}
