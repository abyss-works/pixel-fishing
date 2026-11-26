import { describe, expect, it } from 'vitest';
import { FORTUNE_CATALOG } from '../../../game/rules/fortune';
import type { DailyFortune } from '../../../game/rules/fortune';
import { newState } from '../../../game/rules/logic';
import type { FortuneHistory } from '../../../platform/api';
import {
  FORTUNE_EFFECT_TARGET_LABEL,
  FORTUNE_INDEX_LABEL,
  FORTUNE_KIND,
  FORTUNE_PHRASE,
  FORTUNE_PIPS,
  FORTUNE_SHORT_NAME,
  FORTUNE_SOURCE_HELP,
  FORTUNE_SOURCE_LABEL,
  FORTUNE_TARGET_BONUS_LABEL,
  FORTUNE_WEEKDAYS,
  buildFortuneCalendarCells,
  canGoNextFortuneMonth,
  canGoPrevFortuneMonth,
  currentGameMonth,
  formatFortuneDay,
  formatFortuneMonth,
  formatLuckMult,
  fortuneBonusText,
  fortuneBonusTip,
  fortuneEffectRows,
  fortuneHistoryDiscovered,
  fortuneLuckMult,
  fortuneLuckMultText,
  fortuneModalRows,
  fortuneName,
  fortunePhrase,
  fortuneShortName,
  resolveSelectedFortuneDay,
  selectFortuneCatalogOptions,
  selectFortuneCollection,
  selectFortuneDayDetail,
  selectSellLuck,
  selectTodayFortune,
  shiftFortuneMonth,
} from './fortune';

const f = (kind: DailyFortune['kind'], index: DailyFortune['index'], day = '2026-11-24'): DailyFortune => ({
  day, kind, index,
});

