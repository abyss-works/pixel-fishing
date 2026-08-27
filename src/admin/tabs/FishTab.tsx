import { Fragment, useMemo, useState } from 'react';
import {
  FISH, RARITY, RARITY_ORDER, SPOTS, drawRows, rarityWeightOf,
} from '../../game/logic';
import type { RarityId } from '../../game/logic';
import type { SpotId } from '../../data/spots';
import DataTable from '../../ui/DataTable';
import Note from '../../ui/Note';
import PixelIcon from '../../ui/PixelIcon';
import { FishSpriteThumb } from './FishSpriteThumb';
import { cx } from '../../ui/cx';

// 어종 탭 — **수역 단위 통합 대시보드**. 한 표 안에 편집과 통계가 같이 산다(사용자 지시:
// 어종별 데이터와 통계치를 분리하지 마라 — 수치를 조절하면 그 자리에서 즉시 읽히게).
//
//   [머리] 해역명 · 요구 파워 · 배 단계 · 축별 EV 요약 띠(5축 + 지역 내 Δ + Δ직전)
//   [본문] 어종 행 — 등급/예산·가격·개체가중치는 인라인 편집(오버라이드), 확률은 실시간
//   [바닥] 수역 초기화 버튼 (오버라이드가 있을 때만)
//
// 오버라이드는 저장 안 됨(새로고침 초기화). 확정 변경은 fish.ts·spots.ts 수정이 정본이다.

/** 시뮬레이션 오버라이드 — 컴포넌트 로컬 상태. sb* = 미확정 가안(JSON 추출에 함께 실린다) */
export interface SimOverrides {
  budgets: Record<string, Partial<Record<RarityId, number>>>;
  fishWeights: Record<string, Record<string, number>>;
  price: Record<string, number>;
}

/** 보상 축 — 다이얼 산식은 balanceReport.EV_AXES와 동일(common 축: rareMult=÷ / commonMult=×).
 *  **수동 3축과 자동 2축은 같은 선상이 아니다**(사용자 지적):
 *   수동 = 판정 사다리 — 한 번의 캐스트에서 유저가 고르는 등급. 지역내Δ를 직전 행 대비 %로
 *          연쇄한다(GOOD=무판정 대비, PERFECT=GOOD 대비) — "조금 더 잘 잡으면 얼마"의 척도.
 *   방치 = 같은 행위(자동 획득)의 파워 여유 시나리오 둘. 사다리가 아니라 **폭** 하나가 변화량이다:
 *          (×4 − ×10)/×10 — 여유를 확보하면 방치 소득이 몇 % 개선되는가.
 *   그래서 방치 두 행에는 개별 지역내Δ를 붙이지 않고, 폭 한 번만 마지막 행에 표기한다. */
const AXES = [
  { key: 'normal', label: '무판정', mult: {}, group: 'manual' },
  { key: 'good', label: 'GOOD', mult: { rareMult: 1.6 }, group: 'manual' },
  { key: 'perfect', label: 'PERFECT', mult: { rareMult: 2.0 }, group: 'manual' },
  { key: 'idleBest', label: '방치×4', mult: { commonMult: 4 }, group: 'idle' },
  { key: 'idleWorst', label: '방치×10', mult: { commonMult: 10 }, group: 'idle' },
] as const;
type AxisKey = typeof AXES[number]['key'];
type AxisEvs = Record<AxisKey, number>;

const SPOT_KEY = 'admin-spots-open';

/** 한 수역의 5축 EV — 오버라이드 반영 */
function spotAxisEvs(spot: SpotId, sim: SimOverrides): AxisEvs {
  const entry = Object.fromEntries(AXES.map(a => {
    const rows = drawRows(spot, { ...a.mult,
      budgets: sim.budgets[spot as string], fishWeights: sim.fishWeights[spot as string],
    }).map(r => ({ ...r, price: sim.price[r.fish.id] ?? r.fish.price }));
    let num = 0, den = 0;
    for (const r of rows) { num += r.fishPct * r.price; den += r.fishPct; }
    return [a.key, den > 0 ? num / den : 0];
  })) as AxisEvs;
  return entry;
}

