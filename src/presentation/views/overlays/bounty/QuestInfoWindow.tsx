import { useState } from 'react';
import type { QuestInfoData } from '../../../../features/bounty/model/questInfo';
import type { QuestInfoStatus } from '../../../../features/bounty/service/useQuestInfo';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import TabBar from '../../../ui/TabBar';
import type { TabDef } from '../../../ui/TabBar';
import { ClearsLeft } from './boardParts';
import { EmptyInfoCard, GeneralInfoCard, NamedInfoCard } from './QuestInfoCards';

// 의뢰 창의 화면 - 헤더의 의뢰 현황을 눌러 여는, 지금 수주 중인 의뢰를 보는 읽기 전용 창.
// 제목 "의뢰" 아래 고정 정보 줄에 오늘 남은 클리어를 두고(수배판과 같은 조각), 일반 의뢰와 네임드 토벌 두 탭에서 카드 한 장씩 본다.
// 수주한 의뢰가 없어도 열리고, 빈 카드가 수배판이 있는 항구를 안내한다. 수주와 납품은 수배판에서 한다.
// 값은 전부 의뢰 기능(useQuestInfo)이 만들어 넘긴다 - 여기서 규칙을 다시 조립하지 않는다.

export type InfoTab = 'general' | 'named';
const TABS: TabDef<InfoTab>[] = [
  { key: 'general', label: '일반 의뢰' },
  { key: 'named', label: '네임드 토벌' },
];
const EMPTY_SUBJECT: Record<InfoTab, string> = { general: '일반 의뢰가', named: '네임드 토벌이' };
const STATUS_TEXT: Record<Exclude<QuestInfoStatus, 'ready'>, string> = {
  loading: '불러오는 중이에요.',
  offline: '오프라인에서는 의뢰를 볼 수 없어요.\n서버에 연결된 뒤 다시 열어 주세요.',
};
/** 탭이 있는 창의 높이: 두 탭의 카드가 들어가는 높이. 스테이지가 낮으면 위아래 16px을 남긴다 */
const FIXED_HEIGHT = 'h-[min(480px,calc(100%-32px))] max-[640px]:h-auto';

export default function QuestInfoWindow({ info, initialTab = 'general', onClose }: {
  info: QuestInfoData & { status: QuestInfoStatus };
  /** 처음 보이는 탭 */
  initialTab?: InfoTab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<InfoTab>(initialTab);

  const body = () => {
    if (info.status !== 'ready') return <EmptyInfoCard><span className="whitespace-pre-line">{STATUS_TEXT[info.status]}</span></EmptyInfoCard>;
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
    <Modal layer="stage" md onClose={onClose} className={FIXED_HEIGHT}>
      <ModalCard title="의뢰" onClose={onClose} className="flex-1">
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <Inset className="flex items-center gap-3 h-10 px-3 shrink-0 text-xs">
            <ClearsLeft first leftAll={info.left?.general ?? null} leftNamed={info.left?.named ?? null}
                        dailyCap={info.caps.general} namedDailyCap={info.caps.named} />
          </Inset>
          <TabBar tabs={TABS} activeKey={tab} onSelect={setTab} />
          <div className="pf-scroll-panel flex flex-col flex-1 min-h-0 pf-vscroll pr-2 [scrollbar-gutter:stable]">
            {body()}
          </div>
        </div>
      </ModalCard>
    </Modal>
  );
}
