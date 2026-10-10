import type { GameState } from '../../game/logic';
import type { ZoneId } from '../../data/zones';
import type { DexView } from '../shared';
import VDexBase from './VDexBase';
import VDexVariant from './VDexVariant';
import VDexNamed from './VDexNamed';

// 도감은 포함관계: 전체 = 기본 어종 + 변이 (슬롯 2×종수).
// 보기 전환(일반→돌연변이→네임드)은 활성 도감 탭 재선택(클릭·같은 숫자키), **최상위 존** 전환은
// 하단 서브탭 또는 Tab 키 — 둘 다 Sidebar가 소유한 상태를 내려받는 제어 컴포넌트다.
// 서브탭 단위가 최상위 존인 이유: 하위 존(해구 등) 어종은 부모 존으로 합산된다(topZoneOfSpot) —
// 서브탭 수가 존 트리 확장과 무관하게 안정된다(오픈월드 spec/zone-tree.md).
export default function DexTab({ game, view, sub, onSub }: {
  game: GameState;
  view: DexView;
  /** 열람 중인 최상위 존 — Sidebar 소유(Tab 키 존 순환과 상태 공유) */
  sub: ZoneId;
  onSub: (z: ZoneId) => void;
}) {
  if (view === 'named') return <VDexNamed game={game} sub={sub} onSub={onSub} />;
  if (view === 'variant') return <VDexVariant game={game} sub={sub} onSub={onSub} />;
  return <VDexBase game={game} sub={sub} onSub={onSub} />;
}
