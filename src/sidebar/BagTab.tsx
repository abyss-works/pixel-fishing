import { useMemo } from 'react';
import { bagCapacity, sellableValue } from '../game/logic';
import type { GameState } from '../game/logic';
import type { GameAction } from '../game/actions';
import { when } from '../backend/types';
import type { DispatchResult, MaybePromise } from '../backend/types';
import { cx } from '../ui/cx';
import Note from '../ui/Note';
import FishSprite from '../ui/FishSprite';
import PixelIcon from '../ui/PixelIcon';
import { RarityDot } from '../ui/RarityTag';
import { groupInstances, sumPrice } from './bagRows';
import InstanceLine, { UnsizedLine } from './InstanceLine';
import BagCards from './BagCards';
import { toggleBagRow, useBagView } from './bagView';

// 가방 탭 — 두 가지 보기. 전환은 **탭 재클릭**이다(도감과 같은 규약, 라벨이 현재 보기를 쓴다).
//  목록: 종+폼 머리 아래에 개체가 한 마리씩. 정보 집약 — 개체를 고르고 잠그는 화면.
//  카드: 전 어종 격자에 보유 마릿수만. 현황 파악 — 뭐가 비었는지가 한눈에 보인다.
// 목록은 **기본 펼침**이다: 접어 두면 예전 어종 목록과 구분이 안 돼 개체화가 눈에 안 보인다.
// 어종 행 머리 — **고정 그리드**. flex로 나열하면 이름·마릿수 자릿수에 따라 숫자 열이
// 행마다 어긋나 소계·최대 크기를 세로로 훑을 수가 없다. 개체 줄(InstanceLine)도 같은 이유로 그리드다.
//   [캐럿] [스프라이트] [이름] [×N] [최대 크기] [소계] [자물쇠]
const ROW = 'grid grid-cols-[10px_30px_1fr_28px_76px_52px_22px] items-center gap-1';

export default function BagTab({ game, dispatch, setToast }: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (m: string) => void;
}) {
  const rows = useMemo(() => groupInstances(game.bag), [game.bag]);
  const cap = bagCapacity(game.bag); // 이미 넘겨 든 유저는 그 수가 상한이다 (래칫)
  const { layout, collapsed } = useBagView();
  const total = sellableValue(game);

  const lock = (uids: string[], locked: boolean, label: string) =>
    when(dispatch({ type: 'setLocked', uids, locked }), r => {
      if (r.status !== 'ok') return;
      setToast(locked
        ? `${label} 잠금 — 판매에서 제외된다.`
        : `${label} 잠금 해제 — 다시 판매 대상이 된다.`);
    });

  return (
    <div>
      <h3 className="text-lg text-gold mb-1">
        가방 (<span className={cx('pf-accent', game.bag.length >= cap && 'text-danger')}>
          {game.bag.length}</span>
        <span className="pf-accent text-text-dim">/{cap}</span>마리)
      </h3>
      {layout === 'cards' ? (
        <BagCards bag={game.bag} game={game} />
      ) : rows.length === 0 ? (
        <Note>가방이 비어 있다. 물고기 군집을 찾아 낚시하자.</Note>
      ) : (
        <>
          <div className="pf-frame divide-y divide-line">
            {rows.map(({ key, fish, name, items, sized, unsized, maxSize, maxByForm }) => {
              const expanded = !collapsed.has(key);
              const uids = items.map(i => i.uid);
              // 하나라도 안 잠겼으면 머리 버튼은 "전부 잠금" — 부분 상태에서 눌러도 결과가 하나다
              const allLocked = items.every(i => i.locked);
              return (
                <div key={key}>
                  <div className={cx(ROW, 'px-1 py-1 text-sm cursor-pointer hover:bg-surface-2',
                                     allLocked && 'text-text-dim')}
                       onClick={() => toggleBagRow(key)}
                       role="button"
                       aria-expanded={expanded}
                       aria-label={`${name} 개체 ${expanded ? '접기' : '펼치기'}`}>
                    <PixelIcon glyph={expanded ? 'caretDown' : 'caretRight'} size={10}
                               className="text-text-dim" />
                    <FishSprite fish={fish} preset="thumb" form="normal" />
                    <span className="truncate">
                      <RarityDot rarity={fish.rarity} />{name}
                    </span>
                    <span className="pf-accent text-text-dim text-right">×{items.length}</span>
                    <span className="pf-accent text-text-dim text-right whitespace-nowrap">
                      {maxSize !== null && `최대 ${maxSize.toFixed(1)}cm`}
                    </span>
                    <span className="pf-accent text-right">{sumPrice(items)}G</span>
                    <button
                      className={cx('justify-self-end bg-transparent border-0 px-1 cursor-pointer',
                        allLocked ? 'text-gold' : 'text-text-dim hover:text-text')}
                      aria-label={`${name} 전체 ${allLocked ? '잠금 해제' : '잠금'}`}
                      onClick={e => {
                        e.stopPropagation(); // 잠금 토글이 행 펼침을 겸하지 않게
                        lock(uids, !allLocked, `${name} ${items.length}마리`);
                      }}>
                      <PixelIcon glyph={allLocked ? 'lock' : 'lockOpen'} size={14} />
                    </button>
                  </div>
                  {expanded && (
                    <div className="bg-bg pb-1">
                      {sized.map(inst => (
                        <InstanceLine key={inst.uid} inst={inst} fish={fish}
                                      best={inst.size !== null && inst.size === maxByForm[inst.form]}
                                      onLock={() => lock([inst.uid], !inst.locked, name)} />
                      ))}
                      {unsized.map(g => {
                        const allLockedG = g.items.every(i => i.locked);
                        return (
                          <UnsizedLine key={g.form} count={g.items.length} form={g.form}
                                       locked={allLockedG}
                                       onLock={() => lock(g.items.map(i => i.uid), !allLockedG,
                                                          `${name} 크기 미상 ${g.items.length}마리`)} />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Note>
            판매 가능 <span className="pf-accent">{total}G</span> · 판매는 집 궤짝/항구 어시장에서.
            자물쇠는 개체마다 걸 수 있고, 머리의 자물쇠는 그 종 전부에 건다.
          </Note>
        </>
      )}
    </div>
  );
}
