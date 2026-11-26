// 보너스 통합 칩 - 미니맵 위 칩 줄에서 적용 중인 도시락·미끼·비약·오늘의 운세를 한 칩으로 모은다.
// 칩 줄의 순서와 자리는 HUD 배치(HudLayout)가 정한다.
// 요리가 열리기 전이고 활성 효과도 없으면 잠금 칩 하나, 열린 뒤나 활성 효과가 하나라도 있으면 누를 수 있는 통합 칩(효과 N / 흐린 효과 0)을 둔다.
// 호버 시에는 4행 2열 최소 표만 보이고(hoverOnly로 모바일 터치 이중 열림 방지), 누르면 적용 중인 효과 창을 연다.
import type { GameState } from '../../../game/rules/logic';
import type { AccountLockState } from '../../../features/display/model/menuLock';
import { useNow } from '../../../features/gameplay/service/useGameTime';
import { selectBonusChip, selectBonusTipRows } from '../../../features/kitchen/model/slots';
import Locked, { LockIcon } from '../Locked';
import Tip, { TipList } from '../Tip';
import HudChip from './HudChip';

const CHIP_TITLE = '활성 효과';
const CHIP_SUBTITLE = '도시락, 미끼, 비약, 운세 현황';

export default function SlotChips({
  game,
  accountState,
  onOpenEffects,
}: {
  game: GameState;
  accountState: AccountLockState;
  onOpenEffects?: () => void;
}) {
  const now = useNow(1_000);
  const chip = selectBonusChip(game, now, accountState);

  if (chip.state === 'locked') {
    return (
      <Locked lines={chip.lines} title={CHIP_TITLE} description={CHIP_SUBTITLE} label={CHIP_TITLE} badge={false} className="flex">
        <HudChip className="text-text-dim">
          <LockIcon size={11} className="text-text-dim" />
          <span className="leading-none">효과</span>
        </HudChip>
      </Locked>
    );
  }

  const tipRows = selectBonusTipRows(game, now);
  const openEffects = onOpenEffects ?? (() => {});

  if (chip.state === 'empty') {
    return (
      <Tip wraps hoverOnly className="flex" text={<TipList rows={tipRows} />}>
        <HudChip onClick={openEffects} aria-label="활성 효과 없음" className="text-text-dim">
          <span className="inline-block size-1.5 bg-text-dim" aria-hidden="true" />
          <span className="leading-none">효과</span>
          <span className="pf-accent leading-none">0</span>
        </HudChip>
      </Tip>
    );
  }

  return (
    <Tip wraps hoverOnly className="flex" text={<TipList rows={tipRows} />}>
      <HudChip onClick={openEffects} aria-label={`활성 효과 ${chip.count}개`} className="border-accent text-accent">
        <span className="inline-block size-1.5 bg-accent" aria-hidden="true" />
        <span className="leading-none">효과</span>
        <span className="pf-accent leading-none">{chip.count}</span>
      </HudChip>
    </Tip>
  );
}
