// 이상탐지 탭 — ops/queries-audit.sql의 상시 감시 절(⑤⑥⑦④ + 제재 현황). 운영은 여기 +
// Sentry 두 곳으로 관측한다. 레이아웃: 행동 이상(연타 | PERFECT) 좌우 → 기록 이상(반입 | 도감 차액)
// 좌우 → 제재 현황 풀폭. 판정 기준(gap<2초 등)은 balance.ts·audit SQL의 근거를 문구로 옮긴 것.
import { useEffect, useMemo, useState } from 'react';
import DataTable from '../../ui/DataTable';
import Note from '../../ui/Note';
import SectionTitle from '../../ui/SectionTitle';
import { cx } from '../../ui/cx';
import { fmtNum, fmtDT } from '../metrics';
import { api } from '../../api';
import type {
  AdminUserRow, AdminSpamFlagRow, AdminImportLogRow, AdminDexMismatchRow,
} from '../../api';
import { useAdminAuth } from '../accessContext';
import { Frame, TabState } from '../charts';

export default function AntiAbuseTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [flags, setFlags] = useState<AdminSpamFlagRow[]>([]);
  const [imports, setImports] = useState<AdminImportLogRow[]>([]);
  const [mismatch, setMismatch] = useState<AdminDexMismatchRow[]>([]);

  const run = () =>
    (async () => {
      // 유저 명부는 "uid → 식별" 라벨 풀로 쓴다 — 플래그 행에는 개인정보를 조인해 둘 수 없다
      const [us, f, imps, mis] = await Promise.all([
        api.admin.users(), api.admin.spamFlags(), api.admin.imports(), api.admin.dexMismatch(),
      ]);
      setUsers(us);
      setFlags(f);
      setImports(imps);
      setMismatch(mis);
    })().then(() => setLoading(false),
              e => { setError(String(e?.message ?? e)); setLoading(false); });

  useEffect(() => {
    // granted가 된 순간 조회 — 그 전엔 빈 골격만
    if (!granted) { setLoading(false); return; }
    void run();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 판정 완료 시점 실행
  }, [granted]);

  const labelOf = (uid: string): string => {
    const u = users.find(x => x.user_id === uid);
    return u?.email ?? `${uid.slice(0, 8)}…`;
  };

  const spamUsers = useMemo(() =>
    flags.filter(f => f.fast_gap_7d > 0).sort((a, b) => b.fast_gap_7d - a.fast_gap_7d), [flags]);
  const perfectOutliers = useMemo(() => {
    const globalPct = flags[0]?.perfect_pct_global ?? null;
    if (globalPct === null) return [];
    // 정상 밴드: 전체 평균 +40%p — 도입 초기 극소 표본 대비 완화치(audit ⑥의 상시 관측 의도)
    return flags
      .filter(f => f.catches_7d >= 20 && (f.perfect_pct ?? 0) > globalPct + 40)
      .sort((a, b) => (b.perfect_pct ?? 0) - (a.perfect_pct ?? 0));
  }, [flags]);
  const restricted = users.filter(u => u.restricted === true);

  return (
    <div className="flex flex-col gap-3">
      <TabState loading={loading && granted} error={error} onRetry={run} />

      {!granted && (
        <Note>운영 DB 연결 또는 admins 등록 후 채워진다. 화면 구성은 아래와 같다.</Note>
      )}

      {/* 행동 이상 — 캐시 타이밍/판정율은 같은 "플레이 행위" 축이라 나란히 본다 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
        <Frame title="연타 (캐치 간격 &lt;2초 · 최근 7일)">
          <p className="text-2xs text-text-dim">
            입질 하한 1초 + 스윕 1.4초라 인간은 물리적으로 못 만드는 간격. 서버에 레이트 리밋이
            없어 **간격 분포가 유일한 방어 관측점**(audit ⑤).
          </p>
          <DataTable>
            <thead>
              <tr><th className="text-left">유저</th><th className="text-right">7일 캐치</th>
                  <th className="text-right">연타 건수</th></tr>
            </thead>
            <tbody>
              {spamUsers.map(f => (
                <tr key={f.user_id}>
                  <td>{labelOf(f.user_id)}</td>
                  <td className="text-right">{f.catches_7d}</td>
                  <td className={cx('text-right pf-accent',
                                    f.fast_gap_7d > 10 ? 'text-danger' : 'text-gold')}>
                    {f.fast_gap_7d}
                  </td>
                </tr>
              ))}
              {spamUsers.length === 0 &&
                <tr><td colSpan={3} className="text-text-dim text-center py-2">
                  {granted ? '정상 — 연타 없음.' : '—'}
                </td></tr>}
            </tbody>
          </DataTable>
        </Frame>

        <Frame title="PERFECT 판정 비율 이상치 (7일)">
          <p className="text-2xs text-text-dim">
            30일 전체 평균 {(flags[0]?.perfect_pct_global ?? '—')}%.
            PERFECT ×2는 클라 주장(의도된 구멍)이라 비율 감시가 유일한 대응이다(20캐치 이상).
          </p>
          <DataTable>
            <thead>
              <tr><th className="text-left">유저</th><th className="text-right">7일 PERFECT%</th>
                  <th className="text-right">30일 전체%</th><th className="text-right">7일 캐치</th></tr>
            </thead>
            <tbody>
              {perfectOutliers.map(f => (
                <tr key={f.user_id}>
                  <td>{labelOf(f.user_id)}</td>
                  <td className="text-right text-danger pf-accent">{f.perfect_pct}%</td>
                  <td className="text-right text-text-dim">{f.perfect_pct_global}%</td>
                  <td className="text-right">{f.catches_7d}</td>
                </tr>
              ))}
              {perfectOutliers.length === 0 &&
                <tr><td colSpan={4} className="text-text-dim text-center py-2">
                  {granted ? '이상치 없음.' : '—'}
                </td></tr>}
            </tbody>
          </DataTable>
        </Frame>
      </div>

      {/* 기록 이상 — 원장 위변조 흔적 두 축 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
        <Frame title="이사 코드 반입 로그">
          <Note tone="warn">
            import는 검증 없이 수입되는 **운영자 전용** 경로다(2026-08-24 악용 사고).
            여기 행이 생기면 반입 시각·들여온 자산을 즉시 본다. 제재 절차는 운영 쿼리로 한다.
          </Note>
          <DataTable>
            <thead>
              <tr><th className="text-left">시각</th><th className="text-left">유저</th>
                  <th className="text-right">골드</th><th className="text-right">명성</th></tr>
            </thead>
            <tbody>
              {imports.map(r => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{fmtDT(r.created_at)}</td>
                  <td>{labelOf(r.user_id)}</td>
                  <td className="text-right pf-accent text-gold">{fmtNum(toNum(r.gold))}</td>
                  <td className="text-right pf-accent text-gold">{fmtNum(toNum(r.fame))}</td>
                </tr>
              ))}
              {imports.length === 0 &&
                <tr><td colSpan={4} className="text-text-dim text-center py-2">
                  {granted ? '반입 이력 없음.' : '—'}
                </td></tr>}
            </tbody>
          </DataTable>
        </Frame>

        <Frame title="도감↔이벤트 차액 상위">
          <p className="text-2xs text-text-dim">
            v0.5.0 이전 플레이분은 정상적으로 차액이 난다(events 제도 이전).
            그 <span className="pf-accent text-gold">이후 가입</span> 계정의 큰 차액만 위작 후보다.
          </p>
          <DataTable>
            <thead>
              <tr><th className="text-left">유저</th><th className="text-left">어종/폼</th>
                  <th className="text-right">차액</th></tr>
            </thead>
            <tbody>
              {[...mismatch]
                .sort((a, b) => b.missing_events - a.missing_events).slice(0, 15)
                .map((m, i) => (
                  <tr key={`${m.user_id}/${m.fish_id}/${m.form}/${i}`}>
                    <td>{labelOf(m.user_id)}</td>
                    <td className="font-mono text-2xs">{m.fish_id}/{m.form}</td>
                    <td className="text-right pf-accent text-gold">+{m.missing_events}</td>
                  </tr>
                ))}
              {mismatch.length === 0 &&
                <tr><td colSpan={3} className="text-text-dim text-center py-2">
                  {granted ? '차액 없음.' : '—'}
                </td></tr>}
            </tbody>
          </DataTable>
        </Frame>
      </div>

      <section>
        <SectionTitle>제재 계정</SectionTitle>
        {!granted || restricted.length === 0 ? (
          <p className="text-2xs text-text-dim my-1">
            {granted ? '활성 제재 없음.' : '운영 DB 연결 후 확인한다.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {restricted.map(u => (
              <li key={u.user_id}
                  className="border border-danger/40 rounded-sm px-2 py-1 text-xs select-text">
                <span className="pf-accent text-danger">{labelOf(u.user_id)}</span>
                {' '}— 골드 {fmtNum(toNum(u.gold))} · 명성 {fmtNum(toNum(u.fame))} ·
                마지막 행동 {fmtDT(u.last_action_at)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** number|string|null(DB 스칼라) → 숫자 — 표기 전용 */
const toNum = (v: number | string | null): number =>
  v === null ? NaN : Number(v);
