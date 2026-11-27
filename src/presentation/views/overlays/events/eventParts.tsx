import type { ReactNode } from 'react';
import type { EventPodiumSlot, EventRankMeView, EventRankRowView } from '../../../../features/events/model/events';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import Inset from '../../../ui/Inset';
import PageTitle from '../../../ui/PageTitle';
import PersonSprite from '../../../ui/PersonSprite';
import PixelIcon from '../../../ui/PixelIcon';
import ProgressCount from '../../../ui/ProgressCount';
import { RankMeBar } from '../../../ui/RankList';
import { fmtNum } from '../../../ui/format';

/** 이벤트 2단계 상세 머리글 — 목록으로 돌아가기, 제목, 한 줄 설명, 우측 보조 동작 */
export function EventDepthHeader({
  title,
  summary,
  remainingText,
  badge,
  action,
  onBack,
}: {
  title: string;
  summary: string;
  remainingText?: string;
  badge?: ReactNode;
  action?: ReactNode;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-line pb-2 shrink-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button size="sm" onClick={onBack}>
            <PixelIcon glyph="back" size={11} />
            목록
          </Button>
          <PageTitle className="truncate">{title}</PageTitle>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {badge}
          {remainingText && (
            <span className="text-xs font-bold text-gold whitespace-nowrap">{remainingText}</span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-xs text-text-dim truncate min-w-0 flex-1">{summary}</p>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

/** 2-1-3 아바타 시상대 — 참여자 수와 무관하게 3열 고정 배치하고 빈 자리는 점선 어두운 받침대로 표시한다 */
export function EventPodium({
  podium,
  scoreIcon = 'none',
}: {
  podium: readonly EventPodiumSlot[];
  scoreIcon?: 'none' | 'clover';
}) {
  const heightOf = (place: 1 | 2 | 3) => (
    place === 1
      ? 'min-h-[98px] mobile:min-h-[90px]'
      : place === 2
        ? 'min-h-[86px] mobile:min-h-[80px]'
        : 'min-h-[76px] mobile:min-h-[72px]'
  );
  return (
    <div className="grid grid-cols-3 gap-2 items-end" aria-label="순위 시상대">
      {podium.map(({ place, entry }) => (
        <div key={place} className="flex flex-col items-center justify-end gap-1.5 min-w-0">
          {entry ? (
            <>
              <PersonSprite look={entry.look} scale={2} ariaLabel={`${place}위 ${entry.nickname}`} />
              <Inset
                tone={place === 1 ? 'light' : 'base'}
                border={entry.me ? 'accent' : place === 1 ? 'gold' : 'line'}
                data-place={place}
                className={cx(
                  'w-full px-2 py-1.5 flex flex-col items-center justify-center gap-0.5 text-center min-w-0',
                  heightOf(place),
                )}
              >
                <Badge tone={place === 1 ? 'gold' : entry.me ? 'accent' : 'dim'} size="2xs">
                  {place}위
                </Badge>
                <span className={cx('text-xs font-bold truncate max-w-full', entry.me ? 'text-accent' : 'text-text')}>
                  {entry.nickname}
                </span>
                <span className="inline-flex items-center gap-1 pf-accent text-xs font-bold text-gold whitespace-nowrap">
                  {scoreIcon === 'clover' && <PixelIcon glyph="clover" size={11} className="text-gold shrink-0" />}
                  {fmtNum(entry.score)}점
                </span>
              </Inset>
            </>
          ) : (
            <Inset
              tone="deep"
              border="line-dim"
              data-place={place}
              className={cx(
                'w-full px-2 py-1.5 flex flex-col items-center justify-center gap-1 text-center min-w-0 border-dashed',
                heightOf(place),
              )}
            >
              <Badge tone="dim" size="2xs">{place}위</Badge>
              <span className="text-2xs text-text-dim">기록 대기</span>
            </Inset>
          )}
        </div>
      ))}
    </div>
  );
}

/** 4위 이하 순위 표 + 하단 고정 내 순위 바(1~3위 단상 포함 시 생략) */
export function EventRankRows({
  rows,
  myRow,
  scoreIcon = 'none',
}: {
  rows: readonly EventRankRowView[];
  myRow: EventRankMeView | null;
  scoreIcon?: 'none' | 'clover';
}) {
  const showMyBar = myRow === null || myRow.rank > 3;
  return (
    <div className="flex flex-col gap-1.5">
      {rows.length > 0 && (
        <Inset divided className="px-2.5">
          {rows.map(row => (
            <div
              key={row.rank}
              className={cx(
                'grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 py-1.5 text-xs',
                row.me && 'bg-accent/10 -mx-2.5 px-2.5',
              )}
            >
              <span className="pf-accent text-text-dim">{row.rank}위</span>
              <span className={cx('truncate font-bold', row.me ? 'text-accent' : 'text-text')}>
                {row.nickname}
              </span>
              <span className="inline-flex items-center justify-end gap-1 pf-accent text-gold whitespace-nowrap">
                {scoreIcon === 'clover' && <PixelIcon glyph="clover" size={11} className="text-gold shrink-0" />}
                {fmtNum(row.score)}점
              </span>
            </div>
          ))}
        </Inset>
      )}
      {showMyBar && (
        <RankMeBar
          me={myRow ? { rank: myRow.rank, value: myRow.score } : null}
          format={v => (
            scoreIcon === 'clover' ? (
              <span className="inline-flex items-center justify-end gap-1">
                <PixelIcon glyph="clover" size={11} className="text-gold shrink-0" />
                <ProgressCount value={`${fmtNum(v)}점`} />
              </span>
            ) : `${fmtNum(v)}점`
          )}
        />
      )}
    </div>
  );
}

/** 교환권 번호에서 결정적인 픽셀 바코드 SVG 막대를 만든다 */
export function EventBarcode({ code }: { code: string }) {
  const digits = code.replace(/[^0-9A-Za-z]/g, '');
  const bars: { x: number; w: number }[] = [];
  let cursor = 4;
  for (let i = 0; i < digits.length; i++) {
    const n = digits.charCodeAt(i);
    const w1 = (n % 2) + 1;
    const gap1 = ((n >> 1) % 2) + 1;
    const w2 = ((n >> 2) % 2) + 1;
    const gap2 = ((n >> 3) % 2) + 1;
    bars.push({ x: cursor, w: w1 });
    cursor += w1 + gap1;
    bars.push({ x: cursor, w: w2 });
    cursor += w2 + gap2;
  }
  const width = Math.max(80, cursor + 4);
  return (
    <div className="bg-text text-bg px-3 py-1.5 inline-block" aria-label="교환권 바코드">
      <svg
        viewBox={`0 0 ${width} 28`}
        width={Math.min(240, width * 2)}
        height={32}
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        {bars.map((b, idx) => (
          <rect key={idx} x={b.x} y={0} width={b.w} height={28} fill="currentColor" />
        ))}
      </svg>
    </div>
  );
}
