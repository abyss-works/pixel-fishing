import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { isChannelShown } from '../../../features/display/model/messageFilter';
import type { MessageFilter } from '../../../features/display/model/messageFilter';
import { cx } from '../cx';
import CheckToggle from '../CheckToggle';
import { CHANNEL_LABEL, MESSAGE_VISIBLE_LINES, channelsOf, isAtBottom } from './messageFeed';
import type { MessageChannel, Msg } from './messageFeed';

// 메시지 창 — 스테이지 왼쪽 아래의 채팅창형 기록.
// 높이는 기록 수와 무관하게 항상 정해진 줄 수만큼이다. 보관된 기록 전체를 담고, 휠로 이전 메시지를 거슬러 본다.
// 기록이 창보다 적으면 글줄을 창 아래쪽에 붙인다.
// 사용자가 위로 올려 읽는 중이 아니면 언제나 맨 아래(최신)를 보인다. 기록이 앞쪽에 끼어들어도(접속 직후 받은
// 최근 채팅 묶음처럼) 마찬가지다. 위로 올려 읽는 중이면 자리를 지키고, 다시 맨 아래로 내리면 또 따라 내려간다.
// 휠을 받으려고 창 상자는 포인터를 받는다. 창 바깥의 빈 열은 캔버스 클릭을 막지 않는다.
// 바탕은 마우스를 올렸을 때만 보인다(평소에는 글줄과 글자 그림자만). 스크롤 막대(HUD용 흰 막대)도 마우스를 올렸을 때만 보인다.
// 채널: 글줄마다 [채널] 머리표를 붙이고, 기록에 채널이 둘 이상 나타나면 창 위에 채널 토글(채팅·시스템)을 그린다.
// 꺼 둔 채널에 새 글줄이 오면 그 토글 옆에 점을 찍는다. 채널 표시를 바꾸면 맨 아래부터 다시 보인다.
// 채팅: 원본이 있는 글줄의 보낸 사람 이름은 버튼이라 고르면 onPick이 받는다. 내 이름은 골드, 다른 사람은 하늘색이다.
// footer는 창 아래(입력 줄 등)에 놓는다.

const TONE_CLS = { info: 'text-text', gold: 'text-gold', warn: 'text-danger' } as const;

/** 한 줄 높이(em) — 창 높이를 줄 수로 정한다 */
const LINE_EM = 1.45;

const TOGGLES: MessageChannel[] = ['chat', 'system'];

function Line({ m, mine, onPick }: { m: Msg; mine: boolean; onPick?: (m: Msg) => void }) {
  const nameCls = mine ? 'text-gold' : 'text-accent';
  return (
    <div className={cx('leading-[1.45] text-shadow-hud', TONE_CLS[m.tone])}>
      <span className="text-text-dim text-2xs mr-0.5">{m.ts}</span>{' '}
      <span className="text-text-dim">[{CHANNEL_LABEL[m.channel]}]</span>{' '}
      {m.author && (m.from && onPick
        ? <button type="button" className={cx(nameCls, 'hover:underline cursor-pointer')} onClick={() => onPick(m)}>{m.author}: </button>
        : <span className={nameCls}>{m.author}: </span>)}
      {m.text}
    </div>
  );
}

export default function MessageLog({ log, onPick, footer, you, filter = 'all', onToggle }: {
  log: Msg[];
  /** 채팅 글줄의 보낸 사람을 골랐다 */
  onPick?: (m: Msg) => void;
  footer?: ReactNode;
  /** 내 id — 내가 보낸 채팅 글줄의 이름을 구분한다 */
  you?: string | null;
  /** 보이는 채널 */
  filter?: MessageFilter;
  /** 채널 토글을 눌렀다. 없으면 토글을 그리지 않는다 */
  onToggle?: (channel: MessageChannel) => void;
}) {
  const toggles = channelsOf(log).length > 1 && onToggle !== undefined;
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
    <div className="absolute left-3 bottom-3 z-(--z-overlay) w-[min(520px,58%)] flex flex-col items-stretch gap-1 pointer-events-none">
      {toggles && (
        <div className="pointer-events-auto self-start flex items-center gap-3 px-1 text-shadow-hud" role="group" aria-label="메시지 채널">
          {TOGGLES.map(c => (
            <span key={c} className="inline-flex items-center gap-1">
              <CheckToggle label={CHANNEL_LABEL[c]} checked={isChannelShown(filter, c)}
                           onChange={() => { setHiddenSince(Date.now()); onToggle?.(c); }} />
              {unread(c) && (
                <span className="w-1.5 h-1.5 rounded-full bg-gold">
                  <span className="sr-only">새 메시지</span>
                </span>
              )}
            </span>
          ))}
        </div>
      )}
      <div ref={listRef} onScroll={onScroll} role="log" aria-label="메시지 기록"
           className="pointer-events-auto pf-glass-hover pf-scroll-hud border rounded-sm px-2 py-1
                      text-sm flex flex-col [&>:first-child]:mt-auto overflow-y-auto overscroll-contain select-text"
           style={{ height: `calc(${MESSAGE_VISIBLE_LINES * LINE_EM}em + 0.5rem + 2px)` }}>
        {shown.map(m => (
          <Line key={`${m.channel}-${m.id}`} m={m} mine={you != null && m.from?.uid === you} onPick={onPick} />
        ))}
      </div>
      {footer && <div className="pointer-events-auto">{footer}</div>}
    </div>
  );
}
