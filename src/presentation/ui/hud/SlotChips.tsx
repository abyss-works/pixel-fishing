// 슬롯 칩 - 미니맵 위 칩 줄의 도시락 칩과 미끼 칩. 칩 줄의 순서와 자리는 HUD 배치(HudLayout)가 정한다.
// 요리를 쓸 수 없는 동안(해금 전, 게스트)은 두 슬롯 모두 잠금 칩이고 툴팁이 사유를 보인다.
// 쓸 수 있으면 효과가 든 슬롯의 칩만 보이고, 칩은 아이콘과 남은 시간("8:12" 꼴)을 담는다. 효과가 없는 슬롯의 칩은 숨긴다.
// 남은 시간은 게임 시계와 같은 주기로 갱신한다. 칩 자신만 포인터 이벤트를 받아 툴팁을 연다(HudChip).
import type { GameState } from '../../../game/rules/logic';
import { useNow } from '../../../features/gameplay/service/useGameTime';
import { SLOT_NAME, selectSlotChips } from '../../../features/kitchen/model/slots';
import type { ActiveSlot, SlotChip, SlotKey } from '../../../features/kitchen/model/slots';
import Locked from '../Locked';
import PixelIcon from '../PixelIcon';
import type { GlyphId } from '../PixelIcon';
import RecipeEffectTip from '../RecipeEffectTip';
import Tip from '../Tip';
import HudChip from './HudChip';

const SLOT_GLYPH: Record<SlotKey, GlyphId> = { lunch: 'lunch', bait: 'bait' };
const SLOT_TONE: Record<SlotKey, string> = { lunch: 'text-gold', bait: 'text-accent' };

function ActiveChip({ slot }: { slot: ActiveSlot }) {
  return (
    <Tip wraps pressOpens className="flex" text={<RecipeEffectTip label={slot.label} effects={slot.effects} note={slot.note} />}>
      <HudChip tabIndex={0} role="group" aria-label={`${SLOT_NAME[slot.key]}, ${slot.label}, 남은 시간 ${slot.clock}`}>
        <PixelIcon glyph={SLOT_GLYPH[slot.key]} size={12} className={SLOT_TONE[slot.key]} />
        <span className="pf-accent leading-none text-text">{slot.clock}</span>
      </HudChip>
    </Tip>
  );
}

function LockedChip({ slotKey, lines }: { slotKey: SlotKey; lines: readonly string[] }) {
  return (
    <Locked lines={lines} label={SLOT_NAME[slotKey]} className="flex">
      <HudChip>
        <PixelIcon glyph={SLOT_GLYPH[slotKey]} size={12} />
      </HudChip>
    </Locked>
  );
}

export default function SlotChips({ game, guest }: { game: GameState; guest: boolean }) {
  const now = useNow();
  const chips: SlotChip[] = selectSlotChips(game, now, guest);
  return (
    <>
      {chips.map(chip => chip.state === 'locked'
        ? <LockedChip key={chip.key} slotKey={chip.key} lines={chip.lines} />
        : <ActiveChip key={chip.key} slot={chip} />)}
    </>
  );
}
