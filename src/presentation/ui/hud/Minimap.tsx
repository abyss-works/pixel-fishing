import { useEffect, useRef } from 'react';
import { renderWorldMap, minimapView, MINIMAP_VIEW_W, MINIMAP_VIEW_H } from '../../views/overlays/world-map/worldmap.js';
import type { RegionPack } from '../../../game/world/types';
import { zoneById, zoneOfSpot, topZoneOf } from '../../../game/content/zones';
import { getSpotState, subscribeSpotState } from '../../../game/world/currentSpot.js';
import TimeBadge from './TimeBadge';

// 미니맵 — 자기 캔버스를 소유하고 변경될 때만 그린다 (메인 rAF와 분리).
// 위치·구역·어군은 전역 스토어를 **직접 구독**한다: 좌표가 바뀌어도 React를 다시 그리지 않고
// 캔버스만 다시 그린다(이동 중 재렌더 해소). 생기(점멸·bob)는 500ms 틱이 맡는다.
// 프레임 ref를 읽지 않으므로 React 바깥 루프와 얽히지 않는다.
export default function Minimap({ def, boat, covered, onOpenMap }: {
  def: RegionPack;
  boat: number;
  covered: boolean;
  onOpenMap?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (covered) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      const { pos, zone, spot } = getSpotState();
      if (!pos) return;
      const displayZone = (spot ? zoneOfSpot(spot) : null) ?? (zone ? topZoneOf(zone) : null);
      renderWorldMap(ctx, def, pos, boat, {
        t: Date.now() / 1000, view: minimapView(def, pos),
        zoneName: displayZone ? zoneById(displayZone)?.name ?? null : null,
      });
    };
    draw();
    const unsubscribe = subscribeSpotState(draw);
    // 생기 틱 — 위치 변화가 없어도 점멸·bob이 이어지도록 500ms마다 다시 그린다.
    const id = setInterval(draw, 500);
    return () => { unsubscribe(); clearInterval(id); };
  }, [def, boat, covered]);

  return (
    <div className="absolute right-3 bottom-3 z-(--z-overlay) w-[clamp(120px,25%,225px)] aspect-video">
      {covered ? (
        <div className="w-full h-full border border-line rounded-sm bg-bg" aria-hidden="true" />
      ) : (
        <canvas ref={canvasRef}
                width={Math.min(MINIMAP_VIEW_W, def.w, 912)}
                height={Math.round(Math.min(MINIMAP_VIEW_W, def.w, 912)
                                   * Math.min(MINIMAP_VIEW_H, def.h) / Math.min(MINIMAP_VIEW_W, def.w))}
                className="w-full h-full [image-rendering:pixelated] border border-line rounded-sm bg-bg shadow-panel cursor-pointer"
                aria-label="미니맵"
                onClick={() => onOpenMap?.()} />
      )}
      <TimeBadge className="top-1.5 left-1.5" />
    </div>
  );
}
