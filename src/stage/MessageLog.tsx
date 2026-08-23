import { cx } from '../ui/cx';
import type { Msg } from '../hooks/useMessageLog';

// 메시지 톤 → 텍스트 색
const TONE_CLS = { info: 'text-text', gold: 'text-gold', warn: 'text-danger' } as const;

// 시스템 메시지 로그 오버레이 — 스테이지 좌하단, 최근 8개가 아래로 갈수록 선명 (v0.9 채팅 자리)
export default function MessageLog({ log }: { log: Msg[] }) {
  return (
    <div className="absolute left-3 bottom-3 z-(--z-overlay) w-[min(360px,55%)] flex flex-col gap-0.5 pointer-events-none"
         role="status" aria-live="polite">
      {log.slice(-8).map((m, i, arr) => (
        <div key={m.id}
             className={cx('text-sm leading-[1.45] bg-[rgba(6,12,24,0.45)] rounded-sm px-2 py-px w-fit max-w-full',
               'animate-fade-in [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]', TONE_CLS[m.tone])}
             style={{ opacity: 0.4 + 0.6 * ((i + 1) / arr.length) }}>
          <span className="text-text-dim text-2xs mr-0.5">{m.ts}</span> {m.text}
        </div>
      ))}
    </div>
  );
}
