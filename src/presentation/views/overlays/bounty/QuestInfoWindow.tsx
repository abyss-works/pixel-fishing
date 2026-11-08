import { useState } from 'react';
import type { QuestInfoData } from '../../../../features/bounty/model/questInfo';
import type { QuestInfoStatus } from '../../../../features/bounty/service/useQuestInfo';
import Frame from '../../../ui/Frame';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Skeleton from '../../../ui/Skeleton';
import TabBar from '../../../ui/TabBar';
import type { TabDef } from '../../../ui/TabBar';
import { ClearsLeft } from './boardParts';
import { EmptyInfoCard, GeneralInfoCard, NamedInfoCard } from './QuestInfoCards';
import { SCROLL_Y } from '../../../ui/scrollArea';

// 의뢰 창의 화면 - 헤더의 의뢰 현황을 눌러 여는, 지금 수주 중인 의뢰를 보는 읽기 전용 창.
// 제목 "의뢰" 아래 고정 정보 줄에 오늘 남은 클리어를 두고(수배판과 같은 조각, 값 이름은 헤더처럼 줄인다),
// 일반 의뢰와 네임드 토벌 두 탭에서 카드 한 장씩 본다.
// 수주한 의뢰가 없어도 열리고, 빈 카드가 수배판이 있는 항구를 안내한다. 수주와 납품은 수배판에서 한다.
// 값은 전부 의뢰 기능(useQuestInfo)이 만들어 넘긴다 - 여기서 규칙을 다시 조립하지 않는다.
// 처음 보이는 탭은 받은 의뢰가 있는 탭이다(일반 의뢰가 없고 네임드 토벌만 있으면 네임드 토벌, 그 밖에는 일반 의뢰).
// 데이터가 오기 전에는 스켈레톤을 보이고, 데이터가 오면 그 값으로 탭이 정해진다. 사용자가 탭을 고른 뒤에는 바꾸지 않는다.

type InfoTab = 'general' | 'named';
const TABS: TabDef<InfoTab>[] = [
  { key: 'general', label: '일반 의뢰' },
  { key: 'named', label: '네임드 토벌' },
];
const EMPTY_SUBJECT: Record<InfoTab, string> = { general: '일반 의뢰가', named: '네임드 토벌이' };
const OFFLINE_TEXT = '오프라인에서는 의뢰를 볼 수 없어요.\n서버에 연결된 뒤 다시 열어 주세요.';

export default function QuestInfoWindow({ info, onClose }: {
  info: QuestInfoData & { status: QuestInfoStatus };
  onClose: () => void;
}) {
  // 사용자가 고른 탭. 고르기 전에는 받은 의뢰를 보고 정한다
  const [picked, setPicked] = useState<InfoTab | null>(null);
  const tab: InfoTab = picked ?? (info.general || !info.named ? 'general' : 'named');

  const body = () => {
    if (info.status === 'loading') {
      return (
        <Frame role="status" className="bg-surface-2 p-3 flex flex-col gap-2">
          <span className="sr-only">불러오는 중이에요.</span>
          <Skeleton className="h-6 w-1/2" />
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[26px]" />)}
        </Frame>
      );
    }
    if (info.status === 'offline') return <EmptyInfoCard><span className="whitespace-pre-line">{OFFLINE_TEXT}</span></EmptyInfoCard>;
    if (tab === 'general' && info.general) return <GeneralInfoCard info={info.general} />;
    if (tab === 'named' && info.named) return <NamedInfoCard info={info.named} />;
    return (
      <EmptyInfoCard>
        <span>수주한 {EMPTY_SUBJECT[tab]} 없어요.</span>
        <span>수배판은 {info.boardPorts.join(', ')}에 있어요.</span>
      </EmptyInfoCard>
    );
  };

  return (
    // 탭이 있는 창의 높이는 고정이다(모바일 레이아웃도 같다). 더 긴 탭(네임드 토벌)이 들어가는 높이를 잡는다:
    // 창 제목과 여백 56 + 고정 정보 줄 40 + 탭 줄 44 + 카드(이름 줄 24, 줄 목록 5 x 26, 여백과 간격 약 50) 204 + 간격 12 x 3 = 380에
    // 여유를 더한 400px. 스테이지가 낮으면 위아래 16px을 남기고, 넘치는 내용은 본문 안에서 굴린다
    <Modal layer="stage" md height={400} onClose={onClose}>
      <ModalCard title="의뢰" onClose={onClose} fixed>
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <Inset className="flex items-center gap-3 h-10 px-3 shrink-0 text-xs">
            <ClearsLeft first shortLabels leftAll={info.left?.general ?? null} leftNamed={info.left?.named ?? null}
                        dailyCap={info.caps.general} namedDailyCap={info.caps.named} />
          </Inset>
          <TabBar tabs={TABS} activeKey={tab} onSelect={setPicked} />
          <div className={`flex flex-col flex-1 min-h-0 ${SCROLL_Y}`}>
            {body()}
          </div>
        </div>
      </ModalCard>
    </Modal>
  );
}
