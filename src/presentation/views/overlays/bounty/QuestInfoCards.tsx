// 의뢰 창의 카드 - 수주 중인 의뢰 한 장(일반 의뢰, 네임드 토벌)과 빈 카드. 수배판 카드와 같은 틀과 줄 목록(BoardRows)을 쓰되
// 버튼이 없는 읽기 전용이다. 포기는 기능이 생길 때까지 두지 않는다.
// 도전권은 규칙 용어라 화면에 쓰지 않는다. 유저에게는 흔적과 그 남은 시간으로 보인다.
// 수배서 문구는 수배판에서만 읽히므로 여기에 두지 않는다.
import type { ReactNode } from 'react';
import type { QuestInfoGeneral, QuestInfoNamed } from '../../../../features/bounty/model/questInfo';
import AdjustedAmount from '../../../ui/AdjustedAmount';
import Inset from '../../../ui/Inset';
import ProgressCount from '../../../ui/ProgressCount';
import { RarityText } from '../../../ui/fish/RarityTag';
import { fmtGold, fmtNum } from '../../../ui/format';
import { BoardRows, NamedCardHead, ProgressMeter } from './boardParts';

const CARD = 'p-3 flex flex-col gap-2 text-sm';

export function GeneralInfoCard({ info }: { info: QuestInfoGeneral }) {
  return (
    <Inset className={CARD}>
      <b className="text-base">{info.title}</b>
      <BoardRows rows={[
        { key: 'target', label: '목표', value: <><b><RarityText rarity={info.grade} /></b> 등급 어종 <ProgressCount value={fmtNum(info.count)} />마리</> },
        { key: 'progress', label: '진행', value: <span className="inline-block w-40 align-middle"><ProgressMeter progress={info.progress} count={info.count} /></span> },
        { key: 'reward', label: '보상', value: <ProgressCount value={fmtGold(info.reward)} /> },
        { key: 'finish', label: '마치는 곳', value: info.finishAt },
      ]} />
    </Inset>
  );
}

export function NamedInfoCard({ info }: { info: QuestInfoNamed }) {
  return (
    <Inset className={CARD}>
      <NamedCardHead title={info.title} traceMins={info.traceMins} />
      <BoardRows rows={[
        { key: 'haunt', label: '나타나는 곳', value: info.haunt },
        { key: 'progress', label: '진행', value: <ProgressCount current={info.progress} target={info.count} tight /> },
        { key: 'reward', label: '보상', value: <AdjustedAmount amount={info.reward} className="text-gold" /> },
        ...(info.materialName ? [{ key: 'material', label: '교환 재료', value: info.materialName }] : []),
        { key: 'finish', label: '마치는 곳', value: info.finishAt },
      ]} />
    </Inset>
  );
}

/** 빈 카드 - 수주한 의뢰가 없을 때, 또는 아직 읽지 못했을 때 */
export function EmptyInfoCard({ children }: { children: ReactNode }) {
  return (
    <Inset tone="deep" className={`${CARD} items-center text-center text-text-dim leading-relaxed py-6`}>
      {children}
    </Inset>
  );
}
