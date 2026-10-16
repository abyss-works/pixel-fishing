import type { ReactNode } from 'react';
import Badge from './Badge';
import Frame from './Frame';

// 상세 머리 — 무엇이 되나/무엇을 사나. 큰 그림 + 이름 + 꼬리표(단계·해금·보유 등).
// 정비 패널·상점처럼 2열 상세(TwoColumn)의 오른쪽 맨 위에 둔다.
export default function HeroHeader({ sprite, title, tags }: { sprite: ReactNode; title: string; tags: ReactNode[] }) {
  return (
    <Frame className="bg-surface-2 flex items-center gap-4 px-3 py-3">
      <span className="shrink-0 flex items-center justify-center">{sprite}</span>
      <div className="min-w-0 flex flex-col gap-1.5">
        <div className="text-gold pf-accent text-xl truncate">{title}</div>
        <div className="flex flex-wrap gap-1">
          {tags.map((t, i) => <Badge key={i}>{t}</Badge>)}
        </div>
      </div>
    </Frame>
  );
}
