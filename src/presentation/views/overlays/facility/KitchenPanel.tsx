import { useState } from 'react';
import type { GameState } from '../../../../game/rules/logic';
import { useNow } from '../../../../features/gameplay/service/useGameTime';
import { recipeLabel, selectKitchenStatus } from '../../../../features/kitchen/model/recipes';
import Inset from '../../../ui/Inset';
import ItemSprite from '../../../ui/ItemSprite';
import ModalCard from '../../../ui/ModalCard';
import TabBar from '../../../ui/TabBar';
import Tip from '../../../ui/Tip';
import { fmtMinutes } from '../../../ui/format';
import RecipeTab from './RecipeTab';
import type { FacilityAct } from './facilityParts';

type KitchenTab = 'lunch' | 'bait';

// 부엌 창 — 920 폭, 높이 고정. 제목 아래 고정 정보 줄(조리 중, 다음 완성, 보관함)은 어느 탭에서나 같은 자리에 두고,
// 그 아래 탭 둘(도시락, 미끼)을 둔다. 두 탭은 레시피를 골라 수량을 넣어 조리를 시작한다.
// 조리 가능 여부는 게임 규칙이 정하고, 이 창은 그 판정을 그린다.
export default function KitchenPanel({ game, busy, act, onClose }: {
  game: GameState;
  busy: boolean;
  act: FacilityAct;
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
            <span><span className="text-text-dim">조리 중</span>{' '}
              <span className="inline-flex align-middle"><ItemSprite kind={status.cooking.recipe.kind} id={status.cooking.recipe.id} preset="row" /></span>{' '}<b>{recipeLabel(status.cooking.recipe)}</b>{' '}
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
        ]}
        activeKey={tab}
        onSelect={setTab}
      />
      <RecipeTab key={tab} kind={tab} game={game} now={now} busy={busy} act={act} />
    </ModalCard>
  );
}
