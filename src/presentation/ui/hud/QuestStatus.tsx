import Divider from '../Divider';
import Inset from '../Inset';
import HeaderFrame from './HeaderFrame';
import HudStat from './HudStat';

// 의뢰 현황 — 일반 의뢰와 네임드 토벌의 오늘 남은 클리어 횟수. 헤더에서 자원 바 옆의 별도 틀이다.
// 두 칸은 오목한 칸 하나에 담고 세로 구분선으로 가른다. 칸마다 위가 이름, 아래가 값이다.
// 네임드 값은 네임드 색(영웅 보라)이다. 누르면 의뢰 창이 열린다(자원 바를 누르면 스탯 창이 열리는 것과 같다).
export default function QuestStatus({ general, named, onOpen }: { general: number; named: number; onOpen?: () => void }) {
  return (
    <HeaderFrame as="button" onClick={onOpen}
                 aria-label={`의뢰 창 열기, 오늘 남은 클리어 일반 ${general} 네임드 ${named}`}
                 className="flex p-[7px] cursor-pointer transition hover:brightness-125 @max-[960px]:p-0.5 mobile:col-start-2 mobile:row-start-1 mobile:mx-1 mobile:my-1">
      <Inset tone="deep" className="flex flex-1 items-center justify-center gap-2.5 px-3 @max-[960px]:gap-1 @max-[960px]:px-1">
        <HudStat label="일반"><b className="font-bold">{general}</b></HudStat>
        <Divider vertical />
        <HudStat label="네임드" tone="epic"><b className="font-bold">{named}</b></HudStat>
      </Inset>
    </HeaderFrame>
  );
}
