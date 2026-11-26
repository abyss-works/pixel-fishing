import { useState } from 'react';
import {
  EVENT2_STANDARD_SPEC_VIEW,
  EVENT2_UPGRADE_TIP,
  EVENT_SCORE_TIERS,
} from '../../../../features/events/model/events';
import type { EventChampionshipView, EventDexEntryView } from '../../../../features/events/model/events';
import type { FormId } from '../../../../game/content/fish';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import Frame from '../../../ui/Frame';
import Inset from '../../../ui/Inset';
import Note from '../../../ui/Note';
import PersonSprite from '../../../ui/PersonSprite';
import PixelIcon from '../../../ui/PixelIcon';
import SubTabs from '../../../ui/SubTabs';
import TabBar from '../../../ui/TabBar';
import ToggleChip from '../../../ui/ToggleChip';
import FishSprite from '../../../ui/fish/FishSprite';
import { DIM_CARD, RARITY_CARD, RarityDot, RarityText } from '../../../ui/fish/RarityTag';
import { fmtGold, fmtNum } from '../../../ui/format';
import { SCROLL_Y } from '../../../ui/scrollArea';
import { EventDepthHeader, EventPodium, EventRankRows } from './eventParts';

type TourneyTab = 'rank' | 'settle' | 'dex';

function TourneyRankTab({ view }: { view: EventChampionshipView }) {
  return (
    <div className="flex flex-col gap-2.5">
      <EventPodium podium={view.podium} />
      <EventRankRows rows={view.rows} myRow={view.myRow} />
      <Inset tone="deep" className="p-2.5 flex flex-col gap-1.5 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-text">표준 장비</span>
          <Badge size="2xs">낚싯대 Lv.{EVENT2_STANDARD_SPEC_VIEW.rodLevel}</Badge>
          <Badge size="2xs">파워 {EVENT2_STANDARD_SPEC_VIEW.power}</Badge>
          <Badge size="2xs">입질 {EVENT2_STANDARD_SPEC_VIEW.biteRangeText}</Badge>
          <Badge size="2xs">방치 {EVENT2_STANDARD_SPEC_VIEW.idleBoost}배</Badge>
          <Badge size="2xs" tone="accent">돌연변이 {EVENT2_STANDARD_SPEC_VIEW.variantEv}배</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-text">점수 기준</span>
          {EVENT_SCORE_TIERS.map(t => (
            <span key={t.rarity} className="inline-flex items-center gap-1">
              <RarityText rarity={t.rarity} />
              <span className="pf-accent text-gold">{t.score}</span>
            </span>
          ))}
          <span className="text-mutation font-bold">돌연변이 2배</span>
        </div>
      </Inset>
    </div>
  );
}

function TourneySettleTab({
  view,
  busy,
  onSettle,
}: {
  view: EventChampionshipView;
  busy: boolean;
  onSettle: () => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2">
        <Inset tone="light" border="gold" className="p-3 flex flex-col items-center gap-1">
          <span className="text-xs text-text-dim">미정산 골드</span>
          <span className="pf-accent text-lg font-bold text-gold">{fmtGold(view.pendingGold)}</span>
        </Inset>
        <Inset tone="light" border="accent" className="p-3 flex flex-col items-center gap-1">
          <span className="text-xs text-text-dim">미정산 명성</span>
          <span className="pf-accent text-lg font-bold text-accent">{fmtNum(view.pendingFame)}</span>
        </Inset>
      </div>
      <Button variant="primary" full disabled={busy || !view.canSettle} onClick={onSettle}>
        정산하기
      </Button>
      <Inset tone="base" className="p-3 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-text">{view.boatName}</span>
          <Badge tone="gold" size="2xs">{view.boatTier}단계</Badge>
          <span className="ml-auto text-2xs text-text-dim">10점당 적립</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Inset tone="deep" className="p-2 flex flex-col items-center gap-0.5 text-center">
            <span className="text-2xs text-text-dim">방치</span>
            <span className="pf-accent text-xs font-bold text-gold">{fmtGold(view.idleRate)}</span>
          </Inset>
          <Inset tone="deep" className="p-2 flex flex-col items-center gap-0.5 text-center">
            <span className="text-2xs text-text-dim">수동</span>
            <span className="pf-accent text-xs font-bold text-gold">{fmtGold(view.manualRate)}</span>
          </Inset>
          <Inset tone="deep" className="p-2 flex flex-col items-center gap-0.5 text-center">
            <span className="text-2xs text-text-dim">명성 (고정)</span>
            <span className="pf-accent text-xs font-bold text-accent">{fmtNum(view.fameRate)}</span>
          </Inset>
        </div>
      </Inset>
      <Note size="xs" className="my-0">{EVENT2_UPGRADE_TIP}</Note>
    </div>
  );
}

