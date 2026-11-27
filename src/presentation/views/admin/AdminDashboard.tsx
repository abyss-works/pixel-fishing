// 관리자 대시보드 — **완전 분리된 독립 앱**이다. 게임과 다른 진입점·번들로 빌드해 /admin/에서 서빙하고,
// 게임 번들에는 관리자 화면이 들어가지 않는다.
// 어드민 가드를 통과한 뒤 역할(admin / maintainer)에 따라 관리 페이지와 Zero-PII 운영 페이지를 동적 코드 분할해 마운트한다.
import { Suspense, lazy } from 'react';
import { useAdminAuth } from '../../../features/admin/service/accessContext';
import { AdminAuthProvider, AdminGate } from './access';

const AdminWorkspace = lazy(() => import('./AdminWorkspace'));
const MaintainerWorkspace = lazy(() => import('./MaintainerWorkspace'));

export default function AdminApp() {
  return (
    <AdminAuthProvider>
      <AdminGate><Dashboard /></AdminGate>
    </AdminAuthProvider>
  );
}

function Dashboard() {
  const { role } = useAdminAuth();
  return (
    <Suspense fallback={<div className="min-h-screen w-full bg-surface p-4 text-xs text-text-dim">대시보드를 여는 중이에요.</div>}>
      {role === 'maintainer' ? <MaintainerWorkspace /> : <AdminWorkspace />}
    </Suspense>
  );
}
