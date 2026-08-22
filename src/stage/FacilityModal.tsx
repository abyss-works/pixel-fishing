import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BOATS, MAX_BOAT, SPOTS,
  entryFish, entryName, entryPrice, parseBagEntry,
  rodStats, upgradeCost,
} from '../game/logic';
import type { GameState } from '../game/logic';
import type { GameAction } from '../game/actions';
import { when } from '../backend/types';
import type { DispatchResult, MaybePromise } from '../backend/types';
import { cx } from '../ui/cx';
import Panel from '../ui/Panel';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import Modal from '../ui/Modal';
import Note from '../ui/Note';
import PixelIcon from '../ui/PixelIcon';
import StatCompare from '../ui/StatCompare';
import { RarityText } from '../ui/RarityTag';
/** 열려 있는 정비 패널 — 시설 클릭(거점)·목공소 트리거(필드)가 연다. null = 닫힘 */
export type ActionPanel = 'sell' | 'rod' | 'boat' | null;

interface Props {
  panel: Exclude<ActionPanel, null>;
  game: GameState;
  /** 상태 변경의 유일한 경로 (서버 권위 v0.5.0) — 판매/강화/구매는 서버(또는 로컬 리듀서)가 실행 */
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (msg: string) => void;
  onClose: () => void;
}

