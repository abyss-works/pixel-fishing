import type { GameState } from '../../../../../game/rules/logic';
import type { RegionId } from '../../../../../game/world';
import { useSpotState } from '../../../../../features/travel/service/useSpotState';
import { useSchools } from '../../../../../features/gameplay/service/schoolDay';
import { zoneTips, zoneControls } from '../../../../../game/content/zones';
import { selectRegionViewData } from '../../../../../features/travel/model/regionView';
import type { SpotStatus, SpotTendency } from '../../../../../features/travel/model/regionView';
import { fmtNum } from '../../../../ui/format';
import { cx } from '../../../../ui/cx';
import PixelIcon from '../../../../ui/PixelIcon';
import PixelList from '../../../../ui/PixelList';
import SectionTitle from '../../../../ui/SectionTitle';
import FishSprite from '../../../../ui/fish/FishSprite';
import CardCarousel from '../../../../ui/CardCarousel';
import { RarityText } from '../../../../ui/fish/RarityTag';
import { RARITY, RARITY_ORDER } from '../../../../../game/content/rarity';
import { RARITY_CARD, DIM_CARD } from '../../../../ui/fish/RarityTag';
import DataTable from '../../../../ui/DataTable';
import Frame from '../../../../ui/Frame';

// 한 화면에 보일 어종 카드 수 — 어군당 보통 5~6종이라 6장이면 대개 한 번에 들어간다.
const FISH_PER_VIEW = 6;
// 가까운 어군 노출 개수 — 3개면 한눈에 들어온다(요구).
/** 거리 표기 — 내부 게임 축척에 맞춰 유효숫자를 제한한다. */
function fmtMeters(m: number): string {
  if (m >= 10000) return `${Math.round(m / 1000)}km`;
  if (m >= 1000) return `${(Math.round(m / 100) / 10).toFixed(1)}km`;
  return `${Math.max(10, Math.round(m / 10) * 10)}m`;
}

/** 슬롯 고정 높이 — 지역 탭의 모든 가변 구간은 **부모 높이를 고정**한다(사용자 요구 —
 *  구역 전환·수역 입장 전/후 배타 교체 시 레이아웃이 뒤바뀌면 안 된다). 내용이 넘치면
 *  그 슬롯만 스크롤된다. 탭 전체 높이는 씬(마을/바다)이 같으면 항상 같다.
 *  LORE = 구역/수역 로어(클램프 3줄 + 제목·한 줄 감정) · SLOT = 수역 정보(목록↔상세) ·
 *  TABLE = 등급 분포(수역 2~3행) · FOOT = 다음 배·팁·조작(구역별 항목 수·줄바꿈 가변 — 최대
 *  동남아 4팁 8줄 기준, 안전 여유로 스크롤 허용). */
const LORE_H = 'h-[112px]';
const SLOT_H = 'h-[168px]';
/** 등급 분포 — 최대 3행(동남아) + 헤더 + 프레임 여백을 정확히 담는 높이. **스크롤 없음**:
 *  세로 스크롤은 켜지지도 않고(내용 < 높이), 가로만 필요 시 스크롤된다. */
const TABLE_H = 'h-[124px]';
const FOOT_H = 'h-[360px]';

/** 해역 상태 표시 — 파워 부족은 경고색(orange), 배 부족은 자물쇠 */
function StatusText({ status, detail = false }: { status: SpotStatus; detail?: boolean }) {
  if (status.kind === 'ok') return <span className="text-text-dim">낚시 가능</span>;
  if (status.kind === 'power') {
    return <span className="text-orange">파워 부족{detail && ` · ${status.power}/${status.req}`}</span>;
  }
  return (
    <span className="flex items-center gap-0.5 text-text-dim">
      <PixelIcon glyph="lock" size={10} />{status.boatName} 필요
    </span>
  );
}

