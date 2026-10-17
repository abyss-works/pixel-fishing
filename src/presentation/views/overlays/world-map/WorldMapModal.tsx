import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import Modal from '../../../ui/Modal';
import Note from '../../../ui/Note';
import PageTitle from '../../../ui/PageTitle';
import { cx } from '../../../ui/cx';
import PillButton from '../../../ui/PillButton';
import PixelIcon from '../../../ui/PixelIcon';
import {
  FULL_VIEW, MAP_ZOOM_MAX, MAP_ZOOM_MIN, MAP_ZOOM_STEP, clampView, loadMapView, panBy, saveMapView, zoomAt,
} from './mapView';
import type { MapView } from './mapView';
import { WORLD_MAP } from '../../../../game/world';
import type { CompiledMap, Point } from '../../../../game/world/types';
import { useSpotState } from '../../../../features/travel/service/useSpotState';

// 세계지도 모달 — 미니맵 클릭으로 열린다(구 R23b "지역 탭" 대체, 사용자 확정 2026-08-28).
// 지구 전체를 그리되 지금 항해할 수 있는 세계(구현 영역)만 컬러, 나머지는 흑백 —
// "세계는 이만큼 남았다"는 다음 콘텐츠 예고를 색으로만 한다(라벨 없음 — 사용자 확정).
// earth 마스크(~178KB)는 이 화면에서만 쓰므로 아틀라스 모듈째 **동적 import**한다 —
// 첫 오픈 전까지 초기 번들에 녹지 않는다. 로딩 순간엔 캔버스 자리만 유지된다.
// 확대·축소(휠·버튼)와 끌어서 이동을 지원한다. 지형은 배율대로 키워 그리고, 라벨·점은
// 위치만 옮겨 크기를 유지한다. 보던 배율과 위치는 기기에 남겨 창을 닫았다 열어도 이어서 보여 준다.

interface AtlasModule {
  ATLAS_W: number;
  ATLAS_H: number;
  EARTH_MAP: CompiledMap;
  renderAtlasBase: (ctx: CanvasRenderingContext2D, earth: CompiledMap) => void;
  renderAtlasOverlay: (ctx: CanvasRenderingContext2D, worldMap: CompiledMap,
                       player: Point | null, t: number, view: MapView) => void;
}

const DEFAULT_W = 1280, DEFAULT_H = 604;

export default function WorldMapModal({ world, onClose }: {
  /** 병합 바다 씬에서 열렸는가 — 마을 씬이면 위치가 아니라 항구 점을 보여준다 */
  world: boolean;
  onClose: () => void;
}) {
  // 열 때만 위치를 구독해 모달을 닫았을 때 이동 상태가 화면 트리에 전파되지 않게 한다.
  const { pos } = useSpotState();
  const player = world ? pos : null;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Point | null>(player);
  const [atlas, setAtlas] = useState<AtlasModule | null>(null);
  const [view, setView] = useState<MapView>(() => clampView(loadMapView() ?? FULL_VIEW, DEFAULT_W, DEFAULT_H));
  const viewRef = useRef(view);
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const w = atlas?.ATLAS_W ?? DEFAULT_W;
  const h = atlas?.ATLAS_H ?? DEFAULT_H;

  useEffect(() => { playerRef.current = player; }, [player]);
  useEffect(() => { viewRef.current = view; saveMapView(view); }, [view]);

  // 화면 좌표 → 캔버스 내부 px (캔버스는 CSS로 늘어나 표시되므로 비율을 곱한다)
  const toCanvas = (clientX: number, clientY: number) => {
    const el = canvasRef.current;
    const r = el?.getBoundingClientRect();
    if (!el || !r || !r.width || !r.height) return { x: w / 2, y: h / 2 };
    return { x: (clientX - r.left) * (el.width / r.width), y: (clientY - r.top) * (el.height / r.height) };
  };
  const zoomBy = (factor: number) => setView(v => zoomAt(v, factor, w / 2, h / 2, w, h));

  // 휠 확대 — React의 onWheel은 passive라 페이지 스크롤을 막을 수 없어 직접 단다
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const p = r.width && r.height
        ? { x: (e.clientX - r.left) * (el.width / r.width), y: (e.clientY - r.top) * (el.height / r.height) }
        : { x: el.width / 2, y: el.height / 2 };
      const factor = e.deltaY < 0 ? MAP_ZOOM_STEP : 1 / MAP_ZOOM_STEP;
      setView(v => zoomAt(v, factor, p.x, p.y, el.width, el.height));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (viewRef.current.scale <= MAP_ZOOM_MIN) return; // 전체 보기에서는 끌 곳이 없다
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = toCanvas(e.clientX, e.clientY);
    dragRef.current = { id: e.pointerId, ...p };
    setDragging(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const p = toCanvas(e.clientX, e.clientY);
    dragRef.current = { id: d.id, ...p };
    setView(v => panBy(v, p.x - d.x, p.y - d.y, w, h));
  };
  const endDrag = () => { dragRef.current = null; setDragging(false); };

  // 아틀라스 모듈 로드 — 첫 오픈 때 1회 (lazy 청크: earth.mask + 렌더러)
  useEffect(() => {
    let alive = true;
    import('./atlas').then(m => {
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
      const v = viewRef.current;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(base, v.x, v.y, base.width / v.scale, base.height / v.scale,
                    0, 0, ctx.canvas.width, ctx.canvas.height);
      atlas.renderAtlasOverlay(ctx, WORLD_MAP, playerRef.current, now / 1000, v);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [atlas]);

  return (
    <Modal layer="app" onClose={onClose} className="pf-modal-worldmap">
      <PageTitle className="mb-2 pr-6">세계지도</PageTitle>
      <div className="relative">
        <canvas ref={canvasRef} width={w} height={h}
                className={cx('block w-full h-auto border border-line rounded-sm bg-bg touch-none',
                              '[image-rendering:pixelated]',
                              view.scale > MAP_ZOOM_MIN && (dragging ? 'cursor-grabbing' : 'cursor-grab'))}
                aria-label="세계지도"
                onPointerDown={onPointerDown} onPointerMove={onPointerMove}
                onPointerUp={endDrag} onPointerCancel={endDrag} />
        <div className="absolute top-2 right-2 flex items-center gap-1 pf-glass p-1 rounded-sm">
          <PillButton aria-label="축소" disabled={view.scale <= MAP_ZOOM_MIN}
                      onClick={() => zoomBy(1 / MAP_ZOOM_STEP)}>
            <PixelIcon glyph="minus" size={10} />
          </PillButton>
          <span className="pf-accent text-xs text-text-dim w-10 text-center" aria-live="polite">
            {Math.round(view.scale * 100)}%
          </span>
          <PillButton aria-label="확대" disabled={view.scale >= MAP_ZOOM_MAX}
                      onClick={() => zoomBy(MAP_ZOOM_STEP)}>
            <PixelIcon glyph="plus" size={10} />
          </PillButton>
          <PillButton disabled={view.scale <= MAP_ZOOM_MIN} onClick={() => setView(FULL_VIEW)}>
            전체
          </PillButton>
        </div>
      </div>
      <Note className="mb-0">
        밝은 바다는 지금 항해할 수 있는 세계다. 회색 물은 아직 이 배가 닿지 않는 곳 —
        해도가 다 채워지는 날까지 남겨둔 바다다. 휠이나 버튼으로 확대하고, 끌어서 둘러본다.
      </Note>
    </Modal>
  );
}
