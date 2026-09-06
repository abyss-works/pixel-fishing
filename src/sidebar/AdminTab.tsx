import { useState } from 'react';
import type { GameState } from '../game/logic';
import type { GameAction } from '../game/actions';
import type { DispatchResult, MaybePromise } from '../api';
import { dayPhase, NIGHT_MIN } from '../game/time';
import { setTimeOverride, useTimeOverride } from '../admin/timeOverride';
import StatsTab from '../admin/tabs/StatsTab';
import { setCanvasCover, useCanvasCover } from '../admin/canvasCover';
import { cx } from '../ui/cx';
import Note from '../ui/Note';
import SectionTitle from '../ui/SectionTitle';

// 관리자 탭 — 게임 셸 5탭 다음(6번) 조건부 탭. 스탯 편집 + 덮개 + 시간대 설정 + 대시보드.
// 노출은 Sidebar가 ?admin + (로컬 또는 소유자 계정) 게이트로 통제한다.
export default function AdminTab({ game, dispatch }: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
}) {
  const canvasCover = useCanvasCover();
  const override = useTimeOverride();
  // 실제 시각 모드에서 분이 바뀌어 표시가 갱신되도록(테스트 편의)
  const [, setTick] = useState(0);

  const shown = override ?? new Date().toISOString();
  const phase = dayPhase(shown);
  const minute = new Date(shown).getMinutes(); // 하루=60분: 분이 곧 게임 "시"(0=자정)

  // ISO 분만 조작 — 분이 곧 시간대 판정이므로 날짜·시 무관
  const atMinute = (m: number): string => {
    const d = new Date();
    d.setUTCMinutes(m, 0, 0);
    return d.toISOString();
  };

  return (
    <div className="flex flex-col gap-4">
      <StatsTab game={game} dispatch={dispatch} />

      <SectionTitle>시간대 설정</SectionTitle>
      <Note>
        게임 시각 <b className="pf-accent">{minute}시</b> — {phase === 'night'
          ? <b className="text-accent">밤</b> : <b className="text-gold">낮</b>}
        {override === null && ' (실제 벽시계 — 밤은 매시 정각부터 20분)'}
      </Note>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button"
                onClick={() => { setTimeOverride(atMinute(NIGHT_MIN)); setTick(t => t + 1); }}
                className="border border-line rounded-sm px-3 py-1 text-xs text-text-dim
                           hover:text-gold hover:border-gold cursor-pointer transition shrink-0">
          낮으로 (게임 {NIGHT_MIN}시)
        </button>
        <button type="button"
                onClick={() => { setTimeOverride(atMinute(0)); setTick(t => t + 1); }}
                className="border border-line rounded-sm px-3 py-1 text-xs text-text-dim
                           hover:text-accent hover:border-accent cursor-pointer transition shrink-0">
          밤으로 (게임 0시)
        </button>
        <button type="button"
                onClick={() => { setTimeOverride(null); setTick(t => t + 1); }}
                className="border border-line rounded-sm px-3 py-1 text-xs text-text-dim
                           hover:text-gold hover:border-gold cursor-pointer transition shrink-0">
          실제 시각 (해제)
        </button>
      </div>
      <p className="text-2xs text-text-dim">
        밤 어종(달무리 등)을 테스트하려면 [밤으로] 후 캐스팅 — 다음 catch부터 밤 풀이 적용된다.
        로컬 개발 전용이며 운영(클라우드)은 서버가 시각을 판정한다.
      </p>

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
