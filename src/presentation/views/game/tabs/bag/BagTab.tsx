import { useMemo } from 'react';
import { REJECT_TEXT, freeExhibitSlot, instanceFish, formName } from '../../../../../game/rules/logic';
import PageTitle from '../../../../ui/PageTitle';
import Subheading from '../../../../ui/Subheading';
import { fmtGold } from '../../../../ui/format';
import { EXHIBIT_SLOTS } from '../../../../../game/rules/balance';
import { selectBagOverview, selectBaitInventory } from '../../../../../features/inventory/model/selectors';
import { selectInventoryItemCount } from '../../../../../features/inventory/model/catalog';
import type { FishInstance, GameState } from '../../../../../game/rules/logic';
import type { GameAction } from '../../../../../game/rules/actions';
import type { Bait } from '../../../../../game/content/baits';
import { when } from '../../../../../shared/lib/when';
import type { DispatchResult, MaybePromise } from '../../../../../features/gameplay/service/types';
import { cx } from '../../../../ui/cx';
import Note from '../../../../ui/Note';
import FishSprite from '../../../../ui/fish/FishSprite';
import PixelIcon from '../../../../ui/PixelIcon';
import IconButton from '../../../../ui/IconButton';
import PillButton from '../../../../ui/PillButton';
import SubTabs from '../../../../ui/SubTabs';
import { RarityDot } from '../../../../ui/fish/RarityTag';
import { groupInstances } from '../../../../../features/inventory/model/bagRows';
import InstanceLine, { UnsizedLine } from '../../../../ui/fish/InstanceLine';
import BagCards from './BagCards';
import { setBagLayout, setBagSection, toggleBagRow, useBagView } from './bagView';

/** 전시대 화면 노출 — 1차 전시대는 이번 배포에서 뺀다(사용자 결정 2026-10-15). 규칙·액션은 그대로다 */
export const EXHIBIT_UI_ENABLED = false;

// 가방 탭 — **서브탭 2장: 물고기 / 아이템**(사용자 지시 2026-08-27: 물고기 1,500마리를 아이템과
// 한 스크롤에서 훑게 하지 않는다). 서브탭 선택은 bagView 저장소에 살아서 탭을 왕래해도 유지된다.
//
// 물고기 섹션 — 목록/카드 2레이아웃. 카드뷰는 **물고기 목록의 렌더링만** 바꾼다(아이템과 무관).
//  목록: 종+폼 머리 아래 개체가 한 마리씩. 정보 집약 — 개체를 고르고 잠그는 화면.
//  카드: 전 어종 격자에 보유 마릿수. 현황 파악 — 뭐가 비었는지가 한눈에 보인다.
//
// 목록은 **기본 전부 닫힘**(사용자 지시 2026-08-27) — 1,500마리 세이브에서 펼침 기본은
// 스크롤 지옥이다. 개체 선택 화면은 판매 패널이 담당하고(그쪽은 기본 펼침 유지), 가방은
// 열람 화면이므로 종 머리(마릿수·최대 크기·소계)만으로 훑고 필요한 종만 펼친다.
//
// 종 행 머리 — **고정 그리드**. flex로 나열하면 이름·마릿수 자릿수에 따라 숫자 열이
// 행마다 어긋나 소계·최대 크기를 세로로 훑을 수가 없다. 개체 줄(InstanceLine)도 같은 이유로 그리드다.
//   [캐럿] [스프라이트] [이름] [×N] [최대 크기] [소계] [자물쇠]
// 정렬 — **등급 내림차순 → 소계 내림차순**(bagRows; 목록·카드·판매 패널 공용).
const ROW = 'grid grid-cols-[10px_30px_1fr_28px_76px_52px_22px] items-center gap-1';
const ITEM_ROW = 'grid grid-cols-[16px_1fr_40px_88px] items-center gap-2';

