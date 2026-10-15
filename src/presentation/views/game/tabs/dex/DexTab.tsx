import type { GameState } from '../../../../../game/rules/logic';
import type { ZoneId } from '../../../../../game/content/zones';
import SubTabs from '../../../../ui/SubTabs';
import type { DexView } from '../tabs';
import DexGrid from './DexGrid';
import VDexNamed from './VDexNamed';

// 도감은 포함관계: 전체 = 기본 어종 + 변이 (슬롯 2×종수).
// 보기(일반→돌연변이→네임드)와 **최상위 존**은 둘 다 GameTabs가 소유한 상태를 내려받는
// 제어 컴포넌트다 — 보기는 서브탭 클릭·Tab 키, 존은 그 아래 줄 클릭으로 바꾼다.
// 존 단위가 최상위 존인 이유: 하위 존(해구 등) 어종은 부모 존으로 합산된다(topZoneOfSpot) —
// 존 트리가 확장되어도 서브탭 수는 안정적으로 유지된다.
export default function DexTab({ game, view, onView, sub, onSub }: {
  game: GameState;
  view: DexView;
  onView: (v: DexView) => void;
  /** 열람 중인 최상위 존 — GameTabs 소유(탭을 떠났다 와도 유지) */
  sub: ZoneId;
  onSub: (z: ZoneId) => void;
}) {
  return (
    <div>
      <SubTabs
        items={[
          { key: 'base' as DexView, label: '일반' },
          { key: 'variant' as DexView, label: '돌연변이' },
          { key: 'named' as DexView, label: '네임드' },
        ]}
        activeKey={view}
        onSelect={onView}
      />
      {view === 'named'
        ? <VDexNamed game={game} sub={sub} onSub={onSub} />
        : <DexGrid game={game} view={view} sub={sub} onSub={onSub} />}
    </div>
  );
}
