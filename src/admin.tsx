import { boot } from './boot.tsx'
import { QueryProvider } from './core/QueryProvider.tsx'
import AdminApp from './presentation/views/admin/AdminDashboard.tsx'

// 관리자 대시보드 진입점 — 게임 번들과 따로 빌드해 /admin/에서 서빙한다.
// 관리자 앱의 읽기 캐시도 앱 경계에서 연다 — 접근 판정과 탭 조회가 이 안에서 돈다
boot(<QueryProvider><AdminApp /></QueryProvider>)
