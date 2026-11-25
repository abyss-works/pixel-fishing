// 보너스 통합 칩 - 미니맵 위 칩 줄에서 적용 중인 도시락·미끼·비약·오늘의 운세를 한 칩으로 모은다.
// 칩 줄의 순서와 자리는 HUD 배치(HudLayout)가 정한다.
// 요리가 열리기 전이고 활성 효과도 없으면 잠금 칩 하나, 열린 뒤나 활성 효과가 하나라도 있으면 보너스 통합 칩(효과 N / 흐린 효과 0)을 둔다.
// 남은 시간은 게임 시계와 같은 주기로 갱신한다. 칩 자신만 포인터 이벤트를 받아 툴팁을 연다(HudChip).
import type { GameState } from '../../../game/rules/logic';
import type { AccountLockState } from '../../../features/display/model/menuLock';
import { useNow } from '../../../features/gameplay/service/useGameTime';
import { selectBonusChip } from '../../../features/kitchen/model/slots';
import Badge from '../Badge';
import { GradeName, HighlightRarityText } from '../fish/RarityTag';
import Locked, { LockIcon } from '../Locked';
import Tip, { TipCard } from '../Tip';
import HudChip from './HudChip';

const CHIP_TITLE = '활성 효과';
const CHIP_SUBTITLE = '도시락, 미끼, 비약, 운세 현황';

export default function SlotChips({ game, accountState }: { game: GameState; accountState: AccountLockState }) {
  const now = useNow();
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

  if (chip.state === 'empty') {
    return (
      <Tip wraps pressOpens className="flex" text={(
        <TipCard
          title={CHIP_TITLE}
          badge={<Badge tone="dim" size="2xs">없음</Badge>}
          subtitle={CHIP_SUBTITLE}
          description="적용 중인 요리나 비약, 운세가 없어요."
        />
      )}>
        <HudChip tabIndex={0} role="group" aria-label="활성 효과 없음" className="text-text-dim">
          <span className="inline-block size-1.5 bg-text-dim" aria-hidden="true" />
          <span className="leading-none">효과</span>
          <span className="pf-accent leading-none">0</span>
        </HudChip>
      </Tip>
    );
  }

  return (
    <Tip wraps pressOpens className="flex" text={(
      <TipCard
        title={CHIP_TITLE}
        badge={<Badge tone="gold" size="2xs">{`${chip.count}개 적용 중`}</Badge>}
        subtitle={CHIP_SUBTITLE}
        rows={chip.items.map(item => ({
          label: (
            <span key={item.id} className="flex flex-col">
              <span className="flex items-center gap-1.5 text-text">
                <GradeName name={item.title.name} grade={item.title.grade} />
                <Badge tone="dim-plain" size="2xs">{item.kindLabel}</Badge>
              </span>
              <span className="text-2xs text-text-dim leading-snug">
                <HighlightRarityText text={item.summary} />
              </span>
            </span>
          ),
          value: item.durationText,
        }))}
      />
    )}>
      <HudChip tabIndex={0} role="group" aria-label={`활성 효과 ${chip.count}개`} className="border-accent text-accent">
        <span className="inline-block size-1.5 bg-accent" aria-hidden="true" />
        <span className="leading-none">효과</span>
        <span className="pf-accent leading-none">{chip.count}</span>
      </HudChip>
    </Tip>
  );
}
