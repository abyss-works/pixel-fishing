import { useEffect, useState } from 'react';
import type { GameState } from '../game/logic';
import type { GameAction } from '../game/actions';
import type { DispatchResult, MaybePromise } from '../backend/types';
import TabBar from '../ui/TabBar';
import FishTab from './tabs/FishTab';
import StatsTab from './tabs/StatsTab';
import ToolsTab from './tabs/ToolsTab';

// 관리자 대시보드 — **완전 분리된 독립 앱**이다. main.tsx 부팅 분기(?admin && #/admin/*)만
// 여기로 들어오고, 게임 셸(App)에는 관리자 흔적이 남지 않는다(탭·게이트·아이콘 전부 철거).
// 진입: ?admin=1#/admin/fish  · 복귀: 헤더의 "게임으로" 링크.
//
// 탭은 어종(통합 대시보드 — 편집+통계 한 표) / 스탯(adminSet) / 도구(덮개) 셋.
// 밸런스 매트릭스는 어종 표 머리에 흡수됐다(BalanceTab 폐기 — 사용자 지시: 같은 화면에서).
//
// dispatch는 App 경유(A2 — props 드릴)다: adminSet/import 액션은 서버 권위 리듀서를 타며,
// 운영 환경의 소유자 게이트(api/action.ts IMPORT_OWNER_EMAIL)가 여전히 검증한다.
type AdminTabKey = 'fish' | 'stats' | 'tools';

const TABS = [
  { key: 'fish' as const, label: '어종' },
  { key: 'stats' as const, label: '스탯' },
  { key: 'tools' as const, label: '도구' },
];

const DEFAULT_HASH = '#/admin/fish';
const tabFromHash = (): AdminTabKey => {
  const h = window.location.hash;
  return (TABS.find(t => h === `#/admin/${t.key}`)?.key ?? 'fish');
};

interface Props {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
}

export default function AdminApp({ game, dispatch }: Props) {
  const [tab, setTabState] = useState<AdminTabKey>(tabFromHash);

  // hash 라우팅 — 탭 클릭은 **동기**로 상태를 바꾸고(클릭 피드백 즉시), 해시도 함께 옮긴다.
  // hashchange 이벤트는 외부 변경(뒤로 가기)만 받는다.
  useEffect(() => {
    if (!window.location.hash.startsWith('#/admin')) {
      window.location.replace(`${window.location.pathname}${window.location.search}${DEFAULT_HASH}`);
    }
    const onHash = () => setTabState(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (key: AdminTabKey) => {
    setTabState(key);
    if (window.location.hash !== `#/admin/${key}`) {
      try { window.history.pushState(null, '', `#/admin/${key}`); } catch { /* 무해 */ }
    }
  };

  return (
    <div className="min-h-screen w-full bg-bg text-text select-text">
      {/* 헤더 */}
      <header className="border-b border-line bg-surface px-4 py-3
                         flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg text-gold pf-accent">관리자 대시보드</h1>
          <p className="text-xs text-text-dim mt-0.5">
            데이터 열람·시뮬레이션·운영 도구. 확정 변경은 데이터 파일(fish.ts·spots.ts)이 정본이다.
          </p>
        </div>
        <a href="/" aria-label="게임으로 돌아가기"
           className="pf-btn ghost !py-1.5 !px-3 text-sm">← 게임으로</a>
      </header>

      {/* 내비게이션 — 좁은 화면 상단 가로 / 넓은 화면 좌측 세로 */}
      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-64px)]">
        <nav className="lg:w-[180px] shrink-0 border-b lg:border-b-0 lg:border-r border-line"
             aria-label="대시보드 섹션">
          <TabBar tabs={TABS} activeKey={tab} onSelect={go}
                  className="lg:flex-col lg:border-b-0" />
        </nav>

        <main className="flex-1 min-w-0 p-4">
          {tab === 'fish' && <FishTab />}
          {tab === 'stats' && <StatsTab game={game} dispatch={dispatch} />}
          {tab === 'tools' && <ToolsTab />}
        </main>
      </div>
    </div>
  );
}
