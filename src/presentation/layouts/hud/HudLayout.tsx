import type { ReactNode } from 'react';
import type { GameState } from '../../../game/rules/logic';
import type { SceneRef } from '../../../game/world';
import { REGION_PACKS } from '../../../game/world';
import type { Msg } from './useMessageLog';
import type { FilterChannel, MessageFilter } from '../../../features/display/model/messageFilter';
import { setMinimapVisible, useMinimapVisible } from '../../../features/display/service/minimapVisible';
import { cx } from '../../ui/cx';
import MessageLog from '../../ui/hud/MessageLog';
import type { MessageChannel } from '../../ui/hud/messageFeed';
import HudChip from '../../ui/hud/HudChip';
import Minimap from '../../ui/hud/Minimap';
import HudHeader from './HudHeader';
import TimeBadge from '../../ui/hud/TimeBadge';
import PixelIcon from '../../ui/PixelIcon';
import Tip from '../../ui/Tip';
import { STACK_COLUMN_CLASS, STACK_TRUNK_CLASS } from '../../ui/hud/stackTier';
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
// 오른쪽 아래는 한 줄기로 쌓는다 — 위에서부터 알림(notice), 칩 한 줄(접속 칩, 시계, 지도 버튼 순서), 미니맵(바다에서만).
// 시계는 바다와 거점이 같은 자리이고, 미니맵을 숨겨도 남는다. 표시 상태를 바꾸는 지도 버튼은 정보 항목 뒤 줄 끝에 둔다.
// 아래 칸의 크기가 바뀌어도 위 칸이 따라 올라가 겹치지 않는다. 폭은 화면의 32.5%(156~292px)다.
// 모바일 레이아웃에서는 헤더(자원 바, 메뉴 버튼)가 맨 위 행이고, 나머지는 게임 영역 아래쪽 위에 겹치는 한 줄기에 쌓는다 —
// 아래에서부터 메시지 창(폭 전체), 그 위 오른쪽의 칩과 미니맵(156px), 알림 카드, 맨 위 낚시 상태 띠.
// PC 레이아웃도 스테이지 폭이 쌓기 단계(464 미만, stackTier)이면 같은 줄기로 쌓는다. 낚시 상태 띠는 줄기로 옮기지 않고 프레임 아래 가운데에 둔다.
// PC 레이아웃의 칩 줄은 열 폭에 다 들어가지 않으면 줄을 나눈다(순서는 그대로). 모바일 레이아웃은 한 줄이다.
// 메시지 창이 줄기의 마지막 자식이라 펼치거나 입력해 높이가 늘면 칩과 미니맵이 그 바로 위로 따라 올라가고, 스테이지 크기는 그대로다.
// 줄기의 층은 요소마다 따로 정한다 - 낚시 상태 띠, 알림, 칩, 미니맵은 스테이지 위 HUD 층(stage-hud), 메시지 창만 채팅 층(chrome)이다.
// 헤더의 펼친 메뉴 줄이 메시지 창 위에 오는 것은 DOM 순서가 아니라 층 토큰(menu-row)이 보장하고, 탭 이동 순서는 헤더, 채팅 순이다.
// 화면 키보드가 올라오면 줄기만 키보드 위로 올라가고(--keyboard-h, 탭 줄 높이 56px는 이미 비어 있다) 스테이지 크기는 그대로다.
// 시트가 열려도 이 줄기는 자리를 지키고 시트가 그 위를 덮는다.
export default function HudLayout({ game, bagBonus = 0, scene, log, covered, onOpenStats, onOpenMap, notice, chips, badge, logFooter, onPickLine, you, channels, disabledChannels, guildMates, filter, onToggleFilter, folded, onFold, onStatusSlot, menu }: HudLayoutProps) {
  const mobile = useMobileLayout();
  const minimapVisible = useMinimapVisible();
  const hasMinimap = scene.kind === 'region';

  return (
    <>
      <HudHeader game={game} bagBonus={bagBonus} onOpenStats={onOpenStats} menu={menu} />
      <div className={cx('contents mobile:absolute mobile:row-start-2 mobile:row-end-3 mobile:inset-x-2',
                         'mobile:bottom-[calc(0.5rem_+_max(0px,_var(--keyboard-h,0px)_-_3.5rem))]',
                         'mobile:flex mobile:flex-col mobile:items-end mobile:gap-2 mobile:pointer-events-none', STACK_TRUNK_CLASS)}>
        {mobile && <div ref={onStatusSlot} className="relative z-(--z-stage-hud) w-full flex justify-center empty:hidden" />}
        <div className={cx('absolute right-3 bottom-3 z-(--z-stage-hud) w-[clamp(156px,32.5%,292px)]',
                           'flex flex-col items-end gap-2 pointer-events-none',
                           'mobile:relative mobile:right-auto mobile:bottom-auto mobile:w-[156px]', STACK_COLUMN_CLASS)}>
          {notice && <div className="w-full pointer-events-auto">{notice}</div>}
          <div className="flex pc:flex-wrap items-center justify-end gap-1.5 pointer-events-auto">
            {chips}
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
        <MessageLog log={log} footer={logFooter} onPick={onPickLine} you={you}
                    filter={filter} onToggle={onToggleFilter} folded={folded} onFold={onFold}
                    channels={channels} disabledChannels={disabledChannels}
                    lines={mobile ? 5 : undefined} />
      </div>
      {badge}
    </>
  );
}
