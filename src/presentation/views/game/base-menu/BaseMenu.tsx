import { useEffect, useRef } from 'react';
import { boatNameOf } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import { BASE_PACKS } from '../../../../game/world';
import type { BaseId, FurnitureId } from '../../../../game/world';
import { renderBaseBackdrop } from '../../../../game/rendering/canvas/scenes/base.js';
import { BASE_CANVAS_W, BASE_CANVAS_H } from '../../../../game/rendering/pixel/common.js';
import { useCanvasCover } from '../../../layouts/game-stage/canvasCover';
import GameFrame from '../../../layouts/game-stage/GameFrame';
import NightOverlay from '../../../ui/hud/NightOverlay';
import TimeBadge from '../../../ui/hud/TimeBadge';
import Button from '../../../ui/Button';
import FacilityIcon from './FacilityIcon';

interface Props {
  base: BaseId;
  game: GameState;
  /** 카드 선택 — 패널 선택과 장면 이동은 호출부가 결정한다 */
  onFacility?: (id: FurnitureId) => void;
}

// 거점 카드 메뉴 — 거점 배경 위 가운데에 시설 카드를 거점 데이터의 가구 순서대로 늘어놓는다.
// 거점 Canvas 화면과 같은 속성을 받으며, 거점 데이터와 가구 스프라이트를 읽기만 한다.
export default function BaseMenu({ base, game, onFacility }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const covered = useCanvasCover();
  const pack = BASE_PACKS[base];
  const info = { rod: game.rod, boatName: boatNameOf(game.boat, '배 없음') };

  useEffect(() => {
    if (covered) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) renderBaseBackdrop(ctx, base);
  }, [base, covered]);

  const name = base === 'home' ? '집' : '항구';
  return (
    <GameFrame>
      {covered ? (
        <div className="block w-full h-full bg-bg" aria-label={`${name}(덮개)`} />
      ) : (
        <canvas ref={canvasRef} width={BASE_CANVAS_W} height={BASE_CANVAS_H}
                className="block w-full h-full [image-rendering:pixelated] bg-bg" aria-label={name} />
      )}
      <NightOverlay />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-[6%]">
        <p className="pf-accent pf-glass px-2 py-0.5 text-sm text-text">{pack.headline}</p>
        <div className="flex flex-wrap justify-center gap-2 max-w-[640px]">
          {pack.furniture.map(f => {
            const label = f.label(info);
            const [title, sub] = label.split(' · ');
            return (
              <Button key={f.id} type="button" aria-label={label} data-facility={f.id}
                      onClick={() => onFacility?.(f.id)}
                      className="flex w-[clamp(72px,14vw,112px)] flex-col items-center gap-1 px-1.5 py-2">
                <span className="h-10 w-full"><FacilityIcon facility={f} /></span>
                <span className="pf-accent text-xs text-gold">{title}</span>
                {sub && <span className="text-2xs text-text-dim">{sub}</span>}
              </Button>
            );
          })}
        </div>
      </div>
      <TimeBadge className="top-2 right-2" />
    </GameFrame>
  );
}
