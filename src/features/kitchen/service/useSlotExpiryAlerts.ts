import { useEffect, useRef } from 'react';
import type { GameState } from '../../../game/rules/logic';
import { sendNotice } from '../../display/model/toastPolicy';
import type { NoticeSink } from '../../display/model/toastPolicy';
import { useNow } from '../../gameplay/service/useGameTime';
import { activeSlot, SLOT_ORDER } from '../model/slots';
import type { ActiveSlot, SlotKey } from '../model/slots';

interface PrevSlotState {
  active: ActiveSlot | null;
  endsAt: string | null;
}

/** 도시락·미끼 슬롯 효과가 켜진 상태에서 시간 만료로 꺼지면 1회 알린다 */
export function useSlotExpiryAlerts(game: GameState, notify: NoticeSink): void {
  const now = useNow();
  const prevRef = useRef<Record<SlotKey, PrevSlotState> | null>(null);

  useEffect(() => {
    const current: Record<SlotKey, PrevSlotState> = {
      lunch: { active: activeSlot(game, 'lunch', now), endsAt: game.slots.lunch?.endsAt ?? null },
      bait: { active: activeSlot(game, 'bait', now), endsAt: game.slots.bait?.endsAt ?? null },
    };
    const prev = prevRef.current;
    prevRef.current = current;
    if (!prev) return;

    const nowMs = Date.parse(now);
    for (const key of SLOT_ORDER) {
      const before = prev[key];
      const after = current[key];
      if (!before.active || after.active) continue;
      const expired = before.endsAt !== null && Date.parse(before.endsAt) <= nowMs;
      if (!expired) continue;
      sendNotice(notify, {
        kind: 'kitchen.cookAndBuff',
        text: `${before.active.label} 효과가 끝났어요.`,
        toastText: `${before.active.label} 효과 종료`,
        tone: 'neutral',
      });
    }
  }, [game, now, notify]);
}
