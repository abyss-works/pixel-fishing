import { useMemo, useState } from 'react';
import { REJECT_TEXT, freeExhibitSlot, instanceFish, formName } from '../../../../../game/rules/logic';
import PageTitle from '../../../../ui/PageTitle';
import Subheading from '../../../../ui/Subheading';
import { fmtGold, fmtNum, fmtSize, josa } from '../../../../ui/format';
import type { Notify } from '../../../../ui/hud/messageFeed';
import { EXHIBIT_SLOTS } from '../../../../../game/rules/balance';
import { selectBagOverview } from '../../../../../features/inventory/model/selectors';
import { selectBagEnergyEntry } from '../../../../../features/kitchen/model/energy';
import { useNow } from '../../../../../features/gameplay/service/useGameTime';
import type { AccountLockState } from '../../../../../features/display/model/menuLock';
import { sendNotice } from '../../../../../features/display/model/toastPolicy';
import type { FishInstance, GameState } from '../../../../../game/rules/logic';
import type { GameAction } from '../../../../../game/rules/actions';
import { when } from '../../../../../shared/lib/when';
import type { DispatchResult, MaybePromise } from '../../../../../features/gameplay/service/types';
import { cx } from '../../../../ui/cx';
import Note from '../../../../ui/Note';
import ConfirmDialog from '../../../../ui/ConfirmDialog';
import FishSprite from '../../../../ui/fish/FishSprite';
import PixelIcon from '../../../../ui/PixelIcon';
import Badge from '../../../../ui/Badge';
import Button from '../../../../ui/Button';
import IconButton from '../../../../ui/IconButton';
import Tip, { TipCard } from '../../../../ui/Tip';
import SubTabs from '../../../../ui/SubTabs';
import ToggleChip from '../../../../ui/ToggleChip';
import { GradeName, HighlightRarityText, RarityDot } from '../../../../ui/fish/RarityTag';
import { groupInstances } from '../../../../../features/inventory/model/bagRows';
import InstanceLine, { UnsizedLine } from '../../../../ui/fish/InstanceLine';
import BagCards from './BagCards';
import { setBagLayout, setBagSection, toggleBagRow, useBagView } from './bagView';
import type { BagSection } from './bagView';
import { levelText, selectArtifactLevel } from '../../../../../features/inventory/model/artifactLevel';
import { selectBagArtifacts } from '../../../../../features/inventory/model/selectors';
import { ARTIFACTS } from '../../../../../game/content/artifacts';
import { artifactEffectLines, artifactSystemLines } from '../../../../ui/artifactEffects';
import Inset from '../../../../ui/Inset';
import ItemSprite from '../../../../ui/ItemSprite';
import PressRow from '../../../../ui/PressRow';
import ArtifactDetail from './ArtifactDetail';
import ItemSection from './ItemSection';
import EnergyPanel from '../../../overlays/facility/EnergyPanel';
import { SidebarFooter } from '../../../../layouts/sidebar';

/** 전시대 화면 노출 — 1차 전시대는 이번 배포에서 뺀다. 규칙·액션은 그대로다 */
export const EXHIBIT_UI_ENABLED = false;

