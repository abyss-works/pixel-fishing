import { useState } from 'react';
import { FISH, SPOTS, priceOf, sizeParams, sizePercentile, variantDiscovered } from '../game/logic';
import type { Fish, GameState } from '../game/logic';
import { REGION_PACKS } from '../world';
import type { RegionId } from '../world';
import { cx } from '../ui/cx';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import SubTabs from '../ui/SubTabs';
import FishSprite from '../ui/FishSprite';
import { RarityText, RarityDot } from '../ui/RarityTag';
import { rarityRank } from './shared';
import type { DexView } from './shared';

// 도감 상세보기 — 위(초상화, 좌우 화살표로 기본형/변이 전환) + 아래(정보) 2단 구성.
// 변이는 "종만 같고 다른 개체" (v0.3.3): 폼을 전환하면 이름/로어/가격/마릿수/크기/첫 조우일이
// 전부 그 폼의 것으로 바뀐다. 등급·형태·크기 분포만 종에 종속.
function DexDetail({ fish, game, initialForm = 0, onClose }: {
  fish: Fish; game: GameState; initialForm?: number; onClose: () => void;
}) {
  const id = fish.id;
  const varN = game.variantCaught[id] ?? 0;
  // forms[0] = 기본형 · forms[1+] = 변이(발견해야 정보 공개). 배열인 이유: 변이가 늘어도
  // 화살표 로직 그대로. 크기 폴백 = 분포 평균(상위 50%) — 구세이브(기록 없음) 대응.
  const forms = [
    {
      name: fish.name, lore: fish.lore, mutated: false,
      discovered: (game.caught[id] ?? 0) - varN > 0, // 일반 폼을 잡아야 공개 (변이만 잡았으면 ???)
      count: (game.caught[id] ?? 0) - varN,
      maxSize: game.maxSize[id] ?? sizeParams(fish).mean,
      firstCaught: game.firstCaught[id],
    },
    {
      name: fish.variant.name, lore: fish.variant.lore, mutated: true,
      discovered: varN > 0,
      count: varN,
      maxSize: game.variantMaxSize[id] ?? sizeParams(fish).mean,
      firstCaught: game.variantFirstCaught[id],
    },
  ];
  const [i, setI] = useState(initialForm);
  const form = forms[i];
  const arrowCls = 'bg-surface-2 border border-line rounded-sm text-text text-sm px-1 py-2 cursor-pointer hover:bg-line';

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-center gap-2">
        <button className={arrowCls} aria-label="이전 형태"
                onClick={() => setI((i - 1 + forms.length) % forms.length)}>◀</button>
        <div>
          <FishSprite fish={fish} preset="portrait" mutated={form.mutated} discovered={form.discovered}
                      ariaLabel={form.discovered ? fish.name : '미확인 변종'} className="block" />
          <p className="text-center text-text-dim text-xs mt-1">{form.discovered ? form.name : '???'}</p>
        </div>
        <button className={arrowCls} aria-label="다음 형태"
                onClick={() => setI((i + 1) % forms.length)}>▶</button>
      </div>

      <div className="mt-3">
        {/* 미발견 폼도 같은 구조로 렌더 (값만 ??? 마스킹) — 폼 전환 시 레이아웃 점프 방지 */}
        <h3 className="text-base text-gold mb-2">{form.discovered ? form.name : '???'}{' '}
          <RarityDot rarity={fish.rarity} /><RarityText rarity={fish.rarity} /></h3>
        <p className="text-text-dim italic text-xs mt-1 mb-3">
          {form.discovered ? form.lore : '…아직 만나지 못한 개체다. 어딘가에서 헤엄치고 있을 것이다.'}
        </p>
        <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs mb-2">
          <span className="text-text-dim">가격</span>
          <span className="pf-accent">{form.discovered ? `${priceOf(fish, form.mutated)}G` : '???'}</span>
          <span className="text-text-dim">잡은 수</span>
          <span>{form.discovered ? `${form.count}마리` : '???'}</span>
          <span className="text-text-dim">최대 크기</span>
          <span>{form.discovered
            ? <>{form.maxSize.toFixed(1)}cm <span className="text-text-dim text-[11px]">(상위 {sizePercentile(fish, form.maxSize)}%)</span></>
            : '???'}</span>
          <span className="text-text-dim">처음 만난 날</span>
          <span>{form.discovered ? (form.firstCaught ?? '알 수 없음') : '???'}</span>
        </div>
        <Button onClick={onClose}>닫기</Button>
      </div>
    </Modal>
  );
}

