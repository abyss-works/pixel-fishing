// 우편함 파생 모델 — 우편 목록에서 할 일이 남은 우편과 받을 보상을 가린다.
import type { MailItem } from '../../../platform/api';
import { findStackableItem, formatItemQtyText } from '../../inventory/model/items';

export type { MailItem };

/** 받을 보상(골드 또는 아이템)이 있는 우편인가 */
export const hasReward = (m: Pick<MailItem, 'gold' | 'items'>): boolean =>
  m.gold > 0 || m.items.length > 0;

/** 보상을 받을 수 있는 우편인가 */
export const isClaimable = (m: Pick<MailItem, 'gold' | 'items' | 'claimedAt'>): boolean =>
  hasReward(m) && m.claimedAt === null;

/** 할 일이 남은 우편인가 — 보상 우편은 받기 전, 글 우편은 읽기 전 */
export const isPending = (m: Pick<MailItem, 'gold' | 'items' | 'readAt' | 'claimedAt'>): boolean =>
  (hasReward(m) ? m.claimedAt === null : m.readAt === null);

/** 할 일이 남은 우편 수 */
export const pendingCount = (mails: readonly MailItem[]): number => mails.filter(isPending).length;

/** 목록 표의 보상 칸 요약 문구 */
export function mailRewardSummary(m: Pick<MailItem, 'gold' | 'items'>): string {
  const goldText = m.gold > 0 ? `${m.gold.toLocaleString('ko-KR')}G` : '';
  if (m.items.length === 0) return goldText;
  if (goldText) return `${goldText} 외 ${m.items.length}종`;
  const firstName = findStackableItem(m.items[0].id)?.name ?? m.items[0].id;
  if (m.items.length === 1) return `${firstName} ×${m.items[0].qty.toLocaleString('ko-KR')}`;
  return `${firstName} 외 ${m.items.length - 1}종`;
}

/** 우편 수령 안내 문구 */
export function claimMailNoticeText(m: Pick<MailItem, 'gold' | 'items'>): string {
  const parts: string[] = [];
  if (m.gold > 0) parts.push(`${m.gold.toLocaleString('ko-KR')}G`);
  for (const att of m.items) parts.push(formatItemQtyText(att.id, att.qty));
  if (parts.length === 0) return '우편 보상을 받았어요!';
  return `우편에서 ${parts.join(', ')}를 받았어요!`;
}

/** 우편 수령 토스트 짧은 문구 */
export function claimMailToastText(m: Pick<MailItem, 'gold' | 'items'>): string {
  if (m.gold > 0 && m.items.length === 0) return `우편 ${m.gold.toLocaleString('ko-KR')}G 수령!`;
  if (m.gold === 0 && m.items.length === 1) return `우편 ${formatItemQtyText(m.items[0].id, m.items[0].qty)} 수령!`;
  if (m.gold > 0 && m.items.length > 0) return `우편 ${m.gold.toLocaleString('ko-KR')}G 외 아이템 ${m.items.length}종 수령!`;
  if (m.items.length > 1) return `우편 아이템 ${m.items.length}종 수령!`;
  return '우편 보상 수령!';
}
