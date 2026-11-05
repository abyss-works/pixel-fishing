import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FILTER_CHANNELS, isChannelShown } from '../../../features/display/model/messageFilter';
import type { MessageFilter } from '../../../features/display/model/messageFilter';
import { cx } from '../cx';
import ToggleChip from '../ToggleChip';
import { CHANNEL_LABEL, MESSAGE_VISIBLE_LINES, channelsOf, isAtBottom } from './messageFeed';
import type { MessageChannel, Msg } from './messageFeed';

// 메시지 창 — 스테이지 왼쪽 아래의 채팅창형 기록. 폭은 400px(좁은 스테이지에서는 58%)이다.
// 높이는 기록 수와 무관하게 항상 정해진 줄 수만큼이다. 보관된 기록 전체를 담고, 휠로 이전 메시지를 거슬러 본다.
// 기록이 창보다 적으면 글줄을 창 아래쪽에 붙인다.
// 사용자가 위로 올려 읽는 중이 아니면 언제나 맨 아래(최신)를 보인다. 기록이 앞쪽에 끼어들어도(접속 직후 받은
// 최근 채팅 묶음처럼) 마찬가지다. 위로 올려 읽는 중이면 자리를 지키고, 다시 맨 아래로 내리면 또 따라 내려간다.
// 휠을 받으려고 창 상자는 포인터를 받는다. 창 바깥의 빈 열은 캔버스 클릭을 막지 않는다.
// 기록 상자는 노치와 베벨 틀이다. 평소에는 글줄과 글자 그림자만 보이고, 마우스를 올렸거나 창 아래 입력 칸에서
// 입력하는 동안에만 반투명 바탕과 테두리를 보인다. 스크롤 막대(HUD용 흰 막대)도 마우스를 올렸을 때만 보인다.
// 채널: 머리표 없이 색으로 가른다. 채팅은 보낸 사람 이름(굵게)이 앞에 오고 본문은 본문색, 길드 채팅 본문은 길드색,
// 시스템은 본문색, 보상은 골드, 거부와 실패는 위험색이다. 시각은 픽셀 서체의 보조색으로 낮춘다.
// 기록에 채널이 둘 이상 나타나면 창 위에 기록에 나온 채널의 토글 칩(채팅, 길드, 시스템)을 그린다. 켜진 채널은
// 일반 켜짐 단계라 골드로 세우지 않는다. 꺼 둔 채널은 칩 안 이름 뒤에 점 자리를 두고, 새 글줄이 오면 네모 골드 점을 찍는다.
// 채널 표시를 바꾸면 맨 아래부터 다시 보인다.
// 채팅: 원본이 있는 글줄의 보낸 사람 이름은 버튼이라 고르면 onPick이 받는다. 내 이름은 골드, 다른 사람은 하늘색이다.
// footer는 창 아래(입력 줄 등)에 놓는다.

const TONE_CLS = { info: 'text-text', gold: 'text-gold', warn: 'text-danger' } as const;

/** 한 줄 높이(em) — 창 높이를 줄 수로 정한다 */
const LINE_EM = 1.45;

/** 기록 상자의 반투명 바탕 — 마우스를 올렸을 때와 창 안 입력 칸에 포커스가 있을 때 보인다 */
const GLASS_ON = cx(
  'hover:border-line hover:bg-[color-mix(in_oklab,var(--c-bg)_72%,transparent)] hover:backdrop-blur-[4px]',
  'hover:shadow-[inset_1px_1px_0_var(--bevel-lo),inset_-1px_-1px_0_var(--bevel-hi)]',
  'group-has-[input:focus]:border-line group-has-[input:focus]:bg-[color-mix(in_oklab,var(--c-bg)_72%,transparent)]',
  'group-has-[input:focus]:backdrop-blur-[4px]',
  'group-has-[input:focus]:shadow-[inset_1px_1px_0_var(--bevel-lo),inset_-1px_-1px_0_var(--bevel-hi)]',
);

function Line({ m, mine, onPick }: { m: Msg; mine: boolean; onPick?: (m: Msg) => void }) {
  const nameCls = cx('font-bold', mine ? 'text-gold' : 'text-accent');
  return (
    <div className={cx('leading-[1.45] text-shadow-hud', m.channel === 'guild' ? 'text-guild' : TONE_CLS[m.tone])}>
      <span className="pf-accent text-2xs text-text-dim mr-1">{m.ts}</span>
      {m.author && (m.from && onPick
        ? <button type="button" className={cx(nameCls, 'hover:underline cursor-pointer')} onClick={() => onPick(m)}>{m.author}</button>
        : <b className={nameCls}>{m.author}</b>)}
      {m.author && ' '}
      {m.text}
    </div>
  );
}

