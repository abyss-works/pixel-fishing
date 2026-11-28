import { useMemo, useState } from 'react';
import type { EventFish } from '../../../../../game/content/eventFish';
import type { FormId } from '../../../../../game/content/fish';
import { selectEventDex } from '../../../../../features/dex/model/eventCatalog';
import { useEvents } from '../../../../../features/events/service/useEvents';
import { cx } from '../../../../ui/cx';
import Frame from '../../../../ui/Frame';
import PageTitle from '../../../../ui/PageTitle';
import PixelIcon from '../../../../ui/PixelIcon';
import ToggleChip from '../../../../ui/ToggleChip';
import FishSprite from '../../../../ui/fish/FishSprite';
import { DIM_CARD, RARITY_CARD, RarityDot } from '../../../../ui/fish/RarityTag';
import { fmtFishCount } from '../../../../ui/format';
import EventFishDetail from './EventFishDetail';

/** 도감 이벤트 어종 화면 — 전 회차 이벤트 어종 누적 도감과 폼 전환 토글을 제공한다 */
export default function VDexEvent({
  form,
  onToggleForm,
}: {
  form: FormId;
  onToggleForm: () => void;
}) {
  const { snap } = useEvents();
  const eventDex = snap?.eventDex;
  const data = useMemo(() => selectEventDex(eventDex, form), [eventDex, form]);
  const [detail, setDetail] = useState<EventFish | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <PageTitle>
          이벤트 어종
          {' '}
          <span className={form === 'variant' ? 'text-mutation' : undefined}>
            ({data.foundCount}/{data.totalCount})
          </span>
        </PageTitle>
        <ToggleChip
          size="sm"
          pressed={form === 'variant'}
          emphasis={form === 'variant'}
          onClick={onToggleForm}
        >
          <PixelIcon glyph="sparkle" size={10} />
          돌연변이
        </ToggleChip>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {data.entries.map(entry => {
          const ok = entry.discovered;
          const body = (
            <>
              <FishSprite
                fish={entry.sprite}
                preset="icon"
                form={form}
                discovered={ok}
                ariaLabel={ok ? entry.name : '미확인 어종'}
                className="block mx-auto mb-1"
              />
              {ok ? (
                <>
                  <b>{entry.name}</b><br />
                  <span className="text-text-dim text-xs">{fmtFishCount(entry.count)}</span>
                </>
              ) : (
                <>
                  <b>???</b><br />
                  <span className="text-text-dim text-xs"><RarityDot rarity={entry.fish.rarity} />미확인</span>
                </>
              )}
            </>
          );
          return ok ? (
            <Frame
              as="button"
              type="button"
              key={entry.fish.id}
              data-rarity={entry.fish.rarity}
              className={cx(RARITY_CARD, 'p-2 text-sm text-center cursor-pointer')}
              onClick={() => setDetail(entry.fish)}
            >
              {body}
            </Frame>
          ) : (
            <div
              key={entry.fish.id}
              data-rarity={entry.fish.rarity}
              className={cx(RARITY_CARD, 'p-2 text-sm', DIM_CARD)}
            >
              {body}
            </div>
          );
        })}
      </div>

      {detail && (
        <EventFishDetail
          key={`${detail.id}-${form}`}
          fish={detail}
          eventDex={eventDex}
          initialForm={form}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
