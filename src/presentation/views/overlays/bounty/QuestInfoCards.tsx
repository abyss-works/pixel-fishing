// 의뢰 창의 카드 - 수주 중인 의뢰 한 장(일반 의뢰, 네임드 토벌)과 빈 카드. 수배판 카드와 같은 틀과 줄 목록(BoardRows)을 쓰되
// 버튼이 없는 읽기 전용이다. 포기는 기능이 생길 때까지 두지 않는다.
// 도전권은 규칙 용어라 화면에 쓰지 않는다. 유저에게는 흔적과 그 남은 시간으로 보인다.
import type { ReactNode } from 'react';
import type { QuestInfoGeneral, QuestInfoNamed } from '../../../../features/bounty/model/questInfo';
import Frame from '../../../ui/Frame';
import Tip from '../../../ui/Tip';
import { RarityText } from '../../../ui/fish/RarityTag';
import { fmtGold, fmtMinutes, fmtNum } from '../../../ui/format';
import { BoardRows, ProgressMeter } from './boardParts';

const CARD = 'bg-surface-2 p-3 flex flex-col gap-2 text-sm';

export function GeneralInfoCard({ info }: { info: QuestInfoGeneral }) {
  return (
    <Frame className={CARD}>
      <b className="text-base">{info.title}</b>
      <BoardRows rows={[
        { key: 'target', label: '목표', value: <><b><RarityText rarity={info.grade} /></b> 등급 어종 <span className="pf-accent">{fmtNum(info.count)}</span>마리</> },
        { key: 'progress', label: '진행', value: <span className="inline-block w-40 align-middle"><ProgressMeter progress={info.progress} count={info.count} /></span> },
        { key: 'reward', label: '보상', value: <span className="pf-accent text-gold">{fmtGold(info.reward)}</span> },
        { key: 'finish', label: '마치는 곳', value: info.finishAt },
      ]} />
    </Frame>
  );
}

export function NamedInfoCard({ info }: { info: QuestInfoNamed }) {
  return (
    <Frame className={CARD}>
      <div className="flex items-baseline justify-between gap-2 h-6">
        <b className="text-base text-epic truncate">{info.title}</b>
        {info.traceMins !== null && (
          <span className="text-xs text-text-dim whitespace-nowrap">
            <Tip text={'흔적이 남아 있어요.\n이 구역 바다로 나가 흔적 카드의 추적을 눌러 보세요.'}>흔적</Tip>
            {' '}<span className="pf-accent text-text">{fmtMinutes(info.traceMins)}</span>
          </span>
        )}
      </div>
      <p className="text-xs text-text-dim leading-relaxed">{info.poster}</p>
      <BoardRows rows={[
        { key: 'haunt', label: '나타나는 곳', value: info.haunt },
        { key: 'progress', label: '진행', value: <span className="pf-accent">{info.progress}/{info.count}</span> },
        { key: 'reward', label: '보상', value: <span className="pf-accent text-gold">{fmtGold(info.reward)}</span> },
        ...(info.materialName ? [{ key: 'material', label: '교환 재료', value: info.materialName }] : []),
        { key: 'finish', label: '마치는 곳', value: info.finishAt },
      ]} />
    </Frame>
  );
}

/** 빈 카드 - 수주한 의뢰가 없을 때, 또는 아직 읽지 못했을 때 */
export function EmptyInfoCard({ children }: { children: ReactNode }) {
  return (
    <Frame className={`${CARD} items-center text-center text-text-dim leading-relaxed py-6`}>
      {children}
    </Frame>
  );
}