/** Δ 셀 — **비율(%)이 본체**다(사용자 지시: 절대치는 꼭 필요한 곳만). prev=null은 '—' */
function Delta({ prev, cur }: { prev: number | null; cur: number }) {
  if (prev === null || !Number.isFinite(prev)) return <span className="text-text-dim">—</span>;
  const diff = cur - prev;
  const pct = prev !== 0 ? diff / Math.abs(prev) * 100 : null;
  if (Math.abs(diff) <= 0.05) return <span className="text-text-dim">±0</span>;
  const up = diff > 0;
  return (
    <span className={up ? 'text-gold pf-accent whitespace-nowrap'
                        : 'text-danger pf-accent whitespace-nowrap'}>
      {pct !== null ? `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%` : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}G`}
    </span>
  );
}

export default function FishTab() {
  const [sbBudgets, setSbBudgets] = useState<Record<string, Partial<Record<RarityId, number>>>>({});
  const [sbFish, setSbFish] = useState<Record<string, Record<string, number>>>({});
  const [sbPrice, setSbPrice] = useState<Record<string, number>>({});
  const sim: SimOverrides = { budgets: sbBudgets, fishWeights: sbFish, price: sbPrice };

  // 전체 5축 EV — 편집할 때마다 다시 계산(닫힌형이라 저렴한다)
  const evsBySpot = useMemo(() => new Map(
    SPOTS.map(s => [s.id as SpotId, spotAxisEvs(s.id as SpotId, sim)])),
  [sim]);

  const exportJson = async () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      spots: SPOTS.map(spot => ({
        id: spot.id, name: spot.name, boatTier: spot.boatTier,
        powerReq: spot.powerReq ?? null,
        rarityWeightOverride: spot.rarityWeight ?? null,
        simEV: AXES.reduce((acc, a) =>
          ({ ...acc, [a.key]: +(evsBySpot.get(spot.id)?.[a.key] ?? 0).toFixed(1) }), {}),
        fish: FISH.filter(f => f.spot === spot.id).map(f => ({
          id: f.id, name: f.name, rarity: f.rarity,
          price: f.price, sbPrice: sim.price[f.id] ?? null,
          budgetBase: rarityWeightOf(spot.id, f.rarity),
          sbBudget: sim.budgets[spot.id]?.[f.rarity] ?? null,
          individualWeight: f.weight ?? 1, sbWeight: sim.fishWeights[spot.id]?.[f.id] ?? null,
        })),
      })),
      notes: {
        drawModel: '2단 — 등급 예산(수역별 고정, 부재 등급 재균등) × 개체 균등 배분',
        dialAxes: 'commonMult=일반 예산 × / rareMult=일반 예산 ÷ (판정·방치 다이얼)',
        fieldsSbX: 'sb* = 관리자 화면의 미확정 오버라이드. null = 원본 값 사용 중',
        evAxes: `simEV keys = ${AXES.map(a => a.key).join('/')}`,
      },
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      window.alert('어종 현황 JSON을 클립보드에 복사했다.');
    } catch {
      console.log('pf-export', JSON.stringify(payload, null, 2));
      window.alert('클립보드 접근 실패 — 개발자 콘솔(pf-export)에서 복사하세요.');
    }
  };

  // 변화량(Δ)만 추출 — sb* ≠ null 인 항목만 모은다. 오버라이드 0건이면 빈 spots.
  const deltaCount = (() => {
    let n = 0;
    for (const spot of SPOTS) {
      n += Object.keys(sim.budgets[spot.id] ?? {}).length;
      n += Object.keys(sim.fishWeights[spot.id] ?? {}).length;
    }
    n += Object.keys(sim.price).length;
    return n;
  })();

  const exportDeltaJson = async () => {
    if (deltaCount === 0) {
      window.alert('변경된 항목이 없습니다 — Δ JSON은 비어 있습니다.');
      return;
    }
    const deltaSpots = SPOTS.map(spot => {
      const fishDeltas = FISH.filter(f => f.spot === spot.id)
        .map(f => {
          const sbPrice = sim.price[f.id] ?? null;
          const sbWeight = sim.fishWeights[spot.id]?.[f.id] ?? null;
          if (sbPrice === null && sbWeight === null) return null;
          return {
            id: f.id, name: f.name, rarity: f.rarity,
            ...(sbPrice !== null ? { price: sbPrice } : {}),
            ...(sbWeight !== null ? { weight: sbWeight } : {}),
          };
        })
        .filter(Boolean);

      const budgetDelta = sim.budgets[spot.id];
      const hasBudgetDelta = budgetDelta && Object.keys(budgetDelta).length > 0;
      const hasFishDelta = fishDeltas.length > 0;
      if (!hasBudgetDelta && !hasFishDelta) return null;

      return {
        id: spot.id, name: spot.name,
        ...(hasBudgetDelta ? { rarityWeightDelta: budgetDelta } : {}),
        ...(hasFishDelta ? { fish: fishDeltas } : {}),
        // 참고용 EV는 델타가 있는 수역만 포함 — 변화 체감 즉시 확인
        simEV: AXES.reduce((acc, a) =>
          ({ ...acc, [a.key]: +(evsBySpot.get(spot.id)?.[a.key] ?? 0).toFixed(1) }), {} as Record<string, number>),
      };
    }).filter(Boolean);

    const payload = {
      exportedAt: new Date().toISOString(),
      deltaOnly: true,
      changedFields: deltaCount,
      spots: deltaSpots,
      notes: {
        usage: 'Δ JSON — sb* ≠ null 인 항목만. 비어 있으면 spots=[]',
        fields: 'rarityWeightDelta = 수역 등급 예산 오버라이드(변경된 등급만), fish[].price/weight = 어종 확정값(변경된 어종만)',
      },
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      window.alert(`변화량 Δ JSON (${deltaCount}건)을 클립보드에 복사했다.`);
    } catch {
      console.log('pf-export-delta', JSON.stringify(payload, null, 2));
      window.alert('클립보드 접근 실패 — 개발자 콘솔(pf-export-delta)에서 복사하세요.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base text-gold">어종 · 수역 ({FISH.length}종 / {SPOTS.length}수역)</h2>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="변화량 Δ JSON 추출"
                  onClick={exportDeltaJson}
                  disabled={deltaCount === 0}
                  className="flex items-center gap-1 border rounded-sm px-2 py-1 text-xs
                             cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed
                             border-line text-text-dim hover:text-gold hover:border-gold
                             disabled:hover:text-text-dim disabled:hover:border-line">
            <PixelIcon glyph="download" size={12} />Δ JSON{deltaCount > 0 ? ` (${deltaCount})` : ''}
          </button>
          <button type="button" aria-label="어종 데이터 JSON 추출"
                  onClick={exportJson}
                  className="flex items-center gap-1 border border-line rounded-sm px-2 py-1 text-xs
                             text-text-dim hover:text-gold hover:border-gold cursor-pointer transition">
            <PixelIcon glyph="download" size={12} />현황 JSON
          </button>
        </div>
      </div>

      {/* 수역별 통합 대시보드 — 머리에 통계, 몸통에 편집 가능한 어종 행 */}
      {SPOTS.map((spot, i) => (
        <SpotDashboard key={spot.id} spot={spot} idx={i}
                       evs={evsBySpot.get(spot.id)!} prevEvs={i > 0 ? evsBySpot.get(SPOTS[i - 1].id)! : null}
                       sim={sim}
                       setBudgets={setSbBudgets} setWeights={setSbFish} setPrice={setSbPrice} />
      ))}

      <Note>
        입력칸 = 시뮬레이션 오버라이드(placeholder가 확정값, 비우면 원본, 저장 안 됨).
        머리의 기대값 띠와 어종 행의 확률은 입력 즉시 함께 움직인다.
      </Note>
    </div>
  );
}

/** 한 수역의 통합 대시보드 — [머리: 통계 띠] + [몸통: 편집 표]가 한 프레임이다 */
function SpotDashboard({ spot, idx, evs, prevEvs, sim, setBudgets, setWeights, setPrice }: {
  spot: (typeof SPOTS)[number];
  /** 진행 사다리 순서 — Δ직전 계산용(첫 행은 null) */
  idx: number;
  evs: AxisEvs;
  prevEvs: AxisEvs | null;
  sim: SimOverrides;
  setBudgets: React.Dispatch<React.SetStateAction<Record<string, Partial<Record<RarityId, number>>>>>;
  setWeights: React.Dispatch<React.SetStateAction<Record<string, Record<string, number>>>>;
  setPrice: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}) {
  void idx; // 향후 "지역명 기반 Δ" 확장 여지 — 현재는 prevEvs가 정본
  const bid = spot.id as string;
  const list = useMemo(
    () => FISH.filter(f => f.spot === spot.id)
      .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity)),
    [spot.id],
  );
  const draws = useMemo(
    () => new Map(drawRows(spot.id as SpotId, {
      budgets: sim.budgets[bid], fishWeights: sim.fishWeights[bid],
    }).map(r => [r.fish.id, r])),
    [spot.id, sim],
  );

  // 접기 — 기본 펼침, 세션이 접은 것을 기억
  const [open, setOpen] = useState(() => {
    try {
      const raw = sessionStorage.getItem(SPOT_KEY);
      const closed = raw ? new Set(JSON.parse(raw) as string[]) : new Set<string>();
      return !closed.has(bid);
    } catch { return true; }
  });
  const toggleOpen = () => {
    setOpen(o => {
      const nextClosed = (() => {
        try {
          const raw = sessionStorage.getItem(SPOT_KEY);
          return new Set(raw ? JSON.parse(raw) as string[] : []);
        } catch { return new Set<string>(); }
      })();
      if (o) nextClosed.add(bid); else nextClosed.delete(bid);
      try { sessionStorage.setItem(SPOT_KEY, JSON.stringify([...nextClosed])); } catch { /* 무해 */ }
      return !o;
    });
  };

  const dropKey = <K extends string>(obj: Record<string, unknown>, key: K) => {
    const { [key]: _drop, ...rest } = obj; return rest;
  };
  const hasOverride =
    Object.keys(sim.budgets[bid] ?? {}).length > 0
    || Object.keys(sim.fishWeights[bid] ?? {}).length > 0
    || list.some(f => sim.price[f.id] != null);

  // 지역 내 판정 사다리(% — 무판정→GOOD→PERFECT), 방치 간격(G 절대값)
  const stepPct = (from: number, to: number): number =>
    from !== 0 ? (to - from) / Math.abs(from) * 100 : 0;

  return (
    <section className="pf-frame p-3" aria-labelledby={`h-${bid}`}>
      {/* ── 머리: 해역 식별 + 펼침 토글 ── */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <button type="button"
                aria-expanded={open}
                aria-label={`${spot.name} ${open ? '접기' : '펼치기'}`}
                onClick={toggleOpen}
                className="flex items-center gap-1 cursor-pointer hover:text-accent">
          <PixelIcon glyph={open ? 'caretDown' : 'caretRight'} size={10} className="text-text-dim" />
          <span id={`h-${bid}`} className="text-sm text-gold">{spot.name}</span>
          <span className="text-xs text-text-dim pf-accent ml-1">
            요구 파워 {spot.powerReq ?? '-'} · 배{spot.boatTier}
            {'rarityWeight' in spot && spot.rarityWeight ? ' · 예산 오버라이드' : ''}
          </span>
        </button>
        {hasOverride && (
          <button type="button" aria-label={`${spot.name} 오버라이드 초기화`}
                  onClick={() => {
                    setBudgets(p => ({ ...p, [bid]: {} }));
                    setWeights(p => ({ ...p, [bid]: {} }));
                    setPrice(p => {
                      const next = { ...p };
                      for (const f of list) delete next[f.id];
                      return next;
                    });
                  }}
                  className="border border-line rounded-sm px-1.5 py-0.5 text-2xs
                             text-text-dim hover:text-gold hover:border-gold cursor-pointer">
            이 수역 초기화
          </button>
        )}
      </div>

      {/* ── 기대값 띠 — 접었을 때도 보인다(요약의 역할). 5축 값+Δ를 한 줄에 ── */}
      {open && (
        <>
          {/* ── 기대값 띠 — 행=축(수동 3 + 방치 2, 그룹 구분선 분리), 열=[축명|EV|직전|지역내] ──
              지역내Δ: 수동 사다리는 직전 판정 대비 %를 연쇄한다. 방치는 사다리가 아니라
              폭 하나 — 마지막 방치 행(×10)에 한 번만 표기하고 ×4에는 붙이지 않는다. */}
          <div className="overflow-x-auto mb-3">
            <table className="pf-table">
              <thead>
                <tr>
                  <th scope="col" className="whitespace-nowrap">기대값 (골드)</th>
                  <th scope="col">EV</th>
                  <th scope="col" className="whitespace-nowrap">직전 대비</th>
                  <th scope="col" className="whitespace-nowrap">지역 내</th>
                </tr>
              </thead>
              <tbody>
                {AXES.map((a, ai) => {
                  const v = evs[a.key];
                  const pv = prevEvs ? prevEvs[a.key] : null;
                  // 그룹 전환점 — 수동→방치 경계에 소제목 행을 놓아 "같은 선상이 아님"을 표시
                  const groupDivider = ai === 3;
                  // 지역 내 변화량 — 수동 사다리만 연쇄 %. 방치는 폭 하나(×10 행에만).
                  let inRegion: string | null = null;
                  if (a.group === 'manual' && ai > 0) {
                    const prevKey = AXES[ai - 1].key;
                    inRegion = fmtPct(stepPct(evs[prevKey], v));
                  } else if (a.key === 'idleWorst') {
                    inRegion = `폭 ${fmtPct(stepPct(evs.idleWorst, evs.idleBest))}`;
                  }
                  return (
                    <Fragment key={a.key}>
                      {groupDivider && (
                        <tr aria-hidden="true">
                          <td colSpan={4}
                              className="bg-surface/60 text-2xs text-text-dim py-0.5 px-1 border-y border-line">
                            방치 — 파워 여유에 따른 자동 획득 (사다리 아님)
                          </td>
                        </tr>
                      )}
                      <tr key={a.key} className={ai % 2 ? '' : 'bg-surface/40'}>
                        <th scope="row"
                            className={cx('whitespace-nowrap text-left', a.group === 'manual' && ai === 0 ? 'text-gold' : '')}>
                          {a.label}
                        </th>
                        <td className="pf-accent whitespace-nowrap text-gold">{v.toFixed(1)}G</td>
                        <td><Delta prev={pv} cur={v} /></td>
                        <td className={cx('pf-accent whitespace-nowrap',
                                          inRegion ? 'text-text' : 'text-text-dim')}>
                          {inRegion ?? '—'}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── 어종 행 — 편집 + 실시간 확률 ── */}
          <div className="overflow-x-auto">
            <DataTable>
              <thead>
                <tr>
                  <th scope="col" className="whitespace-nowrap">등급 · 예산</th>
                  <th scope="col">그림</th>
                  <th scope="col" className="whitespace-nowrap">이름</th>
                  <th scope="col">가격</th>
                  <th scope="col" className="whitespace-nowrap">개체 가중치</th>
                  <th scope="col">확률</th>
                  <th scope="col">등급 합계</th>
                </tr>
              </thead>
              <tbody>
                {list.map((f, i) => {
                  const d = draws.get(f.id)!;
                  const firstOfGrade = i === 0 || list[i - 1].rarity !== f.rarity;
                  return (
                    <tr key={f.id}>
                      <td>
                        {firstOfGrade && (
                          <div className="flex items-center gap-1">
                            {RARITY[f.rarity].name}
                            <input type="number" min={0}
                                   placeholder={String(rarityWeightOf(spot.id, f.rarity))}
                                   value={sim.budgets[bid]?.[f.rarity] ?? ''}
                                   aria-label={`${spot.name} ${f.rarity} 예산`}
                                   onChange={e => setBudgets(p => {
                                     const cur = p[bid] ?? {};
                                     if (e.target.value === '') {
                                       return { ...p, [bid]: dropKey(cur, f.rarity) };
                                     }
                                     const n = Number(e.target.value);
                                     if (!Number.isFinite(n) || n < 0) return p;
                                     return { ...p, [bid]: { ...cur, [f.rarity]: n } };
                                   })}
                                   className="w-14 bg-bg border border-line rounded-sm px-1 py-0.5 text-xs pf-accent" />
                          </div>
                        )}
                      </td>
                      <td><FishSpriteThumb fish={f} /></td>
                      <td className="whitespace-nowrap">{f.name}</td>
                      <td className="whitespace-nowrap">
                        <input type="number" min={0} placeholder={String(f.price)}
                               value={sim.price[f.id] ?? ''}
                               aria-label={`${f.name} 가격`}
                               onChange={e => setPrice(p => {
                                 if (e.target.value === '') return dropKey(p, f.id);
                                 const n = Number(e.target.value);
                                 if (!Number.isFinite(n) || n < 0) return p;
                                 return { ...p, [f.id]: n };
                               })}
                               className="w-16 bg-bg border border-line rounded-sm px-1 py-0.5 text-xs pf-accent" />G
                      </td>
                      <td>
                        <input type="number" min={0} step="0.5" placeholder="1"
                               value={sim.fishWeights[bid]?.[f.id] ?? ''}
                               aria-label={`${f.name} 개체 가중치`}
                               onChange={e => setWeights(p => {
                                 const cur = p[bid] ?? {};
                                 if (e.target.value === '') return { ...p, [bid]: dropKey(cur, f.id) };
                                 const n = Number(e.target.value);
                                 if (!Number.isFinite(n) || n < 0) return p;
                                 return { ...p, [bid]: { ...cur, [f.id]: n } };
                               })}
                               className="w-14 bg-bg border border-line rounded-sm px-1 py-0.5 text-xs pf-accent" />
                      </td>
                      <td className="pf-accent whitespace-nowrap">{d.fishPct.toFixed(3)}%</td>
                      <td className="pf-accent whitespace-nowrap">
                        {firstOfGrade ? `${d.gradePct.toFixed(2)}%` : '( ↑ )'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </div>
        </>
      )}
    </section>
  );
}

function fmtPct(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;
}
