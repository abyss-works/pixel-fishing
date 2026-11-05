import App from './App.tsx'
import { boot } from './boot.tsx'
import { legacyAdminTarget } from './presentation/views/admin/gate.ts'

// 관리자 대시보드는 게임 번들과 따로 빌드해 /admin/에서 서빙한다. 옛 주소는 해시 경로를 유지해 옮긴다.
const adminTarget = legacyAdminTarget(window.location.search, window.location.hash)
if (adminTarget) window.location.replace(adminTarget)
else boot(<App />)