// 가방 탭 — **서브탭 3개: 물고기 / 아이템 / 유물**. 상단 서브탭, Tab 키, 가방 탭 재선택(클릭·같은 숫자키)으로
// 전환한다. 물고기 1,500마리를 아이템과 한 스크롤에서
// 훑게 하지 않는다. 선택은 가방 보기 상태에 살아서 탭을 왕래해도 유지된다.
//
// 물고기 섹션 — 우상단 보기 전환 아이콘으로 목록/카드 보기를 바꾼다. 카드뷰는 **물고기 목록의 렌더링만** 바꾼다.
//  목록: 종+폼 머리 아래 개체가 한 마리씩. 정보 집약 — 개체를 고르고 잠그는 화면.
//  카드: 전 어종 격자에 보유 마릿수. 현황 파악 — 뭐가 비었는지가 한눈에 보인다.
// 하단에는 자동 잠금과 기운 얻기 진입 버튼을 나란히 둔다.
//
// 목록은 **기본 전부 닫힘** — 1,500마리 세이브에서 펼침 기본은
// 스크롤 지옥이다. 개체 선택 화면은 판매 패널이 담당하고(그쪽은 기본 펼침 유지), 가방은
// 열람 화면이므로 종 머리(마릿수·소계)만으로 훑고 필요한 종만 펼친다. 개체별 크기는 펼친 줄에서 본다.
//
// 종 행 머리 — **고정 그리드**. flex로 나열하면 이름·마릿수 자릿수에 따라 숫자 열이
// 행마다 어긋나 소계를 세로로 훑을 수가 없다. 개체 줄(InstanceLine)도 같은 이유로 그리드다.
//   [캐럿] [스프라이트] [이름] [×N] [소계] [자물쇠]
// 정렬 — **등급 내림차순 → 소계 내림차순**(bagRows; 목록·카드·판매 패널 공용).
// 마릿수 열은 행 너비의 15%를 더 받아 이름 바로 뒤에 왼쪽 정렬로 둔다(세 자리 마릿수가 잘리지 않게)
const ROW = 'grid grid-cols-[10px_30px_1fr_calc(15%+24px)_80px_22px] items-center gap-1';

/** 유물 섹션 — 레지스트리 순 전체 유물을 보이고 눌러 유물 상세 창을 연다. 미보유 유물은 흐리게 보이고 Lv.1 기준 효과를 알려 준다.
 *  보유 중만 보기 토글을 켜면 보유 유물만 걸러 보이며, 보유 유물이 없으면 수배판 교환 안내를 보인다. */
