import { useMemo, useState } from 'react';
import { formName, sellableValue } from '../game/logic';
import type { GameState } from '../game/logic';
import type { GameAction } from '../game/actions';
import { when } from '../backend/types';
import type { DispatchResult, MaybePromise } from '../backend/types';
import { cx } from '../ui/cx';
import Note from '../ui/Note';
import FishSprite from '../ui/FishSprite';
import PixelIcon from '../ui/PixelIcon';
import { RarityDot } from '../ui/RarityTag';
import { groupInstances } from './bagRows';
import InstanceLine from './InstanceLine';

// 가방 탭 — 종+폼 행으로 요약하고, 펼치면 개체가 보인다 (판매는 거점 정비에서).
// 방치 낚시로 수십~수백 마리가 쌓이므로 개체를 평면 목록으로 두면 훑을 수가 없다.
// 요약은 유지하되, 개체를 보고 싶을 때만 열어보는 구조.
export default function BagTab({ game, dispatch, setToast }: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (m: string) => void;
}) {
  const rows = useMemo(() => groupInstances(game.bag), [game.bag]);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const total = sellableValue(game);

  const toggle = (key: string) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <div>
      <h3 className="text-base text-gold mb-1">가방 (<span className="pf-accent">{game.bag.length}</span>마리)</h3>
      {rows.length === 0 ? (
        <Note>가방이 비어 있다. 물고기 군집을 찾아 낚시하자.</Note>
      ) : (
        <>
          <div className="pf-frame divide-y divide-line">
            {rows.map(({ key, form, fish, items, price, maxSize }) => {
              const locked = game.locked.includes(fish.id);
              const expanded = open.has(key);
              return (
                <div key={key}>
                  <div className={cx('flex items-center gap-1 px-1 py-1 text-xs cursor-pointer hover:bg-surface-2',
                                     locked && 'text-text-dim')}
                       onClick={() => toggle(key)}
                       role="button"
                       aria-expanded={expanded}
                       aria-label={`${formName(fish, form)} 개체 ${expanded ? '접기' : '펼치기'}`}>
                    <PixelIcon glyph={expanded ? 'caretDown' : 'caretRight'} size={10}
                               className="shrink-0 text-text-dim" />
                    <FishSprite fish={fish} preset="thumb" form={form} className="shrink-0" />
                    <span className="whitespace-nowrap">
                      <RarityDot rarity={fish.rarity} />{formName(fish, form)}
                    </span>
                    <span className="text-text-dim">×{items.length}</span>
                    <span className="ml-auto flex items-center gap-2 whitespace-nowrap">
                      {maxSize !== null && <span className="text-text-dim">최대 {maxSize.toFixed(1)}cm</span>}
                      <span className="pf-accent">{price * items.length}G</span>
                      <button
                        className={cx('bg-transparent border-0 px-1 cursor-pointer',
                          locked ? 'text-gold' : 'text-text-dim hover:text-text')}
                        aria-label={`${fish.name} ${locked ? '잠금 해제' : '잠금'}`}
                        onClick={e => {
                          e.stopPropagation(); // 잠금 토글이 행 펼침을 겸하지 않게
                          when(dispatch({ type: 'toggleLock', fishId: fish.id }), r => {
                            if (r.status !== 'ok') return;
                            setToast(locked
                              ? `${fish.name} 잠금 해제 — 다시 판매 대상이 된다.`
                              : `${fish.name} 잠금 — 전부 판매에서 제외된다.`);
                          });
                        }}>
                        <PixelIcon glyph={locked ? 'lock' : 'lockOpen'} size={14} />
                      </button>
                    </span>
                  </div>
                  {expanded && (
                    <div className="bg-bg pb-1">
                      {items.map(inst => (
                        <InstanceLine key={inst.uid} inst={inst} fish={fish}
                                      best={inst.size !== null && inst.size === maxSize} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Note>
            판매 가능 <span className="pf-accent">{total}G</span> · 판매는 집 궤짝/항구 어시장에서.
            줄을 누르면 개체가 펼쳐지고, 잠근 어종은 전부 판매에서 빠져요.
          </Note>
        </>
      )}
    </div>
  );
}
