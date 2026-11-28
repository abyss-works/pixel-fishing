import type { GameState } from '../../../game/rules/logic';
import { claimableCount } from '../../achievement/model/achievements';
import { useBounty } from '../../bounty/service/useBounty';
import { useMailbox } from '../../mailbox/service/useMailbox';
import { selectRewardsDue } from '../model/rewardsDue';
import type { RewardsDue } from '../model/rewardsDue';
import type { AccountLockState } from '../model/menuLock';

// 받을 보상 모음 - 받을 보상 카드와 메뉴 표식이 같은 값을 읽는다.
export function useRewardsDue(game: GameState, accountState: AccountLockState): RewardsDue {
  const { snap } = useBounty();
  const { pending } = useMailbox();
  return selectRewardsDue({ snapshot: snap, claimable: claimableCount(game), mailPending: pending, accountState });
}
