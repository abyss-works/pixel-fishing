import type { FormId } from '../../../../../game/content/fish';
import type { GameState } from '../../../../../game/rules/logic';
import type { ZoneId } from '../../../../../game/content/zones';
import SubTabs from '../../../../ui/SubTabs';
import type { DexView } from '../tabs';
import DexGrid from './DexGrid';
import VDexEvent from './VDexEvent';
import VDexNamed from './VDexNamed';

const VIEW_ITEMS: { key: DexView; label: string }[] = [
  { key: 'base', label: '일반' },
  { key: 'named', label: '네임드' },
  { key: 'event', label: '이벤트' },
];

// 도감은 포함관계: 일반 탭 안에서 돌연변이 토글로 일반/변이 폼을 전환하고,
// 이벤트 탭에서도 같은 돌연변이 토글 상태를 공유한다.
// 보기(일반→네임드→이벤트)와 **최상위 존**은 둘 다 GameTabs가 소유한 상태를 내려받는
// 제어 컴포넌트다 — 보기는 1단 서브탭이나 도감 탭 재선택(클릭·같은 숫자키), 존은 2단 서브탭 클릭·Tab 키로 바꾼다.
// 존 단위가 최상위 존인 이유: 하위 존(해구 등) 어종은 부모 존으로 합산된다(topZoneOfSpot) —
// 존 트리가 확장되어도 서브탭 수는 안정적으로 유지된다.
export default function DexTab({ game, view, onView, form, onToggleForm, sub, onSub }: {
  game: GameState;
  view: DexView;
  onView: (v: DexView) => void;
  form: FormId;
  onToggleForm: () => void;
  /** 열람 중인 최상위 존 — GameTabs 소유(탭을 떠났다 와도 유지) */
  sub: ZoneId;
  onSub: (z: ZoneId) => void;
}) {
  return (
    <div>
      <SubTabs items={VIEW_ITEMS} activeKey={view} onSelect={onView} />
      {view === 'named' ? (
        <VDexNamed game={game} sub={sub} onSub={onSub} />
      ) : view === 'event' ? (
        <VDexEvent form={form} onToggleForm={onToggleForm} />
      ) : (
        <DexGrid game={game} form={form} onToggleForm={onToggleForm} sub={sub} onSub={onSub} />
      )}
    </div>
  );
}
