// 운영 탭 — 대시보드 자체의 메타: 지금 이 번들이 어느 배포인지, 어느 Supabase 프로젝트를
// 보고 있는지, 이벤트 스트림에 무엇이 기록되는지. 링크를 나열하는 게 아니라 **환경 정체를
// 화면에 에코**하는 것이 목적이다(운영/스테이징 착오는 과거 사고의 원인 둘).
// 권한 진단은 AdminAuthProvider가 판정한 것을 소비한다 — 여기서 판정하지 않는다.
import Note from '../../ui/Note';
import SectionTitle from '../../ui/SectionTitle';
import DataTable from '../../ui/DataTable';
import { APP_VERSION } from '../../version';
import { BUILD_LABEL } from '../../buildId';
import { api } from '../../api';
import { EVENT_LABELS } from '../metrics';
import { useAdminAuth } from '../accessContext';

export default function OpsTab() {
  const { access } = useAdminAuth();

  return (
    <div className="flex flex-col gap-3">
      <Note>
        관측 3점 세트: 이 대시보드(게임 데이터) · Sentry(예외 — release가 아래 버전과 같다) ·
        Vercel 대시보드(함수·배포). 서버 예외는 reportServerIssue로 Sentry에 올라간다.
      </Note>

      <SectionTitle>이 화면의 정체</SectionTitle>
      <DataTable>
        <tbody>
          <Meta k="릴리즈 버전" v={APP_VERSION} hint="package.json + src/version.ts (릴리즈 때만 bump)" />
          <Meta k="빌드 식별자" v={BUILD_LABEL} hint="VERCEL_GIT_COMMIT_SHA — 낡은 탭 차단(426) 기준값" />
          <Meta k="Supabase 프로젝트" v={api.admin.projectRef() ?? '로컬 모드'}
                hint="VITE_SUPABASE_URL 호스트 — 운영/스테이징 ref가 다르다(착오 방지 표시)" />
        </tbody>
      </DataTable>

      <SectionTitle>권한</SectionTitle>
      {access === 'local' && <Note>클라우드 미설정 — 로컬 모드에선 관리자 데이터가 없다.</Note>}
      {access === 'denied' &&
        <Note tone="warn">이 세션은 admins에 등록되지 않았다. uid INSERT는 SQL Editor에서 한다.</Note>}
      {access === 'granted' &&
        <p className="text-xs text-gold pf-accent">관리자 세션 — 전 뷰 접근 가능.</p>}
      {access === 'checking' && <p className="text-2xs text-text-dim">확인 중…</p>}

      <SectionTitle>데이터 계약</SectionTitle>
      <p className="text-xs text-text-dim leading-relaxed">
        읽기 전용이다 — 쓰기 액션(지급·제재·이사코드 수입)은 이 화면에 존재하지 않는다.
        권한 방어선은 DB(<code className="pf-accent">admins</code> + is_admin() 뷰 게이트)다.
        데이터 접근은 api 계층(api.admin.*)이 유일한 경로다 — 전송 상세(뷰 이름·RPC 파라미터)는
        그 안에 갇혀 있다.
      </p>

      <EventCatalog />
    </div>
  );
}

function Meta({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <tr>
      <td className="text-left text-2xs text-text-dim w-[150px] align-top">{k}</td>
      <td className="text-left">
        <span className="pf-accent text-gold select-text">{v}</span>
        {hint && <span className="ml-2 text-2xs text-text-dim">{hint}</span>}
      </td>
    </tr>
  );
}

/** 이벤트 카탈로그 — game/actions.ts 리듀서가 남기는 유형의 사람용 목차. 로그에 모르는
 *  타입이 보이면 actions.ts와 metrics.EVENT_LABELS가 함께 늘어난 것이고, 여기는 그 사본이다 */
function EventCatalog() {
  return (
    <>
      <SectionTitle>events 스트림 카탈로그</SectionTitle>
      <p className="text-2xs text-text-dim mb-1">
        단일 근원은 game/actions.ts — 이 표는 표시용 목차다(metrics.ts EVENT_LABELS 재사용).
      </p>
      <DataTable>
        <thead>
          <tr><th className="text-left">type</th><th className="text-left">화면명</th></tr>
        </thead>
        <tbody>
          {Object.entries(EVENT_LABELS).map(([type, label]) => (
            <tr key={type}>
              <td className="font-mono text-2xs select-text">{type}</td>
              <td className="text-xs">{label}</td>
            </tr>
          ))}
          {/* 리듀서에서 상태만 바꾸고 이벤트 없는 액션들 — "왜 로그에 없나"의 답 */}
          <tr><td colSpan={2} className="text-2xs text-text-dim pt-2">
            이벤트 없음: setLocked · travel(첫 방문만 visit으로) · setActiveBait(멱등 재활성)
          </td></tr>
        </tbody>
      </DataTable>
    </>
  );
}
