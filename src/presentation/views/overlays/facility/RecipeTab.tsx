import { useState } from 'react';
import type { CookKind } from '../../../../game/content/cooking';
import { RARITY } from '../../../../game/content/rarity';
import { REJECT_TEXT } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import { recipeEffectNote, recipeLabel, recipesOfKind, selectRecipeView } from '../../../../features/kitchen/model/recipes';
import { ENERGY_NAME } from '../../../../features/kitchen/model/energy';
import { GradeName } from '../../../ui/fish/RarityTag';
import HeroHeader from '../../../ui/HeroHeader';
import ItemSprite from '../../../ui/ItemSprite';
import Inset from '../../../ui/Inset';
import NumberStepper from '../../../ui/NumberStepper';
import SelectList from '../../../ui/SelectList';
import Tip from '../../../ui/Tip';
import { artifactEffectLabel } from '../../../ui/artifactEffects';
import { fmtMinutes, fmtPlusPoint } from '../../../ui/format';
import { CompareTable, ConfirmButton, FacilityTabBody } from './facilityParts';
import type { KitchenAct } from './kitchenParts';

const MIN_MS = 60_000;

// 도시락 탭과 미끼 탭 — 왼쪽은 그 종류의 레시피 목록(이름, 1개에 드는 기운, 보유한 완성품)이고, 오른쪽은 고른 레시피의 효과,
// 필요와 보유, 수량과 조리 시간이다. 조리 시작 버튼은 오른쪽 열 맨 아래에 고정한다.
// 조리 중이어도 다른 레시피를 골라 볼 수 있고, 시작만 막힌다. 막힌 이유는 게임 규칙의 판정 사유 문구이며 버튼의 툴팁으로 보인다.
export default function RecipeTab({ kind, game, now, busy, act }: {
  kind: CookKind;
  game: GameState;
  now: string;
  busy: boolean;
  act: KitchenAct;
}) {
  const recipes = recipesOfKind(kind);
  const [pickedId, setPickedId] = useState(recipes[0].id);
  const [qty, setQty] = useState(1);
  const picked = recipes.find(r => r.id === pickedId) ?? recipes[0];
  const views = recipes.map(r => selectRecipeView(game, r, r.id === picked.id ? qty : 1, now));
  const view = views.find(v => v.recipe.id === picked.id)!;
  const reason = view.check.ok ? null : REJECT_TEXT[view.check.reason];

  const list = (
    <SelectList label={kind === 'lunch' ? '도시락 목록' : '미끼 목록'} items={views} keyOf={v => v.recipe.id}
                selectedKey={picked.id} onSelect={id => { setPickedId(id); setQty(1); }}
                renderItem={v => (
                  <>
                    <ItemSprite kind={kind} id={v.recipe.id} preset="row" className="shrink-0" />
                    <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <b className="truncate">{recipeLabel(v.recipe)}</b>
                      <span className="flex flex-wrap gap-x-2 text-2xs text-text-dim">
                        {v.unitCost.map(c => (
                          <span key={c.grade} className={c.short ? 'text-danger' : undefined}>
                            {RARITY[c.grade].name} <span className="pf-accent">{c.per}</span>
                          </span>
                        ))}
                      </span>
                    </span>
                    <span className="shrink-0 text-2xs text-text-dim">보유 <span className="pf-accent">{v.owned}</span></span>
                  </>
                )} />
  );

  const detail = (
    <>
      <HeroHeader sprite={<ItemSprite kind={kind} id={view.recipe.id} preset="hero" />}
                  title={recipeLabel(view.recipe)}
                  tags={[`보유 ${view.owned}개`, `지속 시간 ${fmtMinutes(view.slotMs / MIN_MS)}`]} />
      <Inset className="px-3 py-2.5 flex flex-col gap-1.5">
        <Tip text={recipeEffectNote(kind)} className="self-start text-xs text-text-dim">효과</Tip>
        {view.effects.map(line => (
          <div key={line.label} className="flex items-center justify-between gap-2 text-xs">
            <span>{line.label}</span><span className="pf-accent text-accent">{line.value}</span>
          </div>
        ))}
      </Inset>
      <CompareTable heads={['필요', '보유']}
                    rows={view.cost.map(c => ({
                      label: <GradeName name={ENERGY_NAME} grade={c.grade} />,
                      value: <span className={c.short ? 'text-danger' : 'text-text'}>{c.need}</span>,
                      next: <span className={c.short ? 'text-danger' : 'text-accent'}>{c.have}</span>,
                    }))} />
      <Inset className="px-3 py-2 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-text-dim">수량</span>
          <NumberStepper value={view.count} min={view.maxCount === 0 ? 0 : 1} max={view.maxCount}
                         disabled={view.maxCount === 0} onChange={setQty} ariaLabel={recipeLabel(view.recipe)} />
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-text-dim">조리 시간</span>
          <span className="pf-accent">{fmtMinutes(view.waitMs / MIN_MS)}</span>
        </div>
        {view.extraChance > 0 && (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-text-dim">{artifactEffectLabel('extraCookChance')}</span>
            <span className="pf-accent text-accent">{fmtPlusPoint(view.extraChance * 100)}</span>
          </div>
        )}
      </Inset>
    </>
  );

  return (
    <FacilityTabBody list={list} detail={detail}
      foot={
        <ConfirmButton reason={reason} disabled={!view.check.ok || view.count === 0 || busy}
                       onClick={() => act({ type: 'cook', recipe: view.recipe.id, count: view.count })}>
          조리 시작
        </ConfirmButton>
      } />
  );
}
