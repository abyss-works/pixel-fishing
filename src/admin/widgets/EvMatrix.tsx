import { EV_AXES, DELTA_AXES } from '../balanceReport';
import type { DeltaAxisDef, EvAxisKey, SpotBalance } from '../balanceReport';
import DataTable from '../../ui/DataTable';
import MiniBar from './MiniBar';
import { cx } from '../../ui/cx';

type Metric = 'gold' | 'fame';
const UNIT = { gold: 'G', fame: '⭐' } as const;

/** Δ 셀 — 부호+색으로 방향, 소수 1자리. 0 근처는 dim */
function Delta({ v, unit }: { v: number; unit: string }) {
  const up = v > 0.05, down = v < -0.05;
  return (
    <span className={cx('pf-accent whitespace-nowrap',
                        up ? 'text-gold' : down ? 'text-danger' : 'text-text-dim')}>
      {up ? '+' : ''}{v.toFixed(1)}{unit}
    </span>
  );
}

// EV 매트릭스 — **한 화면에 다다익선**(사용자 지시):
//   [축 5열] 무판정 · GOOD · PERFECT · 방치×4 · 방치×10
//   [Δ 4열] 수동 대비 GOOD 증가분 · PERFECT 증가분 · 완전 방치 최소↔최대 간격 ·
//           전 지역 동일 지표(방치 평균) 대비 증가량
// 셀 안 미니 바는 같은 축 열 최댓값 기준 — 지역 간 급등이 눈으로 읽힌다.
export default function EvMatrix({ rows, metric }: {
  rows: SpotBalance[];
  metric: Metric;
}) {
  const unit = UNIT[metric];
  const colMax: Record<EvAxisKey, number> = Object.fromEntries(
    EV_AXES.map(a => [a.key,
      Math.max(...rows.map(r => r[metric][a.key]), Number.MIN_VALUE)]),
  ) as Record<EvAxisKey, number>;
  // DELTA_AXES의 마지막 축(idleAvgDelta)은 buildBalanceReport가 주입한다 — 모듈 로드 직후
  // build를 한 번 돌려야 compute가 존재한다(아래 배열 접근 전 보장).
  const deltas: readonly (DeltaAxisDef & { key: string })[] = (() => {
    void rows; // deps 문서화용
    return DELTA_AXES;
  })();

  return (
    <div>
      <DataTable>
        <thead>
          <tr>
            <th scope="col" rowSpan={2} className="whitespace-nowrap align-bottom">해역</th>
            {/* 그룹 헤더 — 정보의 계층(기대값 / 변화량)을 열 구조로 보여준다 */}
            {EV_AXES.length > 0 && (
              <th scope="colgroup" colSpan={EV_AXES.length}
                  className="text-center border-b border-gold">기대값 ({metric === 'gold' ? '골드' : '명성'})</th>
            )}
          </tr>
          <tr>
            {EV_AXES.map(a => (
              <th key={a.key} scope="col"
                  abbr={a.label} title={`${a.label} — ${a.hint}`}
                  className="whitespace-nowrap">{a.short}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">
                <div className="text-gold">{r.name}</div>
                <div className="text-2xs text-text-dim pf-accent">
                  P{r.powerReq} · 배{r.boatTier}
                </div>
              </td>
              {EV_AXES.map(a => (
                <td key={a.key}>
                  <span className="pf-accent whitespace-nowrap">
                    {r[metric][a.key].toFixed(1)}{unit}
                  </span>
                  <MiniBar ratio={r[metric][a.key] / colMax[a.key]} />
                </td>
              ))}
              {deltas.map(d => {
                const v = d.compute?.(r, null);
                return (
                  <td key={d.key}>
                    {v === null || !Number.isFinite(v)
                      ? <span className="text-text-dim">—</span>
                      : <Delta v={v} unit={unit} />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </DataTable>
      <p className="text-2xs text-text-dim mt-1">
        Δ 열: GOOD+/PERFECT+ = 무판정 대비 판정 보너스 · 방치 간격 = ×4↔×10 페널티 폭 ·
        방치평균 vs 전지역 = 이 해역 방치 평균 − 전체 평균.
      </p>
    </div>
  );
}
