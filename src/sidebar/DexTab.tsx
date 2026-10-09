import { useState } from 'react';
import {
  FISH, dexRecord, formDiscovered, formName, priceOf, sizeParams, sizePercentile,
} from '../game/logic';
import type { Fish, FormId, GameState } from '../game/logic';
import { ZONE_IDS, subtreeSpots, topZoneOfSpot, zoneById } from '../data/zones';
import { BOUNTIES } from '../data/bounties';
import type { BountyQuest } from '../data/bounties';
import { namedById } from '../data/named';
import type { ZoneId } from '../data/zones';
import { cx } from '../ui/cx';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import SubTabs from '../ui/SubTabs';
import FishSprite from '../ui/FishSprite';
import { RarityText, RarityDot } from '../ui/RarityTag';
import { RARITY_CARD, rarityRank } from './shared';
import type { DexView } from './shared';

// 도감 상세보기 — 위(초상화, 좌우 화살표로 기본형/변이 전환) + 아래(정보) 2단 구성.
// 변이는 "종만 같고 다른 개체" (v0.3.3): 폼을 전환하면 이름/로어/가격/마릿수/크기/첫 조우일이
// 전부 그 폼의 것으로 바뀐다. 등급·형태·크기 분포만 종에 종속.
function DexDetail({ fish, game, initialForm = 0, onClose }: {
  fish: Fish; game: GameState; initialForm?: number; onClose: () => void;
}) {
  // forms[0] = 기본형 · forms[1+] = 변이(발견해야 정보 공개). 배열인 이유: 폼이 늘어도
  // 화살표 로직 그대로. 크기 폴백 = 분포 평균(상위 50%) — 기록 없는 이관 개체 대응.
  const forms = (['normal', 'variant'] as const).map(form => {
    const rec = dexRecord(game, fish.id, form);
    return {
      form,
      name: formName(fish, form),
      lore: form === 'variant' ? fish.variant.lore : fish.lore,
      discovered: (rec?.count ?? 0) > 0, // 폼별 — 변이만 잡았으면 일반 폼은 여전히 ???
      count: rec?.count ?? 0,
      maxSize: rec?.maxSize ?? sizeParams(fish).mean,
      firstCaught: rec?.first ?? undefined,
    };
  });
  const [i, setI] = useState(initialForm);
  const form = forms[i];
  const arrowCls = 'bg-surface-2 border border-line rounded-sm text-text text-base px-1 py-2 cursor-pointer hover:bg-line';

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-center gap-2">
        <button className={arrowCls} aria-label="이전 형태"
                onClick={() => setI((i - 1 + forms.length) % forms.length)}>◀</button>
        <div>
          <FishSprite fish={fish} preset="portrait" form={form.form} discovered={form.discovered}
                      ariaLabel={form.discovered ? fish.name : '미확인 변종'} className="block" />
          <p className="text-center text-text-dim text-sm mt-1">{form.discovered ? form.name : '???'}</p>
        </div>
        <button className={arrowCls} aria-label="다음 형태"
                onClick={() => setI((i + 1) % forms.length)}>▶</button>
      </div>

      <div className="mt-3">
        {/* 미발견 폼도 같은 구조로 렌더 (값만 ??? 마스킹) — 폼 전환 시 레이아웃 점프 방지 */}
        <h3 className="text-lg text-gold mb-2">{form.discovered ? form.name : '???'}{' '}
          <RarityDot rarity={fish.rarity} /><RarityText rarity={fish.rarity} /></h3>
        <p className="text-text-dim italic text-sm mt-1 mb-3">
          {form.discovered ? form.lore : '…아직 만나지 못한 개체다. 어딘가에서 헤엄치고 있을 것이다.'}
        </p>
        <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm mb-2">
          <span className="text-text-dim">가격</span>
          <span className="pf-accent">{form.discovered ? `${priceOf(fish, form.form)}G` : '???'}</span>
          <span className="text-text-dim">잡은 수</span>
          <span>{form.discovered ? `${form.count}마리` : '???'}</span>
          <span className="text-text-dim">최대 크기</span>
          <span>{form.discovered
            ? <>{form.maxSize.toFixed(1)}cm <span className="text-text-dim text-xs">(상위 {sizePercentile(fish, form.maxSize)}%)</span></>
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
// 보기 전환(일반→돌연변이→네임드)은 활성 도감 탭 재선택(클릭·같은 숫자키), **최상위 존** 전환은
// 하단 서브탭 또는 Tab 키 — 둘 다 Sidebar가 소유한 상태를 내려받는 제어 컴포넌트다.
// 서브탭 단위가 최상위 존인 이유: 하위 존(해구 등) 어종은 부모 존으로 합산된다(topZoneOfSpot) —
// 서브탭 수가 존 트리 확장과 무관하게 안정된다(오픈월드 spec/zone-tree.md).
export default function DexTab({ game, view, sub, onSub }: {
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
  // 네임드는 해역별 1칸 — 수배 목록에서만 공개된 히든 어종이라 FISH 행이 없을 수 있다.
  // 발견 여부는 도감 기록(records) 기준이라 어종 데이터가 나중에 와도 소급된다.
  const namedOf = (zone: ZoneId): BountyQuest[] =>
    BOUNTIES.filter(q => q.zone === zone && q.difficulty === 'named');
  const namedFound = (q: BountyQuest): boolean =>
    q.targetFish !== null && formDiscovered(game, q.targetFish, 'normal');
  const namedCount = BOUNTIES.filter(q => q.difficulty === 'named' && namedFound(q)).length;
  const namedTotal = BOUNTIES.filter(q => q.difficulty === 'named').length;
  const [detail, setDetail] = useState<Fish | null>(null);
  const spots = subtreeSpots(sub); // 최상위 존 서브트리의 어군 전부(하위 존 포함)
  const found = (f: Fish) => formDiscovered(game, f.id, viewForm); // 현재 보기 기준 발견 여부

  if (view === 'named') {
    return (
      <div>
        <h3 className="text-lg text-gold mb-1">
          지명 수배
          {' ('}<span className="pf-accent">{namedCount}/{namedTotal}</span>{')'}
        </h3>
        <SubTabs
          items={ZONE_IDS.map(id => {
            const quests = namedOf(id);
            const caught = quests.filter(namedFound).length;
            return {
              key: id,
              label: <>{zoneById(id)!.shortName}<span className="text-2xs"> {caught}/{quests.length}</span></>,
            };
          })}
          activeKey={sub}
          onSelect={onSub}
        />
        <div className="grid grid-cols-3 gap-2 mt-2">
          {namedOf(sub).map(q => {
            const ok = namedFound(q);
            const known = q.targetFish && (FISH.find(f => f.id === q.targetFish) ?? namedById(q.targetFish));
            return (
              <div key={q.id} className={cx(RARITY_CARD, 'p-2 text-sm aspect-square opacity-[0.72]')}>
                {ok ? (
                  <>
                    <b>{known ? known.name : q.targetFish}</b><br />
                    <span className="text-text-dim text-xs">수배 달성</span>
                  </>
                ) : (
                  <>
                    <b>???</b><br />
                    <span className="text-text-dim text-xs">미확인</span>
                  </>
                )}
              </div>
            );
          })}
          {namedOf(sub).length === 0 && (
            <p className="text-text-dim text-sm">이 해역의 지명 수배는 아직 없다.</p>
          )}
        </div>
      </div>
    );
  }

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
