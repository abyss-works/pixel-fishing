import type { ReactNode } from 'react';
import { cx } from './cx';

// 안내문 본문 — 핵심 문장(lead) · 설명 문단 · 참고(aside)를 위계로 나눈다.
// 핵심 문장은 밝은 본문색, 설명은 낮은 톤, 참고는 왼쪽 선을 두른 작은 글씨로 둔다.
export default function NoticeBody({ lead, aside, className, children }: {
  /** 가장 먼저 읽어야 할 한 문장 */
  lead: ReactNode;
  /** 덧붙이는 주의·예외. 괄호로 감싸 쓰던 내용을 여기에 둔다 */
  aside?: ReactNode;
  className?: string;
  /** 설명 문단 — 문단마다 <p>로 나눈다 */
  children?: ReactNode;
}) {
  return (
    <div className={cx('flex flex-col gap-2 text-sm leading-[1.7]', className)}>
      <p className="text-base text-text">{lead}</p>
      {children && <div className="flex flex-col gap-1.5 text-text-dim">{children}</div>}
      {aside && <p className="border-l-2 border-line pl-2 text-xs text-text-dim">{aside}</p>}
    </div>
  );
}

/** 여러 줄 문자열 안내문 — 첫 줄은 핵심 문장, 괄호로 감싼 줄은 참고, 나머지는 설명 문단 */
export function TextNotice({ text }: { text: string }) {
  const [lead, ...rest] = text.split('\n').map(s => s.trim()).filter(Boolean);
  const asides = rest.filter(l => /^\(.*\)$/.test(l)).map(l => l.slice(1, -1));
  const paras = rest.filter(l => !/^\(.*\)$/.test(l));
  return (
    <NoticeBody lead={lead} aside={asides.length ? asides.join(' ') : undefined}>
      {paras.length ? paras.map((p, i) => <p key={i}>{p}</p>) : undefined}
    </NoticeBody>
  );
}
