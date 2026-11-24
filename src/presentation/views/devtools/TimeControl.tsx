import { useState } from 'react';
import { TIME_CYCLE, timeClockOf, timePhaseOf, timeStepOf } from '../../../features/devtools/model/time';
import {
  setPhaseOverride,
  setTimeOverride,
  usePhaseOverride,
  useTimeOverride,
} from '../../../features/gameplay/service/timeOverride';
import { useGameTime } from '../../../features/gameplay/service/useGameTime';
import { cx } from '../../ui/cx';
import PillButton from '../../ui/PillButton';
import Note from '../../ui/Note';
import PixelIcon from '../../ui/PixelIcon';
import Frame from '../../ui/Frame';
import Slider from '../../ui/Slider';
import Tip from '../../ui/Tip';
import { useDevEnv } from './devEnv';

// 낮/밤 3단 스위치(실제/낮/밤)는 프리뷰·로컬 모두에서 요청 단위 forcePhase와 화면 연출을 동기화한다.
// 25초(10게임분) 스텝 단위 시각 슬라이더는 오프라인 개발 모드(로컬 게이트웨이) 전용이다.
export default function TimeControl() {
  const { env } = useDevEnv();
  const isLocal = env === 'local';
  const override = useTimeOverride();
  const phaseOverride = usePhaseOverride();
  const gameTime = useGameTime();
  const [, setTick] = useState(0);

  const liveIso = new Date().toISOString();
  const step = timeStepOf(override ?? liveIso);
  const phase = phaseOverride ?? timePhaseOf(override ?? liveIso);
  const clockText = override !== null ? timeClockOf(override) : gameTime.clock;

  const atStep = (nextStep: number): string => {
    const d = new Date();
    const totalSec = nextStep * TIME_CYCLE.stepSec;
    d.setUTCMinutes(Math.floor(totalSec / 60), totalSec % 60, 0);
    return d.toISOString();
  };

  const pct = (min: number): string => `${(min / TIME_CYCLE.cycleMin) * 100}%`;

  return (
    <Frame className="px-3 py-2 flex flex-col gap-2">
      {/* 상태 줄 — 해/달 아이콘 + 게임 시각 + 낮밤 */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm">
          <PixelIcon glyph={phase === 'night' ? 'moon' : 'sun'} size={18}
                     className={phase === 'night' ? 'text-accent' : 'text-gold'} />
          <b className="pf-accent text-lg text-gold">{clockText}</b>
          <b className={cx('text-sm', phase === 'night' ? 'text-accent' : 'text-gold')}>
            {phase === 'night' ? '밤' : '낮'}
            {phaseOverride ? ' (고정)' : ''}
          </b>
        </span>
        <div className="flex items-center gap-1">
          <PillButton type="button"
                      active={phaseOverride === null && override === null}
                      aria-pressed={phaseOverride === null}
                      onClick={() => {
                        setPhaseOverride(null);
                        setTimeOverride(null);
                        setTick(t => t + 1);
                      }}
                      className="text-xs px-2 py-1">
            실제
          </PillButton>
          <PillButton type="button"
                      active={phaseOverride === 'day'}
                      aria-pressed={phaseOverride === 'day'}
                      onClick={() => setPhaseOverride('day')}
                      className="text-xs px-2 py-1">
            낮 고정
          </PillButton>
          <PillButton type="button"
                      active={phaseOverride === 'night'}
                      aria-pressed={phaseOverride === 'night'}
                      onClick={() => setPhaseOverride('night')}
                      className="text-xs px-2 py-1">
            밤 고정
          </PillButton>
        </div>
      </div>

      {/* 25초(10게임분) 스텝 단위 슬라이더 — 로컬 전용 */}
      {isLocal && (
        <>
          <Slider min={0} max={TIME_CYCLE.totalSteps - 1} step={1}
                  value={step}
                  aria-label="주기 내 시각 (10게임분)"
                  onChange={e => {
                    const nextStep = Number(e.target.value);
                    setPhaseOverride(null);
                    setTimeOverride(atStep(nextStep));
                    setTick(t => t + 1);
                  }} />

          {/* 눈금 — 밤(게임 22시~6시)은 양끝, 낮(6시~22시)은 가운데 */}
          <div className="flex items-center gap-2 text-xs text-text-dim">
            <span className="shrink-0 w-10">자정</span>
            <div className="flex-1 h-2 rounded-full overflow-hidden flex bg-surface-2 border border-line">
              <Tip plain text="밤 (게임 0~6시)" className="block h-full bg-accent/50" style={{ width: pct(TIME_CYCLE.dayStartMin) }}>{null}</Tip>
              <Tip plain text="낮 (게임 6~22시)" className="block h-full bg-gold/30" style={{ width: pct(TIME_CYCLE.nightStartMin - TIME_CYCLE.dayStartMin) }}>{null}</Tip>
              <Tip plain text="밤 (게임 22~24시)" className="block h-full bg-accent/50" style={{ width: pct(TIME_CYCLE.cycleMin - TIME_CYCLE.nightStartMin) }}>{null}</Tip>
            </div>
            <span className="shrink-0 w-10 text-right">다음 자정</span>
          </div>
        </>
      )}

      <Note size="xs" className="my-0">
        낮/밤 3단 스위치는 프리뷰·로컬 모두에서 수동·방치 캐치(forcePhase)와 화면 어둠에 즉시 반영된다.
        {!isLocal && ' (시각 슬라이더는 로컬 개발 전용)'}
      </Note>
    </Frame>
  );
}
