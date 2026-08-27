// 관리자 대시보드 — **완전 분리된 독립 앱**이다. main.tsx 부팅 분기(?admin && #/admin/*)만
// 여기로 들어오고, 게임 셸(App)에는 관리자 흔적이 남지 않는다.
// 진입: ?admin=1#/admin/fish · 복귀: 헤더의 "게임으로" 링크.
//
// 이전에는 어종/스탯/도구 3탭이었으나 스탯·덮개는 게임 셸 관리자 탭으로 옮겼다
// (사용자 지시): 대시보드에는 어종 시뮬레이션 한 가지만 남기지만 좌측 탭 네비게이션은
// 확장 계획이 있어 유지한다.
import { useEffect, useState } from 'react';
import TabBar from '../ui/TabBar';
import FishTab from './tabs/FishTab';

type AdminTabKey = 'fish';
const TABS = [{ key: 'fish' as const, label: '어종' }];
const DEFAULT_HASH = '#/admin/fish';
const tabFromHash = (): AdminTabKey => {
  const h = window.location.hash;
  return (TABS.find(t => h === `#/admin/${t.key}`)?.key ?? 'fish');
};

export default function AdminApp() {
  const [tab, setTabState] = useState<AdminTabKey>(tabFromHash);
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
      <header className="border-b border-line bg-surface px-4 py-3
                         flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg text-gold pf-accent">관리자 대시보드</h1>
          <p className="text-xs text-text-dim mt-0.5">
            어종 시뮬레이션. 확정 변경은 데이터 파일(fish.ts·spots.ts)이 정본이다.
          </p>
        </div>
        <a href="/" aria-label="게임으로 돌아가기"
           className="pf-btn ghost !py-1.5 !px-3 text-sm">← 게임으로</a>
      </header>

      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-64px)]">
        <nav className="lg:w-[180px] shrink-0 border-b lg:border-b-0 lg:border-r border-line"
             aria-label="대시보드 섹션">
          <TabBar tabs={TABS} activeKey={tab} onSelect={go}
                  className="lg:flex-col lg:border-b-0" />
        </nav>
        <main className="flex-1 min-w-0 p-4">
          {tab === 'fish' && <FishTab />}
        </main>
      </div>
    </div>
  );
}