/** 아이템 서브탭 — 미끼 목록. 활성은 4중 1(setActiveBait 리듀서가 배타성·보유 검증) */
function ItemSection({ game, dispatch, setToast }: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (m: string) => void;
}) {
  // 보유량 순서는 레지스트리(BAITS) 순서다 — 세이브 items는 맵이라 삽입 순서가 유의미 없음
  const rows = useMemo(() => selectBaitInventory(game.items), [game.items]);
  const activate = (bait: string | null) =>
    when(dispatch({ type: 'setActiveBait', bait }), r => {
      if (r.status === 'rejected') setToast(REJECT_TEXT[r.error]);
    });

  return (
    <div className="flex flex-col gap-1">
      <Subheading>미끼</Subheading>
      <div className="pf-frame divide-y divide-line">
        {rows.map(({ bait, count }: { bait: Bait; count: number }) => {
          const active = game.activeBait === bait.id;
          return (
            <div key={bait.id} className={cx(ITEM_ROW, 'px-1 py-1.5 text-sm', active && 'bg-surface-2')}>
              <span className="w-3 h-3 rounded-full border border-line justify-self-center"
                    style={{ backgroundColor: bait.color }} />
              <span className="truncate" title={bait.desc}>{bait.name}</span>
              <span className="pf-accent text-text-dim text-right">×{count}</span>
              <PillButton
                type="button"
                active={active}
                disabled={!active && count <= 0}
                aria-label={`${bait.name} ${active ? '비활성화' : '활성화'}`}
                title={active ? '한 번 더 누르면 끈다' : count <= 0 ? '보유량이 없다' : '같은 등급 물고기 가중치 ×2'}
                onClick={() => activate(active ? null : bait.id)}
                className="justify-self-end">
                <PixelIcon glyph={active ? 'checkOn' : 'checkOff'} size={11} />
                {active ? '사용 중' : '활성'}
              </PillButton>
            </div>
          );
        })}
      </div>
      <Note>
        활성하면 같은 등급 물고기가 두 배 더 잘 낚인다. 수동으로 낚아올릴 때마다 한 개가 소모되고,
        방치 획득에는 소모되지 않는다. 구매는 콜롬보 항구의 미끼 가게에서.
      </Note>
    </div>
  );
}

/** 전시대 선반 — 칸 수는 EXHIBIT_SLOTS, exhibit 인덱스가 칸 번호다. 빈 칸은 자리만 보인다.
 *  진열 입구는 가방 개체 줄의 별 버튼(InstanceLine.onExhibit) — 여기서는 회수만 한다. */