// 어군 슬롯의 두 모드(상세 ⇄ 가까운 목록)가 같은 행·바닥줄 규격을 쓴다 — 전환 시 배치가 흔들리지 않게
const SLOT_ROW = 'flex items-center justify-between gap-2 px-2 py-1.5 text-sm';
const SLOT_ROW_SIDE = 'flex items-center gap-1.5 text-xs whitespace-nowrap';
const SLOT_FOOT = 'mt-auto px-2 py-1.5 text-2xs leading-[1.5] text-text-dim border-t border-line';

const LEVEL_TEXT = { high: '높음', mid: '보통', low: '낮음', none: '—' } as const;
const LEVEL_CLS = {
  high: 'text-gold', mid: 'text-text-dim', low: 'text-accent', none: 'text-text-dim opacity-50',
} as const;

// 지역 탭 — 존 계층 모델을 표시한다.
//  로어 슬롯: **항상 존(범위) 정보** — 사거리 내 어군이 있으면 그 어군의 존(하위 존 포함),
//             없으면 셀 구역의 최상위 존.
//  수역 정보 슬롯: 캐스팅 사거리 내 어군 상세 ⇄ 가까운 어군 목록(거리순 3개, 게임 축척 미터)
//  등급 분포: 최상위 존 서브트리의 어군 등급 흐름(높음/보통/낮음 — 정성 표시)
// 좌표·어군·구역은 전역 스토어(Field가 기록, 저장 안 함 — 클라 신뢰).
export default function VRegion({ region, game }: { region: RegionId; game: GameState }) {
  const { spot: currentSpot, zone: storeZone, pos } = useSpotState();
  const schools = useSchools(region);
  const {
    focused, contextZone, zone, parentZone, tableZone, tableSpots, nearby,
    focusedFishes, focusedStatus, focusedDex, tendency, nextBoat,
  } = selectRegionViewData(game, region, schools, storeZone, currentSpot, pos);
  const tendencyText: Record<SpotTendency, string> = {
    legendary: '낮에는 밝은 바다다. 다만 줄을 올릴 때 손끝이 유난히 무거워지는 날이 있다. 그 무게가 언제 오는지는 아무도 가르쳐 주지 않는다.',
    high: '수면은 평범한 하루처럼 보인다. 그 아래에서는 언제나 시선이 엇갈리고 있다. 줄을 맡겨 둔 손보다 직접 쥔 손에 그 기척이 먼저 닿는다.',
    ordinary: '대부분의 아침은 익숙한 물고기로 시작한다. 가끔 짧은 손맛이 찾아오지만, 그것은 운보다 꾸준히 줄을 던진 사람에게 온다.',
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 로어 슬롯 — 고정 높이. **존(범위) 정보만** 뜬다 — 어군 상세와 배타 교체하지 않는다 */}
      <Frame className={cx(LORE_H, 'shrink-0 overflow-hidden p-2 flex flex-col justify-center gap-0.5')}>
        <h3 className="text-sm text-gold pf-accent truncate">
          {zone.name}
          {parentZone && <span className="ml-1 text-2xs text-text-dim">({parentZone.name} 특수 해역)</span>}
        </h3>
        <p className="text-accent text-xs">{zone.tagline}</p>
        <p className="text-2xs leading-[1.6] text-text-dim line-clamp-3">
          {zone.lore}
        </p>
      </Frame>

      {/* 수역 정보 — 고정 높이 슬롯. 캐스팅 사거리 내 어군 상세 ⇄ 가까운 어군 목록 배타 교체.
          **존 로어를 덮지 않는다** — 존 정보와 별도 슬롯에 표시한다 */}
      <div className="shrink-0">
        <SectionTitle className="flex items-baseline justify-between">
          {focused ? '어군 정보' : '가까운 어군'}
          {focusedDex && (
            <span className="text-2xs text-text-dim">도감 {focusedDex.caught}/{focusedDex.total}</span>
          )}
        </SectionTitle>
        <Frame className={cx(SLOT_H, 'overflow-y-auto p-0 flex flex-col')}>
          {focused ? (
            /* ── 사거리 내 어군 상세 ── */
            <div className="flex flex-col flex-1">
              <div className={cx(SLOT_ROW, 'border-b border-line')}>
                <span className="truncate">{focused.name}</span>
                {focusedStatus && (
                  <span className={SLOT_ROW_SIDE}><StatusText status={focusedStatus} detail /></span>
                )}
              </div>
              <div className="px-2 py-1.5">
              <CardCarousel perView={FISH_PER_VIEW}>
                {focusedFishes.map(({ fish: f, discovered: caught }) => {
                    return (
                      <div key={f.id} data-rarity={f.rarity}
                           className={cx(RARITY_CARD, 'p-1 basis-(--card-w)', !caught && DIM_CARD)}>
                        <FishSprite fish={f} preset="thumb" form="normal" discovered={caught}
                                    ariaLabel={caught ? f.name : '미확인 어종'}
                                    className="block mx-auto" />
                        <div className="text-2xs leading-tight truncate">{caught ? f.name : '???'}</div>
                        <div className="text-2xs leading-tight"><RarityText rarity={f.rarity} /></div>
                      </div>
                    );
                  })}
              </CardCarousel>
              </div>
              <p className={SLOT_FOOT}>
                {tendency ? tendencyText[tendency] : null}
              </p>
            </div>
          ) : (
            /* ── 가까운 어군 (거리순 3개, 가벼운 UI) ── */
            <div className="flex flex-col flex-1">
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
            <p className={SLOT_FOOT}>
              어군 가까이 가면 사는 물고기를 볼 수 있어요.
            </p>
            </div>
          )}
        </Frame>
      </div>

      {/* 등급 분포 — **최상위 존 서브트리** 어군 × 등급의 흐름(높음/보통/낮음, 정성).
          수역 오버라이드(rarityWeight)를 글로벌 기본값과 비교한 조회 뷰다 — 확률 자체는
          drawRows 단일 출처. 하위 존(해구 등) 위에서도 최상위 존 표가 유지돼 자주 바뀌지 않는다.
          서브트리마다 행 수가 다르다(마을 2 / 태평양 2 / 동남아 3 / 인도양 2 / 마다가스카르 2) — 높이 고정 */}
      <div className="shrink-0">
        <SectionTitle>등급 분포 — {tableZone.name}</SectionTitle>
        <Frame className={cx(TABLE_H, 'p-2 overflow-x-auto overflow-y-hidden')}>
          <DataTable className="text-2xs">
            <thead>
              <tr className="text-text-dim">
                <th scope="col" className="text-left font-normal pb-1">어군</th>
                {RARITY_ORDER.map(r => <th scope="col" key={r} className="font-normal pb-1 w-[3.6em]">{RARITY[r].name}</th>)}
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
        </Frame>
      </div>

      {/* 팁·조작 — 최상위 존 기준(하위 존은 부모 폴백). 항목 수가 가변(3~4개)이라 한
          컨테이너에 묶어 높이 고정. 이 아래는 아무것도 없으므로 이 컨테이너가 길어질 일도,
          위 섹션을 밀어낼 일도 없다 */}
      <div className={cx(FOOT_H, 'shrink-0 overflow-y-auto flex flex-col gap-2')}>
        {nextBoat && (
          <Frame className="p-2 flex flex-col gap-0.5 text-xs">
            <span className="text-gold">다음 배 · {nextBoat.name}</span>
            <span className="text-2xs text-text-dim">
              명성 {fmtNum(nextBoat.fameReq)} · 골드 {fmtNum(nextBoat.price)} — 집 목공소나 항구 조선소
            </span>
          </Frame>
        )}
        <div>
          <SectionTitle>여기서 할 수 있는 것</SectionTitle>
          <PixelList>
            {zoneTips(contextZone).map((t, i) => <li key={i}>{t}</li>)}
          </PixelList>
        </div>
        <div>
          <SectionTitle>조작</SectionTitle>
          <PixelList>
            {zoneControls(contextZone).map((c, i) => <li key={i}>{c}</li>)}
          </PixelList>
        </div>
      </div>
    </div>
  );
}
