import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cx } from '../cx';
import SubTabs from '../SubTabs';
import { CHANNEL_LABEL, MESSAGE_VISIBLE_LINES, channelsOf, isAtBottom } from './messageFeed';
import type { MessageChannel, Msg } from './messageFeed';

// 메시지 창 — 스테이지 왼쪽 아래의 채팅창형 기록.
// 높이는 기록 수와 무관하게 항상 정해진 줄 수만큼이다. 보관된 기록 전체를 담고, 휠로 이전 메시지를 거슬러 본다.
// 기록이 창보다 적으면 글줄을 창 아래쪽에 붙인다.
// 사용자가 위로 올려 읽는 중이 아니면 언제나 맨 아래(최신)를 보인다. 기록이 앞쪽에 끼어들어도(접속 직후 받은
// 최근 채팅 묶음처럼) 마찬가지다. 위로 올려 읽는 중이면 자리를 지키고, 다시 맨 아래로 내리면 또 따라 내려간다.
// 휠을 받으려고 창 상자는 포인터를 받는다. 창 바깥의 빈 열은 캔버스 클릭을 막지 않는다.
// 바탕은 마우스를 올렸을 때만 보인다(평소에는 글줄과 글자 그림자만). 스크롤 막대(HUD용 흰 막대)도 마우스를 올렸을 때만 보인다.
// 채널: 글줄마다 [채널] 머리표를 붙이고, 기록에 채널이 둘 이상 나타나면 창 위에 채널 탭(전체·채널별)을 그린다.
// 채팅: 원본이 있는 글줄의 보낸 사람 이름은 버튼이라 고르면 onPick이 받는다. footer는 창 아래(입력 줄 등)에 놓는다.

const TONE_CLS = { info: 'text-text', gold: 'text-gold', warn: 'text-danger' } as const;

/** 한 줄 높이(em) — 창 높이를 줄 수로 정한다 */
const LINE_EM = 1.45;

function Line({ m, onPick }: { m: Msg; onPick?: (m: Msg) => void }) {
  return (
    <div className={cx('leading-[1.45] text-shadow-hud', TONE_CLS[m.tone])}>
      <span className="text-text-dim text-2xs mr-0.5">{m.ts}</span>{' '}
      <span className="text-text-dim">[{CHANNEL_LABEL[m.channel]}]</span>{' '}
      {m.author && (m.from && onPick
        ? <button type="button" className="text-accent hover:underline cursor-pointer" onClick={() => onPick(m)}>{m.author}: </button>
        : <span className="text-accent">{m.author}: </span>)}
      {m.text}
    </div>
  );
}

type Tab = MessageChannel | 'all';

export default function MessageLog({ log, onPick, footer }: {
  log: Msg[];
  /** 채팅 글줄의 보낸 사람을 골랐다 */
  onPick?: (m: Msg) => void;
  footer?: ReactNode;
}) {
  const channels = channelsOf(log);
  const [channel, setChannel] = useState<Tab>('all');
  const shown = channels.length > 1 && channel !== 'all' ? log.filter(m => m.channel === channel) : log;

  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true); // 맨 아래를 보고 있는가

  // 채널을 바꾸면 맨 아래부터 다시 보인다(아래 효과보다 먼저 돈다)
  useLayoutEffect(() => { stickRef.current = true; }, [channel]);

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
      {channels.length > 1 && (
        <div className="pointer-events-auto">
          <SubTabs items={[{ key: 'all' as Tab, label: '전체' }, ...channels.map(c => ({ key: c as Tab, label: CHANNEL_LABEL[c] }))]}
                   activeKey={channel} onSelect={setChannel} />
        </div>
      )}
      <div ref={listRef} onScroll={onScroll} role="log" aria-label="메시지 기록"
           className="pointer-events-auto pf-glass-hover pf-scroll-hud border rounded-sm px-2 py-1
                      text-sm flex flex-col [&>:first-child]:mt-auto overflow-y-auto overscroll-contain select-text"
           style={{ height: `calc(${MESSAGE_VISIBLE_LINES * LINE_EM}em + 0.5rem + 2px)` }}>
        {shown.map(m => <Line key={`${m.channel}-${m.id}`} m={m} onPick={onPick} />)}
      </div>
      {footer && <div className="pointer-events-auto">{footer}</div>}
    </div>
  );
}