export default function MessageLog({ log, onPick, footer, you, filter = FILTER_CHANNELS, onToggle, channels, disabledChannels = [] }: {
  log: Msg[];
  /** 채팅 글줄의 보낸 사람을 골랐다 */
  onPick?: (m: Msg) => void;
  footer?: ReactNode;
  /** 내 id — 내가 보낸 채팅 글줄의 이름을 구분한다 */
  you?: string | null;
  /** 보이는 채널 */
  filter?: MessageFilter;
  /** 채널 토글을 눌렀다. present는 기록에 나온 채널(토글이 보이는 채널)이다. 없으면 토글을 그리지 않는다 */
  onToggle?: (channel: MessageChannel, present: readonly MessageChannel[]) => void;
  /** 기록과 관계없이 늘 보일 채널 토글. 없으면 기록에 나온 채널이 둘 이상일 때만 그린다 */
  channels?: readonly MessageChannel[];
  /** 토글은 보이되 쓸 수 없는 채널(흐림) — 길드에 들어가 있지 않을 때의 길드 */
  disabledChannels?: readonly MessageChannel[];
}) {
  const fixed = channels !== undefined;
  const listed = channels ?? channelsOf(log);
  const present = listed.filter(c => !disabledChannels.includes(c));
  const toggles = onToggle !== undefined && (fixed || present.length > 1);
  const shown = toggles ? log.filter(m => isChannelShown(filter, m.channel)) : log;
  /** 이 시각 뒤에 꺼 둔 채널에 온 글줄을 새 글줄로 친다 — 처음 그린 때와 토글을 누른 때 */
  const [hiddenSince, setHiddenSince] = useState(() => Date.now());
  const unread = (c: MessageChannel) => !isChannelShown(filter, c) && log.some(m => m.channel === c && m.at > hiddenSince);

  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true); // 맨 아래를 보고 있는가

  // 채널 표시를 바꾸면 맨 아래부터 다시 보인다(아래 효과보다 먼저 돈다)
  useLayoutEffect(() => { stickRef.current = true; }, [filter]);

  // 그릴 때마다 — 맨 아래를 보고 있으면 맨 아래로. 마지막 글줄만 보면 앞쪽에 끼어든 기록을 놓친다
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  });

  const onScroll = () => {
    const el = listRef.current;
    if (el) stickRef.current = isAtBottom(el);
  };

  return (
    <div className="group absolute left-3 bottom-3 z-(--z-overlay) w-[min(400px,58%)] flex flex-col items-stretch gap-1 pointer-events-none">
      {toggles && (
        <div className="pointer-events-auto self-start flex items-center gap-1.5 text-shadow-hud" role="group" aria-label="메시지 채널">
          {FILTER_CHANNELS.filter(c => listed.includes(c)).map(c => {
            const disabled = disabledChannels.includes(c);
            const on = !disabled && isChannelShown(filter, c);
            const dot = !on && !disabled && unread(c);
            return (
              <span key={c} className="inline-flex">
                <ToggleChip pressed={on} disabled={disabled}
                            onClick={() => { setHiddenSince(Date.now()); onToggle?.(c, present); }}>
                  {CHANNEL_LABEL[c]}
                  {!on && !disabled && <span className={cx('size-1.5', dot ? 'bg-gold' : 'invisible')} aria-hidden="true" />}
                </ToggleChip>
                {dot && <span className="sr-only">새 메시지</span>}
              </span>
            );
          })}
        </div>
      )}
      <div ref={listRef} onScroll={onScroll} role="log" aria-label="메시지 기록"
           className={cx('pointer-events-auto pf-scroll-hud pf-notch border-2 border-transparent px-2 py-1 text-sm',
             'flex flex-col [&>:first-child]:mt-auto overflow-y-auto overscroll-contain select-text',
             'transition-[background-color,border-color] duration-150', GLASS_ON)}
           style={{ height: `calc(${MESSAGE_VISIBLE_LINES * LINE_EM}em + 0.5rem + 4px)` }}>
        {shown.map(m => (
          <Line key={`${m.channel}-${m.id}`} m={m} mine={you != null && m.from?.uid === you} onPick={onPick} />
        ))}
      </div>
      {footer && <div className="pointer-events-auto">{footer}</div>}
    </div>
  );
}
