import type { GameState } from '../game/logic';
import type { GameAction } from '../game/actions';
import type { DispatchResult, MaybePromise } from '../backend/types';
import StatsTab from '../admin/tabs/StatsTab';
import Note from '../ui/Note';
import SectionTitle from '../ui/SectionTitle';

// 관리자 탭 — 게임 셸 5탭 다음(6번) 조건부 탭. 스탯 직접 편집 + 대시보드 이동만 담는다.
// 노출 자체는 Sidebar가 ?admin + (로컬 또는 소유자 계정) 게이트로 통제한다.
// 상세 어종/밸런스 대시보드는 별도 페이지(admin/AdminApp — ?admin#/admin) 소관.
export default function AdminTab({ game, dispatch }: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <StatsTab game={game} dispatch={dispatch} />

      <SectionTitle>대시보드</SectionTitle>
      <Note>
        어종/밸런스/도구 대시보드는 별도 페이지다. 아래 버튼으로 이동한다 (해시 라우팅).
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
