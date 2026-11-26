import { useState } from 'react';
import type { EventDrawView } from '../../../../features/events/model/events';
import Badge from '../../../ui/Badge';
import Inset from '../../../ui/Inset';
import Note from '../../../ui/Note';
import PixelIcon from '../../../ui/PixelIcon';
import TabBar from '../../../ui/TabBar';
import { fmtNum } from '../../../ui/format';
import { SCROLL_Y } from '../../../ui/scrollArea';
import { FortuneMotifIcon } from '../fortune/fortuneParts';
import { EventDepthHeader, EventPodium, EventRankRows } from './eventParts';

type LuckTab = 'rank' | 'board';

function LuckRankTab({ view }: { view: EventDrawView }) {
  return (
    <div className="flex flex-col gap-2.5">
      <EventPodium podium={view.podium} scoreIcon="clover" />
      <EventRankRows rows={view.rows} myRow={view.myRow} />
    </div>
  );
}

function LuckBoardTab({ view }: { view: EventDrawView }) {
  return (
    <div className="flex flex-col gap-2.5">
      <Inset tone="light" border="gold" className="px-3 py-2 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5">
          <PixelIcon glyph="clover" size={14} className="text-gold shrink-0" />
          <span className="text-xs text-text-dim">누적 점수</span>
          <span className="pf-accent text-base font-bold text-gold">{fmtNum(view.totalScore)}점</span>
        </div>
        <Badge tone="accent">출석 {view.attendedDays}일</Badge>
      </Inset>

      <div className="grid grid-cols-5 gap-2 mobile:grid-cols-3" aria-label="행운 출석 점괘판">
        {view.days.map(day => (
          <Inset
            key={day.day}
            tone={day.attended ? 'light' : 'deep'}
            border={day.attended ? 'gold' : 'line'}
            className="p-2 flex flex-col items-center justify-between gap-1 text-center min-h-[78px]"
          >
            <span className="text-2xs font-bold text-text-dim">{day.label}</span>
            {day.attended && day.kind && day.index ? (
              <>
                <FortuneMotifIcon kind={day.kind} index={day.index} size={18} />
                <span className="text-2xs font-bold text-text truncate max-w-full">{day.fortuneShort}</span>
                <span className="inline-flex items-center gap-0.5 pf-accent text-xs font-bold text-gold">
                  <PixelIcon glyph="clover" size={10} className="text-gold shrink-0" />
                  {day.score}
                </span>
              </>
            ) : (
              <span className="text-2xs text-text-dim my-auto">미출석</span>
            )}
          </Inset>
        ))}
      </div>

      <Note size="xs" className="my-0">동점이면 출석 일수가 많은 쪽이 앞서요.</Note>
    </div>
  );
}

/** 이벤트 3(천하제일 행운왕) 상세 화면 */
export default function EventLuckDetail({
  view,
  onBack,
}: {
  view: EventDrawView;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<LuckTab>('rank');
  return (
    <div className="flex flex-col gap-2.5 flex-1 min-h-0">
      <EventDepthHeader
        title={view.title}
        summary={view.summary}
        remainingText={view.remainingText}
        onBack={onBack}
      />

      <TabBar
        inline
        tabs={[
          { key: 'rank' as LuckTab, label: '순위', icon: <PixelIcon glyph="trophy" size={12} /> },
          { key: 'board' as LuckTab, label: '점괘판', icon: <PixelIcon glyph="clover" size={12} /> },
        ]}
        activeKey={tab}
        onSelect={setTab}
      />

      <div className={`flex-1 min-h-0 flex flex-col gap-2.5 pr-1 ${SCROLL_Y}`}>
        {tab === 'rank' ? <LuckRankTab view={view} /> : <LuckBoardTab view={view} />}
      </div>
    </div>
  );
}
