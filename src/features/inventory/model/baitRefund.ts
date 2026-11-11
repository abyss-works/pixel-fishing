// 미끼 환불 안내 - 세이브 이관이 남긴 영수증을 안내 창이 보이는 문안과 목록으로 바꾼다.
import { COOKING_UNLOCK_BOAT, LEGACY_BAIT_REFUND } from '../../../game/content/cooking';
import { RARITY } from '../../../game/content/rarity';
import type { RarityId } from '../../../game/content/rarity';
import type { BaitRefund } from '../../../game/rules/logic';
import { progressLines } from '../../display/model/menuLock';

export interface BaitRefundRow {
  id: string;
  /** 이름 뒤 괄호에 등급을 붙인 꼴 */
  name: string;
  count: number;
}

export interface BaitRefundNotice {
  title: string;
  /** 줄마다 따로 보이는 안내 문안 */
  lines: string[];
  /** 환불한 미끼별 개수, 등급 오름차순 */
  rows: BaitRefundRow[];
  /** 환불한 골드 합계 */
  gold: number;
}

const BAIT_ID_PREFIX = 'bait-';

/** 이전 미끼 id의 표시 이름 - 환불표에는 이름이 없어 id가 가리키는 등급으로 "미끼(등급)" 꼴을 만든다 */
function legacyBaitName(id: string): string {
  const grade = id.startsWith(BAIT_ID_PREFIX) ? id.slice(BAIT_ID_PREFIX.length) : '';
  return Object.hasOwn(RARITY, grade) ? `미끼(${RARITY[grade as RarityId].name})` : '미끼';
}

/**
 * 영수증에서 안내 창의 내용을 만든다. 영수증이 없으면 안내도 없다.
 * 부엌이 아직 열리지 않은 배 단계에는 부엌이 열리는 조건을 줄로 덧붙인다.
 */
export function baitRefundNotice(refund: BaitRefund | null, boat: number): BaitRefundNotice | null {
  if (!refund) return null;
  const lines = [
    '가지고 있던 미끼를 정가대로 골드로 바꿔 두었어요.',
    '이제 미끼는 골드로 사지 않고 집 부엌에서 생명의 기운으로 만들어요.',
  ];
  if (boat < COOKING_UNLOCK_BOAT) lines.push(...progressLines('부엌', COOKING_UNLOCK_BOAT, 'topic'));
  const rows = Object.keys(LEGACY_BAIT_REFUND)
    .filter(id => (refund.items[id] ?? 0) > 0)
    .map(id => ({ id, name: legacyBaitName(id), count: refund.items[id] }));
  return { title: '미끼 환불', lines, rows, gold: refund.gold };
}
