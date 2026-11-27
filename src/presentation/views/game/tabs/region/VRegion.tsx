import { useState } from 'react';
import type { Fish, GameState } from '../../../../../game/rules/logic';
import type { RegionId } from '../../../../../game/world';
import { useSpotState } from '../../../../../features/travel/service/useSpotState';
import { useSchools } from '../../../../../features/gameplay/service/schoolDay';
import { selectRegionViewData } from '../../../../../features/travel/model/regionView';
import type { SpotStatus } from '../../../../../features/travel/model/regionView';
import { fmtNum } from '../../../../ui/format';
import { cx } from '../../../../ui/cx';
import Frame from '../../../../ui/Frame';
import LoreParagraph from '../../../../ui/LoreParagraph';
import PageTitle from '../../../../ui/PageTitle';
import PixelIcon from '../../../../ui/PixelIcon';
import ProgressCount from '../../../../ui/ProgressCount';
import SectionTitle from '../../../../ui/SectionTitle';
import FishSprite from '../../../../ui/fish/FishSprite';
import NightMark, { NightMarkLegend } from '../../../../ui/fish/NightMark';
import { DIM_CARD, RARITY_CARD, RarityText } from '../../../../ui/fish/RarityTag';
import { RARITY_ORDER } from '../../../../../game/content/rarity';
import DataTable from '../../../../ui/DataTable';
import Inset from '../../../../ui/Inset';
import { SCROLL_Y_ROWS } from '../../../../ui/scrollArea';
import DexDetail from '../dex/DexDetail';

// 가까운 어군 노출 개수 — 3개면 한눈에 들어온다(요구).
/** 거리 표기 — 내부 게임 축척에 맞춰 유효숫자를 제한한다. */
function fmtMeters(m: number): string {
  if (m >= 10000) return `${Math.round(m / 1000)}km`;
  if (m >= 1000) return `${(Math.round(m / 100) / 10).toFixed(1)}km`;
  return `${Math.max(10, Math.round(m / 10) * 10)}m`;
}

/** 고정 높이 — 상단 구역 이야기 상자와 등급 분포 표가 어군 정보 변동에도 흔들리지 않게 유지한다. */
const LORE_H = 'h-[148px]';
const SLOT_H = 'h-[124px]';
const TABLE_H = 'h-[124px]';

/** 해역 상태 표시 — 파워 부족은 경고색(orange)으로 요구 파워를, 배 부족은 자물쇠로 필요한 배를 보인다.
 *  상세(사거리 내 어군)는 내 파워와 요구 파워를 나란히 보인다 */
