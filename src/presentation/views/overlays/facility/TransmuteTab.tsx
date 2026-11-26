import { useState } from 'react';
import type { RarityId } from '../../../../game/content/rarity';
import { REJECT_TEXT } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import { sendNotice } from '../../../../features/display/model/toastPolicy';
import {
  TRANSMUTE_NOTICE,
  TRANSMUTE_PICKS,
  selectTransmuteView,
  transmuteNoticeText,
} from '../../../../features/kitchen/model/transmute';
import type { TransmutePick } from '../../../../features/kitchen/model/transmute';
import { cx } from '../../../ui/cx';
import { RarityText } from '../../../ui/fish/RarityTag';
import Inset from '../../../ui/Inset';
import ItemSprite from '../../../ui/ItemSprite';
import Note from '../../../ui/Note';
import PixelIcon from '../../../ui/PixelIcon';
import { SCROLL_Y } from '../../../ui/scrollArea';
import ToggleChip from '../../../ui/ToggleChip';
import type { Notify } from '../../../ui/hud/messageFeed';
import { ConfirmButton } from './facilityParts';
import type { FacilityAct } from './facilityParts';

// 기운 변환 탭 — 하위 등급 기운 10개를 한 단계 위 등급 기운 1개로 바꾸는 3종 정방향 10:1 카드와 안내 상자를 둔다.
export default function TransmuteTab({ game, busy, act, setToast }: {
  game: GameState;
  busy: boolean;
  act: FacilityAct;
  setToast?: Notify;
}) {
  const [picks, setPicks] = useState<Partial<Record<RarityId, TransmutePick>>>({});
  const view = selectTransmuteView(game, picks);

  return (
    <div className={cx(SCROLL_Y, 'flex-1 min-h-0 flex flex-col justify-between gap-3')}>
      <div className="grid grid-cols-3 mobile:grid-cols-1 gap-3">
        {view.cards.map(card => {
          const reason = card.check.ok ? null : REJECT_TEXT[card.check.reason];
          return (
            <Inset key={card.from} as="section" aria-label={`${card.fromLabel} 변환`} className="p-3 flex flex-col gap-2.5 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <ItemSprite kind="energy" id={card.fromId} preset="list" className="size-6 shrink-0" />
                  <span className="text-xs font-bold"><RarityText rarity={card.from} /></span>
                  <PixelIcon glyph="caretRight" size={11} className="text-text-dim shrink-0" />
                  <ItemSprite kind="energy" id={card.toId} preset="list" className="size-6 shrink-0" />
                  <span className="text-xs font-bold"><RarityText rarity={card.to} /></span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 text-2xs text-text-dim">
                <span>보유 <span className="pf-accent text-text">{card.fromHaveText}</span></span>
                <span>상위 <span className="pf-accent text-text">{card.toHaveText}</span></span>
              </div>

              <Inset tone="deep" className="px-2.5 py-2 flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-text-dim"><RarityText rarity={card.from} /></span>
                  <span className="flex items-center gap-1 pf-accent">
                    <span className="text-text-dim">{card.fromHaveText}</span>
                    <PixelIcon glyph="caretRight" size={10} className="text-text-dim" />
                    <span className={card.short ? 'text-danger' : 'text-text'}>{card.fromAfterText}</span>
                    <span className="text-2xs text-text-dim">(−{card.spendText})</span>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-text-dim"><RarityText rarity={card.to} /></span>
                  <span className="flex items-center gap-1 pf-accent">
                    <span className="text-text-dim">{card.toHaveText}</span>
                    <PixelIcon glyph="caretRight" size={10} className="text-text-dim" />
                    <span className={card.capBlocked ? 'text-danger' : 'text-accent'}>{card.toAfterText}</span>
                    <span className="text-2xs text-accent">(+{card.gainText})</span>
                  </span>
                </div>
              </Inset>

              <div role="group" aria-label={`${card.fromLabel} 배수`} className="flex items-center gap-1">
                {TRANSMUTE_PICKS.map(opt => {
                  const active = card.pick === opt.key;
                  return (
                    <ToggleChip
                      key={opt.key}
                      size="sm"
                      pressed={active}
                      emphasis={active}
                      className="flex-1 justify-center"
                      onClick={() => setPicks(prev => ({ ...prev, [card.from]: opt.key }))}
                    >
                      {opt.label}
                    </ToggleChip>
                  );
                })}
              </div>

              <ConfirmButton
                reason={reason}
                disabled={!card.canExecute || busy}
                onClick={() => act({ type: 'transmuteEnergy', from: card.from, count: card.count }, r => {
                  if (!setToast) return;
                  const spent = r.result.type === 'transmuteEnergy' ? r.result.spent : card.spend;
                  const gained = r.result.type === 'transmuteEnergy' ? r.result.gained : card.gain;
                  const text = transmuteNoticeText(card, spent, gained);
                  sendNotice(setToast, {
                    kind: 'kitchen.cookAndBuff',
                    text,
                    toastText: `${card.toLabel} 변환 완료`,
                  });
                })}
              >
                변환
              </ConfirmButton>
            </Inset>
          );
        })}
      </div>

      <Inset tone="deep" className="px-3 py-2 shrink-0">
        <Note size="xs" className="my-0">{TRANSMUTE_NOTICE}</Note>
      </Inset>
    </div>
  );
}
