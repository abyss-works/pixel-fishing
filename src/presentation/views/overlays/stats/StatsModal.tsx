import { useMemo, useState } from 'react';
import type { GameState } from '../../../../game/rules/logic';
import type { Movement } from '../../../../game/rules/stats';
import type { RegionId } from '../../../../game/content/places';
import type { ZoneId } from '../../../../game/content/zones';
import { useSpotState } from '../../../../features/travel/service/useSpotState';
import {
  selectActiveBonuses, selectInitialStatsSpotIndex, selectReachableZones,
  selectStatsSpotRows, selectStatsSummary, selectStatsZoneTabs,
} from '../../../../features/gameplay/model/stats';
import Modal from '../../../ui/Modal';
import Panel from '../../../ui/Panel';
import PixelIcon from '../../../ui/PixelIcon';
import TabBar from '../../../ui/TabBar';
import type { TabDef } from '../../../ui/TabBar';
import BoatTab from './BoatTab';
import BonusTab from './BonusTab';
import RodTab from './RodTab';
import SummaryTab from './SummaryTab';

// 스탯창 — 자원 바 클릭으로 여는 내 캐릭터 성능 화면. 요약·배·낚싯대·보너스 네 탭이다.
// 값은 전부 스탯 선택자에서 온다 — 여기서 규칙을 재계산하지 않는다.
// 탭 본문 높이를 고정해 탭을 바꿔도 창 크기가 흔들리지 않는다. 긴 목록은 그 구역 안에서만 굴린다.
// 고른 해역은 탭 사이에 이어진다 — 요약의 해역 칸이 낚싯대 탭에서 고른 해역을 따른다.

type StatsTab = 'summary' | 'boat' | 'rod' | 'bonus';
const TABS: TabDef<StatsTab>[] = [
  { key: 'summary', label: '요약', icon: <PixelIcon glyph="star" size={16} /> },
  { key: 'boat', label: '배', icon: <PixelIcon glyph="boat" size={16} /> },
  { key: 'rod', label: '낚싯대', icon: <PixelIcon glyph="rod" size={16} /> },
  { key: 'bonus', label: '보너스', icon: <PixelIcon glyph="plus" size={16} /> },
];

interface Props {
  game: GameState;
  /** 현재 씬의 이동 방식 — 지역 팩의 movement(거점은 walk) */
  movement: Movement;
  /** 현재 위치 지역 — 사거리 안의 어군이 없으면 이 지역의 기준 해역부터 보여 준다 */
  region: RegionId;
  nickname: string | null;
  onClose: () => void;
}

export default function StatsModal({ game, movement, region, nickname, onClose }: Props) {
  const { spot: here } = useSpotState();
  const [tab, setTab] = useState<StatsTab>('summary');
  // 처음 해역은 창을 연 순간에 정한다 — 창이 떠 있는 동안 어군 사거리가 바뀌어도 고른 해역을 옮기지 않는다
  const [start] = useState(() => selectInitialStatsSpotIndex(region, here));
  const [spotIndex, setSpotIndex] = useState(start);
  const rows = useMemo(() => selectStatsSpotRows(game, movement), [game, movement]);
  const selected = rows[spotIndex];
  const [zone, setZone] = useState<ZoneId>(rows[start].zone);
  const zoneTabs = selectStatsZoneTabs(rows, rows[start].zone);
  const summary = selectStatsSummary(game);

  // 지역을 바꾸면 그 지역의 첫 해역을 고른다 — 상세가 다른 지역 해역에 머물지 않게 한다
  const pickZone = (next: ZoneId) => {
    setZone(next);
    const first = rows.find(row => row.zone === next);
    if (first) setSpotIndex(first.spotIndex);
  };

  return (
    <Modal layer="stage" onClose={onClose}>
      <Panel title="스탯" onClose={onClose}>
        <TabBar tabs={TABS} activeKey={tab} onSelect={setTab} className="-mx-2" />
        <div className="h-[492px] min-h-0 flex flex-col">
          {tab === 'summary' && (
            <SummaryTab game={game} nickname={nickname} summary={summary} row={selected}
                        here={here !== null && rows[spotIndex].spot.id === here} />
          )}
          {tab === 'boat' && (
            <BoatTab game={game} movement={movement} summary={summary} row={selected} zones={selectReachableZones(game)} />
          )}
          {tab === 'rod' && (
            <RodTab game={game} rows={rows} zoneTabs={zoneTabs} zone={zone} selected={selected}
                    onZone={pickZone} onSelect={setSpotIndex} />
          )}
          {tab === 'bonus' && <BonusTab rows={selectActiveBonuses(game)} />}
        </div>
      </Panel>
    </Modal>
  );
}
