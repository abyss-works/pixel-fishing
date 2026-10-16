import { Fragment, useMemo, useState } from 'react';
import { FISH, RARITY, SPOTS } from '../../../../game/rules/logic';
import type { RarityId } from '../../../../game/rules/logic';
import {
  buildFishDeltaExport, buildFishSnapshotExport, countSimulationOverrides,
  hasSpotSimulationOverride, resetSpotPriceOverrides, selectBaseRarityWeight,
  selectDeltaValues, selectFishForSpot, selectSpotAxisEvs, selectSpotDraws,
  SIM_AXES, stepPercent,
} from '../../../../features/admin/model/fishSimulation';
import type { AxisEvs, SimOverrides } from '../../../../features/admin/model/fishSimulation';
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import { useDialogs } from '../../../ui/useDialogs';
import PixelIcon from '../../../ui/PixelIcon';
import IconButton from '../../../ui/IconButton';
import PillButton from '../../../ui/PillButton';
import SectionTitle from '../../../ui/SectionTitle';
import TextInput from '../../../ui/TextInput';
import { FishSpriteThumb } from './FishSpriteThumb';
import { cx } from '../../../ui/cx';
import Frame from '../../../ui/Frame';

// 어종 탭 — **수역 단위 통합 대시보드**. 한 표 안에 편집과 통계가 같이 산다(사용자 지시:
// 어종별 데이터와 통계치를 분리하지 마라 — 수치를 조절하면 그 자리에서 즉시 읽히게).
//
//   [머리] 해역명 · 요구 파워 · 배 단계 · 축별 EV 요약 띠(5축 + 지역 내 Δ + Δ직전)
//   [본문] 어종 행 — 등급/예산·가격·개체가중치는 인라인 편집(오버라이드), 확률은 실시간
//   [바닥] 수역 초기화 버튼 (오버라이드가 있을 때만)
//
// 오버라이드는 저장 안 됨(새로고침 초기화). 확정 변경은 어종 데이터·수역 데이터 수정이 정본이다.

const SPOT_KEY = 'admin-spots-open';

