import { useEffect, useRef } from 'react';
import { renderWorldMap, minimapView, MINIMAP_VIEW_W, MINIMAP_VIEW_H } from '../../views/overlays/world-map/worldmap.js';
import type { RegionPack } from '../../../game/world/types';
import { zoneById, zoneOfSpot, topZoneOf } from '../../../game/content/zones';
import { getSpotState, subscribeSpotState } from '../../../game/world/currentSpot.js';
import { useSchools } from '../../../features/gameplay/service/schoolDay';
import IconButton from '../IconButton';
import Tip from '../Tip';
import TimeBadge from './TimeBadge';

// 미니맵 — 자기 캔버스를 소유하고 변경될 때만 그린다 (메인 rAF와 분리).
// 위치·구역·어군은 전역 스토어를 **직접 구독**한다: 좌표가 바뀌어도 React를 다시 그리지 않고
// 캔버스만 다시 그린다(이동 중 재렌더 해소). 생기(점멸·bob)는 500ms 틱이 맡는다.
// 프레임 ref를 읽지 않으므로 React 바깥 루프와 얽히지 않는다.
// 자리와 폭은 HUD 배치(HudLayout)가 정한다 — 여기서는 받은 폭을 채우고 16:9를 지킨다.
export default function Minimap({ def, boat, covered, onOpenMap, onHide, mates }: {
  def: RegionPack;
  boat: number;
  covered: boolean;
  onOpenMap?: () => void;
  /** 오른쪽 위 빼기 버튼 — 미니맵을 숨긴다(다시 보이는 버튼은 HUD 칩 줄이 둔다) */
  onHide?: () => void;
  /** 지금 이 바다에 있는 길드원 위치 — 그릴 때마다 부른다 */
  mates?: () => readonly { x: number; y: number }[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 어군은 미니맵에만 그린다 — 세션의 배치 날짜가 바뀌면(부트 결과) 다시 그린다
  const schools = useSchools(def.id);

  useEffect(() => {
    if (covered) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      const { pos, zone, spot } = getSpotState();
      if (!pos) return;
      const displayZone = (spot ? zoneOfSpot(spot) : null) ?? (zone ? topZoneOf(zone) : null);
      renderWorldMap(ctx, def, schools, pos, boat, {
        t: Date.now() / 1000, view: minimapView(def, pos),
        zoneName: displayZone ? zoneById(displayZone)?.name ?? null : null,
        mates: mates?.(),
      });
    };
    draw();
    const unsubscribe = subscribeSpotState(draw);
    // 생기 틱 — 위치 변화가 없어도 점멸·bob이 이어지도록 500ms마다 다시 그린다.
    const id = setInterval(draw, 500);
    return () => { unsubscribe(); clearInterval(id); };
  }, [def, schools, boat, covered, mates]);

  return (
    <div className="relative w-full aspect-video">
      {covered ? (
        <div className="w-full h-full border border-line rounded-sm bg-bg" aria-hidden="true" />
      ) : (
        <canvas ref={canvasRef}
                width={Math.min(MINIMAP_VIEW_W, def.bounds.w, 912)}
                height={Math.round(Math.min(MINIMAP_VIEW_W, def.bounds.w, 912)
                                   * Math.min(MINIMAP_VIEW_H, def.bounds.h) / Math.min(MINIMAP_VIEW_W, def.bounds.w))}
                className="w-full h-full [image-rendering:pixelated] border border-line rounded-sm bg-bg shadow-panel cursor-pointer"
                aria-label="미니맵"
                onClick={() => onOpenMap?.()} />
      )}
      <TimeBadge className="top-1.5 left-1.5" />
      {onHide && (
        <Tip wraps text="미니맵 숨기기" className="absolute top-1.5 right-1.5 flex">
          <IconButton glyph="minus" size={12} aria-label="미니맵 숨기기" onClick={onHide}
                      className="pf-glass border border-line p-1 text-text hover:border-accent" />
        </Tip>
      )}
    </div>
  );
}
