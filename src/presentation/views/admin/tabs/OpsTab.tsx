// 운영·콘텐츠 탭 — 서버·실시간, 클라이언트, 변경 기록, 콘텐츠 카탈로그 4개 하위 구역으로 나눈다.
// 기간 범위(7|14|30)와 새로고침은 OpsTab의 subnavExtra 한 곳에만 둔다.
import { useEffect, useMemo, useRef, useState } from 'react';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import { APP_VERSION } from '../../../../version';
import { BUILD_LABEL } from '../../../../buildId';
import { readAdminDeployHost } from '../../../../features/admin/service/queries';
import { EVENT_LABELS, fmtNum } from '../../../../features/admin/model/metrics';
import { selectHttpMetricsView } from '../../../../features/admin/model/httpMetrics';
import { selectOpsHealthView } from '../../../../features/admin/model/opsHealth';
import { useAdminHttpMetrics, useAdminOpsHealth } from '../../../../features/admin/service/useAdminStats';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import type { AdminAccess } from '../../../../features/admin/service/accessContext';
import { AdminCard, AdminKpiCard, AdminKpiGrid, AdminQueueItem, AdminSplit, AdminSubnavExtra, AdminTableWrap } from '../layout';
import type { OpsSection } from '../routes';
import { useAdminViewMode } from '../viewMode';
import MetricSwitch from '../widgets/MetricSwitch';
import ChangelogSection from './ChangelogSection';
import ClientMetricsSection from './ClientMetricsSection';
import ContentTab from './ContentTab';
import { HttpMetricsOpsSection } from './HttpMetricsSection';
import ServerHealthSection from './ServerHealthSection';

type OpsRange = '7' | '14' | '30';
const OPS_RANGE_OPTIONS: readonly { key: OpsRange; label: string }[] = [
  { key: '7', label: '7일' },
  { key: '14', label: '14일' },
  { key: '30', label: '30일' },
];

export default function OpsTab({
  section = 'server',
}: {
  section?: OpsSection;
  onSection?: (section: OpsSection) => void;
} = {}) {
  const { access, role } = useAdminAuth();
  const granted = access === 'granted';
  const { viewMode } = useAdminViewMode();
  const [range, setRange] = useState<OpsRange>('7');
  const [refreshSignal, setRefreshSignal] = useState(0);
  const days = Number(range);

  const showRangeControls = section === 'server' || section === 'client';

  return (
    <div className="flex flex-col gap-3">
      {showRangeControls && (
        <AdminSubnavExtra>
          <MetricSwitch
            value={range}
            options={OPS_RANGE_OPTIONS}
            onChange={setRange}
            ariaLabel="운영 기간 선택"
          />
          <Button
            size="sm"
            disabled={!granted}
            onClick={() => setRefreshSignal(s => s + 1)}
          >
            새로고침
          </Button>
        </AdminSubnavExtra>
      )}

      {section === 'server' && (
        <ServerSectionBody
          granted={granted}
          access={access}
          role={role}
          days={days}
          refreshSignal={refreshSignal}
          viewMode={viewMode}
        />
      )}

      {section === 'client' && (
        <ClientMetricsSection
          granted={granted}
          days={days}
          refreshSignal={refreshSignal}
          mode={viewMode}
        />
      )}

      {section === 'changelog' && <ChangelogSection />}

      {section === 'catalog' && (
        <>
          <ContentTab embedded />
          {viewMode === 'detail' && <EventCatalog />}
        </>
      )}
    </div>
  );
}