/** Δ 셀 — **비율(%)이 본체**다(사용자 지시: 절대치는 꼭 필요한 곳만). prev=null은 '—' */
function Delta({ prev, cur }: { prev: number | null; cur: number }) {
  if (prev === null || !Number.isFinite(prev)) return <span className="text-text-dim">—</span>;
  const { diff, percent, unchanged } = selectDeltaValues(prev, cur);
  if (unchanged) return <span className="text-text-dim">±0</span>;
  const up = diff > 0;
  return (
    <span className={up ? 'text-gold pf-accent whitespace-nowrap'
                        : 'text-danger pf-accent whitespace-nowrap'}>
      {percent !== null ? `${percent > 0 ? '+' : ''}${percent.toFixed(0)}%` : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}G`}
    </span>
  );
}

export default function FishTab() {
  const [sbBudgets, setSbBudgets] = useState<Record<string, Partial<Record<RarityId, number>>>>({});
  const [sbFish, setSbFish] = useState<Record<string, Record<string, number>>>({});
  const [sbPrice, setSbPrice] = useState<Record<string, number>>({});
  const sim = useMemo<SimOverrides>(
    () => ({ budgets: sbBudgets, fishWeights: sbFish, price: sbPrice }),
    [sbBudgets, sbFish, sbPrice],
  );

  // 전체 5축 EV — 편집할 때마다 다시 계산(닫힌형이라 저렴한다)
  const evsBySpot = useMemo(() => new Map<string, AxisEvs>(
    SPOTS.map(spot => [spot.id, selectSpotAxisEvs(spot.id, sim)])),
  [sim]);

  const { notice, dialogs } = useDialogs();
  const tell = (body: string) => void notice({ title: 'JSON 추출', body });

  const exportJson = async () => {
    const payload = buildFishSnapshotExport(SPOTS, sim, evsBySpot, new Date().toISOString());
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      tell('어종 현황 JSON을 클립보드에 복사했다.');
    } catch {
      console.log('pf-export', JSON.stringify(payload, null, 2));
      tell('클립보드 접근 실패 — 개발자 콘솔(pf-export)에서 복사하세요.');
    }
  };

  // 변화량(Δ)만 추출 — sb* ≠ null 인 항목만 모은다. 오버라이드 0건이면 빈 spots.
  const deltaCount = countSimulationOverrides(sim);

  const exportDeltaJson = async () => {
    const payload = buildFishDeltaExport(SPOTS, sim, evsBySpot, new Date().toISOString());
    if (!payload) {
      tell('변경된 항목이 없습니다 — Δ JSON은 비어 있습니다.');
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      tell(`변화량 Δ JSON (${deltaCount}건)을 클립보드에 복사했다.`);
    } catch {
      console.log('pf-export-delta', JSON.stringify(payload, null, 2));
      tell('클립보드 접근 실패 — 개발자 콘솔(pf-export-delta)에서 복사하세요.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SectionTitle className="flex-1">어종 · 해역 ({FISH.length}종 / {SPOTS.length}해역)</SectionTitle>
        <div className="flex items-center gap-2">
          <PillButton type="button" aria-label="변화량 Δ JSON 추출"
                  onClick={exportDeltaJson}
                  disabled={deltaCount === 0}>
            <PixelIcon glyph="download" size={12} />Δ JSON{deltaCount > 0 ? ` (${deltaCount})` : ''}
          </PillButton>
          <PillButton type="button" aria-label="어종 데이터 JSON 추출"
                  onClick={exportJson}>
            <PixelIcon glyph="download" size={12} />현황 JSON
          </PillButton>
        </div>
      </div>

      {/* 수역별 통합 대시보드 — 머리에 통계, 몸통에 편집 가능한 어종 행 */}
      {SPOTS.map((spot, i) => (
        <SpotDashboard key={spot.id} spot={spot}
                       evs={evsBySpot.get(spot.id)!} prevEvs={i > 0 ? evsBySpot.get(SPOTS[i - 1].id)! : null}
                       sim={sim}
                       setBudgets={setSbBudgets} setWeights={setSbFish} setPrice={setSbPrice} />
      ))}

      <Note>
        입력칸 = 시뮬레이션 오버라이드(placeholder가 확정값, 비우면 원본, 저장 안 됨).
        머리의 기대값 띠와 어종 행의 확률은 입력 즉시 함께 움직인다.
      </Note>
      {dialogs}
    </div>
  );
}

/** 한 수역의 통합 대시보드 — [머리: 통계 띠] + [몸통: 편집 표]가 한 프레임이다 */
function SpotDashboard({ spot, evs, prevEvs, sim, setBudgets, setWeights, setPrice }: {
  spot: (typeof SPOTS)[number];
  evs: AxisEvs;
  prevEvs: AxisEvs | null;
  sim: SimOverrides;
  setBudgets: React.Dispatch<React.SetStateAction<Record<string, Partial<Record<RarityId, number>>>>>;
  setWeights: React.Dispatch<React.SetStateAction<Record<string, Record<string, number>>>>;
  setPrice: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}) {
  const bid = spot.id as string;
  // 낮 어종(확률 계산·예산 편집 대상)과 밤 전용 어종을 가른다 — drawRows(day 풀)는
  // night를 안 담아 확률·등급 합계가 낮 시간대 기준으로 정직하게 나온다.
  const list = useMemo(() => selectFishForSpot(spot.id, false), [spot.id]);
  const nightList = useMemo(() => selectFishForSpot(spot.id, true), [spot.id]);
  const draws = useMemo(
    () => selectSpotDraws(spot.id, sim),
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
  const hasOverride = hasSpotSimulationOverride(bid, sim, list);

  return (
    <Frame as="section" className="p-3" aria-labelledby={`h-${bid}`}>
      {/* ── 머리: 해역 식별 + 펼침 토글 ── */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <IconButton glyph={open ? 'caretDown' : 'caretRight'} size={10}
                aria-expanded={open}
                aria-label={`${spot.name} ${open ? '접기' : '펼치기'}`}
                onClick={toggleOpen}
                className="gap-1 hover:text-accent">
          <span id={`h-${bid}`} className="text-sm text-gold">{spot.name}</span>
          <span className="text-xs text-text-dim pf-accent ml-1">
            요구 파워 {spot.powerReq ?? '-'} · 배{spot.boatTier}
            {'rarityWeight' in spot && spot.rarityWeight ? ' · 예산 오버라이드' : ''}
          </span>
        </IconButton>
        {hasOverride && (
          <PillButton type="button" aria-label={`${spot.name} 오버라이드 초기화`}
                  onClick={() => {
                    setBudgets(p => ({ ...p, [bid]: {} }));
                    setWeights(p => ({ ...p, [bid]: {} }));
                    setPrice(p => resetSpotPriceOverrides(p, list));
                  }}>
            이 해역 초기화
          </PillButton>
        )}
      </div>

      {/* ── 기대값 띠 — 접었을 때도 보인다(요약의 역할). 5축 값+Δ를 한 줄에 ── */}
      {open && (
        <>
          {/* ── 기대값 띠 — 행=축(수동 3 + 방치 2, 그룹 구분선 분리), 열=[축명|EV|직전|지역내] ──
              지역내Δ: 수동 사다리는 직전 판정 대비 %를 연쇄한다. 방치는 사다리가 아니라
              폭 하나 — 마지막 방치 행(×10)에 한 번만 표기하고 ×4에는 붙이지 않는다. */}
          <div className="overflow-x-auto mb-3">
            <DataTable>
              <thead>
                <tr>
                  <th scope="col" className="whitespace-nowrap">기대값 (골드)</th>
                  <th scope="col">EV</th>
                  <th scope="col" className="whitespace-nowrap">직전 대비</th>
                  <th scope="col" className="whitespace-nowrap">지역 내</th>
                </tr>
              </thead>
              <tbody>
                {SIM_AXES.map((a, ai) => {
                  const v = evs[a.key];
                  const pv = prevEvs ? prevEvs[a.key] : null;
                  // 그룹 전환점 — 수동→방치 경계에 소제목 행을 놓아 "같은 선상이 아님"을 표시
                  const groupDivider = ai === 3;
                  // 지역 내 변화량 — 수동 사다리만 연쇄 %. 방치는 폭 하나(×10 행에만).
                  let inRegion: string | null = null;
                  if (a.group === 'manual' && ai > 0) {
                    const prevKey = SIM_AXES[ai - 1].key;
                    inRegion = fmtPct(stepPercent(evs[prevKey], v));
                  } else if (a.key === 'idleWorst') {
                    inRegion = `폭 ${fmtPct(stepPercent(evs.idleWorst, evs.idleBest))}`;
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
            </DataTable>
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
                            <TextInput compact type="number" min={0}
                                   placeholder={String(selectBaseRarityWeight(spot.id, f.rarity))}
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
                                   className="w-14" />
                          </div>
                        )}
                      </td>
                      <td><FishSpriteThumb fish={f} /></td>
                      <td className="whitespace-nowrap">{f.name}</td>
                      <td className="whitespace-nowrap">
                        <TextInput compact type="number" min={0} placeholder={String(f.price)}
                               value={sim.price[f.id] ?? ''}
                               aria-label={`${f.name} 가격`}
                               onChange={e => setPrice(p => {
                                 if (e.target.value === '') return dropKey(p, f.id);
                                 const n = Number(e.target.value);
                                 if (!Number.isFinite(n) || n < 0) return p;
                                 return { ...p, [f.id]: n };
                               })}
                               className="w-16" />G
                      </td>
                      <td>
                        <TextInput compact type="number" min={0} step="0.5" placeholder="1"
                               value={sim.fishWeights[bid]?.[f.id] ?? ''}
                               aria-label={`${f.name} 개체 가중치`}
                               onChange={e => setWeights(p => {
                                 const cur = p[bid] ?? {};
                                 if (e.target.value === '') return { ...p, [bid]: dropKey(cur, f.id) };
                                 const n = Number(e.target.value);
                                 if (!Number.isFinite(n) || n < 0) return p;
                                 return { ...p, [bid]: { ...cur, [f.id]: n } };
                               })}
                               className="w-14" />
                      </td>
                      <td className="pf-accent whitespace-nowrap">{d.fishPct.toFixed(3)}%</td>
                      <td className="pf-accent whitespace-nowrap">
                        {firstOfGrade ? `${d.gradePct.toFixed(2)}%` : '( ↑ )'}
                      </td>
                    </tr>
                  );
                })}
                {nightList.length > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={7} className="bg-bg/80 text-2xs text-accent py-0.5 px-1 border-y border-line">
                      밤 전용 — 낮 시간대 풀에 없음 (게임 20시~다음 4시)
                    </td>
                  </tr>
                )}
                {nightList.map(f => (
                  <tr key={f.id} className="opacity-80">
                    <td><span className="text-2xs text-accent">밤</span></td>
                    <td><FishSpriteThumb fish={f} /></td>
                    <td className="whitespace-nowrap">{f.name}
                      <span className="text-2xs text-text-dim ml-1">({RARITY[f.rarity].name})</span></td>
                    <td className="whitespace-nowrap">
                      <TextInput compact type="number" min={0} placeholder={String(f.price)}
                             value={sim.price[f.id] ?? ''}
                             aria-label={`${f.name} 가격`}
                             onChange={e => setPrice(p => {
                               if (e.target.value === '') return dropKey(p, f.id);
                               const n = Number(e.target.value);
                               if (!Number.isFinite(n) || n < 0) return p;
                               return { ...p, [f.id]: n };
                             })}
                             className="w-16" />G
                    </td>
                    <td className="text-2xs text-text-dim">—</td>
                    <td className="text-2xs text-text-dim">—</td>
                    <td className="text-2xs text-text-dim whitespace-nowrap">밤 전용</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </>
      )}
    </Frame>
  );
}

function fmtPct(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;
}
