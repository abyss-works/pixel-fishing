import type { ReactNode } from 'react';
import type { GameState } from '../../../game/rules/logic';
import type { SceneRef } from '../../../game/world';
import { baitById } from '../../../game/content/baits';
import { REGION_PACKS } from '../../../game/world';
import type { Msg } from './useMessageLog';
import { useMessageFilter } from '../../../features/display/service/messageFilter';
import { cx } from '../../ui/cx';
import MessageLog from '../../ui/hud/MessageLog';
import type { MessageChannel } from '../../ui/hud/messageFeed';
import HudChip from '../../ui/hud/HudChip';
import Minimap from '../../ui/hud/Minimap';
import ResourceBar from '../../ui/hud/ResourceBar';
import Tip from '../../ui/Tip';

interface HudLayoutProps {
  game: GameState;
  /** 서버가 알려 준 길드 가방 용량 보너스(표시용) */
  bagBonus?: number;
  scene: SceneRef;
  log: Msg[];
  covered: boolean;
  onOpenStats: () => void;
  onOpenMap: () => void;
  /** 오른쪽 열 맨 위에 쌓을 알림(방치 결과 카드, 바다의 흔적 카드 등) */
  notice?: ReactNode;
  /** 미니맵 바로 위 칩 줄에서 활성 미끼 앞에 놓을 칩(바다의 접속 칩 등) */
  chips?: ReactNode;
  /** 스테이지 아래 가운데 표식(비운영 빌드의 환경 배지) — 위치는 표식이 정한다 */
  badge?: ReactNode;
  /** 메시지 창 아래 줄(채팅 입력) */
  logFooter?: ReactNode;
  /** 메시지 창에서 채팅 글줄의 보낸 사람을 골랐다 */
  onPickLine?: (m: Msg) => void;
  /** 내 id — 메시지 창에서 내 채팅 이름을 구분한다 */
  you?: string | null;
  /** 메시지 창에 늘 보일 채널 토글과 그중 쓸 수 없는 채널 */
  channels?: readonly MessageChannel[];
  disabledChannels?: readonly MessageChannel[];
}

// 플레이 화면에서 공통으로 쓰는 자원 표시, 미니맵, 시스템 로그를 배치한다.
// 오른쪽 아래는 한 줄기로 쌓는다 — 위에서부터 알림(notice), 칩 한 줄(chips와 활성 미끼), 미니맵(바다에서만).
// 아래 칸의 크기가 바뀌어도 위 칸이 따라 올라가 겹치지 않는다. 폭은 화면의 32.5%(156~292px)다.
export default function HudLayout({ game, bagBonus = 0, scene, log, covered, onOpenStats, onOpenMap, notice, chips, badge, logFooter, onPickLine, you, channels, disabledChannels }: HudLayoutProps) {
  const activeBait = baitById(game.activeBait);
  const baitLeft = activeBait ? game.items[activeBait.id] ?? 0 : null;
  const messageFilter = useMessageFilter();

  return (
    <>
      <ResourceBar game={game} bagBonus={bagBonus} onOpen={onOpenStats} />
      <div className="absolute right-3 bottom-3 z-(--z-overlay) w-[clamp(156px,32.5%,292px)]
                      flex flex-col items-end gap-2 pointer-events-none">
        {notice && <div className="w-full pointer-events-auto">{notice}</div>}
        {(chips || activeBait) && (
          <div className="flex items-center justify-end gap-1.5 pointer-events-auto">
            {chips}
            {activeBait && (
              <Tip plain className="flex" text={`${activeBait.name} ${baitLeft}개 남음`}>
                <HudChip aria-label="활성 미끼">
                  <span className="size-2.5 shrink-0" style={{ backgroundColor: activeBait.color }} />
                  <span className="sr-only">{activeBait.name}</span>
                  <span className={cx('pf-accent leading-none', baitLeft === 0 ? 'text-text-dim' : 'text-gold')}>
                    {baitLeft}
                  </span>
                </HudChip>
              </Tip>
            )}
          </div>
        )}
        {scene.kind === 'region' && (
          <div className="w-full pointer-events-auto">
            <Minimap def={REGION_PACKS[scene.id]} boat={game.boat}
                     covered={covered} onOpenMap={onOpenMap} />
          </div>
        )}
      </div>
      <MessageLog log={log} footer={logFooter} onPick={onPickLine} you={you}
                  filter={messageFilter.filter} onToggle={messageFilter.toggle}
                  channels={channels} disabledChannels={disabledChannels} />
      {badge}
    </>
  );
}
