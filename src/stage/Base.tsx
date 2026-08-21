import { useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';
import { BOATS, FISH } from '../game/logic';
import type { GameState } from '../game/logic';
import { furnitureAt, BASE_PACKS } from '../world';
import type { BaseId, FurnitureId } from '../world';
import { renderBase, W, H, CANVAS_W, CANVAS_H } from '../pixel';
import ResourceBar from './ResourceBar';

interface Props {
  base: BaseId; // 'home'(마을 집) | 'harbor'(대양 항구)
  game: GameState;
  /** 시설 클릭(캔버스) — 탭 전환/패널 선택/장면 이동은 전부 App이 결정한다 */
  onFacility?: (id: FurnitureId) => void;
}

// 거점 화면 — 캔버스와 그 위 자원 오버레이만 그린다.
// 판매/강화/배 상호작용 UI는 FacilityModal(스테이지 모달) 소관.
export default function Base({ base, game, onFacility }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const dexCount = FISH.filter(f => (game.caught[f.id] ?? 0) > 0).length;
  const boatName = game.boat === 0 ? '배 없음' : BOATS[game.boat - 1].name;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    renderBase(ctx, BASE_PACKS[base], { rod: game.rod, boatName, dexCount, dexTotal: FISH.length });
  }, [base, game.rod, boatName, dexCount]);

  // 캔버스 클릭 → 내부 좌표 → 시설 히트테스트 (R1~R3b)
  // 요소 박스 크기는 부모(.game-frame 상당)가 비율 고정으로 결정하므로
  // 박스 == 그림 영역 — 단순 비례 변환으로 충분하다. (jsdom은 rect 0×0 → 좌표 원본 통과)
  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const el = canvasRef.current!;
    const rect = el.getBoundingClientRect();
    const sx = rect.width ? W / rect.width : 1;
    const sy = rect.height ? H / rect.height : 1;
    const f = furnitureAt(base, (e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy);
    if (f) onFacility?.(f.id);
  };

  return (
    <>
      <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
              className="block w-full h-full [image-rendering:pixelated] cursor-pointer bg-bg"
              aria-label={base === 'home' ? '집' : '항구'} onClick={onClick} />
      <ResourceBar title={base === 'home' ? '집' : '항구'} game={game} />
    </>
  );
}
