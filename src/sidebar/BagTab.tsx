import { useMemo } from 'react';
import { entryFish, entryPrice, parseBagEntry, sellableValue, toggleLock } from '../game/logic';
import type { GameState } from '../game/logic';
import { cx } from '../ui/cx';
import DataTable from '../ui/DataTable';
import Note from '../ui/Note';
import FishSprite from '../ui/FishSprite';
import PixelIcon from '../ui/PixelIcon';
import { RarityDot } from '../ui/RarityTag';
import { rarityRank } from './shared';

// 가방 탭 — 조회 + 어종 잠금 (판매는 거점 정비에서)
export default function BagTab({ game, setGame, setToast }: {
  game: GameState; setGame: (g: GameState) => void; setToast: (m: string) => void;
}) {
  // 엔트리 단위 그룹 — 'carp'(일반)와 'carp*'(변이)는 별개 행 (v0.3.3)
  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of game.bag) counts.set(e, (counts.get(e) ?? 0) + 1);
    return [...counts.entries()]
      .map(([entry, n]) => {
        const { mutated } = parseBagEntry(entry);
        return { entry, mutated, fish: entryFish(entry)!, n };
      })
      .sort((a, b) => rarityRank(a.fish.rarity) - rarityRank(b.fish.rarity)
        || Number(a.mutated) - Number(b.mutated));
  }, [game.bag]);
  const total = sellableValue(game);

  return (
    <div>
      <h3 className="text-base text-gold mb-1">가방 (<span className="pf-accent">{game.bag.length}</span>마리)</h3>
      {rows.length === 0 ? (
        <Note>가방이 비어 있다. 물고기 군집을 찾아 낚시하자.</Note>
      ) : (
        <>
          <DataTable>
            <thead><tr><th>어종</th><th>수량</th><th>값어치</th><th>잠금</th></tr></thead>
            <tbody>
              {rows.map(({ entry, mutated, fish, n }) => {
                const locked = game.locked.includes(fish.id);
                return (
                  <tr key={entry} className={locked ? 'text-text-dim' : ''}>
                    <td className="flex items-center gap-1 whitespace-nowrap">
                      <FishSprite fish={fish} preset="thumb" mutated={mutated} className="shrink-0" />
                      <span><RarityDot rarity={fish.rarity} />{mutated ? fish.variant.name : fish.name}</span>
                    </td>
                    <td>×{n}</td>
                    <td className="pf-accent">{entryPrice(entry) * n}G</td>
                    <td>
                      <button
                        className={cx('bg-transparent border-0 px-1 cursor-pointer',
                          locked ? 'text-gold' : 'text-text-dim hover:text-text')}
                        aria-label={`${fish.name} ${locked ? '잠금 해제' : '잠금'}`}
                        onClick={() => {
                          setGame(toggleLock(game, fish.id));
                          setToast(locked
                            ? `${fish.name} 잠금 해제 — 다시 판매 대상이 된다.`
                            : `${fish.name} 잠금 — 전부 판매에서 제외된다.`);
                        }}>
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
