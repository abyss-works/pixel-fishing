import { useState } from 'react';
import type { GameState } from '../../../../game/rules/logic';
import { useNow } from '../../../../features/gameplay/service/useGameTime';
import { selectKitchenStatus } from '../../../../features/kitchen/model/recipes';
import type { Notify } from '../../../ui/hud/messageFeed';
import Inset from '../../../ui/Inset';
import ModalCard from '../../../ui/ModalCard';
import TabBar from '../../../ui/TabBar';
import Tip from '../../../ui/Tip';
import { fmtMinutes } from '../../../ui/format';
import EnergyTab from './EnergyTab';
import RecipeTab from './RecipeTab';
import { recipeLabel } from './kitchenParts';
import type { KitchenAct } from './kitchenParts';

type KitchenTab = 'lunch' | 'bait' | 'energy';

// 부엌 창 — 920 폭, 높이 고정. 제목 아래 고정 정보 줄(조리 중, 다음 완성, 보관함)은 어느 탭에서나 같은 자리에 두고,
// 그 아래 탭 셋(도시락, 미끼, 기운 얻기)을 둔다. 도시락과 미끼 탭은 레시피를 골라 수량을 넣어 조리를 시작하고,
// 기운 얻기 탭은 판매 창과 같은 표로 물고기를 생명의 기운으로 바꾼다.
// 조리 가능 여부와 기운 얻기 기본 선택은 게임 규칙이 정하고, 이 창은 그 판정을 그린다.
export default function KitchenPanel({ game, busy, act, setToast, onClose }: {
  game: GameState;
  busy: boolean;
  act: KitchenAct;
  setToast: Notify;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<KitchenTab>('lunch');
  const now = useNow();
  const status = selectKitchenStatus(game, now);

  return (
    <ModalCard title="부엌" onClose={onClose} fixed>
      <Inset className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-3 py-2 text-sm shrink-0">
        {status.cooking ? (
          <>
            <span><span className="text-text-dim">조리 중</span> <b>{recipeLabel(status.cooking.recipe)}</b>{' '}
              <span className="pf-accent">{status.cooking.completed}/{status.cooking.count}</span></span>
            <span className="text-text-dim">다음 완성 <span className="pf-accent text-text">{fmtMinutes(status.cooking.nextInMin)}</span></span>
          </>
        ) : (
          <span className="text-text-dim">조리 중인 요리 없음</span>
        )}
        <span className="ml-auto text-text-dim">
          <Tip text={<>가방에 있는 요리와 조리 중인 요리를 함께 세요.<br />가득 차면 조리를 시작할 수 없어요.</>}>보관함</Tip>{' '}
          <span className={status.full ? 'pf-accent text-danger' : 'pf-accent text-text'}>{status.stored}/{status.cap}</span>
        </span>
      </Inset>
      <TabBar
        tabs={[
          { key: 'lunch' as KitchenTab, label: '도시락' },
          { key: 'bait' as KitchenTab, label: '미끼' },
          { key: 'energy' as KitchenTab, label: '기운 얻기' },
        ]}
        activeKey={tab}
        onSelect={setTab}
      />
      {tab === 'energy'
        ? <EnergyTab game={game} busy={busy} act={act} setToast={setToast} />
        : <RecipeTab key={tab} kind={tab} game={game} now={now} busy={busy} act={act} />}
    </ModalCard>
  );
}
