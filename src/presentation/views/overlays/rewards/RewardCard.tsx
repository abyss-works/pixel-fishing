// 받을 보상 카드 - 바다, 항구, 집 어디서나 오른쪽 아래 열에 뜨는 지속 정보. 제목 없이 받을 보상 줄만 보이고, 줄을 누르면 그 줄의 창을 연다.
// 받을 것이 없으면 카드를 두지 않는다. 쌓기 단계와 모바일 레이아웃에서는 줄이 아이콘과 개수만 남아 한 줄로 늘어선다.
import type { GameState } from '../../../../game/rules/logic';
import type { AccountLockState } from '../../../../features/display/model/menuLock';
import type { RewardWindow } from '../../../../features/display/model/rewardsDue';
import { useRewardsDue } from '../../../../features/display/service/useRewardsDue';
import { cx } from '../../../ui/cx';
import HudPanel from '../../../ui/hud/HudPanel';
import { STACK_COMPACT_HIDE_CLASS, STACK_COMPACT_ONLY_CLASS, STACK_COMPACT_ROW_CLASS } from '../../../ui/hud/stackTier';
import PixelIcon from '../../../ui/PixelIcon';
import type { GlyphId } from '../../../ui/PixelIcon';
import Tip from '../../../ui/Tip';

const GLYPH: Record<RewardWindow, GlyphId> = { quests: 'book', achievements: 'star', mailbox: 'letter' };

export default function RewardCard({ game, accountState, onOpen }: {
  game: GameState;
  accountState: AccountLockState;
  onOpen: (window: RewardWindow) => void;
}) {
  const { lines, total } = useRewardsDue(game, accountState);
  if (lines.length === 0) return null;
  return (
    <div role="group" aria-label={`받을 보상 ${total}건`} className={cx('flex w-full flex-col gap-1', STACK_COMPACT_ROW_CLASS)}>
      {lines.map(line => (
        <Tip key={line.key} wraps className="flex min-w-0 flex-1" text={line.tip.join('\n')}>
          <HudPanel as="button" tone="gold" aria-label={`${line.text}, ${line.windowName} 열기`} onClick={() => onOpen(line.window)}
                    className="flex h-7 w-full min-w-0 items-center gap-1.5 px-2 text-left text-xs text-text cursor-pointer hover:border-gold">
            <PixelIcon glyph={GLYPH[line.window]} size={12} className="shrink-0 text-gold" />
            <span className={cx('truncate', STACK_COMPACT_HIDE_CLASS)}>{line.text}</span>
            <span className={cx('pf-accent', STACK_COMPACT_ONLY_CLASS)} aria-hidden="true">{line.count}</span>
          </HudPanel>
        </Tip>
      ))}
    </div>
  );
}