function StatusText({ status, detail = false }: { status: SpotStatus; detail?: boolean }) {
  if (status.kind === 'ok') return <span className="text-text-dim">낚시 가능</span>;
  if (status.kind === 'power') {
    return (
      <span className="text-orange">
        {detail ? `파워 부족 ${status.power}/${status.req}` : `파워 ${status.req} 필요`}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-text-dim">
      <PixelIcon glyph="lock" size={10} />{status.boatName} 필요
    </span>
  );
}

// 어군 슬롯의 두 모드(상세 ⇄ 가까운 목록)가 같은 행 규격을 쓴다 — 전환 시 배치가 흔들리지 않게
const SLOT_ROW = 'flex items-center justify-between gap-2 px-2 py-1.5 text-sm';
const SLOT_ROW_SIDE = 'flex items-center gap-1.5 text-xs whitespace-nowrap';

const LEVEL_TEXT = { high: '높음', mid: '보통', low: '낮음', none: '-' } as const;
const LEVEL_CLS = {
  high: 'text-gold', mid: 'text-text-dim', low: 'text-accent', none: 'text-text-dim',
} as const;

// 지역 탭 — 존 계층 모델을 표시한다.
//  구역 이야기: 최상단 고정 높이 오목 상자에 구역 이름, 한 줄 소개, 구역 이야기를 인라인으로 둔다.
//  등급 분포: 최상위 존 서브트리의 어군 등급 흐름(높음/보통/낮음 — 정성 표시)
//  어군 정보: 캐스팅 사거리 내 어군 상세(4등급 2열 격자) ⇄ 가까운 어군 목록(거리순 3개, 게임 축척 미터)
// 좌표·어군·구역은 전역 스토어(Field가 기록, 저장 안 함 — 클라 신뢰).
export default function VRegion({ region, game }: { region: RegionId; game: GameState }) {
  const { spot: currentSpot, zone: storeZone, pos } = useSpotState();
  const schools = useSchools(region);
  const {
    focused, zone, parentZone, tableZone, tableSpots, nearby,
    focusedFishes, focusedStatus, focusedDex, nextBoat,
  } = selectRegionViewData(game, region, schools, storeZone, currentSpot, pos);
  const [fishDetail, setFishDetail] = useState<{ fish: Fish; initialForm: number } | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <Inset className={cx('shrink-0 p-2.5 flex flex-col gap-1', LORE_H, SCROLL_Y_ROWS)}>
        <PageTitle className="text-sm leading-snug shrink-0">
          {parentZone && <span className="text-text-dim">{parentZone.name} &gt; </span>}
          {zone.name}
        </PageTitle>
        <p className="text-xs text-accent shrink-0">{zone.tagline}</p>
        <LoreParagraph className="text-xs leading-[1.7] text-text-dim">{zone.lore}</LoreParagraph>
      </Inset>

      {/* 등급 분포 — **최상위 존 서브트리** 어군 × 등급의 흐름(높음/보통/낮음, 정성). */}
      <div className="shrink-0">
        <SectionTitle className="flex items-baseline justify-between gap-2">
          <span>등급 분포</span>
          <span className="text-xs text-text-dim">{tableZone.name}</span>
        </SectionTitle>
        <Inset className={cx(TABLE_H, 'p-2 overflow-x-auto overflow-y-hidden pf-scroll-panel')}>
          <DataTable className="text-2xs">
            <thead>
              <tr className="text-text-dim">
                <th scope="col" className="text-left font-normal pb-1">어군</th>
                {RARITY_ORDER.map(r => <th scope="col" key={r} className="font-normal pb-1 w-[3.6em]"><RarityText rarity={r} /></th>)}
              </tr>
            </thead>
            <tbody className="border-t border-line">
              {tableSpots.map(({ spot: s, fishable, grades }) => (
                <tr key={s.id} className={cx('border-b border-line last:border-b-0', s.id === focused?.id && 'bg-accent/10')}>
                  <td className="py-1 pr-1 text-xs truncate">
                    {s.name}
                    {!fishable && <PixelIcon glyph="lock" size={9} className="ml-1 inline-block align-baseline" />}
                  </td>
                  {RARITY_ORDER.map(r => {
                    const lv = grades[r];
                    return <td key={r} className={cx('py-1 text-center', LEVEL_CLS[lv])}>{LEVEL_TEXT[lv]}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Inset>
      </div>

      {/* 수역 정보 — 등급 분포 표 아래에 두고, 사거리 내 어군(4등급 2열 격자) ⇄ 가까운 어군 목록 배타 교체 */}
      <div className="shrink-0">
        <SectionTitle className="flex items-center justify-between gap-2">
          {focused ? (
            <>
              <span>어군 정보</span>
              <span className="inline-flex items-center gap-1.5">
                {focusedDex && (
                  <span className="text-2xs text-text-dim">도감 <ProgressCount current={focusedDex.caught} target={focusedDex.total} tight /></span>
                )}
                <NightMarkLegend />
              </span>
            </>
          ) : '가까운 어군'}
        </SectionTitle>
        {focused ? (
          <Inset className="p-0 flex flex-col">
            <div className={cx(SLOT_ROW, 'border-b border-line')}>
              <span className="truncate">{focused.name}</span>
              {focusedStatus && (
                <span className={SLOT_ROW_SIDE}><StatusText status={focusedStatus} detail /></span>
              )}
            </div>
            <div className="p-2 flex flex-col gap-2.5">
              {RARITY_ORDER.map(rarity => {
                const group = focusedFishes.filter(({ fish }) => fish.rarity === rarity);
                if (group.length === 0) return null;
                return (
                  <div key={rarity} className="flex flex-col gap-1">
                    <div className="text-2xs leading-tight">
                      <RarityText rarity={rarity} />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {group.map(({ fish: f, discovered: caught, shown, name }) => {
                        const body = (
                          <>
                            <NightMark fish={f} discovered={caught} />
                            <FishSprite fish={f} preset="thumb" form={shown.form} discovered={caught}
                                        ariaLabel={caught ? name : '미확인 어종'}
                                        className={cx('block mx-auto', !caught && 'grayscale brightness-75')} />
                            <div className={cx('text-2xs leading-tight truncate w-full mt-1', !caught && 'text-text-dim')}>
                              {caught ? name : '???'}
                            </div>
                          </>
                        );
                        return caught ? (
                          <Frame as="button" type="button" key={f.id} data-rarity={f.rarity}
                                 onClick={() => setFishDetail({ fish: f, initialForm: shown.index })}
                                 className={cx(RARITY_CARD, 'min-h-[68px] p-1.5 cursor-pointer hover:border-accent flex flex-col items-center justify-center text-center min-w-0')}>
                            {body}
                          </Frame>
                        ) : (
                          <div key={f.id} data-rarity={f.rarity}
                               className={cx(RARITY_CARD, 'min-h-[68px] p-1.5 flex flex-col items-center justify-center text-center min-w-0', DIM_CARD)}>
                            {body}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Inset>
        ) : (
          <Inset className={cx(SLOT_H, 'p-0 flex flex-col')}>
            {/* ── 가까운 어군 (거리순 3개, 가벼운 UI) ── */}
            <div className="flex flex-col divide-y divide-line">
              {nearby.map(({ spot: s, distancePx: d, status }) => {
                return (
                  <div key={s.id} className={SLOT_ROW}>
                    <span className="truncate">{s.name}</span>
                    <span className={SLOT_ROW_SIDE}>
                      {Number.isFinite(d) && <span className="text-text-dim">{fmtMeters(d)}</span>}
                      <StatusText status={status} />
                    </span>
                  </div>
                );
              })}
            </div>
          </Inset>
        )}
      </div>

      {nextBoat && (
        <Inset className="shrink-0 p-2 flex flex-col gap-0.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-text-dim">다음 배</span>
            <span className="text-gold">{nextBoat.name}</span>
          </div>
          <span className="text-2xs text-text-dim">
            명성 {fmtNum(nextBoat.fameReq)}, 골드 {fmtNum(nextBoat.price)} (집 목공소나 항구 조선소)
          </span>
        </Inset>
      )}
      {fishDetail && <DexDetail key={`${fishDetail.fish.id}-${fishDetail.initialForm}`} fish={fishDetail.fish} game={game} initialForm={fishDetail.initialForm} onClose={() => setFishDetail(null)} />}
    </div>
  );
}
