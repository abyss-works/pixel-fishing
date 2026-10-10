import { useEffect, useRef, useState } from 'react';
import { renderWorldMap, minimapView, MINIMAP_VIEW_W, MINIMAP_VIEW_H } from './worldmap.js';
import type { RegionPack } from '../../world/types';
import { zoneById, zoneOfSpot, topZoneOf } from '../../data/zones';
import { useSpotState } from '../../world/currentSpot';
import TimeBadge from './TimeBadge';

// 미니맵 — 자기 캔버스를 소유하고 변경될 때만 그린다 (메인 rAF와 분리).
// 위치·구역·어군은 전역 스토어 구독, 생기(점멸·bob)용 500ms 틱.
// 프레임 ref를 읽지 않으므로 React 바깥 루프와 얽히지 않는다.
export default function Minimap({ def, boat, covered, onOpenMap }: {
  def: RegionPack;
  boat: number;
  covered: boolean;
  onOpenMap?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { pos, zone, spot } = useSpotState();
  const [, setLife] = useState(0);
  const lastDrawn = useRef<{ sig: string; at: number }>({ sig: '', at: 0 });

  // 생기 틱 — 점멸·bob용. 위치·구역 변동은 스토어 구독으로 처리한다.
  useEffect(() => {
    const id = setInterval(() => setLife(t => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  const focusZone = spot ? zoneOfSpot(spot) : null;
  const displayZone = focusZone ?? (zone ? topZoneOf(zone) : null);

  useEffect(() => {
    if (covered) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !pos) return;
    // 이동 중이 아니면 생기 틱(500ms)에만 다시 그린다 — 정지 상태 60fps 재렌더 해소.
    const now = Date.now();
    const sig = `${pos.x},${pos.y},${zone},${spot},${boat}`;
    if (sig === lastDrawn.current.sig && now - lastDrawn.current.at < 400) return;
    lastDrawn.current = { sig, at: now };
    renderWorldMap(ctx, def, pos, boat,
      { t: now / 1000, view: minimapView(def, pos),
        zoneName: displayZone ? zoneById(displayZone)?.name ?? null : null });
  });

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