function ArtifactSection({ game, dispatch, setToast }: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
}) {
  const entries = selectBagArtifacts(game);
  const ownedCount = entries.filter(e => e.owned).length;
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const shown = ownedOnly ? entries.filter(e => e.owned) : entries;
  const opened = entries.find(e => e.artifact.id === openId)?.artifact;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 mb-1">
        <PageTitle>
          유물 <span className="pf-accent">{ownedCount}/{ARTIFACTS.length}</span>
        </PageTitle>
        <ToggleChip
          size="sm"
          pressed={ownedOnly}
          emphasis={ownedOnly}
          onClick={() => setOwnedOnly(v => !v)}
        >
          보유 중만 보기
        </ToggleChip>
      </div>
      {shown.length === 0 ? (
        <Note>아직 유물이 없어요.<br /><HighlightRarityText text="네임드를 토벌하고 받은 교환 재료를 수배판의 유물 탭에서 유물로 바꿔 보세요." /></Note>
      ) : (
        <Inset divided>
          {shown.map(({ artifact: a, owned, zoneName }) => {
            const { level, hasLevel } = owned ? selectArtifactLevel(game, a) : { level: 0, hasLevel: false };
            const { bonus, penalty } = artifactSystemLines(a);
            // 미보유는 Lv.1 기준 효과를 흐리게 보인다
            const effects = artifactEffectLines(a, owned ? level : 1);
            const lineCount = effects.length + (bonus ? 1 : 0) + (penalty ? 1 : 0);
            const lineTone = owned ? 'text-accent' : 'text-text-dim';
            const body = (
              <>
                <ItemSprite
                  kind="artifact"
                  id={a.id}
                  preset="list"
                  className={cx('shrink-0 mt-0.5', !owned && 'grayscale brightness-75')}
                />
                <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="flex items-baseline gap-1.5 min-w-0">
                      <span className="truncate min-w-0 text-text">
                        <GradeName name={a.name} grade={a.grade} />
                      </span>
                      {owned && hasLevel && <span className="pf-accent text-accent text-xs shrink-0">{levelText(level)}</span>}
                    </span>
                    <span className="text-xs shrink-0 text-text-dim">{zoneName}</span>
                  </span>
                  {effects.map(line => (
                    <span key={line} className={cx(lineTone, 'text-xs')}>{line}</span>
                  ))}
                  {bonus && <span className={cx(lineTone, 'text-xs')}>{bonus}</span>}
                  {penalty && <span className={cx(owned ? 'text-danger' : 'text-text-dim', 'text-xs')}>{penalty}</span>}
                  {lineCount < 2 && <span aria-hidden="true" className="text-xs select-none">{'\u00A0'}</span>}
                </span>
              </>
            );
            return (
              <PressRow key={a.id} data-artifact-row onPress={() => setOpenId(a.id)}
                        className={cx('flex items-start gap-2.5 px-2 py-1.5 text-sm', owned ? 'text-text' : 'text-text-dim bg-bg')}>
                {body}
              </PressRow>
            );
          })}
        </Inset>
      )}
      {opened && (
        <ArtifactDetail artifact={opened} game={game} dispatch={dispatch} setToast={setToast} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

/** 전시대 선반 —칸 수는 EXHIBIT_SLOTS, exhibit 인덱스가 칸 번호다. 빈 칸은 자리만 보인다.
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
      <Inset divided>
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
                {inst.size === null ? '미상' : fmtSize(inst.size)}
              </span>
              <Tip wraps text="가방으로 되돌려요">
                <Button size="sm" aria-label={`${name} 회수`} onClick={() => onWithdraw(inst, name)}>
                  회수
                </Button>
              </Tip>
            </div>
          );
        })}
      </Inset>
    </div>
  );
}

export default function BagTab({ game, accountState = 'account', sellBonus, bagBonus = 0, dispatch, setToast }: {
  game: GameState;
  /** 잠금 판정에 쓰는 계정 상태 - 아이템 섹션과 기운 얻기 진입의 잠금 사유를 정한다 */
  accountState?: AccountLockState;
  /** 길드 판매가 보너스 비율 - 서버가 알려 준 값. 길드가 없으면 0 */
  sellBonus: number;
  /** 길드 가방 용량 보너스 비율 - 서버가 알려 준 값. 길드가 없으면 0 */
  bagBonus?: number;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
}) {
  const now = useNow();
  const rows = useMemo(() => groupInstances(game.bag, { dex: game.dex }), [game.bag, game.dex]);
  const {
    count: bagCount, cap, full: bagFull,
    autoLock: autoLockPlan,
  } = selectBagOverview(game, sellBonus, bagBonus, now);
  const energyEntry = selectBagEnergyEntry(game, accountState);
  const [lockConfirm, setLockConfirm] = useState(false);
  const [energyOpen, setEnergyOpen] = useState(false);
  const { layout, section, opened } = useBagView();

  const lock = (uids: string[], locked: boolean, label: string) =>
    when(dispatch({ type: 'setLocked', uids, locked }), r => {
      if (r.status !== 'ok') return;
      sendNotice(setToast, {
        kind: 'bag.lockChanged',
        text: locked
          ? `${josa(label, '을/를')} 잠갔어요. 판매와 기운 얻기에서 빠져요.`
          : `${label}의 잠금을 풀었어요. 다시 고를 수 있어요.`,
      });
    });

  // 전시대 — 칸 선택은 freeExhibitSlot(가장 앞 빈 칸)이 대신한다. 다 찼으면 요청 없이 안내만.
  const exhibitTo = (inst: FishInstance, name: string) => {
    const slot = freeExhibitSlot(game.exhibit);
    if (slot === null) {
      sendNotice(setToast, {
        kind: 'system.modalRejected',
        text: '전시대가 가득 찼어요. 먼저 한 마리를 회수해 주세요.',
        toastText: '전시대가 가득 찼어요.',
      });
      return;
    }
    when(dispatch({ type: 'exhibit', uid: inst.uid, slot }), r => {
      if (r.status === 'ok') sendNotice(setToast, { kind: 'bag.exhibitMoved', text: `${josa(name, '을/를')} 진열했어요. 전시 중에는 팔리지 않아요.` });
      else if (r.status === 'rejected') sendNotice(setToast, { kind: 'system.modalRejected', text: REJECT_TEXT[r.error] });
    });
  };
  const withdraw = (inst: FishInstance, name: string) =>
    when(dispatch({ type: 'exhibit', uid: inst.uid, slot: null }), r => {
      if (r.status === 'ok') sendNotice(setToast, { kind: 'bag.exhibitMoved', text: `${josa(name, '이/가')} 가방으로 돌아왔어요.` });
      else if (r.status === 'rejected') sendNotice(setToast, { kind: 'system.modalRejected', text: REJECT_TEXT[r.error] });
    });

  // 자동 잠금 — 어종×폼(일반/돌연변이)마다 가장 큰 1마리만 잠긴 상태로 맞춘다(logic.autoLockPlan).
  // 같은 어종×폼의 나머지 잠금은 풀리므로 누르면 먼저 확인 창을 띄운다. 적용은 autoLock 액션 한 번이고
  // 서버가 현재 가방으로 계획을 다시 계산한다. 변할 게 없으면 요청 없이 안내만.
  const autoLock = () => {
    if (autoLockPlan.lock.length === 0 && autoLockPlan.unlock.length === 0) {
      sendNotice(setToast, {
        kind: 'bag.lockChanged',
        text: '정리할 잠금이 없어요. 어종마다 가장 큰 물고기만 잠겨 있어요.',
      });
      return;
    }
    setLockConfirm(true);
  };
  const applyAutoLock = () => {
    const { lock, unlock } = autoLockPlan;
    setLockConfirm(false);
    when(dispatch({ type: 'autoLock' }), r => {
      if (r.status !== 'ok') return;
      sendNotice(setToast, {
        kind: 'bag.lockChanged',
        text: unlock.length === 0
          ? `가장 큰 물고기 ${lock.length}마리를 잠갔어요.`
          : `가장 큰 물고기만 남기고 정리했어요. ${lock.length}마리를 잠그고 ${unlock.length}마리의 잠금을 풀었어요.`,
      });
    });
  };

  return (
    <div className="flex-1 flex flex-col">
      <SubTabs
        items={[
          { key: 'fish' as BagSection, label: '물고기' },
          { key: 'items' as BagSection, label: '아이템' },
          { key: 'artifacts' as BagSection, label: '유물' },
        ]}
        activeKey={section}
        onSelect={setBagSection}
      />
      {section === 'items' ? (
        <ItemSection game={game} accountState={accountState} dispatch={dispatch} setToast={setToast} />
      ) : section === 'artifacts' ? (
        <ArtifactSection game={game} dispatch={dispatch} setToast={setToast} />
      ) : (
        <>
          {/* 헤더 — 용량 표시(좌) + 개체 표시 및 목록/카드 보기 전환(우측 끝) */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <PageTitle>
              물고기 (<span className={cx(bagFull && 'text-danger')}>{fmtNum(bagCount)}</span>
              <span className="text-text-dim">/{fmtNum(cap)}</span>마리)
            </PageTitle>
            <div className="flex items-center gap-1.5">
              <Tip
                wraps
                pressOpens
                text={(
                  <TipCard
                    title="개체 표시"
                    rows={[
                      {
                        text: (
                          <span className="inline-flex items-center gap-1.5">
                            <PixelIcon glyph="crown" size={11} className="text-gold shrink-0" />
                            <span>최대 크기</span>
                          </span>
                        ),
                      },
                      {
                        text: (
                          <span className="inline-flex items-center gap-1.5">
                            <PixelIcon glyph="sparkle" size={11} className="text-mutation shrink-0" />
                            <span className="text-mutation">돌연변이</span>
                          </span>
                        ),
                      },
                      ...(layout === 'cards' ? [{
                        text: (
                          <span className="inline-flex items-center gap-1.5">
                            <PixelIcon glyph="moon" size={11} className="text-accent shrink-0" />
                            <span>밤 전용 어종</span>
                          </span>
                        ),
                      }] : []),
                    ]}
                    note={layout === 'cards' ? '밤(게임 22:00~06:00)에만 낚여요.' : undefined}
                  />
                )}
              >
                <IconButton type="button" glyph="question" size={12} tone="dim" className="p-1" aria-label="개체 표시" />
              </Tip>
              <Tip wraps text={layout === 'list' ? '카드 보기' : '목록 보기'}>
                <IconButton
                  glyph={layout === 'list' ? 'grid' : 'menu'}
                  size={14}
                  tone="dim"
                  className="p-1"
                  aria-label={layout === 'list' ? '카드 보기' : '목록 보기'}
                  onClick={() => setBagLayout(layout === 'list' ? 'cards' : 'list')}
                />
              </Tip>
            </div>
          </div>
          {lockConfirm && (
            <ConfirmDialog layer="app" title="자동 잠금" confirmLabel="정리"
                           onConfirm={applyAutoLock} onCancel={() => setLockConfirm(false)}>
                <p className="text-sm leading-relaxed">
                  어종마다 <HighlightRarityText text="일반과 돌연변이" /> 각각 <b className="text-gold">가장 큰 물고기 한 마리만</b> 잠그고,
                  나머지는 잠금이 풀려요.<br />
                  직접 잠근 물고기도 가장 크지 않으면 풀려요.
                </p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span>잠금 <b className="pf-accent">{autoLockPlan.lock.length}</b>마리</span>
                  <span>
                    잠금 해제{' '}
                    <b className={cx('pf-accent', autoLockPlan.unlock.length > 0 && 'text-danger')}>{autoLockPlan.unlock.length}</b>마리
                  </span>
                </p>
            </ConfirmDialog>
          )}
          {EXHIBIT_UI_ENABLED && <ExhibitShelf exhibit={game.exhibit} onWithdraw={withdraw} />}
          {layout === 'cards' ? (
            <BagCards bag={game.bag} game={game} />
          ) : rows.length === 0 ? (
            <Note>가방이 비어 있어요.<br />어군을 찾아 낚시해 보세요.</Note>
          ) : (
            <>
              <Inset divided>
                {rows.map(({ key, fish, form, name, items, subtotal, sized, unsized, maxByForm }) => {
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
                        <FishSprite fish={fish} preset="thumb" form={form} />
                        <span className="truncate">
                          <RarityDot rarity={fish.rarity} />{name}
                        </span>
                        <span className="pf-accent text-text-dim whitespace-nowrap">×{items.length}</span>
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
              </Inset>
            </>
          )}
          <SidebarFooter>
            <div className="px-3 pb-3 pt-2 bg-surface border-t border-line-dim grid grid-cols-2 gap-2">
              <Tip wraps className="flex min-w-0"
                   text={(
                     <TipCard
                       title="자동 잠금"
                       description={bagCount === 0
                         ? '가방에 물고기가 없어요.'
                         : '어종마다 일반과 돌연변이 각각 가장 큰 물고기 한 마리만 잠그고, 나머지 잠금은 풀어요.'}
                     />
                   )}>
                <Button size="sm" aria-label="자동 잠금" disabled={bagCount === 0} onClick={autoLock}
                        className="w-full justify-center">
                  <PixelIcon glyph="lockOpen" size={12} />
                  자동 잠금
                </Button>
              </Tip>
              <Tip wraps className="flex min-w-0"
                   text={energyEntry.ok
                     ? <TipCard title="기운 얻기" description="가방의 물고기를 생명의 기운으로 바꿔요." />
                     : (
                       <TipCard
                         title="기운 얻기"
                         description="가방의 물고기를 생명의 기운으로 바꿔요."
                         badge={<Badge tone="dim-plain" size="2xs">잠김</Badge>}
                         status={{ tone: 'lock', lines: energyEntry.lines }}
                       />
                     )}>
                <Button size="sm" disabled={!energyEntry.ok} onClick={() => setEnergyOpen(true)}
                        className="w-full justify-center">
                  기운 얻기
                </Button>
              </Tip>
            </div>
          </SidebarFooter>
          {energyOpen && (
            <EnergyPanel game={game} dispatch={dispatch} setToast={setToast} onClose={() => setEnergyOpen(false)} />
          )}
        </>
      )}
    </div>
  );
}
