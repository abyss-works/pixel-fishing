import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { cx } from '../cx';
import CloseButton from '../CloseButton';
import PillButton from '../PillButton';
import SubTabs from '../SubTabs';
import { CHANNEL_LABEL, MESSAGE_PREVIEW, channelsOf } from './messageFeed';
import type { MessageChannel, Msg } from './messageFeed';

// 메시지 창 — 스테이지 왼쪽 아래.
// 접힘(기본): 최근 메시지 몇 줄이 아래로 갈수록 선명하게 흘러간다. 캔버스 클릭을 막지 않도록
//   글줄은 포인터를 받지 않고, 펼치기 버튼만 받는다.
// 펼침: 보관된 기록 전체를 스크롤로 거슬러 본다. 맨 아래를 보고 있을 때만 새 메시지를 따라 내려가고,
//   위로 올려 읽는 중이면 자리를 지킨다.
// 채널: 기록에 채널이 둘 이상 나타나면(멀티플레이 채팅 등) 펼친 창 위에 채널 탭을 그린다.

const TONE_CLS = { info: 'text-text', gold: 'text-gold', warn: 'text-danger' } as const;

function Line({ m, className, style }: { m: Msg; className?: string; style?: CSSProperties }) {
  return (
    <div className={cx('text-sm leading-[1.45] text-shadow-hud', TONE_CLS[m.tone], className)} style={style}>
      <span className="text-text-dim text-2xs mr-0.5">{m.ts}</span>{' '}
      {m.author && <span className="text-accent">{m.author}: </span>}
      {m.text}
    </div>
  );
}

export default function MessageLog({ log }: { log: Msg[] }) {
  const [open, setOpen] = useState(false);
  const channels = channelsOf(log);
  const [channel, setChannel] = useState<MessageChannel>('system');
  const shown = channels.length > 1 ? log.filter(m => m.channel === channel) : log;

  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true); // 맨 아래를 보고 있는가
  const lastId = shown.at(-1)?.id;

  // 펼칠 때는 맨 아래(최신)부터 보여 준다
  useLayoutEffect(() => {
    if (!open) return;
    stickRef.current = true;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, channel]);

  // 새 메시지 — 맨 아래를 보고 있을 때만 따라 내려간다
  useEffect(() => {
    const el = listRef.current;
    if (open && el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [open, lastId]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
  };

  if (open) {
    return (
      <div className="absolute left-3 bottom-3 z-(--z-overlay) w-[min(360px,55%)]
                      pf-glass border border-line rounded-sm p-2 pt-7 flex flex-col gap-1">
        <span className="absolute top-1.5 left-2 text-xs text-text-dim">기록</span>
        <CloseButton onClose={() => setOpen(false)} />
        {channels.length > 1 && (
          <SubTabs items={channels.map(c => ({ key: c, label: CHANNEL_LABEL[c] }))}
                   activeKey={channel} onSelect={setChannel} />
        )}
        <div ref={listRef} onScroll={onScroll} role="log" aria-label="메시지 기록"
             className="max-h-[220px] overflow-y-auto flex flex-col gap-0.5 select-text">
          {shown.map(m => <Line key={m.id} m={m} />)}
        </div>
      </div>
    );
  }

  const recent = shown.slice(-MESSAGE_PREVIEW);
  return (
    <div className="absolute left-3 bottom-3 z-(--z-overlay) w-[min(360px,55%)] flex flex-col items-start gap-0.5 pointer-events-none">
      <PillButton className="pointer-events-auto pf-glass mb-0.5" aria-label="메시지 기록 펼치기"
                  onClick={() => setOpen(true)}>
        기록
      </PillButton>
      <div className="flex flex-col items-start gap-0.5 max-w-full" role="status" aria-live="polite">
        {recent.map((m, i, arr) => (
          <Line key={m.id} m={m}
                className="bg-[rgba(6,12,24,0.45)] rounded-sm px-2 py-px w-fit max-w-full animate-fade-in"
                style={{ opacity: 0.4 + 0.6 * ((i + 1) / arr.length) }} />
        ))}
      </div>
    </div>
  );
}
