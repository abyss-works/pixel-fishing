// 진행 탭 — 콘텐츠가 어디서 답답한지. 레이아웃: [배 단계 | 낚싯대 레벨] 좌우(xl) →
// [지역 도달] → [게이트 정체 목록]. **밸런스 숫자는 data/boats.ts를 재사용**한다 —
// 대시보드에 임계값을 새로 두지 않는다(이중 구현 금지 원칙, actions.ts 머리 주석과 같은 판단).
import { useEffect, useMemo, useState } from 'react';
import DataTable from '../../ui/DataTable';
import SectionTitle from '../../ui/SectionTitle';
import { fmtNum } from '../metrics';
import { api } from '../../api';
import type { AdminUserRow } from '../../api';
import { useAdminAuth } from '../accessContext';
import { REGION_NAMES, REGION_ORDER } from '../regions';
import { BarsChart, Frame, TabState } from '../charts';
import { BOATS, boatNameOf } from '../../data/boats';

// 지역 표기는 admin/regions.ts 공용(라이브 탭과 공유) — world 마스크 데이터를 끌지 않기 위한 리터럴 미러.
// 도달 퍼널은 REGION_ORDER 그대로 쓴다.
export default function ProgressionTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);

  const run = () =>
    (async () => {
      setUsers(await api.admin.users());
    })().then(() => setLoading(false),
              e => { setError(String(e?.message ?? e)); setLoading(false); });

  useEffect(() => {
    // granted가 된 순간 조회 — 그 전엔 빈 골격만
    if (!granted) { setLoading(false); return; }
    void run();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 판정 완료 시점 실행
  }, [granted]);

  // 배 단계 히스토그램 — 맨발(0)부터 최종 등급까지
  const boatHist = useMemo(() => {
    const buckets = Array.from({ length: BOATS.length + 1 }, (_, t) =>
      users.filter(u => (u.boat ?? 0) === t).length);
    return {
      values: buckets,
      labels: buckets.map((_, t) => t === 0 ? '맨발' : `T${t}`),
      legend: buckets.map((v, t) => ({ name: t === 0 ? '맨발' : `${t} ${boatNameOf(t)}`, count: v })),
    };
  }, [users]);

  // 낚싯대 레벨 분포 — 존재하는 최소~최대 범위만 그린다
  const rodHist = useMemo(() => {
    const rods = users.map(u => u.rod ?? 1).filter(v => v >= 1);
    if (rods.length === 0) return { values: [] as number[], labels: [] as string[], min: 1 };
    const min = Math.min(...rods), max = Math.max(...rods);
    const values: number[] = [];
    for (let lv = min; lv <= max; lv++) values.push(rods.filter(r => r === lv).length);
    return { values, labels: values.map((_, i) => `${min + i}`), min };
  }, [users]);

  // 지역 도달 퍼널 — state.visited 기반("가본 적 있는 곳", 현재 위치 아님)
  const regionReach = useMemo(() => REGION_ORDER.map(id => ({
    id,
    users: users.filter(u => (u.visited ?? []).includes(id)).length,
  })), [users]);

  // 게이트 정체 — 다음 배의 명성 하한을 못 넘은 유저(부족량 내림차순)
  const stalled = useMemo(() => {
    const out: { user: AdminUserRow; next: typeof BOATS[number]; deficit: number }[] = [];
    for (const u of users) {
      const next = BOATS.find(b => b.tier === (u.boat ?? 0) + 1);
      if (!next) continue;
      const fame = toNum(u.fame);
      if (!(fame < next.fameReq)) continue;
      out.push({ user: u, next, deficit: next.fameReq - fame });
    }
    return out.sort((a, b) => b.deficit - a.deficit);
  }, [users]);

  return (
    <div className="flex flex-col gap-3">
      <TabState loading={loading && granted} error={error} onRetry={run} />

      {/* 분포 셋 — 같은 성격(히스토그램)이라 xl 이상에선 짝지어 나란히 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
        <Frame title="배 단계">
          <BarsChart values={boatHist.values} labels={boatHist.labels} height={72} />
          <p className="text-2xs text-text-dim">
            {granted
              ? (boatHist.legend.filter(l => l.count > 0)
                  .map(l => `${l.name} ${l.count}`).join(' · ') || '데이터 없음')
              : '운영 DB 연결 후 채워진다.'}
          </p>
        </Frame>

        <Frame title="낚싯대 레벨">
          {rodHist.values.length > 0 ? (
            <>
              <BarsChart values={rodHist.values}
                         labels={rodHist.labels.map((l, i) =>
                           i % Math.ceil(rodHist.labels.length / 8) === 0 ? l : null)}
                         height={72} />
              <p className="text-2xs text-text-dim">
                Lv{rodHist.min} ~ Lv{rodHist.min + rodHist.values.length - 1}
              </p>
            </>
          ) : (
            <p className="text-2xs text-text-dim">
              {granted ? '데이터 없음' : '운영 DB 연결 후 채워진다.'}
            </p>
          )}
        </Frame>
      </div>

      <Frame title="지역 도달 (visited 기준)">
        <div className="flex items-end gap-4 flex-wrap px-1 pt-1">
          {regionReach.map(r => (
            <div key={r.id} className="text-center min-w-[64px]">
              <div className="h-[72px] flex items-end justify-center">
                <div className="w-14 rounded-t-[2px] bg-gold/80"
                     style={{ height:
                       `${Math.max(users.length ? (r.users / users.length) * 100 : 0,
                                   r.users > 0 ? 4 : 1)}%` }} />
              </div>
              <div className="text-2xs mt-1">{REGION_NAMES[r.id]}</div>
              <div className="text-2xs text-text-dim">{r.users}/{users.length}</div>
            </div>
          ))}
        </div>
        <p className="text-2xs text-text-dim">
          "가본 적 있는 지역" 집계다 — 현재 위치가 아니라 state.visited 기반.
          {' '}{!granted && '운영 DB 연결 후 채워진다.'}
        </p>
      </Frame>

      <section>
        <SectionTitle>배 명성 게이트 — 막힌 유저</SectionTitle>
        {!granted ? (
          <p className="text-2xs text-text-dim my-1">운영 DB 연결 후 채워진다.</p>
        ) : stalled.length === 0 ? (
          <p className="text-2xs text-text-dim my-1">모두 다음 배 하한을 통과 중이다.</p>
        ) : (
          <DataTable>
            <thead>
              <tr><th className="text-left">유저</th><th className="text-left">다음 배</th>
                  <th className="text-right">명성</th><th className="text-right">요구</th>
                  <th className="text-right">부족</th></tr>
            </thead>
            <tbody>
              {stalled.map(({ user, next, deficit }) => (
                <tr key={user.user_id}>
                  <td>{user.email ?? <span className="font-mono text-2xs text-text-dim">{user.user_id.slice(0, 8)}…</span>}</td>
                  <td className="text-xs">{next.name}(T{next.tier})</td>
                  <td className="text-right">{fmtNum(toNum(user.fame))}</td>
                  <td className="text-right text-text-dim">{fmtNum(next.fameReq)}</td>
                  <td className="text-right pf-accent text-gold">{fmtNum(deficit)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>
    </div>
  );
}

function toNum(v: number | string | null): number {
  return v === null ? NaN : Number(v);
}
