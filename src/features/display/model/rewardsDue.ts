// 받을 보상 모음 - 오른쪽 아래 받을 보상 카드와 메뉴 표식이 같은 판정을 쓰는 단일 출처.
// 일반 의뢰 목표 달성, 네임드 토벌 보상 대기, 받을 수 있는 업적, 읽지 않은 우편을 줄로 모은다.
import { bountyById, bountyKindOf } from '../../../game/content/bounties';
import { zoneById } from '../../../game/content/zones';
import { boardPortNameOf } from '../../bounty/model/questInfo';
import { questLabel } from '../../bounty/model/panel';
import type { BountySnapshot } from '../../bounty/model/types';
import { guestLock } from './menuLock';
import type { AccountLockState } from './menuLock';
import type { MenuKey } from './menuEntries';

export type RewardWindow = Extract<MenuKey, 'quests' | 'achievements' | 'mailbox'>;

export interface RewardLine {
  key: string;
  /** 줄을 누르면 여는 창 */
  window: RewardWindow;
  windowName: string;
  /** 줄 문구 */
  text: string;
  /** 툴팁 두 줄 */
  tip: [string, string];
  /** 이 줄이 센 받을 보상 건수 */
  count: number;
}

export interface RewardsDue {
  lines: RewardLine[];
  total: number;
}

const WINDOW_NAME: Record<RewardWindow, string> = { quests: '의뢰 창', achievements: '업적 창', mailbox: '우편함 창' };

function questLines(snapshot: BountySnapshot | null): RewardLine[] {
  const lines: RewardLine[] = [];
  for (const row of snapshot?.progress ?? []) {
    const quest = bountyById(row.questId);
    if (!quest || row.progress < quest.count) continue;
    const port = boardPortNameOf(quest.zone);
    const named = bountyKindOf(quest) === 'named';
    const text = questLabel(quest);
    const zone = zoneById(quest.zone)?.shortName ?? quest.zone;
    lines.push({
      key: quest.id, window: 'quests', windowName: WINDOW_NAME.quests, text, count: 1,
      tip: named
        ? [`${zone} 네임드를 토벌했어요.`, `${port} 수배판에서 보상 받기를 눌러 주세요.`]
        : [`${text} 목표를 달성했어요.`, `${port} 수배판에서 보상을 받아 주세요.`],
    });
  }
  return lines;
}

/** 받을 보상 줄을 의뢰, 업적, 우편 순으로 모은다. 계정 상태에서 잠긴 창의 줄은 두지 않는다 */
export function selectRewardsDue({ snapshot, claimable, mailPending, accountState }: {
  snapshot: BountySnapshot | null;
  /** 받을 수 있는 업적 수 */
  claimable: number;
  /** 받거나 읽지 않은 우편 수 */
  mailPending: number;
  accountState: AccountLockState;
}): RewardsDue {
  const open = (window: RewardWindow) => guestLock(window, accountState) === null;
  const lines: RewardLine[] = [];
  if (open('quests')) lines.push(...questLines(snapshot));
  if (open('achievements') && claimable > 0) {
    lines.push({
      key: 'achievements', window: 'achievements', windowName: WINDOW_NAME.achievements, count: claimable,
      text: `업적 ${claimable}개`,
      tip: [`받을 수 있는 업적이 ${claimable}개 있어요.`, '업적 창에서 받기를 눌러 주세요.'],
    });
  }
  if (open('mailbox') && mailPending > 0) {
    lines.push({
      key: 'mailbox', window: 'mailbox', windowName: WINDOW_NAME.mailbox, count: mailPending,
      text: `우편 ${mailPending}통`,
      tip: ['읽지 않은 우편이 있어요.', '우편함에서 확인해 주세요.'],
    });
  }
  return { lines, total: lines.reduce((sum, line) => sum + line.count, 0) };
}
