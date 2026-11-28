// 운영·콘텐츠 탭 — 서버·실시간, 클라이언트, 변경 기록, 콘텐츠 카탈로그 4개 하위 구역으로 나눈다.
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import SubTabs from '../../../ui/SubTabs';
import { APP_VERSION } from '../../../../version';
import { BUILD_LABEL } from '../../../../buildId';
import { readAdminDeployHost } from '../../../../features/admin/service/queries';
import { EVENT_LABELS } from '../../../../features/admin/model/metrics';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { Cell, CellGrid, TabPage } from '../layout';
import { ADMIN_SECTIONS } from '../routes';
import type { OpsSection } from '../routes';
import { useAdminViewMode } from '../viewMode';
import ChangelogSection from './ChangelogSection';
import ClientMetricsSection from './ClientMetricsSection';
import ContentTab from './ContentTab';
import { HttpMetricsOpsSection } from './HttpMetricsSection';
import ServerHealthSection from './ServerHealthSection';

const CONTEXT: Record<OpsSection, string> = {
  server: '이 대시보드의 배포 정체와 서버 HTTP·소켓·DB 상태 및 경보를 확인해요.',
  client: '브라우저 Web Vitals, 왕복 지연(RTT), 캔버스 프레임 및 소켓 재연결 추이를 확인해요.',
  changelog: '버전별 공개·관리자 변경 기록을 최신 순으로 열람해요.',
  catalog: '어종·네임드·유물·업적·의상·요리·배·구역·의뢰 9개 정본 축을 오프라인에서도 검색·검수해요.',
};

export default function OpsTab({
  section = 'server',
  onSection = () => {},
}: {
  section?: OpsSection;
  onSection?: (section: OpsSection) => void;
} = {}) {
  const { access, role } = useAdminAuth();
  const { viewMode } = useAdminViewMode();

  return (
    <TabPage title="운영·콘텐츠" context={CONTEXT[section]}>
      <div className="max-w-[640px]">
        <SubTabs
          items={ADMIN_SECTIONS.ops.map(s => ({ key: s.key, label: s.label }))}
          activeKey={section}
          onSelect={onSection}
        />
      </div>

      {section === 'server' && (
        <CellGrid>
          <Cell title="이 화면의 정체" flush>
            <div className="px-1">
              <DataTable>
                <tbody>
                  <Meta k="릴리즈 버전" v={APP_VERSION}
                        hint="package.json과 version.ts가 같은 값이에요. 릴리즈 때만 올려요. 운영에서 낡은 탭을 막는 기준(426)이에요." />
                  <Meta k="빌드 식별자" v={BUILD_LABEL}
                        hint="이미지 빌드의 커밋 SHA(BUILD_ID)예요. 스테이징·개발 배포에서 낡은 탭을 막는 기준(426)이에요." />
                  <Meta k="배포 주소" v={readAdminDeployHost() ?? '로컬 모드'}
                        hint="이 화면이 붙은 서버의 호스트예요. 운영과 스테이징의 주소가 달라서 착오를 막으려고 보여 줘요." />
                </tbody>
              </DataTable>
            </div>
          </Cell>

          <Cell title="권한">
            {access === 'local' && <Note className="my-0">클라우드가 설정되지 않아서 로컬 모드에서는 관리자 데이터가 없어요.</Note>}
            {access === 'granted' && (
              <Note className="my-0">
                <span className="pf-accent text-gold">{role === 'maintainer' ? '운영자 세션' : '관리자 세션'}</span>이에요.
                {role === 'maintainer'
                  ? ' 직접 개인정보(이메일·가입/로그인 메타)를 제외한 모든 게임 내 운영 기능을 동일하게 사용해요.'
                  : ' 모든 뷰와 직접 개인정보를 볼 수 있어요.'}
              </Note>
            )}
          </Cell>

          {viewMode === 'detail' && (
            <>
              <Cell title="관측">
                <Note className="my-0 leading-relaxed">
                  게임 데이터는 이 대시보드로, 예외는 Sentry로, 서버와 배포는 클러스터(ArgoCD)로 봐요.
                  Sentry의 release는 위 릴리즈 버전과 같아요. 서버 예외는 reportServerIssue로 Sentry에 올라가요.
                </Note>
              </Cell>

              <Cell title="데이터 계약">
                <Note className="my-0 leading-relaxed">
                  쓰기는 우편 발송, 편지 처리 표시, 공지·쿠폰 관리, 제재·해제, 무결성 오탐 해제, 세션 강제 종료 및 본인 채팅 운영진 별 표기 토글이에요.
                  모든 운영 조치는 행위자 식별자와 함께 감사 로그에 기록돼요.
                </Note>
              </Cell>
            </>
          )}

          <HttpMetricsOpsSection granted={access === 'granted'} />

          <ServerHealthSection granted={access === 'granted'} />
        </CellGrid>
      )}

      {section === 'client' && (
        <CellGrid>
          <ClientMetricsSection granted={access === 'granted'} />
        </CellGrid>
      )}

      {section === 'changelog' && (
        <CellGrid>
          <ChangelogSection />
        </CellGrid>
      )}

      {section === 'catalog' && (
        <>
          <ContentTab embedded />
          {viewMode === 'detail' && (
            <CellGrid>
              <EventCatalog />
            </CellGrid>
          )}
        </>
      )}
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

/** 이벤트 카탈로그 — 액션 리듀서와 관리자 조치가 남기는 유형의 사람용 목차다. */
function EventCatalog() {
  return (
    <Cell title="events 스트림 카탈로그" className="xl:col-span-2" flush>
      <Note size="2xs" className="my-0 px-3 pt-2">
        이벤트 식별자는 게임 동작 기록을 따르고, 화면명은 이벤트 설명 카탈로그를 보여 줘요.
        admin으로 시작하는 유형은 이 대시보드의 관리 조치예요.
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
    </Cell>
  );
}
