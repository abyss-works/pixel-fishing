import { useState } from 'react';
import type { ReactNode } from 'react';
import { SlotContext } from './windowLayer';

/** 창 층 위에 따로 놓인 층(모바일 시트)이 자기 안에 창 자리를 만든다.
 *  자식에서 연 창은 이 층 바로 위, 이 층이 사라지면 함께 사라지는 자리에 그려진다. */
export default function WindowSlot({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  return (
    <SlotContext.Provider value={el}>
      {children}
      <div ref={setEl} className="contents" />
    </SlotContext.Provider>
  );
}
