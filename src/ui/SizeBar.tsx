import { BIG_CATCH_PERCENTILE } from '../game/balance';

// 크기 막대 — 개체가 그 어종 분포에서 어디쯤인지 가로 길이로 보여준다.
// 백분위 숫자만으론 "큰 놈인가"가 한눈에 안 읽혀서 붙였다. 입력은 백분위 하나뿐.
//
// **연속이다.** 칸으로 끊지 않는다 — 백분위가 0.1% 단위로 나오는데 20% 칸으로 뭉개면
// 같은 칸 안의 개체를 구분할 수 없다. 정렬은 크기순인데 막대가 같아 보이면 막대가 거짓말을 한다.
//
// 색은 **트랙 전체 기준**으로 고정한다: 채운 길이에 따라 색이 늘어나면 같은 색이 다른 크기를
// 뜻하게 된다. 그래서 그라디언트를 트랙 폭만큼 키워(background-size) 채운 만큼만 잘라 보여준다.
// 마지막 20% 구간만 금색 = 월척. 채움이 그 경계를 넘는 조건이 `percentile <= 20`과 같아서
// 배지와 막대가 구조적으로 어긋날 수 없다 (칸으로 끊을 땐 반올림 때문에 어긋났다).
const BIG_AT = 100 - BIG_CATCH_PERCENTILE;
const RAMP = 'linear-gradient(90deg,'
  + ' var(--c-surface-2) 0%,'
  + ' var(--c-line) 35%,'
  + ` var(--c-text-dim) ${BIG_AT - 1}%,`
  + ` var(--c-gold) ${BIG_AT}%,`
  + ' var(--c-gold) 100%)';

export default function SizeBar({ percentile }: { percentile: number }) {
  const filled = Math.min(100, Math.max(0, 100 - percentile));
  if (filled <= 0) return null;
  return (
    <span className="block w-full h-[3px]" aria-hidden="true">
      <span
        className="block h-full"
        data-filled={filled}
        style={{
          width: `${filled}%`,
          backgroundImage: RAMP,
          backgroundSize: `${(100 / filled) * 100}% 100%`, // 잘라 보여주려고 트랙 폭까지 키운다
          backgroundRepeat: 'no-repeat',
        }}
      />
    </span>
  );
}
