import { useMemo } from 'react';
import { FISH, formName, speciesDiscovered } from '../game/logic';
import type { FishInstance, GameState } from '../game/logic';
import { cx } from '../ui/cx';
import FishSprite from '../ui/FishSprite';
import { RARITY_CARD, dexIndex } from './shared';

// 가방 카드뷰 — 목록뷰가 정보 집약(개체 한 줄씩)이라면 이쪽은 **현황 한눈에**다.
// 그래서 전 어종을 깔고 보유 마릿수만 얹는다: 뭘 들고 있고 뭐가 비었는지가 한 화면에 보인다.
// 미발견은 도감과 같은 규칙으로 ??? — 카드뷰가 도감 스포일러 우회로가 되면 안 된다.
//
// 정렬은 **보유중 → 발견함 → 미발견**, 각 무리 안에서는 도감 순.
// 지금 쓸 수 있는 것이 맨 위로 모이고, 미발견 ??? 카드가 중간에 끼어 보유분을 갈라놓지 않는다.
// 무리가 바뀌는 건 잡거나 팔 때뿐이라 카드가 눈앞에서 튀지도 않는다.
interface Held { normal: number; variant: number }

export default function BagCards({ bag, game }: { bag: readonly FishInstance[]; game: GameState }) {
  const held = useMemo(() => {
    const m = new Map<string, Held>();
    for (const inst of bag) {
      const h = m.get(inst.fishId) ?? { normal: 0, variant: 0 };
      if (inst.form === 'variant') h.variant += 1; else h.normal += 1;
      m.set(inst.fishId, h);
    }
    return m;
  }, [bag]);

  const fishes = useMemo(() => {
    const group = (id: string) => (held.has(id) ? 0 : speciesDiscovered(game, id) ? 1 : 2);
    return [...FISH].sort((a, b) =>
      group(a.id) - group(b.id) || dexIndex(a.id) - dexIndex(b.id));
  }, [held, game]);

  return (
    <div className="grid grid-cols-3 gap-2">
      {fishes.map(f => {
        const known = speciesDiscovered(game, f.id);
        const h = held.get(f.id) ?? { normal: 0, variant: 0 };
        const n = h.normal + h.variant;
        return (
          <div key={f.id} data-rarity={f.rarity}
               className={cx(RARITY_CARD, 'p-2 text-sm',
                 // 보유 0은 흐리게 — 미발견(???)보다는 진하게 둬서 셋이 구분된다
                 n === 0 && (known ? 'opacity-[0.72]' : 'opacity-[0.55]'))}
               aria-label={!known ? '미확인 어종'
                 : n === 0 ? `${f.name} 미보유`
                 : `${f.name} 일반 ${h.normal}마리 변이 ${h.variant}마리 보유`}>
            <FishSprite fish={f} preset="icon" form="normal" discovered={known}
                        ariaLabel="" className="block mx-auto mb-1" />
            {/* 가방은 "내가 지금 뭘 들고 있나"만 본다 — 등급은 테두리가, 미발견은 ???가 말한다.
                안 들고 있는 종에 0을 적거나 "미확인"을 덧붙이면 읽을 게 늘기만 한다. */}
            <b className="block truncate">{known ? formName(f, 'normal') : '???'}</b>
            {n > 0 && (
              /* 일반/변이를 한 행에 — 흰 글씨 일반, 보라 변이, 사이에 얇은 구분 바 */
              <span className="pf-accent inline-flex items-center justify-center gap-1.5">
                <span className={h.normal > 0 ? 'text-text' : 'text-text-dim'}>{h.normal}</span>
                <span className="block w-px h-2.5 bg-line" aria-hidden="true" />
                <span className={h.variant > 0 ? 'text-epic' : 'text-text-dim'}>{h.variant}</span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