function ExhibitShelf({ exhibit, onWithdraw }: {
  exhibit: readonly FishInstance[];
  onWithdraw: (inst: FishInstance, name: string) => void;
}) {
  const slots = Array.from({ length: EXHIBIT_SLOTS }, (_, i) => exhibit[i]);
  const shown = slots.filter(Boolean).length;
  return (
    <div className="mb-2">
      <Subheading>
        전시대 <span className="pf-accent">{shown}/{EXHIBIT_SLOTS}</span>
      </Subheading>
      <div className="pf-frame divide-y divide-line">
        {slots.map((inst, i) => {
          if (!inst) return <div key={i} className="px-2 py-1.5 text-xs text-text-dim">빈 칸</div>;
          const fish = instanceFish(inst);
          const name = fish ? formName(fish, inst.form) : inst.fishId;
          return (
            <div key={inst.uid}
                 className="grid grid-cols-[30px_1fr_60px_auto] items-center gap-1 px-1 py-1 text-sm">
              <span>{fish && <FishSprite fish={fish} preset="thumb" form={inst.form} animate />}</span>
              <span className="truncate">
                {fish && <RarityDot rarity={fish.rarity} />}{name}
              </span>
              <span className="pf-accent text-text-dim text-right">
                {inst.size === null ? '미상' : `${inst.size.toFixed(1)}cm`}
              </span>
              <PillButton aria-label={`${name} 회수`} title="가방으로 되돌린다"
                          onClick={() => onWithdraw(inst, name)}>
                회수
              </PillButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function BagTab({ game, dispatch, setToast }: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (m: string) => void;
}) {
  const rows = useMemo(() => groupInstances(game.bag), [game.bag]);
  const {
    count: bagCount, cap, full: bagFull, sellableValue: total,
    autoLockUids: autoLockCandidates,
  } = selectBagOverview(game);
  const { layout, section, opened } = useBagView();
  const itemCount = selectInventoryItemCount(game.items);

  const lock = (uids: string[], locked: boolean, label: string) =>
    when(dispatch({ type: 'setLocked', uids, locked }), r => {
      if (r.status !== 'ok') return;
      setToast(locked
        ? `${label} 잠금 — 판매에서 제외된다.`
        : `${label} 잠금 해제 — 다시 판매 대상이 된다.`);
    });

  // 전시대 — 칸 선택은 freeExhibitSlot(가장 앞 빈 칸)이 대신한다. 다 찼으면 요청 없이 안내만.
  const exhibitTo = (inst: FishInstance, name: string) => {
    const slot = freeExhibitSlot(game.exhibit);
    if (slot === null) {
      setToast('전시대가 가득 찼다 — 먼저 회수하자.');
      return;
    }
    when(dispatch({ type: 'exhibit', uid: inst.uid, slot }), r => {
      if (r.status === 'ok') setToast(`${name} 진열 — 전시 중에는 팔리지 않는다.`);
      else if (r.status === 'rejected') setToast(REJECT_TEXT[r.error]);
    });
  };
  const withdraw = (inst: FishInstance, name: string) =>
    when(dispatch({ type: 'exhibit', uid: inst.uid, slot: null }), r => {
      if (r.status === 'ok') setToast(`${name} 회수 — 가방으로 돌아왔다.`);
      else if (r.status === 'rejected') setToast(REJECT_TEXT[r.error]);
    });

  // 자동 잠금 — 어종·돌연변이별 최대 개체를 한 번에 보호한다 (logic.autoLockUids가 선택,
  // 적용은 기존 setLocked 액션). 눌러도 변할 게 없으면(전부 보호됨) 요청을 보내지 않는다.
  const autoLock = () => {
    const uids = autoLockCandidates;
    if (uids.length === 0) {
      setToast('새로 잠글 최대 개체가 없다 — 가방이 비었거나 이미 다 잠겨 있다.');
      return;
    }
    when(dispatch({ type: 'setLocked', uids, locked: true }), r => {
      if (r.status !== 'ok') return;
      setToast(`최대 개체 ${uids.length}종을 잠궜다 — 판매에서 제외된다.`);
    });
  };

  return (
    <div>
      {/* 내부 서브탭 — 물고기(개체 목록·카드) / 아이템(미끼) 완전 분리 */}
      <SubTabs
        items={[
          { key: 'fish', label: '물고기', sub: bagCount },
          { key: 'items', label: '아이템', sub: itemCount },
        ]}
        activeKey={section}
        onSelect={setBagSection}
      />

      {section === 'items' ? (
        <ItemSection game={game} dispatch={dispatch} setToast={setToast} />
      ) : (
        <>
          {/* 헤더 — 용량 표시(좌) + 자동 잠금(우측 끝) */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <PageTitle>
              물고기 (<span className={cx(bagFull && 'text-danger')}>{bagCount}</span>
              <span className="text-text-dim">/{cap}</span>마리)
            </PageTitle>
            <div className="flex items-center gap-1">
              {/* 목록↔카드 — 화면 버튼으로만 바꾼다(키보드 Tab은 서브탭 줄 몫) */}
              <PillButton
                aria-label={layout === 'list' ? '카드로 보기' : '목록으로 보기'}
                title={layout === 'list' ? '전 어종 격자에 보유 마릿수' : '종별 개체를 한 마리씩'}
                onClick={() => setBagLayout(layout === 'list' ? 'cards' : 'list')}>
                {layout === 'list' ? '카드' : '목록'}
              </PillButton>
              {bagCount > 0 && (
                <PillButton
                  aria-label="자동 잠금"
                  title="어종·돌연변이별 가장 큰 물고기를 한 마리씩 잠근다 — 이미 큰 놈이 잠긴 종은 그대로 둔다"
                  onClick={autoLock}>
                  <PixelIcon glyph="lockOpen" size={12} />
                  자동 잠금
                </PillButton>
              )}
            </div>
          </div>
          {EXHIBIT_UI_ENABLED && <ExhibitShelf exhibit={game.exhibit} onWithdraw={withdraw} />}
          {layout === 'cards' ? (
            <BagCards bag={game.bag} game={game} />
          ) : rows.length === 0 ? (
            <Note>가방이 비어 있다. 물고기 군집을 찾아 낚시하자.</Note>
          ) : (
            <>
              <div className="pf-frame divide-y divide-line">
                {rows.map(({ key, fish, name, items, subtotal, sized, unsized, maxSize, maxByForm }) => {
                  const expanded = opened.has(key);
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
                        <span className="pf-accent text-right">{fmtGold(subtotal)}</span>
                        <IconButton
                          glyph={allLocked ? 'lock' : 'lockOpen'} size={14}
                          tone={allLocked ? 'gold' : 'dim'}
                          className="justify-self-end px-1"
                          aria-label={`${name} 전체 ${allLocked ? '잠금 해제' : '잠금'}`}
                          onClick={e => {
                            e.stopPropagation(); // 잠금 토글이 행 펼침을 겸하지 않게
                            lock(uids, !allLocked, `${name} ${items.length}마리`);
                          }} />
                      </div>
                      {expanded && (
                        <div className="bg-bg pb-1">
                          {sized.map(inst => (
                            <InstanceLine key={inst.uid} inst={inst} fish={fish}
                                          best={inst.size !== null && inst.size === maxByForm[inst.form]}
                                          onExhibit={EXHIBIT_UI_ENABLED ? () => exhibitTo(inst, name) : undefined}
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
                판매 가능 <span className="pf-accent">{fmtGold(total)}</span> · 판매는 집 궤짝/항구 어시장에서.
                자물쇠는 개체마다 걸 수 있고, 머리의 자물쇠는 그 종 전부에 건다.
                별은 전시대에 올린다 — 전시 중에는 팔리지 않는다.
                행 소계는 그 종 판매가 합계다 — 정렬은 등급이 높은 순.
              </Note>
            </>
          )}
        </>
      )}
    </div>
  );
}
