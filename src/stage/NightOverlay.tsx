// 밤 화면 오버레이 — 낮/밤에 따라 게임 프레임 위에 어둠을 깐다.
//
// 순수 표시(연출): 캐치 판정·게임 규칙과 무관. 어둠 강도(dark 0~1)는 game/time.ts의
// darkness — 낮 0, 저녁부터 서서히 올라 자정 최대, 새벽에 다시 내려간다.
//
// 구현: "전체 어둠 + 플레이어 주변(화면 중앙) 조명"을 **한 오버레이**로 그린다.
//  - 바탕 = 밤 하늘색(#0a1020) 전체를 어둠 a로
//  - 중앙 = radial 구멍(투명) — 서 있는 곳은 덜 어둡다(조명)
//  최대 어둠도 "아, 어둡네" 수준을 넘지 않게 상한(사용자: 너무 어둡게 말 것).
import { useMemo } from 'react';
import { useGameTime } from '../hooks/useGameTime';

/** 밤 어둠 최대 강도 — 1이면 거의 새까매진다. 자정 기준 "꽤 어둡네" 수준. */
const MAX_DARK = 0.65;
/** 조명(중앙)이 어둠에서 제외되는 비율 — 커질수록 주변만 어둡다 */
const LIGHT_CUT = 0.6;

export default function NightOverlay() {
  const { dark } = useGameTime();
  const a = dark <= 0.01 ? 0 : Math.min(dark, MAX_DARK);

  const overlay = useMemo(() => {
    if (a === 0) return null;
    // 한 오버레이: 가장자리 = a, 중앙 원형 = a*(1-LIGHT_CUT) (조명 영역).
    // radial로 중앙만 밝게 뚫는다.
    const core = a * (1 - LIGHT_CUT);
    return (
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none"
           style={{
             background:
               `radial-gradient(ellipse 62% 58% at 50% 55%, ` +
               `rgba(10,16,32,${core.toFixed(3)}) 0%, ` +
               `rgba(10,16,32,${a.toFixed(3)}) 100%)`,
           }} />
    );
  }, [a]);

  return <>{overlay}</>;
}
