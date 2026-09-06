import { BOATS, FISH, RARITY, RARITY_ORDER, canFishSpot, rarityWeightOf,
         speciesDiscovered, drawRows } from '../game/logic';
import type { GameState } from '../game/logic';
import { REGION_PACKS } from '../world';
import type { RegionId } from '../world';
import { useSpotState } from '../world/currentSpot';
import { zoneById, zoneTips, zoneControls, spotsOfRegion, subtreeSpots, defaultZoneOfRegion, topZoneOf } from '../data/zones';
import type { ZoneId } from '../data/zones';
import type { SpotId } from '../data/spots';
import { spotById } from '../data/spots';
import type { RarityId } from '../data/rarity';
import { cx } from '../ui/cx';
import PixelIcon from '../ui/PixelIcon';
import PixelList from '../ui/PixelList';
import SectionTitle from '../ui/SectionTitle';
import FishSprite from '../ui/FishSprite';
import CardCarousel from '../ui/CardCarousel';
import { RarityText } from '../ui/RarityTag';
import { RARITY_CARD, rarityRank } from './shared';

// 한 화면에 보일 어종 카드 수 — 어군당 보통 5~6종이라 6장이면 대개 한 번에 들어간다.
const FISH_PER_VIEW = 6;
// 가까운 어군 노출 개수 — 3개면 한눈에 들어온다(요구).
const NEARBY_MAX = 3;

/** 거리 표기 — **게임 축척 1px = 1m**(어선 12px ≈ 12m, 캐스팅 사거리 40px = 40m — 실제
 *  낚싯대 사거리와 맞물리는 내부 축척). 지구 실축척(1px ≈ 3.5km)으로 환산하면 초당 수백 km가
 *  나와 부적절하다(사용자 피드백 2026-08-28). 포맷은 십/백의 자리까지만: 1km 미만은 10m 단위,
 *  10km 미만은 0.1km(=100m) 단위, 그 이상은 km 정수 — 소수점 자릿수가 곧 유효숫자다. */
function fmtMeters(m: number): string {
  if (m >= 10000) return `${Math.round(m / 1000)}km`;
  if (m >= 1000) return `${(Math.round(m / 100) / 10).toFixed(1)}km`;
  return `${Math.max(10, Math.round(m / 10) * 10)}m`;
}

/** 슬롯 고정 높이 — 지역 탭의 모든 가변 구간은 **부모 높이를 고정**한다(사용자 요구 —
 *  구역 전환·수역 입장 전/후 배타 교체 시 레이아웃이 뒤바뀌면 안 된다). 내용이 넘치면
 *  그 슬롯만 스크롤된다. 탭 전체 높이는 씬(마을/바다)이 같으면 항상 같다.
 *  LORE = 구역/수역 로어(클램프 3줄 + 제목·한 줄 감정) · SLOT = 수역 정보(목록↔상세) ·
 *  TABLE = 등급 분포(수역 2~3행) · FOOT = 팁·조작(구역별 항목 수·줄바꿈 가변 — 최대
 *  동남아 4팁 8줄 기준, 안전 여유로 스크롤 허용). */
const LORE_H = 'h-[112px]';
const SLOT_H = 'h-[168px]';
/** 등급 분포 — 최대 3행(동남아) + 헤더 + 프레임 여백을 정확히 담는 높이. **스크롤 없음**:
 *  세로 스크롤은 켜지지도 않고(내용 < 높이), 가로만 필요 시 스크롤된다. */
const TABLE_H = 'h-[124px]';
const FOOT_H = 'h-[360px]';

// 수역의 등급 구성(74/20/5/1 기준)을 **직접적인 등급 언급 없이** 서사로 풀어낸다.
function spotTendencyText(spotId: string): string {
  const rows = drawRows(spotId as SpotId);
  const grade = new Map(rows.map(r => [r.fish.rarity, r.gradePct] as const));
  const leg = grade.get('legendary') ?? 0;
  const epic = grade.get('epic') ?? 0;
  const rare = grade.get('rare') ?? 0;
  if (leg >= 2.5) {
    return '낮에는 밝은 바다다. 다만 줄을 올릴 때 손끝이 유난히 무거워지는 날이 있다. 그 무게가 언제 오는지는 아무도 가르쳐 주지 않는다.';
  }
  if (epic >= 7 || rare >= 25) {
    return '수면은 평범한 하루처럼 보인다. 그 아래에서는 언제나 시선이 엇갈리고 있다. 오래 기다린 사람의 손끝에만 그 기척이 닿는다.';
  }
  return '대부분의 아침은 익숙한 물고기로 시작한다. 가끔 짧은 손맛이 찾아오지만, 그것은 운보다 시간을 지불한 사람에게 온다.';
}

