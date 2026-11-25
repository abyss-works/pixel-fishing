import { describe, expect, it } from 'vitest';
import type { DailyFortune } from '../../../game/rules/fortune';
import {
  FORTUNE_CALENDAR_NOTE,
  FORTUNE_INDEX_LABEL,
  FORTUNE_KIND,
  FORTUNE_MENU_GUIDE_NOTE,
  FORTUNE_PHRASE,
  FORTUNE_PIPS,
  FORTUNE_RESET_NOTE,
  FORTUNE_SOURCE_HELP,
  FORTUNE_SOURCE_LABEL,
  FORTUNE_WEEKDAYS,
  buildFortuneCalendarCells,
  canGoNextFortuneMonth,
  canGoPrevFortuneMonth,
  currentGameMonth,
  formatFortuneDay,
  formatFortuneMonth,
  fortuneBonusText,
  fortuneBonusTip,
  fortuneEffectNote,
  fortuneLuckMult,
  fortunePhrase,
  fortuneSummaryRows,
  resolveSelectedFortuneDay,
  selectFortuneDayDetail,
  selectFortuneMonthStats,
  selectTodayFortune,
  shiftFortuneMonth,
} from './fortune';

const f = (kind: DailyFortune['kind'], index: DailyFortune['index'], day = '2026-11-24'): DailyFortune => ({
  day, kind, index,
});

describe('오늘의 운세 화면 모델', () => {
  it('종류별 이름과 보너스 대상을 제공한다', () => {
    expect(FORTUNE_KIND.fish).toEqual({ name: '풍어운', target: 'rarity', bonus: '희귀 이상 출현 비중' });
    expect(FORTUNE_KIND.gold).toEqual({ name: '재물운', target: 'sell', bonus: '판매가' });
    expect(FORTUNE_KIND.shadow).toEqual({ name: '그림자 운', target: 'named', bonus: '네임드 조우 확률' });
    expect(FORTUNE_SOURCE_LABEL).toBe('오늘의 운세');
    expect(FORTUNE_PIPS).toBe(5);
  });

  it('지수 3과 5의 등급 라벨과 운세 문구를 제공한다', () => {
    expect(FORTUNE_INDEX_LABEL).toEqual({ 3: '적당한 운', 5: '좋은 운' });
    expect(FORTUNE_PHRASE.fish[3]).toBe(
      '물결이 맑아 찌 아래로 지나가는 비늘이 한결 또렷하다. 잔 고기 떼 사이로 보기 드문 고기의 입질이 간간이 섞여 든다.',
    );
    expect(FORTUNE_PHRASE.fish[5]).toBe(
      '바람이 잦아들자 깊은 곳의 물살이 수면 아래까지 고르게 살아난다. 잔 고기만 맴돌던 어군 안에 귀한 고기들이 여럿 섞여 있다.',
    );
    expect(FORTUNE_PHRASE.gold[3]).toBe(
      '이른 아침부터 어시장에 손님이 들며 물고기 값이 고르게 올라선다. 저울 눈금이 평소보다 조금 더 후한 쪽으로 기우는 날이다.',
    );
    expect(FORTUNE_PHRASE.gold[5]).toBe(
      '갓 건진 물고기가 매대에 오르자마자 시세가 한층 높게 붙는다. 상인들이 값을 깎지 않고 선선히 셈을 치르는 날이다.',
    );
    expect(FORTUNE_PHRASE.shadow[3]).toBe(
      '수면 아래 깊은 곳에서 묵직한 물결이 한 번씩 느리게 번져 온다. 곁을 맴돌던 작은 물고기들이 문득 길을 비키며 잠잠해지는 날이다.',
    );
    expect(FORTUNE_PHRASE.shadow[5]).toBe(
      '바람이 없는데도 깊은 곳에서 솟구친 물살이 수면을 길게 가르고 있다. 물 밑의 거대한 그림자가 여느 날보다 가까운 자리까지 자주 올라오는 하루다.',
    );
    expect(fortunePhrase(f('gold', 5))).toBe(FORTUNE_PHRASE.gold[5]);
  });

  it('모달 요약 표와 효과 안내 및 초기화 시각 안내를 만든다', () => {
    expect(fortuneSummaryRows(f('fish', 5))).toEqual([
      { label: '적용 대상', value: '희귀 이상 출현 비중' },
      { label: '행운 효과', value: '×1.05', accent: true },
    ]);
    expect(fortuneSummaryRows(f('gold', 3))).toEqual([
      { label: '적용 대상', value: '판매가' },
      { label: '행운 효과', value: '×1.03', accent: true },
    ]);
    expect(fortuneEffectNote(f('fish', 5))).toBe('오늘 희귀 이상 출현 비중 행운 효과가 ×1.05 올라요.');
    expect(fortuneEffectNote(f('shadow', 3))).toBe('오늘 네임드 조우 확률 행운 효과가 ×1.03 올라요.');
    expect(FORTUNE_RESET_NOTE).toBe('매일 새벽에 새 운세가 찾아와요.');
  });

  it('스탯 창 보너스 탭의 효과 문구와 무수치 툴팁·출처 도움말을 만든다', () => {
    expect(fortuneLuckMult(f('fish', 3))).toBe(1.03);
    expect(fortuneLuckMult(f('gold', 5))).toBe(1.05);
    expect(fortuneBonusText(f('fish', 5))).toBe('희귀 이상 출현 비중 ×1.05');
    expect(fortuneBonusText(f('gold', 3))).toBe('판매가 ×1.03');
    expect(fortuneBonusTip(f('fish', 5))).toBe('희귀 이상 출현 비중 행운 효과가 올라가요.');
    expect(fortuneBonusTip(f('gold', 3))).toBe('판매가 행운 효과가 올라가요.');
    expect(fortuneBonusTip(f('shadow', 5))).toBe('네임드 조우 확률 행운 효과가 올라가요.');
    expect(FORTUNE_SOURCE_HELP).toBe('오늘의 운세는 하루마다 새로 뽑혀요. 행운 효과는 다른 보너스 다음에 곱해져요.');
  });

  it('모든 표시 문구에 금지 문자(가운뎃점·줄표)가 없다', () => {
    const texts: string[] = [
      FORTUNE_SOURCE_LABEL,
      FORTUNE_RESET_NOTE,
      FORTUNE_CALENDAR_NOTE,
      FORTUNE_MENU_GUIDE_NOTE,
      FORTUNE_SOURCE_HELP,
      ...FORTUNE_WEEKDAYS,
      ...Object.values(FORTUNE_INDEX_LABEL),
    ];
    for (const kind of ['fish', 'gold', 'shadow'] as const) {
      texts.push(FORTUNE_KIND[kind].name, FORTUNE_KIND[kind].bonus);
      for (const index of [3, 5] as const) {
        const sample = f(kind, index);
        texts.push(
          fortunePhrase(sample),
          fortuneBonusText(sample),
          fortuneBonusTip(sample),
          fortuneEffectNote(sample),
          ...fortuneSummaryRows(sample).flatMap(r => [r.label, r.value]),
        );
      }
    }
    for (const text of texts) {
      expect(text, text).not.toMatch(/[·—–★]/);
    }
  });
});

