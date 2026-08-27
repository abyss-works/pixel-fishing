import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AdminApp from './admin/AdminApp.tsx'
import { initObservability, Sentry } from './observability.ts'
import { installGlobalFailureHandlers, fail } from './errors.ts'

// 렌더보다 먼저 — 부팅 중 터지는 예외도 잡히도록 (DSN 없으면 no-op)
initObservability()
// 정책으로 가는 입구 둘: 이벤트 핸들러·타이머 예외(window.onerror)와 비동기 예외(unhandledrejection).
// ErrorBoundary는 세 번째 입구(렌더 예외)다 — 셋 다 열어야 실패가 새지 않는다.
installGlobalFailureHandlers()

// 관리자 페이지 분기 — URL 기반 별도 라우팅(hash: #/admin/...). 쿼리스트링 토글은 폐기:
// 셸과 완전히 다른 페이지라 부팅 단계에서 갈라진다. 게이트는 ?admin=1을 유지한다(공유 계약).
const isAdmin = new URLSearchParams(window.location.search).has('admin');
const onAdminPage = window.location.hash.startsWith('#/admin');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 렌더 중 예외가 흰 화면으로 끝나지 않게 — 보고 + 새로고침 안내 */}
    <Sentry.ErrorBoundary onError={fail} fallback={
      <div className="p-6 text-center text-text">
        <p className="text-gold">문제가 생겨 화면을 그리지 못했어요.</p>
        <p className="text-text-dim text-sm mt-1">
          새로고침하면 대개 해결돼요. 진행 상황은 서버에 저장되어 있어요.
        </p>
        <button className="pf-btn mt-3" onClick={() => location.reload()}>새로고침</button>
      </div>
    }>
      {isAdmin && onAdminPage
        ? <AdminApp />
        : <App />}
    </Sentry.ErrorBoundary>
  </StrictMode>,
)

