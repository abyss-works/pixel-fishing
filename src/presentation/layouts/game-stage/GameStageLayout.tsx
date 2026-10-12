import type { ReactNode } from 'react';

export default function GameStageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex-1 min-w-0 overflow-hidden bg-bg flex items-center justify-center
                    [container-type:size] [--frame-h:min(65vh,100cqh,calc(100cqw*9/16))]
                    max-[820px]:flex-[1_1_55%]">
      {children}
    </div>
  );
}
