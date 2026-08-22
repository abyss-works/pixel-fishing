import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initObservability, Sentry } from './observability.ts'

// 렌더보다 먼저 — 부팅 중 터지는 예외도 잡히도록 (DSN 없으면 no-op)
initObservability()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 렌더 중 예외가 흰 화면으로 끝나지 않게 — 보고 + 새로고침 안내 */}
    <Sentry.ErrorBoundary fallback={
      <div className="p-6 text-center text-text">
        <p className="text-gold">문제가 생겨 화면을 그리지 못했어요.</p>
        <p className="text-text-dim text-xs mt-1">
          새로고침하면 대개 해결돼요. 진행 상황은 서버에 저장되어 있어요.
        </p>
        <button className="pf-btn mt-3" onClick={() => location.reload()}>새로고침</button>
      </div>
    }>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
