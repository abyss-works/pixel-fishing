import type { GameState } from '../game/logic';
import type { GameAction } from '../game/actions';
import type { DispatchResult, MaybePromise } from '../backend/types';
import StatsTab from '../admin/tabs/StatsTab';
import { setCanvasCover, useCanvasCover } from '../admin/canvasCover';
import { cx } from '../ui/cx';
import Note from '../ui/Note';
import SectionTitle from '../ui/SectionTitle';

// 관리자 탭 — 게임 셸 5탭 다음(6번) 조건부 탭. 스탯 직접 편집 + 덮개 + 대시보드 이동을 담는다.
// 노출 자체는 Sidebar가 ?admin + (로컬 또는 소유자 계정) 게이트로 통제한다.
// 대시보드는 어종 시뮬레이션 한 가지만 남겼다(스탯·덮개는 여기로 옮김).
export default function AdminTab({ game, dispatch }: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
}) {
  const canvasCover = useCanvasCover();
  return (
    <div className="flex flex-col gap-4">
      <StatsTab game={game} dispatch={dispatch} />

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
        어종 시뮬레이션은 별도 페이지다. 아래 버튼으로 이동한다.
      </Note>
      <a href="?admin=1#/admin/fish" aria-label="대시보드 열기"
         className="pf-btn ghost text-sm text-center !py-2">
        대시보드 열기 →
      </a>
      <p className="text-2xs text-text-dim">
        주소: <code className="pf-accent">?admin=1#/admin/fish</code> — 같은 탭에서 열린다.
      </p>
    </div>
  );
}
