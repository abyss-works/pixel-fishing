import { describe, expect, it } from 'vitest';
import type { DailyFortune } from '../../../game/rules/fortune';
import {
  FORTUNE_INDEX_LABEL,
  FORTUNE_KIND,
  FORTUNE_PHRASE,
  FORTUNE_PIPS,
  FORTUNE_RESET_NOTE,
  FORTUNE_SOURCE_HELP,
  FORTUNE_SOURCE_LABEL,
  fortuneBonusText,
  fortuneBonusTip,
  fortuneEffectNote,
  fortuneLuckMult,
  fortunePhrase,
  fortuneSummaryRows,
} from './fortune';

const f = (kind: DailyFortune['kind'], index: DailyFortune['index'], day = '2026-11-24'): DailyFortune => ({
  day, kind, index,
});

describe('오늘의 운세 화면 모델', () => {
  it('종류별 이름과 보너스 대상을 제공한다', () => {
    expect(FORTUNE_KIND.fish).toEqual({ name: '풍어운', target: 'rarity', bonus: '희귀 이상 등급 가중치' });
    expect(FORTUNE_KIND.gold).toEqual({ name: '재물운', target: 'sell', bonus: '판매가' });
    expect(FORTUNE_KIND.shadow).toEqual({ name: '그림자 운', target: 'named', bonus: '네임드 조우 가중치' });
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
      { label: '적용 대상', value: '희귀 이상 등급 가중치' },
      { label: '운 배율', value: '+5%p', accent: true },
    ]);
    expect(fortuneSummaryRows(f('gold', 3))).toEqual([
      { label: '적용 대상', value: '판매가' },
      { label: '운 배율', value: '+3%p', accent: true },
    ]);
    expect(fortuneEffectNote(f('fish', 5))).toBe('오늘 희귀 이상 등급 가중치의 운 배율이 +5%p 올라요.');
    expect(fortuneEffectNote(f('shadow', 3))).toBe('오늘 네임드 조우 가중치의 운 배율이 +3%p 올라요.');
    expect(FORTUNE_RESET_NOTE).toBe('새 운세는 매일 새벽 4시에 다시 정해져요.');
  });

  it('스탯 창 보너스 탭의 효과 문구와 무수치 툴팁·출처 도움말을 만든다', () => {
    expect(fortuneLuckMult(f('fish', 3))).toBe(1.03);
    expect(fortuneLuckMult(f('gold', 5))).toBe(1.05);
    expect(fortuneBonusText(f('fish', 5))).toBe('희귀 이상 등급 가중치 +5%p');
    expect(fortuneBonusText(f('gold', 3))).toBe('판매가 +3%p');
    expect(fortuneBonusTip(f('fish', 5))).toBe('희귀 이상 등급 가중치에 운 배율이 적용돼요.');
    expect(fortuneBonusTip(f('gold', 3))).toBe('판매가에 운 배율이 적용돼요.');
    expect(fortuneBonusTip(f('shadow', 5))).toBe('네임드 조우 가중치에 운 배율이 적용돼요.');
    expect(FORTUNE_SOURCE_HELP).toBe('오늘의 운세는 한국 시간 새벽 4시에 새로 뽑혀요. 운 배율은 다른 보너스 다음에 곱해져요.');
  });

  it('모든 표시 문구에 금지 문자(가운뎃점·줄표)가 없다', () => {
    const texts: string[] = [
      FORTUNE_SOURCE_LABEL,
      FORTUNE_RESET_NOTE,
      FORTUNE_SOURCE_HELP,
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
      expect(text, text).not.toMatch(/[·—–]/);
    }
  });
});
