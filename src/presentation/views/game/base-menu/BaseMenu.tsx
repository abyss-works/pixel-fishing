import { useEffect, useRef } from 'react';
import { boatNameOf } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import { BASE_PACKS } from '../../../../game/world';
import type { BaseId, FurnitureId } from '../../../../game/world';
import { BASE_EDGE_COLORS, renderBaseBackdrop } from '../../../../game/rendering/canvas/scenes/base.js';
import { BASE_CANVAS_W, BASE_CANVAS_H } from '../../../../game/rendering/pixel/common.js';
import { useCanvasCover } from '../../../layouts/game-stage/canvasCover';
import GameFrame from '../../../layouts/game-stage/GameFrame';
import { useMobileLayout } from '../../../layouts/useMobileLayout';
import NightOverlay from '../../../ui/hud/NightOverlay';
import MenuCard from '../../../ui/MenuCard';
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
  /** 켜면 이동 구역의 카드(마을행, 빠른 이동, 승선)를 비활성으로 둔다. 정보와 상점 카드는 그대로 눌린다 */
  locked?: boolean;
}

// 집 아이콘(마을로 돌아가는 여객선 카드) — 마을 필드의 집 건물 스프라이트를 쓴다
const HOUSE_RECT = { x: 0, y: 0, w: 64, h: 52 };
const drawHouse = (ctx: Parameters<typeof BUILDING_SPRITES.house.draw>[0]) => BUILDING_SPRITES.house.draw(ctx, HOUSE_RECT);

/** 카드 아이콘 — 승선은 지금 내 배, 마을행은 집, 나머지(빠른 이동 여객선 포함)는 가구 스프라이트 */
function CardIcon({ base, facility, boat }: { base: BaseId; facility: Furniture; boat: number }) {
  if (facility.id === 'exit' && base !== 'home' && boat > 0) {
    return <span data-icon="boat" className="flex h-full items-center justify-center"><BoatSprite tier={boat} preset="row" className="max-w-full" /></span>;
  }
  if (facility.id === 'travel') return <span data-icon="house" className="block h-full p-1"><FacilityIcon rect={HOUSE_RECT} draw={drawHouse} /></span>;
  return <FacilityIcon rect={facility} draw={ctx => FURNITURE_SPRITES[facility.sprite](ctx, facility)} />;
}

/** 시설 구역 — 구역 순서대로 놓고, 구역 안의 카드는 거점 데이터의 가구 순서를 따른다 */
const SECTIONS = ['정보', '상점', '이동'] as const;
const SECTION_OF: Record<FurnitureId, (typeof SECTIONS)[number]> = {
  rank: '정보', bounty: '정보',
  rod: '상점', boat: '상점', shop: '상점', sell: '상점', wardrobe: '상점',
  travel: '이동', ferry: '이동', exit: '이동',
};

// 거점 카드 메뉴 — 거점 배경 위 가운데에 시설 카드를 거점 데이터의 가구 순서대로 늘어놓는다.
// 메뉴 영역은 PC 레이아웃에서 16:9 프레임 전체, 모바일 레이아웃에서 헤더 아래부터 탭 줄 위까지(게임 영역)다.
// 거점 Canvas 화면과 같은 속성을 받으며, 거점 데이터와 가구 스프라이트를 읽기만 한다.
export default function BaseMenu({ base, game, onFacility, locked }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const covered = useCanvasCover();
  const mobile = useMobileLayout();
  const pack = BASE_PACKS[base];
  const info = { rod: game.rod, boatName: boatNameOf(game.boat, '배 없음') };

  useEffect(() => {
    if (covered) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) renderBaseBackdrop(ctx, base);
  }, [base, covered, mobile]);

  const name = base === 'home' ? '집' : '항구';
  const menu = (
    <div className="absolute inset-0 mobile:row-start-2 mobile:row-end-3 [container:basemenu/size]">
      {/* 채팅은 카드 위를 덮으므로 메뉴는 채팅 자리를 비우지 않는다. 세로로 스크롤하지 않고, 영역이 낮으면 카드가 줄어든다(MenuCard) */}
      <div className="absolute inset-0 flex flex-col px-[6%]">
        <div className="my-auto flex flex-col items-center gap-3">
          <p className="pf-accent pf-glass px-2 py-0.5 text-sm text-text">{pack.headline}</p>
          <div className="flex flex-wrap items-start justify-center gap-3">
            {SECTIONS.map(section => {
              const items = pack.furniture.filter(f => SECTION_OF[f.id] === section);
              if (items.length === 0) return null;
              return (
                <Panel key={section} title={section}>
                  <div className="flex gap-2">
                    {items.map(f => {
                      const { title, sub } = f.label(info);
                      return (
                        <MenuCard key={f.id} data-facility={f.id} onClick={() => onFacility?.(f.id)}
                                  disabled={locked === true && section === '이동'}
                                  icon={<CardIcon base={base} facility={f} boat={game.boat} />}
                                  title={title} sub={sub} subRole="omittable" />
                      );
                    })}
                  </div>
                </Panel>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  const scene = (
    <>
      {covered ? (
        <div className="block w-full h-full bg-bg" aria-label={`${name}(덮개)`} />
      ) : (
        <canvas ref={canvasRef} width={BASE_CANVAS_W} height={BASE_CANVAS_H}
                className="block w-full h-full [image-rendering:pixelated] bg-bg" aria-label={name} />
      )}
      <NightOverlay />
    </>
  );

  // 모바일은 그림을 스테이지 폭에 맞춰 세로 가운데에 두므로, 시설 카드는 그림이 아니라 스테이지 전체 위에 놓는다
  return mobile ? (
    <>
      <GameFrame fill={BASE_EDGE_COLORS[base]}>{scene}</GameFrame>
      {menu}
    </>
  ) : (
    <GameFrame>
      {scene}
      {menu}
    </GameFrame>
  );
}
