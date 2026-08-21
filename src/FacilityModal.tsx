import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BOATS, MAX_BOAT, SPOTS,
  entryFish, entryName, entryPrice, parseBagEntry,
  rodStats, sellSelected, tryBuyBoat, tryUpgrade, upgradeCost,
} from './logic';
import type { GameState } from './logic';
import Panel from './ui/Panel';
import Button from './ui/Button';
import StatCompare from './ui/StatCompare';
import { RarityText } from './ui/RarityTag';
import type { ActionPanel } from './tabs';

interface Props {
  panel: Exclude<ActionPanel, null>;
  game: GameState;
  setGame: (g: GameState) => void;
  setToast: (msg: string) => void;
  onClose: () => void;
}

// 정비 상호작용(판매/강화/배)은 게임 스테이지 위 모달로 띄운다 — 정비 중에는 이동하지
// 않으므로 화면을 점유해도 자연스럽고, 사이드바 탭 흐름을 방해하지 않는다.
export default function FacilityModal({ panel, game, setGame, setToast, onClose }: Props) {
  return (
    <div className="stage-modal-backdrop" onClick={onClose}>
      <div className="stage-modal" onClick={e => e.stopPropagation()}>
        {panel === 'sell' && (
          <SellPanel game={game} onClose={onClose}
            onSell={ids => {
              const next = sellSelected(game, ids);
              const value = next.gold - game.gold;
              setGame(next);
              onClose();
              setToast(`물고기를 팔아 ${value}G를 벌었다!`);
            }} />
        )}
        {panel === 'rod' && (
          <RodPanel game={game} onClose={onClose}
            onUpgrade={() => {
              const next = tryUpgrade(game);
              if (!next) return;
              setGame(next);
              setToast(`낚싯대가 Lv.${next.rod}이 되었다! 입질이 빨라지고 PERFECT 존이 넓어진다.`);
            }} />
        )}
        {panel === 'boat' && (
          <BoatPanel game={game} onClose={onClose}
            onBuy={() => {
              const bought = tryBuyBoat(game);
              if (!bought) return;
              const b = BOATS[bought.boat - 1];
              const opened = SPOTS.find(s => s.boatTier === bought.boat);
              setGame(bought);
              onClose();
              setToast(bought.boat === 1
                ? `${b.name} 구매! 이제 포구에서 대양으로 나갈 수 있다.`
                : `${b.name} 구매! 더 빠르고${opened ? `, [${opened.name}] 해역이 열렸다!` : ' 튼튼하다.'}`);
            }} />
        )}
      </div>
    </div>
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
function SellPanel({ game, onSell, onClose }: {
  game: GameState; onSell: (entries: string[]) => void; onClose: () => void;
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
        <p className="panel-note">가방이 비어 있다. 낚시하러 가자.</p>
      ) : (
        <>
          <table className="pf-compare">
            <thead><tr><th>판매</th><th>어종</th><th>등급</th><th>수량</th><th>소계</th></tr></thead>
            <tbody>
              {rows.map(({ entry, fish, name, price, n, locked }) => {
                const checked = !locked && !excluded.has(entry);
                return (
                  <tr key={entry} className={locked ? 'row-locked' : checked ? '' : 'row-excluded'}>
                    <td>
                      {locked ? (
                        <span className="sell-check" data-state="locked" title="가방 탭에서 잠금 해제">🔒</span>
                      ) : (
                        <button className="sell-check" data-state={checked ? 'on' : 'off'}
                                aria-label={`${name} 판매 ${checked ? '해제' : '선택'}`}
                                onClick={() => toggle(entry)}>
                          {checked ? '☑' : '☐'}
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
          </table>
          {lockedCount > 0 && (
            <p className="panel-note">🔒 잠근 어종은 팔리지 않는다 (가방 탭에서 잠금 해제)</p>
          )}
          <Button variant="primary" disabled={total === 0}
                  onClick={() => onSell(included.map(r => r.entry))}>
            판매하기 (+{total}G)
          </Button>
        </>
      )}
    </ModalCard>
  );
}

// R2: 낚싯대 강화 패널 (상한 없음)
function RodPanel({ game, onUpgrade, onClose }: {
  game: GameState; onUpgrade: () => void; onClose: () => void;
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
      <p className="panel-note">보유 💰{game.gold}G · 비용 💰{cost.toLocaleString()}G · 상한 없음(효율 체감)</p>
      <Button variant="primary" disabled={game.gold < cost} onClick={onUpgrade}>
        강화하기 (-{cost.toLocaleString()}G)
      </Button>
    </ModalCard>
  );
}

// R2b: 배 구매 패널 (골드 차감 + 명성 하한 검증)
function BoatPanel({ game, onBuy, onClose }: {
  game: GameState; onBuy: () => void; onClose: () => void;
}) {
  if (game.boat >= MAX_BOAT) {
    return (
      <ModalCard title="조선소" onClose={onClose}>
        <p className="panel-note">이미 최고의 배({BOATS[MAX_BOAT - 1].name})다. 온 바다가 네 것.</p>
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
        { label: '가격', value: `💰${next.price.toLocaleString()}G (보유 ${game.gold.toLocaleString()}G)` },
        { label: '필요 명성', value: `⭐${next.fameReq.toLocaleString()} (보유 ${game.fame.toLocaleString()}, 소모 없음)` },
        { label: '항해 속도', value: `${next.speed} (현재 ${game.boat === 0 ? '-' : BOATS[game.boat - 1].speed})` },
        { label: '효과', value: next.tier === 1 ? '대양 진입 + 태평양 낚시' : opened ? `[${opened.name}] 해역 해금` : '항해 속도 상승' },
      ]} />
      {lackFame && <p className="panel-note warn">명성이 부족하다 — 물고기를 더 잡아 명성을 쌓자.</p>}
      {!lackFame && lackGold && <p className="panel-note warn">골드가 부족하다 — 물고기를 팔자.</p>}
      <Button variant="primary" disabled={lackFame || lackGold} onClick={onBuy}>
        구매하기 (-{next.price.toLocaleString()}G)
      </Button>
    </ModalCard>
  );
}
