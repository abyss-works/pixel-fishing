import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cx } from '../cx';
import SubTabs from '../SubTabs';
import { CHANNEL_LABEL, MESSAGE_VISIBLE_LINES, channelsOf } from './messageFeed';
import type { MessageChannel, Msg } from './messageFeed';

// 메시지 창 — 스테이지 왼쪽 아래의 채팅창형 기록.
// 높이는 기록 수와 무관하게 항상 정해진 줄 수만큼이다. 보관된 기록 전체를 담고, 휠로 이전 메시지를 거슬러 본다.
// 기록이 창보다 적으면 글줄을 창 아래쪽에 붙인다.
// 맨 아래를 보고 있을 때만 새 메시지를 따라 내려가고, 위로 올려 읽는 중이면 자리를 지킨다.
// 휠을 받으려고 창 상자는 포인터를 받는다. 창 바깥의 빈 열은 캔버스 클릭을 막지 않는다.
// 바탕은 마우스를 올렸을 때만 보인다(평소에는 글줄과 글자 그림자만). 스크롤 막대는 HUD용 흰 막대다.
// 채널: 글줄마다 [채널] 머리표를 붙이고, 기록에 채널이 둘 이상 나타나면 창 위에 채널 탭을 그린다.

const TONE_CLS = { info: 'text-text', gold: 'text-gold', warn: 'text-danger' } as const;

/** 한 줄 높이(em) — 창 높이를 줄 수로 정한다 */
const LINE_EM = 1.45;

function Line({ m }: { m: Msg }) {
  return (
    <div className={cx('leading-[1.45] text-shadow-hud', TONE_CLS[m.tone])}>
      <span className="text-text-dim text-2xs mr-0.5">{m.ts}</span>{' '}
      <span className="text-text-dim">[{CHANNEL_LABEL[m.channel]}]</span>{' '}
      {m.author && <span className="text-accent">{m.author}: </span>}
      {m.text}
    </div>
  );
}

export default function MessageLog({ log }: { log: Msg[] }) {
  const channels = channelsOf(log);
  const [channel, setChannel] = useState<MessageChannel>('system');
  const shown = channels.length > 1 ? log.filter(m => m.channel === channel) : log;

  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true); // 맨 아래를 보고 있는가
  const lastId = shown.at(-1)?.id;

  // 처음 그릴 때와 채널을 바꿀 때는 맨 아래(최신)부터 보여 준다
  useLayoutEffect(() => {
    stickRef.current = true;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [channel]);

  // 새 메시지 — 맨 아래를 보고 있을 때만 따라 내려간다
  useEffect(() => {
    const el = listRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
  };

  return (
    <div className="absolute left-3 bottom-3 z-(--z-overlay) w-[min(520px,58%)] flex flex-col items-stretch gap-1 pointer-events-none">
      {channels.length > 1 && (
        <div className="pointer-events-auto">
          <SubTabs items={channels.map(c => ({ key: c, label: CHANNEL_LABEL[c] }))}
                   activeKey={channel} onSelect={setChannel} />
        </div>
      )}
      <div ref={listRef} onScroll={onScroll} role="log" aria-label="메시지 기록"
           className="pointer-events-auto pf-glass-hover pf-scroll-hud border rounded-sm px-2 py-1
                      text-sm flex flex-col [&>:first-child]:mt-auto overflow-y-auto overscroll-contain select-text"
           style={{ height: `calc(${MESSAGE_VISIBLE_LINES * LINE_EM}em + 0.5rem + 2px)` }}>
        {shown.map(m => <Line key={m.id} m={m} />)}
      </div>
    </div>
  );
}