// 도감은 포함관계: 전체 = 기본 어종 + 변이 (슬롯 2×종수).
// 보기 전환(일반↔돌연변이)은 활성 도감 탭 재클릭 — view는 Sidebar가 들고 온다.
export default function DexTab({ game, region, view }: { game: GameState; region: RegionId; view: DexView }) {
  // 폼별 발견 기준 — 변이는 별개 개체라 변이만 잡은 종은 기본 도감에서 여전히 ??? (v0.3.3)
  const baseCaught = (f: Fish) => (game.caught[f.id] ?? 0) - (game.variantCaught[f.id] ?? 0);
  const baseCount = FISH.filter(f => baseCaught(f) > 0).length;
  const varCount = FISH.filter(f => variantDiscovered(game, f.id)).length;
  const [sub, setSub] = useState<RegionId>(region); // 기본 = 지금 있는 지역
  const [detail, setDetail] = useState<Fish | null>(null);
  const regions = Object.values(REGION_PACKS);
  const spots = SPOTS.filter(s => s.region === sub);
  const found = (f: Fish) => // 현재 보기에서 이 카드가 "발견됨"인가
    view === 'base' ? baseCaught(f) > 0 : variantDiscovered(game, f.id);

  return (
    <div>
      <h3 className="text-base text-gold mb-1">
        {view === 'base' ? '일반 도감' : '돌연변이 도감'}
        {' ('}<span className="pf-accent">
          {view === 'base' ? baseCount : varCount}/{FISH.length}
        </span>{')'}
      </h3>
      <SubTabs
        items={regions.map(pack => {
          const regionFish = FISH.filter(f => SPOTS.some(s => s.region === pack.id && s.id === f.spot));
          const caught = regionFish.filter(found).length;
          return {
            key: pack.id, // RegionId 단일 근원(data/spots 파생)이라 캐스트 불필요
            label: <>{pack.info.shortName}<span className="text-[10px]"> {caught}/{regionFish.length}</span></>,
          };
        })}
        activeKey={sub}
        onSelect={setSub}
      />
      {spots.map(s => {
        const fishes = FISH.filter(f => f.spot === s.id)
          .sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity));
        return (
          <div key={s.id} className="mt-2">
            <h4 className="text-xs text-text-dim font-normal border-b border-line pb-1 mb-1">{s.name}</h4>
            <div className="grid grid-cols-3 gap-2">
              {fishes.map(f => {
                const ok = found(f);
                const n = game.caught[f.id] ?? 0;
                // 등급은 테두리(알파25%)와 등급 점으로만 — 미획득 카드도 티어는 알 수 있게 
                return (
                  <div key={f.id} data-rarity={f.rarity}
                       className={cx(
                         'bg-bg border rounded-sm p-2 text-xs text-center leading-normal',
                         'border-[color-mix(in_srgb,var(--rarity-color)_25%,transparent)]',
                         'transition-[translate,background-color] duration-[120ms] ease-out hover:-translate-y-0.5 hover:bg-surface-2',
                         !ok && 'opacity-[0.72]',
                       )}
                       role={ok ? 'button' : undefined} tabIndex={ok ? 0 : undefined}
                       onClick={ok ? () => setDetail(f) : undefined}>
                    <FishSprite fish={f} preset="icon" mutated={view === 'variant'} discovered={ok}
                                ariaLabel={ok ? (view === 'variant' ? f.variant.name : f.name) : '미확인 어종'}
                                className="block mx-auto mb-1" />
                    {ok ? (
                      <>
                        <b>{view === 'variant' ? f.variant.name : f.name}</b><br />
                        <RarityText rarity={f.rarity} /> · <span className="pf-accent">{priceOf(f, view === 'variant')}G</span><br />
                        <span className="text-text-dim text-[11px]">
                          {view === 'variant'
                            ? `${game.variantCaught[f.id] ?? 0}마리 잡음`
                            : `${n - (game.variantCaught[f.id] ?? 0)}마리 잡음`}
                        </span>
                      </>
                    ) : (
                      <>
                        <b>???</b><br />
                        <span className="text-text-dim text-[11px]"><RarityDot rarity={f.rarity} />미확인</span>
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