describe('오늘의 운세 화면 모델 (21종 확장)', () => {
  it('12종 kind와 21종 정식 이름·짧은 이름·10개 보너스 채널을 제공한다', () => {
    expect(FORTUNE_CATALOG).toHaveLength(21);
    expect(Object.keys(FORTUNE_TARGET_BONUS_LABEL)).toHaveLength(10);
    expect(FORTUNE_KIND.fish).toEqual({ name: '풍어운', target: 'rarity' });
    expect(FORTUNE_KIND.gold).toEqual({ name: '재물운', target: 'sell' });
    expect(FORTUNE_KIND.shadow).toEqual({ name: '그림자 운', target: 'named' });
    expect(FORTUNE_SOURCE_LABEL).toBe('오늘의 운세');
    expect(FORTUNE_PIPS).toBe(5);

    expect(fortuneName(f('fish', 3))).toBe('잔물결 풍어운');
    expect(fortuneName(f('fish', 5))).toBe('만선 풍어운');
    expect(fortuneName(f('gold', 3))).toBe('잔돈 재물운');
    expect(fortuneName(f('gold', 5))).toBe('황금 저울운');
    expect(fortuneName(f('bite', 3))).toBe('순풍 조류운');
    expect(fortuneName(f('bite', 5))).toBe('물때 호조운');
    expect(fortuneName(f('big', 3))).toBe('묵직한 찌운');
    expect(fortuneName(f('big', 5))).toBe('대어 기운');
    expect(fortuneName(f('fame', 3))).toBe('소소한 명성운');
    expect(fortuneName(f('fame', 5))).toBe('바다의 명예운');
    expect(fortuneName(f('shadow', 3))).toBe('얕은 그림자 운');
    expect(fortuneName(f('shadow', 5))).toBe('심해 그림자 운');
    expect(fortuneName(f('mutation', 3))).toBe('묘한 물빛 운');
    expect(fortuneName(f('mutation', 5))).toBe('오색 물빛 운');
    expect(fortuneName(f('night', 3))).toBe('초승달 밤운');
    expect(fortuneName(f('night', 5))).toBe('만월 밤바다 운');
    expect(fortuneName(f('energy', 3))).toBe('맑은 기운');
    expect(fortuneName(f('energy', 5))).toBe('넘치는 기운');
    expect(fortuneName(f('golden-scale', 5))).toBe('금비늘 운');
    expect(fortuneName(f('mirage', 5))).toBe('신기루 운');
    expect(fortuneName(f('grand-catch', 5))).toBe('만선 대길');

    expect(fortuneShortName(f('fish', 3))).toBe('잔물결');
    expect(fortuneShortName(f('fish', 5))).toBe('만선풍어');
    expect(fortuneShortName(f('shadow', 3))).toBe('그림자');
    expect(fortuneShortName(f('shadow', 5))).toBe('큰그림자');
    expect(fortuneShortName(f('mutation', 5))).toBe('오색물빛');
    expect(fortuneShortName(f('grand-catch', 5))).toBe('만선대길');
  });

  it('강도 라벨, 21종 세계의 목소리 문구, 금지어(변이 단축어·비노출 등급·확률) 부재를 보장한다', () => {
    expect(FORTUNE_INDEX_LABEL).toEqual({ 3: '적당한 운', 5: '좋은 운' });
    expect(fortunePhrase(f('fish', 3))).toBe(FORTUNE_PHRASE.fish[3]);
    expect(fortunePhrase(f('grand-catch', 5))).toBe(FORTUNE_PHRASE['grand-catch'][5]);

    const texts: string[] = [
      FORTUNE_SOURCE_LABEL,
      FORTUNE_SOURCE_HELP,
      ...FORTUNE_WEEKDAYS,
      ...Object.values(FORTUNE_INDEX_LABEL),
      ...Object.values(FORTUNE_TARGET_BONUS_LABEL),
    ];
    for (const entry of FORTUNE_CATALOG) {
      const sample = f(entry.kind, entry.index);
      texts.push(
        FORTUNE_KIND[entry.kind].name,
        FORTUNE_SHORT_NAME[entry.kind],
        FORTUNE_EFFECT_TARGET_LABEL[entry.kind],
        fortuneName(sample),
        fortuneShortName(sample),
        fortunePhrase(sample),
        fortuneBonusText(sample),
        fortuneBonusTip(sample),
        fortuneLuckMultText(sample),
        ...fortuneModalRows(sample).flatMap(r => [r.label, r.value]),
      );
    }
    for (const text of texts) {
      expect(text, text).not.toMatch(/[·—–★]/);
      expect(text, text).not.toMatch(/1등급|2등급|3등급|65%|25%|10%|40%|60%|지수|%p/i);
      // '돌연변이' 외의 단독 '변이' 단축어를 쓰지 않는다
      expect(text.replace(/돌연변이/g, ''), text).not.toContain('변이');
    }
  });

  it('단일 효과와 복합 대길(신기루 운 2행, 만선 대길 3행) 모달 표와 보너스 문구를 만든다', () => {
    expect(formatLuckMult(1.05)).toBe('×1.05');
    expect(formatLuckMult(1.1)).toBe('×1.10');
    expect(formatLuckMult(0.95)).toBe('×0.95');
    expect(formatLuckMult(1.5)).toBe('×1.50');
    expect(formatLuckMult(2)).toBe('×2.00');

    expect(fortuneLuckMult(f('fish', 3))).toBe(1.05);
    expect(fortuneLuckMult(f('fish', 5))).toBe(1.10);
    expect(fortuneBonusText(f('fish', 5))).toBe('희귀 이상 출현 비중 ×1.10');
    expect(fortuneBonusText(f('gold', 3))).toBe('판매가 ×1.05');
    expect(fortuneBonusText(f('mirage', 5))).toBe('전설 출현 비중 ×1.08, 돌연변이 출현 비중 ×1.08');
    expect(fortuneBonusText(f('grand-catch', 5))).toBe('희귀 이상 출현 비중 ×1.10, 판매가 ×1.10, 네임드 조우 확률 ×1.10');

    expect(fortuneModalRows(f('fish', 5))).toEqual([
      { label: '적용 대상', value: '희귀 이상 출현 비중' },
      { label: '행운 효과', value: '×1.10', accent: true },
    ]);
    expect(fortuneModalRows(f('bite', 5))).toEqual([
      { label: '적용 대상', value: '입질 대기' },
      { label: '행운 효과', value: '×0.90', accent: true },
    ]);
    expect(fortuneModalRows(f('mirage', 5))).toEqual([
      { label: '전설 출현 비중', value: '×1.08', accent: true },
      { label: '돌연변이 출현 비중', value: '×1.08', accent: true },
    ]);
    expect(fortuneModalRows(f('grand-catch', 5))).toEqual([
      { label: '희귀 이상 출현 비중', value: '×1.10', accent: true },
      { label: '판매가', value: '×1.10', accent: true },
      { label: '네임드 조우 확률', value: '×1.10', accent: true },
    ]);
    expect(fortuneEffectRows(f('grand-catch', 5))).toHaveLength(3);
    expect(fortuneBonusTip(f('shadow', 5))).toBe('네임드 조우 확률 행운 효과가 올라가요.');
    expect(fortuneBonusTip(f('grand-catch', 5))).toBe('여러 행운 효과가 함께 올라가요.');
    expect(FORTUNE_SOURCE_HELP).toBe('오늘의 운세는 하루마다 새로 뽑혀요. 행운 효과는 다른 보너스 다음에 곱해져요.');
  });

  it('selectSellLuck은 재물운(×1.05/×1.10)과 만선 대길(×1.10)의 판매가 행운 배수를 모두 반영한다', () => {
    const now = '2026-11-24T05:00:00.000Z';
    const day = '2026-11-24';
    expect(selectSellLuck({ ...newState(), fortune: f('gold', 3, day) }, now)).toEqual({
      mult: 1.05,
      fortuneBonus: 0.05,
      potions: [],
    });
    expect(selectSellLuck({ ...newState(), fortune: f('gold', 5, day) }, now)).toEqual({
      mult: 1.1,
      fortuneBonus: 0.1,
      potions: [],
    });
    expect(selectSellLuck({ ...newState(), fortune: f('grand-catch', 5, day) }, now)).toEqual({
      mult: 1.1,
      fortuneBonus: 0.1,
      potions: [],
    });
    expect(selectSellLuck({ ...newState(), fortune: f('fish', 5, day) }, now)).toEqual({
      mult: 1,
      fortuneBonus: 0,
      potions: [],
    });
  });

  it('점괘첩 수집 모델(selectFortuneCollection)과 개발 도구 카탈로그 선택지(21종)를 만든다', () => {
    const history: FortuneHistory = {
      month: '2026-11',
      firstMonth: '2026-11',
      currentDay: '2026-11-25',
      today: f('grand-catch', 5, '2026-11-25'),
      days: [f('fish', 3, '2026-11-12'), f('grand-catch', 5, '2026-11-25')],
      discovered: [
        { kind: 'fish', index: 3, count: 4, firstDay: '2026-11-12' },
        { kind: 'grand-catch', index: 5, count: 1, firstDay: '2026-11-25' },
      ],
    };
    const discovered = fortuneHistoryDiscovered(history);
    const view = selectFortuneCollection(discovered);
    expect(view.totalCount).toBe(21);
    expect(view.discoveredCount).toBe(2);
    expect(view.items).toHaveLength(21);

    const first = view.items[0];
    expect(first).toMatchObject({
      key: 'fish:3',
      name: '잔물결 풍어운',
      discovered: true,
      count: 4,
      firstDay: '2026-11-12',
    });
    const last = view.items[20];
    expect(last).toMatchObject({
      key: 'grand-catch:5',
      name: '만선 대길',
      discovered: true,
      count: 1,
      firstDay: '2026-11-25',
    });
    const unseen = view.items.find(i => i.key === 'mirage:5')!;
    expect(unseen).toMatchObject({
      name: '신기루 운',
      discovered: false,
      count: 0,
      firstDay: null,
    });

    expect(fortuneHistoryDiscovered(null)).toEqual([]);
    expect(selectFortuneCatalogOptions()).toHaveLength(21);
  });
});

