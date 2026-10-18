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
import Panel from '../../../ui/Panel';
import FacilityIcon from './FacilityIcon';
import BoatSprite from '../../../ui/BoatSprite';
import { BUILDING_SPRITES, FURNITURE_SPRITES } from '../../../../game/rendering/pixel/sprites/buildings.js';
import type { Furniture } from '../../../../game/world';

interface Props {
  base: BaseId;
  game: GameState;
  /** 카드 선택 — 패널 선택과 장면 이동은 호출부가 결정한다 */
  onFacility?: (id: FurnitureId) => void;
}

// 집 아이콘(마을로 돌아가는 여객선 카드) — 마을 필드의 집 건물 스프라이트를 쓴다
const HOUSE_RECT = { x: 0, y: 0, w: 64, h: 52 };
const drawHouse = (ctx: Parameters<typeof BUILDING_SPRITES.house.draw>[0]) => BUILDING_SPRITES.house.draw(ctx, HOUSE_RECT);

/** 카드 아이콘 — 승선은 지금 내 배, 여객선은 집, 나머지는 가구 스프라이트 */
function CardIcon({ base, facility, boat }: { base: BaseId; facility: Furniture; boat: number }) {
  if (facility.id === 'exit' && base !== 'home' && boat > 0) {
    return <span data-icon="boat" className="flex h-full items-center justify-center"><BoatSprite tier={boat} preset="row" /></span>;
  }
  if (facility.id === 'travel') return <span data-icon="house" className="block h-full p-1"><FacilityIcon rect={HOUSE_RECT} draw={drawHouse} /></span>;
  return <FacilityIcon rect={facility} draw={ctx => FURNITURE_SPRITES[facility.sprite](ctx, facility)} />;
}

/** 시설 구역 — 구역 순서대로 놓고, 구역 안의 카드는 거점 데이터의 가구 순서를 따른다 */
const SECTIONS = ['정보', '상점', '이동'] as const;
const SECTION_OF: Record<FurnitureId, (typeof SECTIONS)[number]> = {
  rank: '정보', bounty: '정보',
  rod: '상점', boat: '상점', shop: '상점', sell: '상점',
  travel: '이동', exit: '이동',
};

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
        <div className="flex flex-wrap items-start justify-center gap-3">
          {SECTIONS.map(section => {
            const items = pack.furniture.filter(f => SECTION_OF[f.id] === section);
            if (items.length === 0) return null;
            return (
              <Panel key={section} title={section}>
                <div className="flex gap-2">
                  {items.map(f => {
                    const label = f.label(info);
                    const [title, sub] = label.split(' · ');
                    return (
                      <Button key={f.id} type="button" aria-label={label} data-facility={f.id}
                              onClick={() => onFacility?.(f.id)}
                              className="flex w-[clamp(84px,12vw,128px)] flex-col items-center gap-1 px-1.5 py-2">
                        <span className="h-14 w-full"><CardIcon base={base} facility={f} boat={game.boat} /></span>
                        <span className="pf-accent text-sm text-gold">{title}</span>
                        {sub && <span className="text-xs text-text-dim">{sub}</span>}
                      </Button>
                    );
                  })}
                </div>
              </Panel>
            );
          })}
        </div>
      </div>
      <TimeBadge className="top-2 right-2" />
    </GameFrame>
  );
}
