import { useState } from 'react';
import type { GameState } from '../game/logic';
import type { GameAction } from '../game/actions';
import type { DispatchResult, MaybePromise } from '../api';
import { dayPhase, formatGameClock, DAY_START_MIN, NIGHT_START_MIN } from '../game/time';
import { setTimeOverride, useTimeOverride } from '../admin/timeOverride';
import StatsTab from '../admin/tabs/StatsTab';
import { setCanvasCover, useCanvasCover } from '../admin/canvasCover';
import { cx } from '../ui/cx';
import Note from '../ui/Note';
import SectionTitle from '../ui/SectionTitle';
import PixelIcon from '../ui/PixelIcon';

// 관리자 탭 — 게임 셸 5탭 다음(6번) 조건부 탭. 스탯 편집 + 덮개 + 시간대 설정 + 대시보드.
// 노출은 Sidebar가 ?admin + (로컬 또는 소유자 계정) 게이트로 통제한다.
export default function AdminTab({ game, dispatch }: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
}) {
  const canvasCover = useCanvasCover();
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
    <div className="flex flex-col gap-4">
      <StatsTab game={game} dispatch={dispatch} />

      <SectionTitle>시간대 설정</SectionTitle>
      <div className="border border-line rounded-sm px-3 py-2 flex flex-col gap-2">
        {/* 상태 줄 — 해/달 아이콘 + 게임 시각 + 낮밤 */}
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm">
            <PixelIcon glyph={phase === 'night' ? 'moon' : 'sun'} size={14}
                       className={phase === 'night' ? 'text-accent' : 'text-gold'} />
            <b className="pf-accent text-base text-gold">{clockText}</b>
            <b className={cx('text-xs', phase === 'night' ? 'text-accent' : 'text-gold')}>
              {phase === 'night' ? '밤' : '낮'}
            </b>
          </span>
          <button type="button"
                  onClick={() => { setTimeOverride(null); setTick(t => t + 1); }}
                  className="border border-line rounded-sm px-2 py-0.5 text-2xs text-text-dim
                             hover:text-gold hover:border-gold cursor-pointer transition shrink-0">
            실제 시각{override === null ? ' (적용 중)' : ''}
          </button>
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
        <div className="flex items-center gap-2 text-2xs text-text-dim">
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
        <p className="text-2xs text-text-dim">
          낮 = 게임 04:00~20:00 · 밤 = 게임 20:00~다음 04:00.
          밤 어종·어둠·이동 감속을 보려면 슬라이더를 0~9(새벽) 또는 50~59(저녁)로.
          로컬 개발 전용 — 운영(클라우드)은 서버가 시각을 판정한다.
        </p>
      </div>

      <SectionTitle>화면 덮개</SectionTitle>
      <div className="flex items-center justify-between gap-2 border border-line rounded-sm px-2 py-1.5">
        <span className="text-xs text-text-dim leading-relaxed">
          캔버스만 가린다. 게임은 계속 돈다.
        </span>
        <button type="button"
                aria-pressed={canvasCover}
                aria-label="게임 화면 덮개"
                onClick={() => setCanvasCover(!canvasCover)}
                className={cx('border rounded-sm px-2 py-1 text-xs cursor-pointer transition shrink-0',
                              canvasCover ? 'border-gold text-gold bg-surface-2'
                                          : 'border-line text-text-dim hover:text-gold hover:border-gold')}>
          {canvasCover ? '덮음' : '열림'}
        </button>
      </div>

      <SectionTitle>대시보드</SectionTitle>
      <Note>
        운영 데이터(개요·유저·지표·이상탐지 등)는 별도 페이지다. 아래 버튼으로 이동한다.
      </Note>
      <a href="?admin=1#/admin/overview" aria-label="대시보드 열기"
         className="pf-btn ghost text-sm text-center !py-2">
        대시보드 열기 →
      </a>
      <p className="text-2xs text-text-dim">
        주소: <code className="pf-accent">?admin=1#/admin/overview</code> — 같은 탭에서 열린다.
      </p>
    </div>
  );
}
