import type { ReactNode } from 'react';
import type { TutorialId } from '../../../../game/content/tutorials';
import type { GameAction } from '../../../../game/rules/actions';
import { BOUNTY_DAILY_CAP, CHALLENGE_MISS_LIMIT } from '../../../../game/rules/balance';
import { GAME_DAY_RESET_TEXT } from '../../../../game/rules/time';
import { TICKET_EXPIRY_TEXT } from '../../../../game/rules/challenge';
import { useTutorial } from '../../../../features/tutorial/service/tutorial';
import { useWhatsNewPending } from '../../../../features/announcements/service/whatsNew';
import Modal from '../../../ui/Modal';
import Button from '../../../ui/Button';
import Note from '../../../ui/Note';
import PixelList from '../../../ui/PixelList';

// 튜토리얼 문구 — 도움말 화면과 같은 규칙 서술·용어를 쓴다. 네임드·밤 어종 이름은 스포일러라 쓰지 않는다.
// 수치는 규칙 모듈에서 읽는다(밸런스가 바뀌어도 문구가 옛 숫자로 남지 않게).
const TUTORIAL: Record<TutorialId, { title: string; lines: ReactNode[] }> = {
  village: {
    title: '마을에 오신 걸 환영해요',
    lines: [
      <><b>방향키</b> 또는 <b>WASD</b>로 걸어 다녀요.</>,
      <>물고기가 모인 자리(<b>어군</b>) 가까이에서 <b>스페이스</b>(또는 화면 누르기)를 누르면 찌를 던져요.</>,
      <>찌를 던진 뒤 <b>아무것도 안 눌러도</b> 잡혀요.<br />자리만 잡아 두면 낚시가 계속 이어져요.</>,
      <>잡은 물고기는 집의 <b>궤짝</b>에서 팔고, <b>작업대</b>에서 낚싯대를 강화해요.</>,
    ],
  },
  sea: {
    title: '바다에 나왔어요',
    lines: [
      <>바다는 여러 <b>구역</b>으로 이어져 있고, 구역마다 사는 물고기가 달라요.</>,
      <>다음 구역으로 가려면 그만한 <b>배</b>가 필요해요.<br />배가 부족하면 경계에서 되돌아와요.</>,
      <>바다마다 낚싯대 <b>파워</b> 요구치가 있어요.<br />모자라면 입질이 늦고 희귀한 물고기가 잘 걸리지 않아요.</>,
      <><b>항구</b>에 배를 대면 팔고 정비할 수 있어요.<br />항구의 <b>여객선</b>을 타면 마을로 돌아가요.</>,
      <>화면 구석의 미니맵을 누르면 <b>세계지도</b>가 열려요.</>,
    ],
  },
  'bounty-quests': {
    title: '일반 의뢰',
    lines: [
      <><b>수주</b>한 뒤에 그 구역에서 잡은 물고기만 세요.<br />수주하기 전에 잡은 물고기는 세지 않아요.</>,
      <>잡은 물고기는 가방에 그대로 남아요.<br />수만큼 잡았으면 수배판에서 <b>납품</b>을 눌러 골드를 받아요.</>,
      <>하루에 {BOUNTY_DAILY_CAP}번 클리어할 수 있어요.<br />의뢰는 {GAME_DAY_RESET_TEXT}에 바뀌고,
        조건을 채우지 못한 의뢰는 그때 사라져요.</>,
    ],
  },
  'bounty-named': {
    title: '네임드 토벌',
    lines: [
      <>네임드 토벌을 수주한 채 그 구역에서 낚시하면 아주 드물게 네임드를 마주쳐요.<br />방치 낚시 중에도 마주칠 수 있어요.</>,
      <>마주치면 바다 화면에 <b>흔적</b> 카드가 떠요.<br />흔적은 {TICKET_EXPIRY_TEXT} 남아요.</>,
      <><b>추적</b>과 <b>조우</b>를 누르면 결투가 시작돼요. 커서가 금색 칸에 들어왔을 때 <b>챔질</b>해 체력을 깎아요.<br />
        도주 {CHALLENGE_MISS_LIMIT}칸이 다 차면 놓쳐요.</>,
      <>설정의 <b>알림</b>을 켜면 다른 탭을 보고 있을 때도 조우를 알려 줘요.</>,
      <>토벌 보상의 <b>교환 재료</b>는 수배판의 유물 탭에서 그 구역의 <b>유물</b>로 바꿀 수 있어요.</>,
    ],
  },
};

// 튜토리얼 창 — 트리거마다 한 번 뜬다. 업데이트 소식 창이 끝난 뒤 차례로 뜨고, 닫으면 본 것으로 남는다.
export default function TutorialModal({ seen, ready, dispatch }: {
  seen: readonly string[];
  /** 세이브가 준비됐는지 — 준비 전의 빈 상태로 판정하지 않게 */
  ready: boolean;
  dispatch: (action: GameAction) => unknown;
}) {
  const suspended = useWhatsNewPending();
  const { current, close } = useTutorial({ seen, ready, suspended, dispatch });
  if (!current) return null;
  const t = TUTORIAL[current];
  return (
    // 본문 마지막 Note의 아래 여백 8px과 합쳐 확정 버튼과의 간격이 12px이 되게 위 여백을 4px로 둔다
    <Modal title={t.title} onClose={close}
           footer={<Button variant="primary" full className="mt-1" onClick={close}>알겠어요</Button>}>
      <PixelList>
        {t.lines.map((line, i) => <li key={i}>{line}</li>)}
      </PixelList>
      <Note size="xs">더 궁금한 것은 <b>도움말</b> 탭에서 볼 수 있어요.</Note>
    </Modal>
  );
}
