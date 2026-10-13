import type { GameState } from '../../../game/rules/logic';
import type { SceneRef } from '../../../game/world';
import { baitById } from '../../../game/content/baits';
import { REGION_PACKS } from '../../../game/world';
import type { Msg } from './useMessageLog';
import { cx } from '../../ui/cx';
import MessageLog from '../../ui/hud/MessageLog';
import Minimap from '../../ui/hud/Minimap';
import ResourceBar from '../../ui/hud/ResourceBar';

interface HudLayoutProps {
  game: GameState;
  scene: SceneRef;
  log: Msg[];
  covered: boolean;
  onOpenStats: () => void;
  onOpenMap: () => void;
}

// 플레이 화면에서 공통으로 쓰는 자원 표시, 미니맵, 시스템 로그를 배치한다.
export default function HudLayout({ game, scene, log, covered, onOpenStats, onOpenMap }: HudLayoutProps) {
  const activeBait = baitById(game.activeBait);
  const baitLeft = activeBait ? game.items[activeBait.id] ?? 0 : null;

  return (
    <>
      <ResourceBar game={game} onOpen={onOpenStats} />
      {activeBait && (
        <div className={cx('absolute right-3 bottom-[152px] z-(--z-overlay) pointer-events-none',
                           'flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-line',
                           'bg-[rgba(10,21,38,0.72)] backdrop-blur-[4px]',
                           '[text-shadow:0_1px_2px_rgba(0,0,0,0.6)]')}
             aria-label="활성 미끼">
          <span className="w-2.5 h-2.5 rounded-full border border-line shrink-0"
                style={{ backgroundColor: activeBait.color }} />
          <span className="sr-only">{activeBait.name}</span>
          <span className={cx('pf-accent text-sm leading-none tracking-[0.5px]',
                              baitLeft === 0 ? 'text-text-dim' : 'text-gold')}>
            {baitLeft}
          </span>
        </div>
      )}
      {scene.kind === 'region' && (
        <Minimap def={REGION_PACKS[scene.id]} boat={game.boat}
                 covered={covered} onOpenMap={onOpenMap} />
      )}
      <MessageLog log={log} />
    </>
  );
}
