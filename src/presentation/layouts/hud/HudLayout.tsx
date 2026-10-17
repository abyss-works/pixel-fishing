import type { ReactNode } from 'react';
import type { GameState } from '../../../game/rules/logic';
import type { SceneRef } from '../../../game/world';
import { baitById } from '../../../game/content/baits';
import { REGION_PACKS } from '../../../game/world';
import type { Msg } from './useMessageLog';
import { cx } from '../../ui/cx';
import MessageLog from '../../ui/hud/MessageLog';
import HudChip from '../../ui/hud/HudChip';
import Minimap from '../../ui/hud/Minimap';
import ResourceBar from '../../ui/hud/ResourceBar';

interface HudLayoutProps {
  game: GameState;
  scene: SceneRef;
  log: Msg[];
  covered: boolean;
  onOpenStats: () => void;
  onOpenMap: () => void;
  /** 오른쪽 열 맨 위에 쌓을 알림(바다의 흔적 카드 등) */
  notice?: ReactNode;
}

// 플레이 화면에서 공통으로 쓰는 자원 표시, 미니맵, 시스템 로그를 배치한다.
// 오른쪽 아래는 한 줄기로 쌓는다 — 위에서부터 알림(notice), 활성 미끼, 미니맵(바다에서만).
// 아래 칸의 크기가 바뀌어도 위 칸이 따라 올라가 겹치지 않는다. 폭은 화면의 32.5%(156~292px)다.
export default function HudLayout({ game, scene, log, covered, onOpenStats, onOpenMap, notice }: HudLayoutProps) {
  const activeBait = baitById(game.activeBait);
  const baitLeft = activeBait ? game.items[activeBait.id] ?? 0 : null;

  return (
    <>
      <ResourceBar game={game} onOpen={onOpenStats} />
      <div className="absolute right-3 bottom-3 z-(--z-overlay) w-[clamp(156px,32.5%,292px)]
                      flex flex-col items-end gap-2 pointer-events-none">
        {notice && <div className="w-full pointer-events-auto">{notice}</div>}
        {activeBait && (
          <HudChip aria-label="활성 미끼">
            <span className="w-2.5 h-2.5 rounded-full border border-line shrink-0"
                  style={{ backgroundColor: activeBait.color }} />
            <span className="sr-only">{activeBait.name}</span>
            <span className={cx('pf-accent text-sm leading-none',
                                baitLeft === 0 ? 'text-text-dim' : 'text-gold')}>
              {baitLeft}
            </span>
          </HudChip>
        )}
        {scene.kind === 'region' && (
          <div className="w-full pointer-events-auto">
            <Minimap def={REGION_PACKS[scene.id]} boat={game.boat}
                     covered={covered} onOpenMap={onOpenMap} />
          </div>
        )}
      </div>
      <MessageLog log={log} />
    </>
  );
}
