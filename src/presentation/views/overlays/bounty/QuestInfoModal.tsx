import type { GameState } from '../../../../game/rules/logic';
import { useQuestInfo } from '../../../../features/bounty/service/useQuestInfo';
import QuestInfoWindow from './QuestInfoWindow';

// 의뢰 창 - 헤더의 의뢰 현황을 눌러 여는, 지금 수주 중인 의뢰를 보는 읽기 전용 창. 값은 의뢰 기능에서 읽어 화면(QuestInfoWindow)에 넘긴다.
export default function QuestInfoModal({ game, onClose }: { game: GameState; onClose: () => void }) {
  return <QuestInfoWindow info={useQuestInfo(game)} onClose={onClose} />;
}
