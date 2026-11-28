// 적용 중인 효과 카드 - 오른쪽 아래 열에서 흔적 카드 아래, 미니맵 위에 놓이는 지속 정보.
// 도시락, 미끼, 비약, 오늘의 운세 순서로 아이콘을 두고, 도시락과 미끼는 남은 시간 막대를 함께 보인다(비약과 운세는 켜져 있는지만).
// 요리가 열리기 전이고 활성 효과도 없으면 흐린 잠금 카드, 열린 뒤 활성 효과가 없으면 흐린 카드를 둔다.
// 카드를 누르면 적용 중인 효과 창을 연다. 호버 요약은 두지 않는다. 쌓기 단계와 모바일 레이아웃에서는 아이콘과 막대만 한 줄로 늘어선다.
// 막대 비율과 표시 조건은 기능 모델(selectEffectCard)이 정하고 이 컴포넌트는 그 결과만 그린다.
import type { GameState } from '../../../game/rules/logic';
import type { AccountLockState } from '../../../features/display/model/menuLock';
import { useNow } from '../../../features/gameplay/service/useGameTime';
import { selectEffectCard, slotPollIntervalMs } from '../../../features/kitchen/model/slots';
import type { EffectCardKind } from '../../../features/kitchen/model/slots';
import { cx } from '../cx';
import Locked, { LockIcon } from '../Locked';
import PixelIcon from '../PixelIcon';
import type { GlyphId } from '../PixelIcon';
import ProgressMeter from '../ProgressMeter';
import HudPanel from './HudPanel';
import { STACK_COMPACT_ROW_CLASS } from './stackTier';

const CARD_TITLE = '활성 효과';
const CARD_SUBTITLE = '도시락, 미끼, 비약, 운세 현황';
const CARD = 'pointer-events-auto flex w-full gap-1.5 px-2 py-1.5 text-xs';

const GLYPH: Record<EffectCardKind, GlyphId> = { lunch: 'lunch', bait: 'bait', potion: 'sparkle', fortune: 'clover' };

export default function EffectCard({ game, accountState, onOpenEffects }: {
  game: GameState;
  accountState: AccountLockState;
  onOpenEffects?: () => void;
}) {
  const now = useNow(current => slotPollIntervalMs(game, current));
  const card = selectEffectCard(game, now, accountState);

  if (card.state === 'locked') {
    return (
      <Locked lines={card.lines} title={CARD_TITLE} description={CARD_SUBTITLE} label={CARD_TITLE} badge={false} className="flex w-full">
        <HudPanel className={cx(CARD, 'h-7 items-center text-text-dim')}>
          <LockIcon size={12} className="text-text-dim" />
        </HudPanel>
      </Locked>
    );
  }

  if (card.state === 'empty') {
    return (
      <HudPanel as="button" aria-label="활성 효과 없음" onClick={onOpenEffects}
                className={cx(CARD, 'h-7 items-center cursor-pointer text-text-dim hover:border-accent')}>
        <span className="inline-block size-1.5 bg-text-dim" aria-hidden="true" />
      </HudPanel>
    );
  }

  return (
    <HudPanel as="button" aria-label={`활성 효과 ${card.items.length}개`} onClick={onOpenEffects}
              className={cx(CARD, 'flex-col items-stretch cursor-pointer text-accent hover:border-accent', STACK_COMPACT_ROW_CLASS)}>
      {card.items.map(item => (
        <span key={item.id} data-effect-kind={item.kind} className={cx('flex min-w-0 items-center gap-1.5', item.ratio !== null && 'flex-1')}>
          <PixelIcon glyph={GLYPH[item.kind]} size={12} className="shrink-0" />
          {item.ratio !== null && (
            <ProgressMeter current={item.ratio} target={1} ratio={item.ratio} ariaLabel={item.name} heightClass="h-1.5" />
          )}
        </span>
      ))}
    </HudPanel>
  );
}