function TourneyDexTab({ view }: { view: EventChampionshipView }) {
  const [form, setForm] = useState<FormId>('normal');
  const [revealAll, setRevealAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(view.dex[0]?.id ?? '');

  const hats = [view.normalHat, view.variantHat];
  const selectedEntry: EventDexEntryView | null = view.dex.find(d => d.id === selectedId) ?? null;
  const selectedCaught = selectedEntry
    ? (form === 'variant' ? selectedEntry.variantCaught : selectedEntry.normalCaught)
    : false;
  const selectedShown = selectedCaught || revealAll;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2 mobile:grid-cols-1" aria-label="대회 한정 모자 보상">
        {hats.map(hat => (
          <Inset
            key={hat.id}
            tone={hat.owned ? 'light' : 'base'}
            border={hat.owned ? 'gold' : 'line'}
            className="p-2 flex items-center gap-2.5"
          >
            <Inset tone="deep" className="size-10 shrink-0 flex items-center justify-center">
              <PersonSprite
                look={{ shirt: 0, pants: 0, hat: hat.id }}
                scale={3}
                headOnly
                ariaLabel={hat.name}
              />
            </Inset>
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <span className="text-xs font-bold text-text truncate">{hat.name}</span>
              <span className="text-2xs text-text-dim">
                {hat.form === 'normal' ? '일반 도감 완성' : '돌연변이 도감 완성'}
              </span>
            </div>
            <Badge tone={hat.owned ? 'gold' : 'dim'} size="2xs">
              {hat.owned ? '획득' : `${hat.count} / ${hat.total}`}
            </Badge>
          </Inset>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <SubTabs
          items={[
            { key: 'normal' as FormId, label: '일반', sub: `${view.normalHat.count}/${view.normalHat.total}` },
            { key: 'variant' as FormId, label: '돌연변이', sub: `${view.variantHat.count}/${view.variantHat.total}` },
          ]}
          activeKey={form}
          onSelect={setForm}
        />
        <ToggleChip size="sm" pressed={revealAll} emphasis={revealAll} onClick={() => setRevealAll(v => !v)}>
          어종 공개
        </ToggleChip>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {view.dex.map(entry => {
          const caught = form === 'variant' ? entry.variantCaught : entry.normalCaught;
          const shown = caught || revealAll;
          const name = form === 'variant' ? entry.variantName : entry.normalName;
          const score = form === 'variant' ? entry.variantScore : entry.normalScore;
          const count = form === 'variant' ? entry.variantCount : entry.normalCount;
          const picked = selectedId === entry.id;
          return (
            <Frame
              key={entry.id}
              as="button"
              type="button"
              data-rarity={entry.rarity}
              className={cx(
                RARITY_CARD,
                !shown && DIM_CARD,
                picked && 'ring-1 ring-gold',
                'p-2 text-xs text-center cursor-pointer flex flex-col items-center gap-0.5',
              )}
              onClick={() => setSelectedId(entry.id)}
            >
              <FishSprite
                fish={entry.fish}
                preset="icon"
                form={form}
                discovered={shown}
                ariaLabel={shown ? name : '미확인 어종'}
                className="block mx-auto mb-0.5"
              />
              {shown ? (
                <>
                  <b className="text-text truncate max-w-full">{name}</b>
                  <span className="pf-accent text-gold">{score}점</span>
                  <span className="text-2xs text-text-dim">{caught ? `${count}마리` : '미획득'}</span>
                </>
              ) : (
                <>
                  <b>???</b>
                  <span className="text-2xs text-text-dim"><RarityDot rarity={entry.rarity} />미확인</span>
                </>
              )}
            </Frame>
          );
        })}
      </div>

      {selectedEntry && (
        <Inset tone="light" border={selectedEntry.rarity === 'legendary' ? 'legend' : selectedEntry.rarity} className="p-2.5 flex items-center gap-3">
          <FishSprite
            fish={selectedEntry.fish}
            preset="icon"
            form={form}
            discovered={selectedShown}
            className="shrink-0"
          />
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-text">
                {selectedShown
                  ? (form === 'variant' ? selectedEntry.variantName : selectedEntry.normalName)
                  : '???'}
              </span>
              <RarityText rarity={selectedEntry.rarity} />
              <span className="pf-accent text-xs text-gold ml-auto">
                {form === 'variant' ? selectedEntry.variantScore : selectedEntry.normalScore}점
              </span>
            </div>
            <p className="m-0 text-xs text-text-dim leading-relaxed">
              {selectedShown
                ? (form === 'variant' ? selectedEntry.variantLore : selectedEntry.normalLore)
                : '아직 낚지 못한 어종이에요.'}
            </p>
          </div>
        </Inset>
      )}
    </div>
  );
}

/** 이벤트 2(강태공 선수권 대회) 상세 화면 */
export default function EventTourneyDetail({
  view,
  busy,
  onEnterZone,
  onLeaveZone,
  onSettle,
  onBack,
}: {
  view: EventChampionshipView;
  busy: boolean;
  onEnterZone: () => void;
  onLeaveZone: () => void;
  onSettle: () => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<TourneyTab>('rank');
  return (
    <div className="flex flex-col gap-2.5 flex-1 min-h-0">
      <EventDepthHeader
        title={view.title}
        summary={view.summary}
        remainingText={view.remainingText}
        onBack={onBack}
      />

      <Inset tone="light" className="px-3 py-2 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Badge tone="accent">{view.rank ? `${view.rank}위` : '순위 집계 중'}</Badge>
          <span className="pf-accent text-base font-bold text-gold whitespace-nowrap">{fmtNum(view.score)}점</span>
        </div>
        <Button variant="primary" size="sm" disabled={busy} onClick={view.inEventZone ? onLeaveZone : onEnterZone}>
          {view.inEventZone ? '나가기' : '입장하기'}
        </Button>
      </Inset>

      <TabBar
        inline
        tabs={[
          { key: 'rank' as TourneyTab, label: '순위', icon: <PixelIcon glyph="trophy" size={12} /> },
          { key: 'settle' as TourneyTab, label: '정산', icon: <PixelIcon glyph="coin" size={12} />, count: view.canSettle ? 1 : 0 },
          { key: 'dex' as TourneyTab, label: '도감', icon: <PixelIcon glyph="book" size={12} /> },
        ]}
        activeKey={tab}
        onSelect={setTab}
      />

      <div className={`flex-1 min-h-0 flex flex-col gap-2.5 pr-1 ${SCROLL_Y}`}>
        {tab === 'rank' && <TourneyRankTab view={view} />}
        {tab === 'settle' && <TourneySettleTab view={view} busy={busy} onSettle={onSettle} />}
        {tab === 'dex' && <TourneyDexTab view={view} />}
      </div>
    </div>
  );
}