describe('운세 월간 달력 파생 로직', () => {
  it('게임 날짜 경계(새벽 4시)를 반영해 현재 월과 오늘 운세를 계산한다', () => {
    // UTC 2026-11-30T18:30:00Z = KST 2026-12-01 03:30 (새벽 4시 이전이므로 게임 날짜는 2026-11-30)
    const beforeBoundary = '2026-11-30T18:30:00.000Z';
    expect(currentGameMonth(beforeBoundary)).toBe('2026-11');
    const nov30 = f('fish', 5, '2026-11-30');
    expect(selectTodayFortune(nov30, beforeBoundary)).toEqual(nov30);
    expect(selectTodayFortune(f('gold', 3, '2026-11-29'), beforeBoundary)).toBeNull();
  });

  it('월 이동과 포맷, 이전/다음 달 경계를 계산한다', () => {
    expect(shiftFortuneMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftFortuneMonth('2026-12', 1)).toBe('2027-01');
    expect(formatFortuneMonth('2026-11')).toBe('2026년 11월');
    expect(formatFortuneDay('2026-11-05')).toBe('2026년 11월 5일');

    expect(canGoPrevFortuneMonth('2026-11', null)).toBe(false);
    expect(canGoPrevFortuneMonth('2026-11', '2026-11')).toBe(false);
    expect(canGoPrevFortuneMonth('2026-11', '2026-10')).toBe(true);
    expect(canGoNextFortuneMonth('2026-11', '2026-11')).toBe(false);
    expect(canGoNextFortuneMonth('2026-10', '2026-11')).toBe(true);
  });

  it('월요일 시작 기준으로 달력 격자 셀을 생성하고 오늘·미래·기록을 구분한다', () => {
    // 2026-11-01은 일요일이므로 월~토 6칸이 빈 칸, 일 30일 총 36셀
    const records: DailyFortune[] = [
      f('gold', 3, '2026-11-19'),
      f('fish', 5, '2026-11-25'),
    ];
    const cells = buildFortuneCalendarCells('2026-11', records, '2026-11-25');
    expect(FORTUNE_WEEKDAYS).toEqual(['월', '화', '수', '목', '금', '토', '일']);
    expect(cells).toHaveLength(36);
    expect(cells.slice(0, 6).every(c => c.kind === 'blank')).toBe(true);

    const day1 = cells[6];
    expect(day1).toEqual({
      kind: 'day', key: '2026-11-01', day: '2026-11-01', dateNum: 1,
      isToday: false, isFuture: false, fortune: null,
    });
    const day19 = cells.find(c => c.kind === 'day' && c.day === '2026-11-19');
    expect(day19).toMatchObject({ kind: 'day', isToday: false, isFuture: false, fortune: records[0] });
    const day25 = cells.find(c => c.kind === 'day' && c.day === '2026-11-25');
    expect(day25).toMatchObject({ kind: 'day', isToday: true, isFuture: false, fortune: records[1] });
    const day26 = cells.find(c => c.kind === 'day' && c.day === '2026-11-26');
    expect(day26).toMatchObject({ kind: 'day', isToday: false, isFuture: true, fortune: null });
  });

  it('월간 통계로 총 기록 일수와 종류별 횟수를 집계한다', () => {
    const records: DailyFortune[] = [
      f('fish', 3, '2026-11-01'),
      f('fish', 5, '2026-11-02'),
      f('gold', 3, '2026-11-03'),
      f('shadow', 5, '2026-11-04'),
      f('shadow', 3, '2026-11-05'),
    ];
    expect(selectFortuneMonthStats(records)).toEqual({
      total: 5,
      byKind: { fish: 2, gold: 1, shadow: 2 },
    });
    expect(selectFortuneMonthStats([])).toEqual({
      total: 0,
      byKind: { fish: 0, gold: 0, shadow: 0 },
    });
  });

  it('선택 날짜 기본값과 상세 정보를 파생한다', () => {
    const records: DailyFortune[] = [
      f('gold', 3, '2026-10-12'),
      f('shadow', 5, '2026-10-28'),
    ];
    // 현재 월이면 오늘을 기본 선택
    expect(resolveSelectedFortuneDay('2026-11', [], '2026-11-25')).toBe('2026-11-25');
    // 과거 월이면 마지막 기록일을 기본 선택
    expect(resolveSelectedFortuneDay('2026-10', records, '2026-11-25')).toBe('2026-10-28');
    // 빈 과거 월이면 null
    expect(resolveSelectedFortuneDay('2026-09', [], '2026-11-25')).toBeNull();
    // 같은 달 안에서 사용자가 선택한 과거/오늘 날짜가 있으면 유지
    expect(resolveSelectedFortuneDay('2026-10', records, '2026-11-25', '2026-10-12')).toBe('2026-10-12');
    // 다른 달에서 넘어온 선택값은 새 달의 기본 선택으로 대체
    expect(resolveSelectedFortuneDay('2026-10', records, '2026-11-25', '2026-11-25')).toBe('2026-10-28');

    expect(selectFortuneDayDetail('2026-10-12', records, '2026-11-25')).toEqual({
      day: '2026-10-12',
      dateLabel: '2026년 10월 12일',
      isToday: false,
      fortune: records[0],
    });
    expect(selectFortuneDayDetail('2026-10-13', records, '2026-11-25')).toEqual({
      day: '2026-10-13',
      dateLabel: '2026년 10월 13일',
      isToday: false,
      fortune: null,
    });
    expect(selectFortuneDayDetail(null, records, '2026-11-25')).toBeNull();
  });

  it('달력 안내 문구가 규칙 문구 기준을 지키고 금지 표현을 쓰지 않는다', () => {
    expect(FORTUNE_CALENDAR_NOTE).toContain('매일 새벽');
    expect(FORTUNE_CALENDAR_NOTE).not.toMatch(/4시|한국 시간 새벽/);
  });
});
