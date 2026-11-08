import { useMemo, useState } from 'react';
import type { GameState } from '../../../../game/rules/logic';
import type { GuildEffects } from '../../../../game/rules/guild';
import { powerHelpText } from '../../../../game/rules/stats';
import type { Movement } from '../../../../game/rules/stats';
import type { RegionId } from '../../../../game/content/places';
import type { ZoneId } from '../../../../game/content/zones';
import { useSpotState } from '../../../../features/travel/service/useSpotState';
import {
  selectActiveBonuses, selectInitialStatsSpotIndex, selectReachableZones,
  selectStatsSpotRows, selectStatsSummary, selectStatsZoneTabs,
} from '../../../../features/gameplay/model/stats';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import TabBar from '../../../ui/TabBar';
import type { TabDef } from '../../../ui/TabBar';
import Tip from '../../../ui/Tip';
import BoatTab from './BoatTab';
import BonusTab from './BonusTab';
import RodTab from './RodTab';
import SummaryTab from './SummaryTab';
import { SCROLL_Y } from '../../../ui/scrollArea';

// 스탯창: 자원 바 클릭으로 여는 내 캐릭터 성능 화면. 680 폭에 높이를 고정하고, 탭은 요약, 배, 낚싯대, 보너스 넷이다.
// 제목 아래 고정 정보 줄에는 어느 탭에서나 쓰는 상태(닉네임, 배, 낚싯대 레벨, 파워)를 둔다. 파워 규칙은 파워의 툴팁이다.
// 값은 전부 스탯 선택자에서 온다 — 여기서 규칙을 재계산하지 않는다. 넘치는 내용은 탭 본문 안에서만 굴린다.
// 고른 해역은 탭 사이에 이어진다 — 요약의 해역 칸이 낚싯대 탭에서 고른 해역을 따른다.

type StatsTab = 'summary' | 'boat' | 'rod' | 'bonus';
const TABS: TabDef<StatsTab>[] = [
  { key: 'summary', label: '요약' },
  { key: 'boat', label: '배' },
  { key: 'rod', label: '낚싯대' },
  { key: 'bonus', label: '보너스' },
];

interface Props {
  game: GameState;
  /** 현재 씬의 이동 방식 — 지역 팩의 movement(거점은 walk) */
  movement: Movement;
  /** 현재 위치 지역 — 사거리 안의 어군이 없으면 이 지역의 기준 해역부터 보여 준다 */
  region: RegionId;
  nickname: string | null;
  /** 길드 레벨과 서버가 적용하는 길드 보너스 효과. 길드가 없으면 null */
  guild: { level: number; effects: GuildEffects } | null;
  onClose: () => void;
}

export default function StatsModal({ game, movement, region, nickname, guild, onClose }: Props) {
  const { spot: here } = useSpotState();
  const [tab, setTab] = useState<StatsTab>('summary');
  // 처음 해역은 창을 연 순간에 정한다 — 창이 떠 있는 동안 어군 사거리가 바뀌어도 고른 해역을 옮기지 않는다
  const [start] = useState(() => selectInitialStatsSpotIndex(region, here));
  const [spotIndex, setSpotIndex] = useState(start);
  const rows = useMemo(() => selectStatsSpotRows(game, movement), [game, movement]);
  const selected = rows[spotIndex];
  const [zone, setZone] = useState<ZoneId>(rows[start].zone);
  const zoneTabs = selectStatsZoneTabs(rows, rows[start].zone);
  const summary = selectStatsSummary(game, guild?.effects.bag ?? 0);

  // 지역을 바꾸면 그 지역의 첫 해역을 고른다 — 상세가 다른 지역 해역에 머물지 않게 한다
  const pickZone = (next: ZoneId) => {
    setZone(next);
    const first = rows.find(row => row.zone === next);
    if (first) setSpotIndex(first.spotIndex);
  };

  return (
    // 탭이 있는 창의 높이: 가장 긴 탭(낚싯대)이 들어가는 560px. 스테이지가 낮으면 위아래 16px을 남긴다
    <Modal layer="stage" md height={560} onClose={onClose}>
      <ModalCard title="스탯" onClose={onClose} fixed>
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <Inset className="flex items-center gap-3 h-10 px-3 shrink-0 text-sm">
            <b className="max-w-40 truncate text-text">{nickname ?? '불러오는 중'}</b>
            <span className="flex items-baseline gap-2 pl-3 border-l border-line">
              <span className="text-xs text-text-dim">배</span><span>{selected.data.boatName}</span>
            </span>
            <span className="flex items-baseline gap-2 pl-3 border-l border-line">
              <span className="text-xs text-text-dim">낚싯대</span><span className="pf-accent text-xs">Lv.{game.rod}</span>
            </span>
            <span className="flex items-baseline gap-2 pl-3 border-l border-line">
              <span className="text-xs text-text-dim"><Tip text={powerHelpText()}>파워</Tip></span>
              <span className="pf-accent text-xs text-gold">{selected.data.currentPower}</span>
            </span>
          </Inset>
          <TabBar tabs={TABS} activeKey={tab} onSelect={setTab} />
          <div className={`flex flex-col flex-1 min-h-0 ${SCROLL_Y}`}>
            {tab === 'summary' && (
              <SummaryTab game={game} summary={summary} row={selected}
                          here={here !== null && rows[spotIndex].spot.id === here} />
            )}
            {tab === 'boat' && (
              <BoatTab game={game} summary={summary} row={selected} zones={selectReachableZones(game)} />
            )}
            {tab === 'rod' && (
              <RodTab rows={rows} zoneTabs={zoneTabs} zone={zone} selected={selected}
                      onZone={pickZone} onSelect={setSpotIndex} />
            )}
            {tab === 'bonus' && <BonusTab rows={selectActiveBonuses(game, guild)} />}
          </div>
        </div>
      </ModalCard>
    </Modal>
  );
}
