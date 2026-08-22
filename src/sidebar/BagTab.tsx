import { useMemo } from 'react';
import { formName, sellableValue } from '../game/logic';
import type { GameState } from '../game/logic';
import type { GameAction } from '../game/actions';
import { when } from '../backend/types';
import type { DispatchResult, MaybePromise } from '../backend/types';
import { cx } from '../ui/cx';
import DataTable from '../ui/DataTable';
import Note from '../ui/Note';
import FishSprite from '../ui/FishSprite';
import PixelIcon from '../ui/PixelIcon';
import { RarityDot } from '../ui/RarityTag';
import { groupInstances } from './bagRows';

// 가방 탭 — 조회 + 어종 잠금 (판매는 거점 정비에서)
export default function BagTab({ game, dispatch, setToast }: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (m: string) => void;
}) {
  // 종+폼 단위 그룹 — 개체는 uid로 구분되지만 표시는 묶는다 (v8)
  const rows = useMemo(() => groupInstances(game.bag), [game.bag]);
  const total = sellableValue(game);

  return (
    <div>
      <h3 className="text-base text-gold mb-1">가방 (<span className="pf-accent">{game.bag.length}</span>마리)</h3>
      {rows.length === 0 ? (
        <Note>가방이 비어 있다. 물고기 군집을 찾아 낚시하자.</Note>
      ) : (
        <>
          <DataTable>
            <thead><tr><th>어종</th><th>수량</th><th>최대</th><th>값어치</th><th>잠금</th></tr></thead>
            <tbody>
              {rows.map(({ key, form, fish, items, price, maxSize }) => {
                const locked = game.locked.includes(fish.id);
                return (
                  <tr key={key} className={locked ? 'text-text-dim' : ''}>
                    <td className="flex items-center gap-1 whitespace-nowrap">
                      <FishSprite fish={fish} preset="thumb" form={form} className="shrink-0" />
                      <span><RarityDot rarity={fish.rarity} />{formName(fish, form)}</span>
                    </td>
                    <td>×{items.length}</td>
                    {/* 개체화(v8)로 가방에서도 크기를 안다 — 이관 개체(크기 미상)는 — */}
                    <td>{maxSize === null ? '—' : `${maxSize.toFixed(1)}cm`}</td>
                    <td className="pf-accent">{price * items.length}G</td>
                    <td>
                      <button
                        className={cx('bg-transparent border-0 px-1 cursor-pointer',
                          locked ? 'text-gold' : 'text-text-dim hover:text-text')}
                        aria-label={`${fish.name} ${locked ? '잠금 해제' : '잠금'}`}
                        onClick={() => when(dispatch({ type: 'toggleLock', fishId: fish.id }), r => {
                          if (r.status !== 'ok') return;
                          setToast(locked
                            ? `${fish.name} 잠금 해제 — 다시 판매 대상이 된다.`
                            : `${fish.name} 잠금 — 전부 판매에서 제외된다.`);
                        })}>
                        <PixelIcon glyph={locked ? 'lock' : 'lockOpen'} size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          <Note>
            판매 가능 <span className="pf-accent">{total}G</span> · 판매는 집 궤짝/항구 어시장에서.
            잠근 어종은 전부 판매에서 빠져요.
          </Note>
        </>
      )}
    </div>
  );
}
