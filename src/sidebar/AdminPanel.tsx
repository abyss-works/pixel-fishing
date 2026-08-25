// 설정 탭 하단의 구(舊) 관리자 대시보드 — 이제는 사이드바 관리자 탭(AdminTab)이 정본이다.
// 호환을 위해 남겨두되 노출은 차단한다(중복 렌더 방지). 삭제 시 SettingsTab의 import만 정리하면 된다.
export default function AdminPanel(_props: { account?: string | null }) {
  return null;
}
