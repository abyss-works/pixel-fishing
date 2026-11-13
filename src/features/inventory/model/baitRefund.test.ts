import { describe, expect, it } from 'vitest';
import { COOKING_UNLOCK_BOAT } from '../../../game/content/cooking';
import { baitRefundNotice } from './baitRefund';

const receipt = { gold: 2625, items: { 'bait-legendary': 1, 'bait-common': 5 } };

describe('미끼 환불 안내', () => {
  it('영수증이 없으면 안내가 없다', () => {
    expect(baitRefundNotice(null, 0)).toBeNull();
  });

  it('제목은 "미끼 환불"이고 환불 골드 합계를 그대로 담는다', () => {
    const notice = baitRefundNotice(receipt, COOKING_UNLOCK_BOAT)!;
    expect(notice.title).toBe('미끼 환불');
    expect(notice.gold).toBe(2625);
  });

  it('미끼별 개수는 등급 오름차순이고 이름은 이름 뒤 괄호에 등급을 붙인다', () => {
    const notice = baitRefundNotice(receipt, COOKING_UNLOCK_BOAT)!;
    expect(notice.rows).toEqual([
      { id: 'bait-common', name: '미끼(일반)', count: 5 },
      { id: 'bait-legendary', name: '미끼(전설)', count: 1 },
    ]);
  });

  it('영수증에 없는 미끼는 줄을 만들지 않는다', () => {
    const notice = baitRefundNotice({ gold: 200, items: { 'bait-rare': 1 } }, COOKING_UNLOCK_BOAT)!;
    expect(notice.rows.map(r => r.name)).toEqual(['미끼(희귀)']);
  });

  it('부엌이 열리기 전에는 부엌 안내와 항로 조건 줄이 붙는다', () => {
    const notice = baitRefundNotice(receipt, COOKING_UNLOCK_BOAT - 1)!;
    expect(notice.lines).toEqual([
      '가지고 있던 미끼를 정가대로 골드로 바꿔 두었어요.',
      '이제 미끼는 골드로 사지 않고 집 부엌에서 생명의 기운으로 만들어요.',
      '부엌은 인도양 항로가 열리면 쓸 수 있어요.',
      '인도양 항로는 증기선(5단계)부터 열려요.',
    ]);
  });

  it('부엌이 열린 뒤에는 앞의 두 줄만 있다', () => {
    const notice = baitRefundNotice(receipt, COOKING_UNLOCK_BOAT)!;
    expect(notice.lines).toEqual([
      '가지고 있던 미끼를 정가대로 골드로 바꿔 두었어요.',
      '이제 미끼는 골드로 사지 않고 집 부엌에서 생명의 기운으로 만들어요.',
    ]);
  });
});