function ServerSectionBody({
  granted,
  access,
  role,
  days,
  refreshSignal,
  viewMode,
}: {
  granted: boolean;
  access: AdminAccess;
  role: string;
  days: number;
  refreshSignal: number;
  viewMode: 'summary' | 'detail';
}) {
  const http = useAdminHttpMetrics(days);
  const health = useAdminOpsHealth(days);
  const refreshHttp = http.refresh;
  const refreshHealth = health.refresh;
  const lastSignalRef = useRef(refreshSignal);

  useEffect(() => {
    if (refreshSignal !== lastSignalRef.current) {
      lastSignalRef.current = refreshSignal;
      refreshHttp();
      refreshHealth();
    }
  }, [refreshSignal, refreshHttp, refreshHealth]);

  const httpView = useMemo(() => selectHttpMetricsView(http.data, days), [http.data, days]);
  const healthView = useMemo(() => selectOpsHealthView(health.data), [health.data]);

  const status5xx = httpView.summary.status5xx ?? 0;
  const status429 = httpView.summary.status429 ?? 0;
  const poolWaiting = healthView.database.poolWaiting ?? 0;

  const apiTone = !granted || !http.data
    ? 'dim'
    : status5xx > 0
      ? 'danger'
      : status429 > 0
        ? 'warn'
        : 'ok';
  const apiLabel = !granted || !http.data
    ? '--'
    : status5xx > 0
      ? '주의'
      : '정상';

  const dbTone = !granted || !health.data
    ? 'dim'
    : poolWaiting > 0
      ? 'warn'
      : 'ok';
  const dbLabel = !granted || !health.data
    ? '--'
    : poolWaiting > 0
      ? '주의'
      : '정상';

  const wsTone = !granted || !health.data
    ? 'dim'
    : healthView.ws.closeAbnormal > 0
      ? 'warn'
      : 'ok';
  const wsLabel = !granted || !health.data
    ? '--'
    : healthView.ws.closeAbnormal > 0
      ? '주의'
      : '정상';

  const hasCritAlert = healthView.alerts.some(a => a.severity === 'crit');
  const runtimeTone = !granted || !health.data
    ? 'dim'
    : hasCritAlert
      ? 'danger'
      : healthView.alerts.length > 0
        ? 'warn'
        : 'ok';
  const runtimeLabel = !granted || !health.data
    ? '--'
    : hasCritAlert
      ? '위험'
      : healthView.alerts.length > 0
        ? '주의'
        : '정상';

  const topAlert = healthView.alerts[0] ?? null;

  return (
    <>
      <AdminKpiGrid cols={4}>
        <AdminKpiCard
          label="API 상태"
          value={apiLabel}
          sub={http.data && httpView.summary.total !== null
            ? `요청 ${fmtNum(httpView.summary.total)}건 / p95 ${httpView.summary.latency.p95Text}`
            : `최근 ${days}일 HTTP`}
          tone={apiTone}
        />
        <AdminKpiCard
          label="데이터베이스"
          value={dbLabel}
          sub={health.data
            ? `풀 ${healthView.database.poolCompactText} / 연결 ${healthView.database.activeConnectionsText}`
            : '연결 풀 대기'}
          tone={dbTone}
        />
        <AdminKpiCard
          label="실시간 채널"
          value={wsLabel}
          sub={health.data
            ? `접속 ${healthView.ws.onlineCountText} / 비정상율 ${healthView.ws.abnormalRateText}`
            : 'WebSocket 상태'}
          tone={wsTone}
        />
        <AdminKpiCard
          label="런타임·오류"
          value={runtimeLabel}
          sub={health.data
            ? `가동 ${healthView.runtime.uptimeText} / 경보 ${healthView.alerts.length}건`
            : '런타임 대기'}
          tone={runtimeTone}
        />
      </AdminKpiGrid>

      {granted && topAlert && (
        <AdminQueueItem tone={topAlert.severity === 'crit' ? 'urgent' : 'warn'}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone={topAlert.severity === 'crit' ? 'danger' : 'orange'} size="xs">
              {topAlert.severityLabel}
            </Badge>
            <strong className="text-text">{topAlert.title}</strong>
            <span className="text-text-dim">{topAlert.detail}</span>
          </div>
          {healthView.alerts.length > 1 && (
            <Badge tone="dim" size="2xs">{`외 ${healthView.alerts.length - 1}건`}</Badge>
          )}
        </AdminQueueItem>
      )}

      {viewMode === 'detail' && (
        <>
          <AdminSplit variant="2">
            <AdminCard title="이 화면의 정체">
              <AdminTableWrap>
                <DataTable className="pf-admin-table">
                  <tbody>
                    <Meta
                      k="릴리즈 버전"
                      v={APP_VERSION}
                      hint="package.json과 version.ts가 같은 값이에요. 릴리즈 때만 올려요. 운영에서 낡은 탭을 막는 기준(426)이에요."
                    />
                    <Meta
                      k="빌드 식별자"
                      v={BUILD_LABEL}
                      hint="이미지 빌드의 커밋 SHA(BUILD_ID)예요. 스테이징과 개발 배포에서 낡은 탭을 막는 기준(426)이에요."
                    />
                    <Meta
                      k="배포 주소"
                      v={readAdminDeployHost() ?? '로컬 모드'}
                      hint="이 화면이 붙은 서버의 호스트예요. 운영과 스테이징의 주소가 달라서 착오를 막으려고 보여 줘요."
                    />
                  </tbody>
                </DataTable>
              </AdminTableWrap>
            </AdminCard>

            <AdminCard title="권한">
              {access === 'local' && <Note className="my-0">클라우드가 설정되지 않아서 로컬 모드에서는 관리자 데이터가 없어요.</Note>}
              {access === 'granted' && (
                <Note className="my-0">
                  <span className="pf-accent text-gold">{role === 'maintainer' ? '운영자 세션' : '관리자 세션'}</span>이에요.
                  {role === 'maintainer'
                    ? ' 직접 개인정보(이메일, 가입/로그인 메타)를 제외한 모든 게임 내 운영 기능을 동일하게 사용해요.'
                    : ' 모든 뷰와 직접 개인정보를 볼 수 있어요.'}
                </Note>
              )}
            </AdminCard>

            <AdminCard title="관측">
              <Note className="my-0 leading-relaxed">
                게임 데이터는 이 대시보드로, 예외는 Sentry로, 서버와 배포는 클러스터(ArgoCD)로 봐요.
                Sentry의 release는 위 릴리즈 버전과 같아요. 서버 예외는 reportServerIssue로 Sentry에 올라가요.
              </Note>
            </AdminCard>

            <AdminCard title="데이터 계약">
              <Note className="my-0 leading-relaxed">
                쓰기는 우편 발송, 편지 처리 표시, 공지·쿠폰 관리, 제재·해제, 무결성 오탐 해제, 세션 강제 종료 및 본인 채팅 운영진 별 표기 토글이에요.
                모든 운영 조치는 행위자 식별자와 함께 감사 로그에 기록돼요.
              </Note>
            </AdminCard>
          </AdminSplit>

          <HttpMetricsOpsSection granted={granted} days={days} refreshSignal={refreshSignal} />
          <ServerHealthSection granted={granted} days={days} refreshSignal={refreshSignal} />
        </>
      )}
    </>
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
    <AdminCard title="events 스트림 카탈로그">
      <div className="flex flex-col gap-2">
        <Note size="2xs" className="my-0">
          이벤트 식별자는 게임 동작 기록을 따르고, 화면명은 이벤트 설명 카탈로그를 보여 줘요.
          admin으로 시작하는 유형은 이 대시보드의 관리 조치예요.
        </Note>
        <AdminTableWrap scroll>
          <DataTable className="pf-admin-table">
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
        </AdminTableWrap>
      </div>
    </AdminCard>
  );
}
