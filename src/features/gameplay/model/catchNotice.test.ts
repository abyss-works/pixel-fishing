import { describe, expect, it } from 'vitest';
import { FISH } from '../../../game/rules/logic';
import { bagOverflowNotice, bagOverflowNoticeInput, classifyCatchNotice } from './catchNotice';

const fish = (uid: string, name: string) => ({ uid, name });

describe('가방 초과 안내', () => {
  it('내보낸 개체가 없으면 안내가 없다', () => {
    expect(bagOverflowNotice({ released: [] })).toBeNull();
    expect(bagOverflowNotice({ released: [], extracted: [] })).toBeNull();
  });

  it('놓아주기만 있으면 기존 문구 그대로다', () => {
    expect(bagOverflowNotice({ released: [fish('a', '붕어'), fish('b', '잉어')] }))
      .toBe('가방이 가득 차 [붕어, 잉어]을(를) 놓아줬어요. 명성은 그대로 남아요.');
  });

  it('기운으로 바꾸기만 있으면 바꾼 수를 알린다', () => {
    expect(bagOverflowNotice({ released: [], extracted: [fish('a', '붕어')] }))
      .toBe('가방이 차서 1마리를 생명의 기운으로 바꿨어요.');
  });

  it('둘 다 있으면 한 문장으로 알린다', () => {
    expect(bagOverflowNotice({ released: [fish('b', '잉어')], extracted: [fish('a', '붕어'), fish('c', '피라미')] }))
      .toBe('가방이 차서 2마리를 생명의 기운으로 바꾸고 1마리를 놓아줬어요.');
  });

  it('bagOverflowNoticeInput은 1줄 요약과 replaceKey를 함께 생성한다', () => {
    const input = bagOverflowNoticeInput({ released: [fish('b', '잉어')], extracted: [fish('a', '붕어')] });
    expect(input?.kind).toBe('catch.bagOverflow');
    expect(input?.toastText).toBe('가방 가득 참 2마리 정리');
    expect(input?.replaceKey).toBe('bag-overflow');
  });
});

describe('포획 이벤트 토스트 분류', () => {
  const commonFish = FISH.find(f => f.rarity === 'common')!;
  const epicFish = FISH.find(f => f.rarity === 'epic')!;
  const legendaryFish = FISH.find(f => f.rarity === 'legendary')!;

  it('전설 어종과 최초 돌연변이는 Tier A(catch.legendaryOrFirstVariant)로 분류한다', () => {
    const leg = classifyCatchNotice(legendaryFish, { form: 'normal', size: 100, percentile: 50, isBig: false, isNew: false }, 'normal', { count: 1, maxSize: 120, first: null });
    expect(leg.kind).toBe('catch.legendaryOrFirstVariant');
    expect(leg.tone).toBe('gold');

    const firstVar = classifyCatchNotice(commonFish, { form: 'variant', size: 20, percentile: 50, isBig: false, isNew: true }, 'auto', undefined);
    expect(firstVar.kind).toBe('catch.legendaryOrFirstVariant');
    expect(firstVar.tone).toBe('epic');
  });

  it('영웅·신규 도감·최대 크기 경신은 Tier B(catch.epicOrRecord)로 분류하고 수동 포획은 쿨다운을 건너뛴다', () => {
    const epic = classifyCatchNotice(epicFish, { form: 'normal', size: 50, percentile: 50, isBig: false, isNew: false }, 'perfect', { count: 1, maxSize: 80, first: null });
    expect(epic.kind).toBe('catch.epicOrRecord');
    expect(epic.bypassCooldown).toBe(true);

    const record = classifyCatchNotice(commonFish, { form: 'normal', size: 45, percentile: 10, isBig: true, isNew: false }, 'auto', { count: 2, maxSize: 40, first: null });
    expect(record.kind).toBe('catch.epicOrRecord');
    expect(record.toastText).toContain('최대 크기');
    expect(record.bypassCooldown).toBe(false);
  });

  it('일상 일반·반복 포획은 Tier C(catch.routine, logTone info)로 분류한다', () => {
    const routine = classifyCatchNotice(commonFish, { form: 'normal', size: 20, percentile: 50, isBig: false, isNew: false }, 'auto', { count: 5, maxSize: 30, first: null });
    expect(routine.kind).toBe('catch.routine');
    expect(routine.logTone).toBe('info');
  });
});
