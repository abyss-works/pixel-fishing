import Divider from '../Divider';
import Inset from '../Inset';
import { fmtRatioTight } from '../format';
import Tip from '../Tip';
import MobileHeaderFrame from './MobileHeaderFrame';
import MobileHudStat from './MobileHudStat';

// 의뢰 현황 - 일반 의뢰와 네임드 토벌의 오늘 남은 클리어 횟수. 헤더에서 자원 바 옆의 별도 틀이다.
// 두 칸은 오목한 칸 하나에 담고 세로 구분선으로 가른다. 칸마다 [도형 표지 | 값] 한 줄이다. 일반은 골드 네모, 네임드는 영웅 보라 다이아몬드로
// 색과 모양이 함께 다르다(색만으로 구분하지 않는다).
// 이름 글자는 화면에 그리지 않고 sr-only 이름과 칸의 툴팁이 알린다. 누르면 의뢰 창이 열리는 요소라 터치에서는 툴팁을 띄우지 않는다.
// 누르면 의뢰 창이 열린다(자원 바를 누르면 스탯 창이 열리는 것과 같다).
export default function MobileQuestStatus({ general, named, generalCap, namedCap, onOpen }: {
  /** 오늘 남은 클리어. 아직 모르면(null) 화면 값은 0, 툴팁과 접근성 이름은 -를 보인다 */
  general: number | null; named: number | null;
  /** 오늘 클리어 한도 - 툴팁이 "남은 수/한도"로 보인다 */
  generalCap: number; namedCap: number;
  onOpen?: () => void;
}) {
  return (
    <MobileHeaderFrame as="button" onClick={onOpen}
                 aria-label={`의뢰 창 열기, 오늘 남은 클리어 일반 ${general ?? '-'} 네임드 ${named ?? '-'}`}
                 className="flex p-0.5 cursor-pointer transition hover:brightness-125  mobile:col-start-2 mobile:row-start-1 mobile:mx-1 mobile:my-1">
      <Inset tone="deep" className="flex flex-1 items-center justify-center gap-0.5 px-0.5">
        <Tip wraps plain hoverOnly text={`일반 의뢰 오늘 남은 클리어 ${fmtRatioTight(general, generalCap)}`}>
          <MobileHudStat label="일반"><b className="font-bold">{general ?? 0}</b></MobileHudStat>
        </Tip>
        <Divider vertical />
        <Tip wraps plain hoverOnly text={`네임드 토벌 오늘 남은 클리어 ${fmtRatioTight(named, namedCap)}`}>
          <MobileHudStat label="네임드" tone="epic" marker="diamond"><b className="font-bold">{named ?? 0}</b></MobileHudStat>
        </Tip>
      </Inset>
    </MobileHeaderFrame>
  );
}
