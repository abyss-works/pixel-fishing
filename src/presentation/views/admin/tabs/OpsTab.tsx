// 운영 탭 — 대시보드 자체의 메타: 지금 이 번들이 어느 배포인지, 어느 Supabase 프로젝트를
// 보고 있는지, 이벤트 스트림에 무엇이 기록되는지. 링크를 나열하는 게 아니라 **환경 정체를
// 화면에 에코**하는 것이 목적이다(운영/스테이징 착오는 과거 사고의 원인 둘).
// 권한 진단은 AdminAuthProvider가 판정한 것을 소비한다 — 여기서 판정하지 않는다.
import Note from '../../../ui/Note';
import DataTable from '../../../ui/DataTable';
import { APP_VERSION } from '../../../../version';
import { BUILD_LABEL } from '../../../../buildId';
import { readAdminProjectRef } from '../../../../features/admin/service/queries';
import { EVENT_LABELS } from '../../../../features/admin/model/metrics';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { Cell, CellGrid, TabPage } from '../layout';

export default function OpsTab() {
  const { access } = useAdminAuth();

  return (
    <TabPage title="운영" context="이 대시보드가 어느 배포와 어느 Supabase 프로젝트를 보고 있는지 확인해요.">
      <CellGrid>
        <Cell title="이 화면의 정체" flush>
          <div className="px-1">
            <DataTable>
              <tbody>
                <Meta k="릴리즈 버전" v={APP_VERSION}
                      hint="package.json과 version.ts가 같은 값이에요. 릴리즈 때만 올려요." />
                <Meta k="빌드 식별자" v={BUILD_LABEL}
                      hint="VERCEL_GIT_COMMIT_SHA 값이에요. 낡은 탭을 막는 기준(426)이에요." />
                <Meta k="Supabase 프로젝트" v={readAdminProjectRef() ?? '로컬 모드'}
                      hint="VITE_SUPABASE_URL의 호스트예요. 운영과 스테이징의 ref가 달라서 착오를 막으려고 보여 줘요." />
              </tbody>
            </DataTable>
          </div>
        </Cell>

        <Cell title="권한">
          {access === 'local' && <Note className="my-0">클라우드가 설정되지 않아서 로컬 모드에서는 관리자 데이터가 없어요.</Note>}
          {access === 'denied' &&
            <Note tone="warn" className="my-0">이 세션은 admins에 등록되지 않았어요. uid는 SQL Editor에서 INSERT해 주세요.</Note>}
          {access === 'granted' &&
            <Note className="my-0"><span className="pf-accent text-gold">관리자 세션</span>이에요. 모든 뷰를 볼 수 있어요.</Note>}
          {access === 'checking' && <Note size="xs" className="my-0">확인 중…</Note>}
        </Cell>

        <Cell title="관측">
          <Note className="my-0 leading-relaxed">
            게임 데이터는 이 대시보드로, 예외는 Sentry로, 함수와 배포는 Vercel 대시보드로 봐요.
            Sentry의 release는 위 릴리즈 버전과 같아요. 서버 예외는 reportServerIssue로 Sentry에 올라가요.
          </Note>
        </Cell>

        <Cell title="데이터 계약">
          <Note className="my-0 leading-relaxed">
            읽기 전용이에요. 쓰기 액션(지급·제재·이사 코드 반입)은 이 화면에 없어요.
            권한 방어선은 서버 읽기 함수가 <code className="pf-accent">admins</code> 명부로 하는 판정이에요.
            데이터 접근은 features/admin/service가 유일한 경로이고, 전송 상세(요청 이름·인자)는 그 안에서만 다뤄요.
          </Note>
        </Cell>

        <EventCatalog />
      </CellGrid>
    </TabPage>
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

/** 이벤트 카탈로그 — 액션 리듀서가 남기는 유형의 사람용 목차다. 로그에 모르는
 *  타입이 보이면 GameAction과 metrics.EVENT_LABELS를 함께 갱신한다. */
function EventCatalog() {
  return (
    <Cell title="events 스트림 카탈로그" className="xl:col-span-2" flush>
      <Note size="2xs" className="my-0 px-3 pt-2">
        이벤트 식별자는 게임 동작 기록을 따르고, 화면명은 이벤트 설명 카탈로그를 보여 줘요.
      </Note>
      <div className="pf-scroll-panel max-h-[360px] overflow-y-auto px-1">
        <DataTable>
          <thead>
            <tr><th className="text-left">type</th><th className="text-left">화면명</th></tr>
          </thead>
          <tbody>
            {Object.entries(EVENT_LABELS).map(([type, label]) => (
              <tr key={type}>
                <td className="pf-accent text-2xs select-text">{type}</td>
                <td className="text-xs">{label}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
      {/* 리듀서에서 상태만 바꾸고 이벤트 없는 액션들 — "왜 로그에 없나"의 답 */}
      <Note size="2xs" className="my-0 px-3 pb-2">
        setLocked, travel, setActiveBait는 이벤트를 남기지 않아요.
        travel은 첫 방문만 visit으로 남고, setActiveBait는 이미 활성인 미끼를 다시 고르면 기록하지 않아요.
      </Note>
    </Cell>
  );
}