// 등급 예산의 수역 오버라이드(spots.rarityWeight)를 **정성 3단**으로 요약한다(사용자 확정
// 2026-08-28 — 정확 % 공개 대신 높음/낮음, 로어 톤 유지). 단일 출처는 drawRows와 같은
// rarityWeightOf다: 글로벌 기본값(RARITY.weight)보다 무겁면 높음, 가볍면 낮음, 같으면 보통.
// 그 수역에 없는 등급은 '—'다(부재 등급은 예산에서 빠지고 재균등한다 — logic.drawRows 규칙).
function gradeLevel(spotId: SpotId, r: RarityId): 'high' | 'mid' | 'low' | 'none' {
  if (!FISH.some(f => f.spot === spotId && f.rarity === r)) return 'none';
  const w = rarityWeightOf(spotId, r);
  const g = RARITY[r].weight;
  return w > g ? 'high' : w < g ? 'low' : 'mid';
}
const LEVEL_TEXT = { high: '높음', mid: '보통', low: '낮음', none: '—' } as const;
const LEVEL_CLS = {
  high: 'text-gold', mid: 'text-text-dim', low: 'text-accent', none: 'text-text-dim opacity-50',
} as const;

// 지역 탭 — 존 계층 모델로 동작한다(spec/zone-tree.md).
//  로어 슬롯: **항상 존(범위) 정보** — 셀 구역 체인 중 가장 구체적인 존(해구 위면 해구,
//             열린 바다면 최상위). 어군 근처여도 존 로어는 바뀌지 않는다.
//  수역 정보 슬롯: 캐스팅 사거리 내 어군 상세 ⇄ 가까운 어군 목록(거리순 3개, 게임 축척 미터)
//  등급 분포: 최상위 존 서브트리의 어군 등급 흐름(높음/보통/낮음 — 정성 표시)
// 좌표·어군·구역은 전역 스토어(Field가 기록, 저장 안 함 — 클라 신뢰).
export default function RegionTab({ region, game }: { region: RegionId; game: GameState }) {
  const pack = REGION_PACKS[region];
  const spots = spotsOfRegion(region); // 병합 바다 = 3존 서브트리 전부, 마을 = 연못·강

  const { spot: currentSpot, zone: storeZone, pos } = useSpotState();
  // 주목 어군 — 캐스팅 사거리 내 어군(같은 씬 소속만 유효; 거점/이전 지역 잔여는 무시)
  const focused = currentSpot && spots.some(s => s.id === currentSpot)
    ? spotById(currentSpot) : undefined;
  // 로어 문맥 — **셀 구역**(가장 구체적인 존)이 단일 근원. 스폰 직후 등 위치를 못 읽으면
  // 씬 지역의 기본 존(마을=마을, 병합 바다=태평양 — 고향 항구 소재)으로 폴백한다.
  const contextZone: ZoneId = (storeZone && zoneById(storeZone)?.group === region)
    ? storeZone : defaultZoneOfRegion(region);
  const zone = zoneById(contextZone)!;
  // 등급 분포 = 최상위 존 서브트리(하위 존 어군을 부모 쪽으로 합산) — 구역 이동 시 표가 안 흔들린다
  const tableSpots = subtreeSpots(topZoneOf(contextZone));

  // 거리 — 플레이어 좌표 → 어군의 가장 가까운 군집(학교) 지점. 좌표 없으면 Infinity(순서 유지).
  const distPxTo = (s: (typeof spots)[number]): number => {
    if (!pos) return Infinity;
    let best = Infinity;
    for (const sc of pack.schools) {
      if (sc.spot !== s.id) continue;
      const d = Math.hypot(sc.x - pos.x, sc.y - pos.y);
      if (d < best) best = d;
    }
    return best;
  };
  const nearby = [...spots].sort((a, b) => distPxTo(a) - distPxTo(b)).slice(0, NEARBY_MAX);

  return (
    <div className="flex flex-col gap-3">
      {/* 로어 슬롯 — 고정 높이. **존(범위) 정보만** 뜬다 — 어군 상세와 배타 교체하지 않는다 */}
      <div className={cx(LORE_H, 'shrink-0 overflow-hidden pf-frame p-2 flex flex-col justify-center gap-0.5')}>
        <h3 className="text-sm text-gold pf-accent truncate">
          {zone.name}
        </h3>
        <p className="text-accent text-xs">{zone.tagline}</p>
        <p className="text-2xs leading-[1.6] text-text-dim line-clamp-3">
          {zone.lore}
        </p>
      </div>

      {/* 수역 정보 — 고정 높이 슬롯. 캐스팅 사거리 내 어군 상세 ⇄ 가까운 어군 목록 배타 교체.
          **존 로어를 덮지 않는다** — 로어 슬롯(존 정보)과 별개 슬롯이다(spec/zone-tree.md §2) */}
      <div className="shrink-0">
        <SectionTitle>어군 정보</SectionTitle>
        <div className={cx(SLOT_H, 'overflow-y-auto pf-frame p-0 flex flex-col')}>
          {focused ? (
            /* ── 사거리 내 어군 상세 ── */
            <div className="flex flex-col flex-1 p-2 gap-1.5">
              <CardCarousel perView={FISH_PER_VIEW}>
                {FISH.filter(f => f.spot === focused.id)
                  .sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity))
                  .map(f => {
                    const caught = speciesDiscovered(game, f.id);
                    return (
                      <div key={f.id} data-rarity={f.rarity}
                           className={cx(RARITY_CARD, 'p-1 basis-(--card-w)', !caught && 'opacity-[0.72]')}>
                        <FishSprite fish={f} preset="thumb" form="normal" discovered={caught}
                                    ariaLabel={caught ? f.name : '미확인 어종'}
                                    className="block mx-auto" />
                        <div className="text-2xs leading-tight truncate">{caught ? f.name : '???'}</div>
                        <div className="text-2xs leading-tight"><RarityText rarity={f.rarity} /></div>
                      </div>
                    );
                  })}
              </CardCarousel>
              <p className="text-2xs leading-[1.5] text-text-dim border-t border-line pt-1.5">
                {spotTendencyText(focused.id)}
              </p>
            </div>
          ) : (
            /* ── 가까운 어군 (거리순 3개, 가벼운 UI) ── */
            <div className="flex flex-col divide-y divide-line">
              {nearby.map(s => {
                const open = canFishSpot(game, s.id);
                const d = distPxTo(s);
                return (
                  <div key={s.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
                    <span className="truncate">{s.name}</span>
                    <span className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                      {Number.isFinite(d) && <span className="text-text-dim">{fmtMeters(d)}</span>}
                      {open ? (
                        <span className="text-text-dim">낚시 가능</span>
                      ) : (
                        <span className="flex items-center gap-0.5 text-text-dim">
                          <PixelIcon glyph="lock" size={10} />{BOATS[s.boatTier - 1].name} 필요
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 등급 분포 — **최상위 존 서브트리** 어군 × 등급의 흐름(높음/보통/낮음, 정성).
          수역 오버라이드(rarityWeight)를 글로벌 기본값과 비교한 조회 뷰다 — 확률 자체는
          drawRows 단일 출처. 하위 존(해구 등) 위에서도 최상위 존 표가 유지돼 자주 바뀌지 않는다.
          서브트리마다 행 수가 다르다(마을 2 / 태평양 2 / 동남아 3 / 인도양 2) — 높이 고정 */}
      <div className="shrink-0">
        <SectionTitle>등급 분포 — {zoneById(topZoneOf(contextZone))!.name}</SectionTitle>
        <div className={cx(TABLE_H, 'pf-frame p-2 overflow-x-auto overflow-y-hidden')}>
          <table className="w-full text-2xs">
            <thead>
              <tr className="text-text-dim">
                <th scope="col" className="text-left font-normal pb-1">어군</th>
                {RARITY_ORDER.map(r => <th scope="col" key={r} className="font-normal pb-1 w-[3.6em]">{RARITY[r].name}</th>)}
              </tr>
            </thead>
            <tbody className="border-t border-line">
              {tableSpots.map(s => (
                <tr key={s.id} className="border-b border-line last:border-b-0">
                  <td className="py-1 pr-1 text-xs truncate">
                    {s.name}
                    {!canFishSpot(game, s.id) && <PixelIcon glyph="lock" size={9} className="ml-1 inline-block align-baseline" />}
                  </td>
                  {RARITY_ORDER.map(r => {
                    const lv = gradeLevel(s.id, r);
                    return <td key={r} className={cx('py-1 text-center', LEVEL_CLS[lv])}>{LEVEL_TEXT[lv]}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 팁·조작 — 최상위 존 기준(하위 존은 부모 폴백). 항목 수가 가변(3~4개)이라 한
          컨테이너에 묶어 높이 고정. 이 아래는 아무것도 없으므로 이 컨테이너가 길어질 일도,
          위 섹션을 밀어낼 일도 없다 */}
      <div className={cx(FOOT_H, 'shrink-0 overflow-y-auto flex flex-col gap-2')}>
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
