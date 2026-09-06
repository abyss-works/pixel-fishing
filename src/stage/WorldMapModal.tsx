import { useEffect, useRef, useState } from 'react';
import Modal from '../ui/Modal';
import CloseButton from '../ui/CloseButton';
import { WORLD_MAP } from '../world';
import type { CompiledMap, Point } from '../world/types';

// 세계지도 모달 — 미니맵 클릭으로 열린다(구 R23b "지역 탭" 대체, 사용자 확정 2026-08-28).
// 지구 전체를 그리되 지금 항해할 수 있는 세계(구현 영역)만 컬러, 나머지는 흑백 —
// "세계는 이만큼 남았다"는 다음 콘텐츠 예고를 색으로만 한다(라벨 없음 — 사용자 확정).
// earth 마스크(~178KB)는 이 화면에서만 쓰므로 아틀라스 모듈째 **동적 import**한다 —
// 첫 오픈 전까지 초기 번들에 녹지 않는다. 로딩 순간엔 캔버스 자리만 유지된다.

interface AtlasModule {
  ATLAS_W: number;
  ATLAS_H: number;
  EARTH_MAP: CompiledMap;
  renderAtlasBase: (ctx: CanvasRenderingContext2D, earth: CompiledMap) => void;
  renderAtlasOverlay: (ctx: CanvasRenderingContext2D, worldMap: CompiledMap,
                       player: Point | null, t: number) => void;
}

export default function WorldMapModal({ player, onClose }: {
  /** 플레이어 위치(world 팩 좌표) — 마을 씬이면 null(경위도 없음, 항구 점이 고향을 가리킨다) */
  player: Point | null;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Point | null>(player);
  const [atlas, setAtlas] = useState<AtlasModule | null>(null);

  useEffect(() => { playerRef.current = player; }, [player]);

  // 아틀라스 모듈 로드 — 첫 오픈 때 1회 (lazy 청크: earth.mask + 렌더러)
  useEffect(() => {
    let alive = true;
    import('../pixel/scenes/atlas').then(m => {
      if (!alive) return;
      setAtlas({
        ATLAS_W: m.ATLAS_W, ATLAS_H: m.ATLAS_H, EARTH_MAP: m.EARTH_MAP,
        renderAtlasBase: m.renderAtlasBase, renderAtlasOverlay: m.renderAtlasOverlay,
      });
    });
    return () => { alive = false; };
  }, []);

  // 렌더 루프 — 지형은 base 오프스크린에 1회 캐시, 프레임마다 drawImage + 점멸 레이어만
  useEffect(() => {
    if (!atlas) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || typeof requestAnimationFrame === 'undefined') return;
    const base = document.createElement('canvas');
    base.width = atlas.ATLAS_W;
    base.height = atlas.ATLAS_H;
    const bctx = base.getContext('2d');
    if (!bctx) return;
    atlas.renderAtlasBase(bctx, atlas.EARTH_MAP);
    let raf = 0;
    const loop = (now: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.drawImage(base, 0, 0);
      atlas.renderAtlasOverlay(ctx, WORLD_MAP, playerRef.current, now / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [atlas]);

  return (
    <Modal layer="app" onClose={onClose} className="pf-modal-worldmap">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg text-gold pf-accent">세계지도</h3>
        <CloseButton onClick={onClose} />
      </div>
      <canvas ref={canvasRef} width={atlas?.ATLAS_W ?? 1280} height={atlas?.ATLAS_H ?? 604}
              className="block w-full h-auto border border-line rounded-sm bg-bg
                         [image-rendering:pixelated]"
              aria-label="세계지도" />
      <p className="text-2xs leading-[1.6] text-text-dim mt-2">
        밝은 바다는 지금 항해할 수 있는 세계다. 회색 물은 아직 이 배가 닿지 않는 곳 —
        해도가 다 채워지는 날까지 남겨둔 바다다.
      </p>
    </Modal>
  );
}
