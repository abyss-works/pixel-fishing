import { createContext, useContext } from 'react';

/** Modal이 title prop 없이 ModalCard/Panel을 감쌀 때(stage 레이어) role="dialog"에 접근성 이름을 연결한다 */
export const ModalTitleContext = createContext<{ id: string; register: () => void } | null>(null);

export const useModalTitle = () => useContext(ModalTitleContext);
