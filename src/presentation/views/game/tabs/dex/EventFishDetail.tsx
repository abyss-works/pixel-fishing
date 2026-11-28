import { useState } from 'react';
import type { EventFish } from '../../../../../game/content/eventFish';
import type { FormId } from '../../../../../game/content/fish';
import {
  selectEventFishDetail,
  type EventDexSnapshot,
} from '../../../../../features/dex/model/eventCatalog';
import ArrowButton from '../../../../ui/ArrowButton';
import Inset from '../../../../ui/Inset';
import KeyValueRow from '../../../../ui/KeyValueRow';
import LoreParagraph from '../../../../ui/LoreParagraph';
import Modal from '../../../../ui/Modal';
import PageTitle from '../../../../ui/PageTitle';
import TitledCell from '../../../../ui/TitledCell';
import FishSprite from '../../../../ui/fish/FishSprite';
import { RarityText } from '../../../../ui/fish/RarityTag';
import { fmtFishCount, fmtKoreanDate } from '../../../../ui/format';
import { SCROLL_Y_ROWS } from '../../../../ui/scrollArea';

/** 이벤트 어종 상세 창 — 좌측 표본(일반/돌연변이 전환)과 우측 기록·등장한 이벤트를 보여준다 */
export default function EventFishDetail({
  fish,
  eventDex,
  initialForm = 'normal',
  onClose,
}: {
  fish: EventFish;
  eventDex: EventDexSnapshot | undefined;
  initialForm?: FormId;
  onClose: () => void;
}) {
  const detail = selectEventFishDetail(eventDex, fish);
  const [i, setI] = useState(initialForm === 'variant' ? 1 : 0);
  const current = detail.forms[i];
  const known = current.count > 0;

  return (
    <Modal
      layer="app"
      xl
      onClose={onClose}
      header={
        <header className="mb-3 flex items-baseline gap-3 border-b border-line pb-2 pr-8">
          <PageTitle>{known ? current.name : '???'}</PageTitle>
          <span className="text-sm"><RarityText rarity={fish.rarity} /></span>
          <span className="pf-accent ml-auto text-2xs text-text-dim">
            {current.form === 'variant' ? '돌연변이' : '일반'} {i + 1}/{detail.forms.length}
          </span>
        </header>
      }
    >
      <div className="grid grid-cols-2 gap-x-5 gap-y-4 mobile:grid-cols-1">
        <TitledCell title="표본">
          <Inset
            tone="light"
            className="flex flex-1 flex-col bg-[linear-gradient(180deg,var(--c-surface-2),color-mix(in_oklab,var(--c-bg)_40%,var(--c-surface))_85%)]"
          >
            <div className="flex items-center justify-between gap-2 px-2 pt-3">
              <ArrowButton
                dir={-1}
                tone="solid"
                aria-label="이전 형태"
                onClick={() => setI((i - 1 + detail.forms.length) % detail.forms.length)}
              />
              <FishSprite
                fish={detail.sprite}
                preset="portrait"
                form={current.form}
                discovered={known}
                animate={known}
                ariaLabel={known ? current.name : (current.form === 'variant' ? '미확인 변종' : '미확인 어종')}
                className="block min-w-0 shrink h-auto [image-rendering:pixelated]"
              />
              <ArrowButton
                dir={1}
                tone="solid"
                aria-label="다음 형태"
                onClick={() => setI((i + 1) % detail.forms.length)}
              />
            </div>
            {known ? (
              <LoreParagraph className="mt-auto min-h-[6.5rem] px-3 pb-3 pt-2 text-sm leading-[1.8] text-text-dim">
                {current.lore}
              </LoreParagraph>
            ) : (
              <p className="mt-auto min-h-[6.5rem] px-3 pb-3 pt-2 text-sm leading-[1.8] text-text-dim">
                아직 만나지 못한 개체예요.
              </p>
            )}
          </Inset>
        </TitledCell>

        <div className="flex flex-col gap-4">
          <TitledCell title="기록">
            <Inset divided>
              <KeyValueRow
                label="잡은 수"
                value={<span className="pf-accent">{known ? fmtFishCount(current.count) : '???'}</span>}
              />
            </Inset>
          </TitledCell>

          <TitledCell title="등장한 이벤트" className="flex-1">
            <Inset divided className={`flex-1 ${SCROLL_Y_ROWS} max-h-[min(220px,40dvh)]`}>
              {detail.appearances.length > 0 ? (
                detail.appearances.map(item => (
                  <div key={item.eventId} className="px-3 py-2 flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-text">{item.title}</span>
                    <span className="text-2xs text-text-dim">
                      {fmtKoreanDate(item.startsAt)} ~ {fmtKoreanDate(item.endsAt)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="px-3 py-4 text-xs text-text-dim text-center">
                  아직 등장한 이벤트 기록이 없어요.
                </div>
              )}
            </Inset>
          </TitledCell>
        </div>
      </div>
    </Modal>
  );
}