// 정비 상호작용(판매/강화/배)은 게임 스테이지 위 모달로 띄운다 — 정비 중에는 이동하지
// 않으므로 화면을 점유해도 자연스럽고, 사이드바 탭 흐름을 방해하지 않는다.
// busy: HTTP 왕복 동안 확정 버튼 잠금 — 더블클릭이 낙관 락 재시도로 이중 적용되는 것 방지.
export default function FacilityModal({ panel, game, dispatch, setToast, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const run = (action: GameAction, onOk: (r: Extract<DispatchResult, { status: 'ok' }>) => void) => {
    if (busy) return;
    setBusy(true);
    when(dispatch(action), r => {
      setBusy(false);
      if (r.status === 'ok') onOk(r);
      else if (r.status === 'rejected') setToast(`처리할 수 없다 (${r.error}).`);
    });
  };

  return (
    <Modal layer="stage" onClose={onClose}>
      {panel === 'sell' && (
        <SellPanel game={game} onClose={onClose} busy={busy}
          onSell={ids => run({ type: 'sell', entries: ids }, r => {
            onClose();
            setToast(`물고기를 팔아 ${r.result.type === 'sell' ? r.result.gold : 0}G를 벌었다!`);
          })} />
      )}
      {panel === 'rod' && (
        <RodPanel game={game} onClose={onClose} busy={busy}
          onUpgrade={() => run({ type: 'upgradeRod' }, r => {
            setToast(`낚싯대가 Lv.${r.state.rod}이 되었다! 입질이 빨라지고 PERFECT 존이 넓어진다.`);
          })} />
      )}
      {panel === 'boat' && (
        <BoatPanel game={game} onClose={onClose} busy={busy}
          onBuy={() => run({ type: 'buyBoat' }, r => {
            const b = BOATS[r.state.boat - 1];
            const opened = SPOTS.find(s => s.boatTier === r.state.boat);
            onClose();
            setToast(r.state.boat === 1
              ? `${b.name} 구매! 이제 포구에서 대양으로 나갈 수 있다.`
              : `${b.name} 구매! 더 빠르고${opened ? `, [${opened.name}] 해역이 열렸다!` : ' 튼튼하다.'}`);
          })} />
      )}
    </Modal>
  );
}

function ModalCard({ title, onClose, children }: {
  title: string; onClose: () => void; children: ReactNode;
}) {
  return (
    <Panel title={title}>
      {children}
      <Button variant="ghost" onClick={onClose}>닫기</Button>
    </Panel>
  );
}

// R1: 판매 확인 패널 — 행별 체크로 판매 여부 선택 (기본 전부 체크).
// 일반/변이는 별개 행 (v0.3.3, 'id' vs 'id*'). 잠근 어종(가방 탭 🔒)은 두 행 다 체크 불가.
function SellPanel({ game, onSell, onClose, busy }: {
  game: GameState; onSell: (entries: string[]) => void; onClose: () => void; busy: boolean;
}) {
  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of game.bag) counts.set(e, (counts.get(e) ?? 0) + 1);
    return [...counts.entries()].map(([entry, n]) => ({
      entry, n,
      fish: entryFish(entry)!,
      name: entryName(entry),
      price: entryPrice(entry),
      locked: game.locked.includes(parseBagEntry(entry).id),
    }));
  }, [game.bag, game.locked]);

  // 패널을 열 때마다 기본 전부 체크 — 해제한 행만 기록
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const toggle = (entry: string) => setExcluded(prev => {
    const next = new Set(prev);
    if (next.has(entry)) next.delete(entry); else next.add(entry);
    return next;
  });

  const included = rows.filter(r => !r.locked && !excluded.has(r.entry));
  const total = included.reduce((s, r) => s + r.price * r.n, 0);
  const lockedCount = rows.filter(r => r.locked).length;

  return (
    <ModalCard title={`판매 — 가방 (${game.bag.length}마리)`} onClose={onClose}>
      {rows.length === 0 ? (
        <Note>가방이 비어 있다. 낚시하러 가자.</Note>
      ) : (
        <>
          <DataTable>
            <thead><tr><th>판매</th><th>어종</th><th>등급</th><th>수량</th><th>소계</th></tr></thead>
            <tbody>
              {rows.map(({ entry, fish, name, price, n, locked }) => {
                const checked = !locked && !excluded.has(entry);
                return (
                  <tr key={entry} className={locked || !checked ? 'text-text-dim' : ''}>
                    <td>
                      {locked ? (
                        <span className="text-text-dim cursor-default" title="가방 탭에서 잠금 해제">
                          <PixelIcon glyph="lock" size={13} />
                        </span>
                      ) : (
                        <button className={cx('bg-transparent border-0 p-0 leading-none cursor-pointer',
                                  checked ? 'text-gold' : 'text-text-dim')}
                                aria-label={`${name} 판매 ${checked ? '해제' : '선택'}`}
                                onClick={() => toggle(entry)}>
                          <PixelIcon glyph={checked ? 'checkOn' : 'checkOff'} size={13} />
                        </button>
                      )}
                    </td>
                    <td>{name}</td>
                    <td><RarityText rarity={fish.rarity} /></td>
                    <td>×{n}</td>
                    <td className="pf-accent">{checked ? `${price * n}G` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          {lockedCount > 0 && (
            <Note>잠근 어종은 팔리지 않는다 (가방 탭에서 잠금 해제)</Note>
          )}
          <Button variant="primary" disabled={total === 0 || busy}
                  onClick={() => onSell(included.map(r => r.entry))}>
            판매하기 (+{total}G)
          </Button>
        </>
      )}
    </ModalCard>
  );
}

// R2: 낚싯대 강화 패널 (상한 없음)
function RodPanel({ game, onUpgrade, onClose, busy }: {
  game: GameState; onUpgrade: () => void; onClose: () => void; busy: boolean;
}) {
  const cost = upgradeCost(game.rod);
  const cur = rodStats(game.rod);
  const next = rodStats(game.rod + 1);
  const fmt = (s: { biteMin: number; biteMax: number; sweep: number; zone: number }) =>
    ({ bite: `${s.biteMin.toFixed(1)}~${s.biteMax.toFixed(1)}s`, sweep: `${s.sweep.toFixed(2)}s`, zone: `${Math.round(s.zone * 100)}%` });
  const c = fmt(cur), n = fmt(next);

  return (
    <ModalCard title={`낚싯대 강화 — Lv.${game.rod} → Lv.${game.rod + 1}`} onClose={onClose}>
      <StatCompare rows={[
        { label: '입질 대기', value: c.bite, next: n.bite },
        { label: '바 시간', value: c.sweep, next: n.sweep },
        { label: 'PERFECT 존', value: c.zone, next: n.zone },
      ]} />
      <Note>보유 {game.gold}G · 비용 {cost.toLocaleString()}G · 상한 없음(효율 체감)</Note>
      <Button variant="primary" disabled={game.gold < cost || busy} onClick={onUpgrade}>
        강화하기 (-{cost.toLocaleString()}G)
      </Button>
    </ModalCard>
  );
}

// R2b: 배 구매 패널 (골드 차감 + 명성 하한 검증)
function BoatPanel({ game, onBuy, onClose, busy }: {
  game: GameState; onBuy: () => void; onClose: () => void; busy: boolean;
}) {
  if (game.boat >= MAX_BOAT) {
    return (
      <ModalCard title="조선소" onClose={onClose}>
        <Note>이미 최고의 배({BOATS[MAX_BOAT - 1].name})다. 온 바다가 네 것.</Note>
      </ModalCard>
    );
  }
  const next = BOATS[game.boat];
  const opened = SPOTS.find(s => s.boatTier === next.tier);
  const lackFame = game.fame < next.fameReq;
  const lackGold = game.gold < next.price;

  return (
    <ModalCard title={`배 구매 — ${next.name} (${next.tier}단계)`} onClose={onClose}>
      <StatCompare rows={[
        { label: '가격', value: `${next.price.toLocaleString()}G (보유 ${game.gold.toLocaleString()}G)` },
        { label: '필요 명성', value: `${next.fameReq.toLocaleString()} (보유 ${game.fame.toLocaleString()}, 소모 없음)` },
        { label: '항해 속도', value: `${next.speed} (현재 ${game.boat === 0 ? '-' : BOATS[game.boat - 1].speed})` },
        { label: '효과', value: next.tier === 1 ? '대양 진입 + 태평양 낚시' : opened ? `[${opened.name}] 해역 해금` : '항해 속도 상승' },
      ]} />
      {lackFame && <Note tone="warn">명성이 부족하다 — 물고기를 더 잡아 명성을 쌓자.</Note>}
      {!lackFame && lackGold && <Note tone="warn">골드가 부족하다 — 물고기를 팔자.</Note>}
      <Button variant="primary" disabled={lackFame || lackGold || busy} onClick={onBuy}>
        구매하기 (-{next.price.toLocaleString()}G)
      </Button>
    </ModalCard>
  );
}
