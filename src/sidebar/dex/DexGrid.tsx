import { useState } from 'react';
import {
  FISH, dexRecord, formDiscovered, formName, priceOf,
} from '../../game/logic';
import type { Fish, FormId, GameState } from '../../game/logic';
import { ZONE_IDS, subtreeSpots, topZoneOfSpot, zoneById } from '../../data/zones';
import type { ZoneId } from '../../data/zones';
import { cx } from '../../ui/cx';
import SubTabs from '../../ui/SubTabs';
import FishSprite from '../../ui/FishSprite';
import { RarityText, RarityDot } from '../../ui/RarityTag';
import { RARITY_CARD, rarityRank } from '../shared';
import type { DexView } from '../shared';
import DexDetail from './DexDetail';

// 일반/돌연변이 공용 격자 — 폼별 발견 기준만 다르다. 변이는 별개 개체라 변이만 잡은 종은
// 기본 도감에서 여전히 ??? (v0.3.3)
export default function DexGrid({ game, view, sub, onSub }: {
  game: GameState;
  view: DexView;
  /** 열람 중인 최상위 존 — Sidebar 소유(Tab 키 존 순환과 상태 공유) */
  sub: ZoneId;
  onSub: (z: ZoneId) => void;
}) {
  // 폼별 발견 기준 — 변이는 별개 개체라 변이만 잡은 종은 기본 도감에서 여전히 ??? (v0.3.3)
  const viewForm: FormId = view === 'variant' ? 'variant' : 'normal';
  const baseCount = FISH.filter(f => formDiscovered(game, f.id, 'normal')).length;
  const varCount = FISH.filter(f => formDiscovered(game, f.id, 'variant')).length;
  const [detail, setDetail] = useState<Fish | null>(null);
  const spots = subtreeSpots(sub); // 최상위 존 서브트리의 어군 전부(하위 존 포함)
  const found = (f: Fish) => formDiscovered(game, f.id, viewForm); // 현재 보기 기준 발견 여부

  return (
    <div>
      <h3 className="text-lg text-gold mb-1">
        {view === 'base' ? '일반 어종' : '돌연변이'}
        {' ('}<span className="pf-accent">
          {view === 'base' ? baseCount : varCount}/{FISH.length}
        </span>{')'}
      </h3>
      <SubTabs
        items={ZONE_IDS.map(id => {
          const zoneFish = FISH.filter(f => topZoneOfSpot(f.spot) === id);
          const caught = zoneFish.filter(found).length;
          return {
            key: id,
            label: <>{zoneById(id)!.shortName}<span className="text-2xs"> {caught}/{zoneFish.length}</span></>,
          };
        })}
        activeKey={sub}
        onSelect={onSub}
      />
      {spots.map(s => {
        const fishes = FISH.filter(f => f.spot === s.id)
          .sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity));
        return (
          <div key={s.id} className="mt-2">
            <h4 className="text-sm text-text-dim font-normal border-b border-line pb-1 mb-1">{s.name}</h4>
            <div className="grid grid-cols-3 gap-2">
              {fishes.map(f => {
                const ok = found(f);
                // 등급은 테두리(알파25%)와 등급 점으로만 — 미획득 카드도 티어는 알 수 있게
                return (
                  <div key={f.id} data-rarity={f.rarity}
                       className={cx(RARITY_CARD, 'p-2 text-sm', !ok && 'opacity-[0.72]')}
                       role={ok ? 'button' : undefined} tabIndex={ok ? 0 : undefined}
                       onClick={ok ? () => setDetail(f) : undefined}>
                    <FishSprite fish={f} preset="icon" form={viewForm} discovered={ok}
                                ariaLabel={ok ? formName(f, viewForm) : '미확인 어종'}
                                className="block mx-auto mb-1" />
                    {ok ? (
                      <>
                        <b>{formName(f, viewForm)}</b><br />
                        <RarityText rarity={f.rarity} /> · <span className="pf-accent">{priceOf(f, viewForm)}G</span><br />
                        <span className="text-text-dim text-xs">
                          {dexRecord(game, f.id, viewForm)?.count ?? 0}마리 잡음
                        </span>
                      </>
                    ) : (
                      <>
                        <b>???</b><br />
                        <span className="text-text-dim text-xs"><RarityDot rarity={f.rarity} />미확인</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {detail && (
        <DexDetail key={`${detail.id}-${view}`} fish={detail} game={game}
                   initialForm={view === 'variant' ? 1 : 0} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}
