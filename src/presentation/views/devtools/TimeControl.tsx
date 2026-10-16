import { useState } from 'react';
import { dayPhase, formatGameClock, DAY_START_MIN, NIGHT_START_MIN } from '../../../game/rules/time';
import { setTimeOverride, useTimeOverride } from '../../../features/gameplay/service/timeOverride';
import { cx } from '../../ui/cx';
import PillButton from '../../ui/PillButton';
import Note from '../../ui/Note';
import PixelIcon from '../../ui/PixelIcon';

// 게임 시각 고정 — 오프라인 개발 모드(로컬 게이트웨이) 전용. 서버는 자기 시각으로 판정한다.
export default function TimeControl() {
  const override = useTimeOverride();
  const [, setTick] = useState(0);

  // 슬라이더 위치 = 주기 내 분(0~59, 0=자정). override가 없으면 실제 시계의 분을 표시한다.
  const liveMinute = new Date().getMinutes();
  const minute = override !== null ? new Date(override).getMinutes() : liveMinute;
  const phase = dayPhase(override ?? new Date().toISOString());
  const clockText = formatGameClock(override ?? new Date().toISOString());

  // ISO 분만 조작 — 분이 곧 주기 내 위치이므로 날짜·시 무관
  const atMinute = (m: number): string => {
    const d = new Date();
    d.setUTCMinutes(m, 0, 0);
    return d.toISOString();
  };

  return (
    <div className="pf-frame px-3 py-2 flex flex-col gap-2">
      {/* 상태 줄 — 해/달 아이콘 + 게임 시각 + 낮밤 */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm">
          <PixelIcon glyph={phase === 'night' ? 'moon' : 'sun'} size={18}
                     className={phase === 'night' ? 'text-accent' : 'text-gold'} />
          <b className="pf-accent text-lg text-gold">{clockText}</b>
          <b className={cx('text-sm', phase === 'night' ? 'text-accent' : 'text-gold')}>
            {phase === 'night' ? '밤' : '낮'}
          </b>
        </span>
        <PillButton type="button"
                onClick={() => { setTimeOverride(null); setTick(t => t + 1); }}
                className="shrink-0 text-sm px-3 py-1.5">
          실제 시각{override === null ? ' (적용 중)' : ''}
        </PillButton>
      </div>

      {/* 슬라이더 — 주기 내 분(0~59, 0=자정). 드래그하면 낮/밤·어둠·해/달이 즉시 반영된다. */}
      <input type="range" min={0} max={59} step={1}
             value={minute}
             aria-label="주기 내 시각 (분)"
             onChange={e => {
               const m = Number(e.target.value);
               setTimeOverride(atMinute(m));
               setTick(t => t + 1);
             }}
             className="w-full accent-gold cursor-pointer" />

      {/* 눈금 — 밤(게임 20시~4시)은 양끝, 낮(4시~20시)은 가운데 */}
      <div className="flex items-center gap-2 text-xs text-text-dim">
        <span className="shrink-0 w-10">자정</span>
        <div className="flex-1 h-2 rounded-full overflow-hidden flex bg-surface-2 border border-line">
          <div className="h-full bg-accent/50" style={{ width: `${DAY_START_MIN}%` }}
               title="밤 (게임 0~4시)" />
          <div className="h-full bg-gold/30" style={{ width: `${NIGHT_START_MIN - DAY_START_MIN}%` }}
               title="낮 (게임 4~20시)" />
          <div className="h-full bg-accent/50" style={{ width: `${100 - NIGHT_START_MIN}%` }}
               title="밤 (게임 20~24시)" />
        </div>
        <span className="shrink-0 w-10 text-right">다음 자정</span>
      </div>
      <Note size="xs" className="my-0">
        낮 = 게임 04:00~20:00 · 밤 = 게임 20:00~다음 04:00.
        밤 어종·어둠·이동 감속을 보려면 슬라이더를 0~9(새벽) 또는 50~59(저녁)로.
        로컬 개발 전용 — 운영(클라우드)은 서버가 시각을 판정한다.
      </Note>
    </div>
  );
}