describe('운세 월간 달력 파생 로직', () => {
  it('게임 날짜 경계(새벽 4시)를 반영해 현재 월과 오늘 운세를 계산한다', () => {
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

  it('선택 날짜 기본값과 상세 정보를 파생한다', () => {
    const records: DailyFortune[] = [
      f('gold', 3, '2026-10-12'),
      f('shadow', 5, '2026-10-28'),
    ];
    expect(resolveSelectedFortuneDay('2026-11', [], '2026-11-25')).toBeNull();
    expect(resolveSelectedFortuneDay('2026-11', [f('fish', 5, '2026-11-20'), f('gold', 3, '2026-11-25')], '2026-11-25')).toBe('2026-11-25');
    expect(resolveSelectedFortuneDay('2026-11', [f('fish', 5, '2026-11-20')], '2026-11-25')).toBe('2026-11-20');
    expect(resolveSelectedFortuneDay('2026-10', records, '2026-11-25')).toBe('2026-10-28');
    expect(resolveSelectedFortuneDay('2026-09', [], '2026-11-25')).toBeNull();
    expect(resolveSelectedFortuneDay('2026-10', records, '2026-11-25', '2026-10-12')).toBe('2026-10-12');
    expect(resolveSelectedFortuneDay('2026-10', records, '2026-11-25', '2026-10-13')).toBe('2026-10-28');
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
});
