// 개요 탭 — "살아 있는가 · 이상한 일이 진행 중인가"를 한 화면으로.
// 레이아웃(사용자 지시 반영): [KPI 격자 5] 아래 본문을 좌우 분할
//   좌 = 최근 이벤트 피드(넓게 스크롤) / 우 = 위험 신호 카드열(제재·연타·반입).
// Note 텍스트에 묻혔던 위험 신호가 우측 고정 카드로 승격됐다.
import { useEffect, useState } from 'react';
import DataTable from '../../ui/DataTable';
import { cx } from '../../ui/cx';
import { fmtNum, fmtDT, EVENT_LABELS, eventSummary } from '../metrics';
import { api } from '../../api';
import type {
  AdminUserRow, AdminSpamFlagRow, AdminImportLogRow, AdminEventRow,
} from '../../api';
import { useAdminAuth } from '../accessContext';
import { KpiCard, KpiGrid, Frame, TabState } from '../charts';

const DAYS = 30;

export default function OverviewTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [dauToday, setDauToday] = useState<number | null>(null);
  const [wau7, setWau7] = useState<number | null>(null);
  const [catch7d, setCatch7d] = useState<number | null>(null);
  const [recent, setRecent] = useState<AdminEventRow[]>([]);
  const [flags, setFlags] = useState<AdminSpamFlagRow[]>([]);
  const [imports, setImports] = useState<AdminImportLogRow[]>([]);

  const run = () =>
    (async () => {
      // 부분 실패는 하나의 에러로 묶인다 — 개요 카드는 전부 함께 있어야 의미가 있다
      const [us, daily, quality, recentRows, flagRows, importRows] = await Promise.all([
        api.admin.users(), api.admin.dailyActive(DAYS), api.admin.catchQuality(DAYS),
        api.admin.recentEvents(), api.admin.spamFlags(), api.admin.imports(),
      ]);
      setUsers(us);
      setDauToday(daily[0]?.dau ?? null);
      setWau7(daily[0]?.wau7 ?? null);
      setCatch7d(quality.slice(0, 7).reduce((s, r) => s + r.catches, 0));
      setRecent(recentRows);
      setFlags(flagRows);
      setImports(importRows);
    })().then(() => setLoading(false),
              e => { setError(String(e?.message ?? e)); setLoading(false); });

  useEffect(() => {
    // granted가 된 순간 1회 조회 — 그 전엔 빈 골격만(조회하지 않는다)
    if (!granted) { setLoading(false); return; }
    void run();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 판정 완료 시점 실행
  }, [granted]);

  // 위험 신호 집계 — 이상탐지 탭 가기 전에 개요에서 선보인다
  const restrictedCount = users.filter(u => u.restricted === true).length;
  const spamUsers = flags.reduce((s, f) => s + (f.fast_gap_7d > 0 ? 1 : 0), 0);
  const riskTotal = restrictedCount + spamUsers + imports.length;

  return (
    <div className="flex flex-col gap-3">
      <KpiGrid>
        <KpiCard label="등록 유저" value={fmtNum(users.length)} />
        <KpiCard label="금일 DAU" value={dauToday === null ? '—' : fmtNum(dauToday)}
                 hint={`최근 7일 WAU ${wau7 === null ? '—' : fmtNum(wau7)}`} />
        <KpiCard label="최근 7일 낚시" value={catch7d === null ? '—' : fmtNum(catch7d)}
                 hint="catch 이벤트 합계" />
        <KpiCard label="보유 골드 합" value={fmtNum(users.reduce((s, u) => s + toNum(u.gold), 0))} />
        <KpiCard label="명성 합" value={fmtNum(users.reduce((s, u) => s + toNum(u.fame), 0))} />
      </KpiGrid>

      <TabState loading={loading && granted} error={error} onRetry={run} />

      {/* 좌: 피드(1fr) / 우: 위험 신호 카드열(고정폭) — xl 미만에서는 세로 적층 */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-3 items-start">
        <Frame title="최근 이벤트 피드">
          <div className="max-h-[420px] overflow-y-auto">
            <DataTable>
              <thead>
                <tr><th className="text-left">시각</th><th className="text-left">유형</th>
                    <th className="text-left">유저</th><th className="text-left">내용</th></tr>
              </thead>
              <tbody>
                {recent.map(e => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap text-text-dim">{fmtDT(e.created_at)}</td>
                    <td className="whitespace-nowrap">
                      <span className={cx('pf-accent', RISKY.has(e.type) ? 'text-danger' : 'text-gold')}>
                        {EVENT_LABELS[e.type] ?? e.type}
                      </span>
                    </td>
                    <td className="font-mono text-2xs text-text-dim max-w-[120px] truncate"
                        title={e.user_id}>{shortUid(e.user_id)}</td>
                    <td className="max-w-[260px] truncate text-xs">{eventSummary(e.type, e.payload)}</td>
                  </tr>
                ))}
                {recent.length === 0 &&
                  <tr><td colSpan={4} className="text-text-dim text-center py-3">
                    {granted ? '아직 이벤트가 없다.' : '운영 DB 연결 후 채워진다.'}
                  </td></tr>}
              </tbody>
            </DataTable>
          </div>
        </Frame>

        <div className="flex flex-col gap-2">
          <RiskCard label="제재 계정" count={restrictedCount}
                    hint="saves_current.restricted 플래그 — 활동 403 차단 중"
                    tone={restrictedCount > 0 ? 'danger' : undefined} />
          <RiskCard label="연타 플래그 유저" count={spamUsers}
                    hint="최근 7일 캐치 간격 <2초 — 물리적으로 불가한 연타"
                    tone={spamUsers > 0 ? 'warn' : undefined} />
          <RiskCard label="이사 코드 반입" count={imports.length}
                    hint="import 액션 원장 — 운영자 전용 경로의 흔적"
                    tone={imports.length > 0 ? 'warn' : undefined} />
          {riskTotal > 0 && (
            <p className="text-2xs text-text-dim px-1">
              상세 판독은 <span className="pf-accent text-gold">이상탐지</span> 탭에서.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// 위험 신호 카드 — 숫자 하나 + 근거 한 줄. 클릭 없음(탐색은 탭으로 한다)
function RiskCard({ label, count, hint, tone }: {
  label: string; count: number; hint: string;
  tone?: 'warn' | 'danger';
}) {
  const active = count > 0;
  return (
    <div className={cx('pf-frame px-3 py-2',
                       tone === 'danger' && active && 'border-danger/50',
                       tone === 'warn' && active && 'border-gold/40')}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs">{label}</span>
        <span className={cx('text-lg pf-accent',
                            !active ? 'text-text-dim'
                            : tone === 'danger' ? 'text-danger' : 'text-gold')}>
          {fmtNum(count)}
        </span>
      </div>
      <p className="text-2xs text-text-dim leading-snug mt-0.5">{hint}</p>
    </div>
  );
}

// 위험 주시 대상 이벤트 — 피드에서 즉시 눈에 밟히게
const RISKY = new Set(['import', 'adminSet']);

/** number|string|null(DB 스칼라) → 숫자 — 표기 전용 */
const toNum = (v: number | string | null): number =>
  v === null ? NaN : Number(v);

const shortUid = (uid: string): string => uid.slice(0, 8);
