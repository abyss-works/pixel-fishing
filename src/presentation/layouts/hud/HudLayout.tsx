import type { ReactNode } from 'react';
import type { GameState } from '../../../game/rules/logic';
import type { SceneRef } from '../../../game/world';
import { baitById } from '../../../game/content/baits';
import { REGION_PACKS } from '../../../game/world';
import type { Msg } from './useMessageLog';
import type { FilterChannel, MessageFilter } from '../../../features/display/model/messageFilter';
import { setMinimapVisible, useMinimapVisible } from '../../../features/display/service/minimapVisible';
import { cx } from '../../ui/cx';
import MessageLog from '../../ui/hud/MessageLog';
import { useLogHeight } from './useLogHeight';
import type { MessageChannel } from '../../ui/hud/messageFeed';
import HudChip from '../../ui/hud/HudChip';
import Minimap from '../../ui/hud/Minimap';
import HudHeader from './HudHeader';
import TimeBadge from '../../ui/hud/TimeBadge';
import PixelIcon from '../../ui/PixelIcon';
import Tip from '../../ui/Tip';
import { useMobileLayout } from '../useMobileLayout';

interface HudLayoutProps {
  game: GameState;
  /** 서버가 알려 준 길드 가방 용량 보너스(표시용) */
  bagBonus?: number;
  scene: SceneRef;
  log: Msg[];
  covered: boolean;
  onOpenStats: () => void;
  onOpenMap: () => void;
  /** 미니맵에 그릴 같은 바다의 길드원 위치 */
  guildMates?: () => readonly { x: number; y: number }[];
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
  /** 메시지 창에서 보이는 채널과 토글 */
  filter: MessageFilter;
  onToggleFilter: (channel: FilterChannel, present: readonly FilterChannel[]) => void;
  /** 메시지 창이 접혀 있는가와 접기 버튼. 접기를 쓰지 않으면 비운다 */
  folded?: boolean;
  onFold?: () => void;
  /** 헤더의 메뉴 버튼 */
  menu?: ReactNode;
  /** 모바일에서 낚시 상태 띠가 들어갈 자리를 알린다 */
  onStatusSlot?: (el: HTMLDivElement | null) => void;
}

// 플레이 화면에서 공통으로 쓰는 자원 표시, 미니맵, 시스템 로그를 배치한다.
// 오른쪽 아래는 한 줄기로 쌓는다 — 위에서부터 알림(notice), 칩 한 줄(접속 칩, 활성 미끼 칩, 시계, 지도 버튼 순서), 미니맵(바다에서만).
// 시계는 바다와 거점이 같은 자리이고, 미니맵을 숨겨도 남는다. 표시 상태를 바꾸는 지도 버튼은 정보 항목 뒤 줄 끝에 둔다.
// 아래 칸의 크기가 바뀌어도 위 칸이 따라 올라가 겹치지 않는다. 폭은 화면의 32.5%(156~292px)다.
// 모바일 레이아웃에서는 헤더(자원 바, 메뉴 버튼)가 맨 위 행, 메시지 창이 채팅 영역에 놓이고(각 컴포넌트가 자기 행을 정한다), 나머지는 게임 영역의
// 아래 가운데 한 줄기에 쌓는다 — 아래에서부터 오른쪽의 칩과 미니맵(156px), 알림 카드, 맨 위 낚시 상태 띠.
// 시트가 열려도 이 줄기는 자리를 지키고 시트가 그 위를 덮는다.
export default function HudLayout({ game, bagBonus = 0, scene, log, covered, onOpenStats, onOpenMap, notice, chips, badge, logFooter, onPickLine, you, channels, disabledChannels, guildMates, filter, onToggleFilter, folded, onFold, onStatusSlot, menu }: HudLayoutProps) {
  const mobile = useMobileLayout();
  const logRef = useLogHeight();
  const activeBait = baitById(game.activeBait);
  const baitLeft = activeBait ? game.items[activeBait.id] ?? 0 : null;
  const minimapVisible = useMinimapVisible();
  const hasMinimap = scene.kind === 'region';

  return (
    <>
      <HudHeader game={game} bagBonus={bagBonus} onOpenStats={onOpenStats} menu={menu} />
      <div className="contents mobile:absolute mobile:row-start-2 mobile:row-end-3 mobile:inset-x-2 mobile:bottom-2 mobile:z-(--z-overlay)
                      mobile:flex mobile:flex-col mobile:items-end mobile:gap-2 mobile:pointer-events-none">
        {mobile && <div ref={onStatusSlot} className="w-full flex justify-center empty:hidden" />}
        <div className="absolute right-3 bottom-3 z-(--z-overlay) w-[clamp(156px,32.5%,292px)]
                        flex flex-col items-end gap-2 pointer-events-none
                        mobile:static mobile:w-[156px]">
          {notice && <div className="w-full pointer-events-auto">{notice}</div>}
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
            <TimeBadge />
            {hasMinimap && !minimapVisible && (
              <Tip wraps className="flex" text="미니맵 보이기">
                <HudChip aria-label="미니맵 보이기" onClick={() => setMinimapVisible(true)}>
                  <PixelIcon glyph="plus" size={10} />
                </HudChip>
              </Tip>
            )}
          </div>
          {scene.kind === 'region' && minimapVisible && (
            <div className="w-full pointer-events-auto">
              <Minimap def={REGION_PACKS[scene.id]} boat={game.boat}
                       covered={covered} onOpenMap={onOpenMap} mates={guildMates}
                       onHide={() => setMinimapVisible(false)} />
            </div>
          )}
        </div>
      </div>
      <MessageLog rootRef={logRef} log={log} footer={logFooter} onPick={onPickLine} you={you}
                  filter={filter} onToggle={onToggleFilter} folded={folded} onFold={onFold}
                  channels={channels} disabledChannels={disabledChannels}
                  lines={mobile ? 5 : undefined} />
      {badge}
    </>
  );
}
