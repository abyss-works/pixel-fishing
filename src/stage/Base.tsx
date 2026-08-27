import { useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';
import { FISH, boatNameOf, dexSpeciesCount } from '../game/logic';
import type { GameState } from '../game/logic';
import { furnitureAt, BASE_PACKS } from '../world';
import type { BaseId, FurnitureId } from '../world';
import { renderBase, W, H, CANVAS_W, CANVAS_H } from '../pixel';
import { useCanvasCover } from '../admin/canvasCover';
import GameFrame from './GameFrame';
import ResourceBar from './ResourceBar';

interface Props {
  base: BaseId; // 'home'(마을 집) | 'harbor'(대양 항구)
  game: GameState;
  /** 시설 클릭(캔버스) — 탭 전환/패널 선택/장면 이동은 전부 App이 결정한다 */
  onFacility?: (id: FurnitureId) => void;
  /** 자원 바 클릭 — 스탯창 모달 (App이 소유) */
  onOpenStats?: () => void;
}

// 거점 화면 — 캔버스와 그 위 자원 오버레이만 그린다.
// 판매/강화/배 상호작용 UI는 FacilityModal(스테이지 모달) 소관.
export default function Base({ base, game, onFacility, onOpenStats }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 캔버스 덮개(?admin 토글) — 캔버스 요소만 내리고 컴포넌트는 유지(Field와 같은 계약)
  const covered = useCanvasCover();

  const dexCount = dexSpeciesCount(game);
  const boatName = boatNameOf(game.boat, '배 없음');

  useEffect(() => {
    if (covered) return; // 캔버스가 없으면 그릴 것도 없다 — 열면 effect 재실행(deps)으로 복원
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    renderBase(ctx, BASE_PACKS[base], { rod: game.rod, boatName, dexCount, dexTotal: FISH.length });
  }, [base, game.rod, boatName, dexCount, covered]);

  // 캔버스 클릭 → 내부 좌표 → 시설 히트테스트 (R1~R3b)
  // 요소 박스 크기는 부모(.game-frame 상당)가 비율 고정으로 결정하므로
  // 박스 == 그림 영역 — 단순 비례 변환으로 충분하다. (jsdom은 rect 0×0 → 좌표 원본 통과)
  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (covered) return;
    const el = canvasRef.current!;
    const rect = el.getBoundingClientRect();
    const sx = rect.width ? W / rect.width : 1;
    const sy = rect.height ? H / rect.height : 1;
    const f = furnitureAt(base, (e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy);
    if (f) onFacility?.(f.id);
  };

  return (
    <>
      <GameFrame>
        {/* 덮개 상태면 캔버스 대신 같은 크기의 빈 패널 — GameFrame 16:9 박스는 유지된다 */}
        {covered ? (
          <div className="block w-full h-full bg-bg" aria-label="게임 화면(덮개)" />
        ) : (
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
                  className="block w-full h-full [image-rendering:pixelated] cursor-pointer bg-bg"
                  aria-label={base === 'home' ? '집' : '항구'} onClick={onClick} />
        )}
      </GameFrame>
      {/* 스테이지 기준 — 프레임의 형제 */}
      <ResourceBar game={game} onOpen={onOpenStats} />
    </>
  );
}
