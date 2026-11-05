// 작은 노치 — 칩, 토글, 꼬리표처럼 높이가 낮은 요소의 모서리를 3px 깎는다.
// 프레임과 패널의 6px 노치(pf-notch)를 그대로 쓰면 낮은 요소에서는 모서리가 지나치게 깎인다.
export const NOTCH_SM = '[clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]';
