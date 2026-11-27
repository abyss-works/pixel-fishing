import { useState } from 'react';
import type { AccountLockState } from '../../../../features/display/model/menuLock';
import {
  EVENTS_GATE_COPY,
  selectEventChampionshipView,
  selectEventDrawView,
  selectEventList,
  selectEventTrioView,
} from '../../../../features/events/model/events';
import { useEvents } from '../../../../features/events/service/useEvents';
import type { GameState } from '../../../../game/rules/logic';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import EmptyState from '../../../ui/EmptyState';
import Frame from '../../../ui/Frame';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import PixelIcon from '../../../ui/PixelIcon';
import Skeleton from '../../../ui/Skeleton';
import { SCROLL_Y } from '../../../ui/scrollArea';
import EventLuckDetail from './EventLuckDetail';
import EventTourneyDetail from './EventTourneyDetail';
import EventTrioDetail from './EventTrioDetail';

/** 이벤트 창 — 1단계 진행 이벤트 목록과 2단계 이벤트별 상세 화면을 제공한다 */
export default function EventsModal({
  accountState,
  game,
  nickname = null,
  busy = false,
  onEnterEventZone,
  onLeaveEventZone,
  onSettleEventReward,
  onConnectGoogle,
  onClose,
}: {
  accountState: AccountLockState;
  game: Pick<GameState, 'boat' | 'hats' | 'location'>;
  nickname?: string | null;
  busy?: boolean;
  onEnterEventZone: (eventId: string) => void;
  onLeaveEventZone: () => void;
  onSettleEventReward: (eventId: string) => void;
  onConnectGoogle?: () => void;
  onClose: () => void;
}) {
  const { snap, loaded, failed, offline, refresh } = useEvents({ enabled: accountState === 'account' });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedEvent = snap?.events.find(e => e.id === selectedId) ?? null;

  const renderBody = () => {
    if (accountState === 'guest') {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 text-center">
          <Inset tone="deep" className="size-12 flex items-center justify-center">
            <PixelIcon glyph="trophy" size={24} className="text-gold" />
          </Inset>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-bold text-text">{EVENTS_GATE_COPY.guestTitle}</span>
            <span className="text-xs text-text-dim">{EVENTS_GATE_COPY.guestDesc}</span>
          </div>
          {onConnectGoogle && (
            <Button variant="primary" onClick={onConnectGoogle}>
              {EVENTS_GATE_COPY.guestAction}
            </Button>
          )}
        </div>
      );
    }

    if (accountState === 'unverified') {
      return (
        <EmptyState
          glyph="lock"
          message={EVENTS_GATE_COPY.unverifiedDesc}
        />
      );
    }

    if (!loaded) {
      return (
        <div className="flex flex-col gap-2 py-2">
          <Skeleton className="h-[78px] w-full" />
          <Skeleton className="h-[78px] w-full" />
          <Skeleton className="h-[78px] w-full" />
        </div>
      );
    }

    if (failed) {
      return (
        <EmptyState
          glyph="warn"
          iconTone="danger"
          message="이벤트를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요."
          action={<Button size="sm" onClick={refresh}>다시 불러오기</Button>}
        />
      );
    }

    if (offline || !snap || snap.events.length === 0) {
      return (
        <EmptyState
          glyph="trophy"
          message="열린 이벤트가 없어요."
        />
      );
    }

    if (selectedEvent) {
      if (selectedEvent.kind === 'trio') {
        return (
          <EventTrioDetail
            view={selectEventTrioView(selectedEvent, snap.trio, snap.now)}
            onBack={() => setSelectedId(null)}
          />
        );
      }
      if (selectedEvent.kind === 'championship') {
        return (
          <EventTourneyDetail
            view={selectEventChampionshipView(selectedEvent, snap.championship, game, snap.now, nickname)}
            busy={busy}
            onEnterZone={() => onEnterEventZone(selectedEvent.id)}
            onLeaveZone={onLeaveEventZone}
            onSettle={() => onSettleEventReward(selectedEvent.id)}
            onBack={() => setSelectedId(null)}
          />
        );
      }
      return (
        <EventLuckDetail
          view={selectEventDrawView(selectedEvent, snap.draw, snap.now, nickname)}
          onBack={() => setSelectedId(null)}
        />
      );
    }

    const items = selectEventList(snap, accountState);
    return (
      <div className={`flex-1 min-h-0 flex flex-col gap-2 pr-1 ${SCROLL_Y}`} aria-label="진행 중인 이벤트 목록">
        {items.map(item => (
          <Frame
            key={item.id}
            as="button"
            type="button"
            onClick={() => setSelectedId(item.id)}
            className="w-full p-3 mobile:p-2.5 flex items-center gap-3 text-left cursor-pointer hover:border-gold min-h-[78px] mobile:min-h-[70px]"
          >
            <Inset
              tone="light"
              border="line"
              className="relative size-[46px] mobile:size-[40px] shrink-0 flex items-center justify-center"
            >
              <PixelIcon glyph={item.glyph} size={22} className="text-gold" />
              {item.hasAlert && (
                <span className="absolute right-1 top-1 size-[7px] bg-danger" aria-hidden="true" data-alert="true" />
              )}
            </Inset>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <span className="text-sm font-bold text-text truncate">{item.title}</span>
              <span className="text-xs text-text-dim truncate">{item.summary}</span>
              <div className="flex flex-wrap items-center gap-1">
                {item.badges.map(b => (
                  <Badge key={b.label} tone={b.tone} size="2xs" inline>
                    {b.label}
                  </Badge>
                ))}
              </div>
            </div>
            <span className="ml-auto shrink-0 inline-flex items-center gap-1 text-xs font-bold text-gold whitespace-nowrap">
              {item.remainingText}
              <PixelIcon glyph="caretRight" size={12} className="text-text-dim" />
            </span>
          </Frame>
        ))}
      </div>
    );
  };

  return (
    <Modal layer="stage" md height={560} mobileFixed onClose={onClose}>
      <ModalCard title="이벤트" onClose={onClose} fixed>
        {renderBody()}
      </ModalCard>
    </Modal>
  );
}
