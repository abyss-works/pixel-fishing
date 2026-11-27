import { useState } from 'react';
import type { EventTrioView } from '../../../../features/events/model/events';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import Inset from '../../../ui/Inset';
import Note from '../../../ui/Note';
import PixelIcon from '../../../ui/PixelIcon';
import FishSprite from '../../../ui/fish/FishSprite';
import { RarityText } from '../../../ui/fish/RarityTag';
import { SCROLL_Y } from '../../../ui/scrollArea';
import { EventBarcode, EventDepthHeader } from './eventParts';

/** 이벤트 1(삼총사를 낚아라) 상세 화면 — 수배 어종 3칸과 자동 응모 또는 당첨 교환권 번호 안내 */
export default function EventTrioDetail({
  view,
  onBack,
}: {
  view: EventTrioView;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!view.rewardPin) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(view.rewardPin).then(() => setCopied(true), () => {});
    } else {
      setCopied(true);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 flex-1 min-h-0">
      <EventDepthHeader
        title={view.title}
        summary={view.summary}
        remainingText={view.remainingText}
        badge={<Badge tone={view.statusTone}>{view.statusLabel}</Badge>}
        onBack={onBack}
      />
      <div className={`flex-1 min-h-0 flex flex-col gap-3 pr-1 ${SCROLL_Y}`}>
        <div className="grid grid-cols-3 gap-2 mobile:grid-cols-1" aria-label="목표 어종 목록">
          {view.slots.map(slot => (
            <Inset
              key={`${slot.fishId}-${slot.form}`}
              tone={slot.completed ? 'light' : 'deep'}
              border={slot.rarity === 'legendary' ? 'legend' : slot.rarity}
              className="p-2.5 flex flex-col items-center gap-1.5 text-center"
            >
              <div className="w-full flex items-center justify-between gap-1 text-2xs">
                <RarityText rarity={slot.rarity} />
                <Badge tone={slot.completed ? 'gold' : 'dim'} size="2xs">
                  {slot.completed ? '완료' : '미달성'}
                </Badge>
              </div>
              {slot.fish && (
                <FishSprite
                  fish={slot.fish}
                  preset="icon"
                  form={slot.form}
                  discovered
                  ariaLabel={slot.name}
                  className="my-0.5"
                />
              )}
              <span className="text-sm font-bold text-text">{slot.name}</span>
              <span className="text-2xs text-text-dim">{slot.formLabel}</span>
              {slot.habitatLabel && (
                <span className="text-2xs text-accent leading-tight break-keep">
                  {slot.habitatLabel}
                </span>
              )}
            </Inset>
          ))}
        </div>

        {view.won ? (
          <Inset tone="light" border="gold" className="p-3 flex flex-col items-center gap-2.5 text-center">
            <div className="inline-flex items-center gap-1.5 text-base font-bold text-gold">
              <PixelIcon glyph="trophy" size={16} />
              <span>당첨을 축하해요</span>
            </div>
            <Inset tone="deep" className="w-full px-3 py-2 flex items-center justify-center gap-2 flex-wrap">
              <span className="pf-accent text-base text-gold tracking-wider select-all">
                {view.rewardPin ?? ''}
              </span>
              <Button size="sm" onClick={handleCopy}>
                {copied ? '복사됨' : '번호 복사'}
              </Button>
            </Inset>
            {view.rewardPin && <EventBarcode code={view.rewardPin} />}
            {view.expiryText && (
              <span className="text-xs text-text-dim">유효기간 {view.expiryText}</span>
            )}
            <Note tone="warn" size="xs" className="my-0">
              교환권 번호가 유출되지 않도록 다른 사람에게 공유하지 마세요.
            </Note>
          </Inset>
        ) : (
          <Inset tone="deep" className="p-3 flex flex-col gap-1.5 text-xs text-text-dim">
            <p className="m-0 text-text font-bold">
              {view.completed
                ? '세 어종을 모두 낚아 자동 응모가 완료됐어요.'
                : '목표 어종 3마리를 모두 낚으면 추첨에 자동 응모돼요.'}
            </p>
            <p className="m-0">
              이벤트 기간 안에 정해진 형태로 새로 낚아야 달성할 수 있어요.
            </p>
            <p className="m-0">
              당첨되면 게임 내 우편함과 이 화면에서 교환권 번호를 바로 확인할 수 있어요.
            </p>
          </Inset>
        )}
      </div>
    </div>
  );
}
