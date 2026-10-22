// 우편함 파생 모델 — 우편 목록에서 할 일이 남은 우편과 받을 골드를 가린다.
import type { MailItem } from '../../../platform/api';

export type { MailItem };

/** 골드를 받을 수 있는 우편인가 */
export const isClaimable = (m: Pick<MailItem, 'gold' | 'claimedAt'>): boolean => m.gold > 0 && m.claimedAt === null;

/** 할 일이 남은 우편인가 — 골드 우편은 받기 전, 글 우편은 읽기 전 */
export const isPending = (m: Pick<MailItem, 'gold' | 'readAt' | 'claimedAt'>): boolean =>
  (m.gold > 0 ? m.claimedAt === null : m.readAt === null);

/** 할 일이 남은 우편 수 */
export const pendingCount = (mails: readonly MailItem[]): number => mails.filter(isPending).length;
