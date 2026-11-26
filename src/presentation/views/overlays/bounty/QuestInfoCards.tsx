// 의뢰 창의 카드 - 수주 중인 의뢰 한 장(일반 의뢰, 네임드 토벌)과 빈 카드. 수배판 카드와 같은 틀과 줄 목록을 쓰며
// 목표를 채우기 전에는 포기할 수 있고, 목표를 모두 채운 의뢰는 수배판 보상 안내만 보인다.
// 도전권은 규칙 용어라 화면에 쓰지 않는다. 유저에게는 흔적과 그 남은 시간으로 보인다.
// 수배서 문구는 수배판에서만 읽히므로 여기에 두지 않는다.
import type { ReactNode } from 'react';
import type { QuestInfoGeneral, QuestInfoNamed } from '../../../../features/bounty/model/questInfo';
import AdjustedAmount from '../../../ui/AdjustedAmount';
import Button from '../../../ui/Button';
import Inset from '../../../ui/Inset';
import ProgressCount from '../../../ui/ProgressCount';
import { RarityText } from '../../../ui/fish/RarityTag';
import { fmtGold, fmtNum } from '../../../ui/format';
import { BoardRows, NamedCardHead, ProgressMeter } from './boardParts';

const CARD = 'p-3 flex flex-col gap-2 text-sm';
const COMPLETED_GUIDANCE = '목표를 모두 채워 포기할 수 없어요. 수배판에서 보상을 받아 주세요.';

export function GeneralInfoCard({ info, busy = false, onAbandon }: {
  info: QuestInfoGeneral;
  busy?: boolean;
  onAbandon?: () => void;
}) {
  return (
    <Inset tone={info.done ? 'light' : 'base'} border={info.done ? 'gold' : 'line'} className={CARD}>
      <b className="text-base">{info.title}</b>
      <BoardRows rows={[
        { key: 'target', label: '목표', value: <><b><RarityText rarity={info.grade} /></b> 등급 어종 <ProgressCount value={fmtNum(info.count)} />마리</> },
        { key: 'waters', label: '대상 해역', value: `${info.zoneName} (${info.watersSummary})`, wrap: true },
        { key: 'progress', label: '진행', value: <span className="inline-block w-40 align-middle"><ProgressMeter progress={info.progress} count={info.count} /></span> },
        { key: 'reward', label: '보상', value: <ProgressCount value={fmtGold(info.reward)} /> },
        { key: 'finish', label: '마치는 곳', value: info.finishAt },
      ]} />
      {info.canAbandon && (
        <Button variant="danger" full disabled={busy} onClick={onAbandon}>의뢰 포기</Button>
      )}
      {info.done && (
        <span className="text-xs text-gold">{COMPLETED_GUIDANCE}</span>
      )}
    </Inset>
  );
}

export function NamedInfoCard({ info, busy = false, onAbandon }: {
  info: QuestInfoNamed;
  busy?: boolean;
  onAbandon?: () => void;
}) {
  return (
    <Inset tone={info.done ? 'light' : 'base'} border={info.done ? 'gold' : 'line'} className={CARD}>
      <NamedCardHead title={info.title} traceMins={info.traceMins} />
      <BoardRows rows={[
        { key: 'haunt', label: '나타나는 곳', value: info.haunt, wrap: true },
        { key: 'progress', label: '진행', value: <ProgressCount current={info.progress} target={info.count} tight /> },
        { key: 'reward', label: '보상', value: <AdjustedAmount amount={info.reward} className="text-gold" /> },
        ...(info.materialName ? [{ key: 'material', label: '교환 재료', value: info.materialName }] : []),
        { key: 'finish', label: '마치는 곳', value: info.finishAt },
      ]} />
      {info.canAbandon && (
        <Button variant="danger" full disabled={busy} onClick={onAbandon}>의뢰 포기</Button>
      )}
      {info.done && (
        <span className="text-xs text-gold">{COMPLETED_GUIDANCE}</span>
      )}
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
