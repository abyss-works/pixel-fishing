import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import {
  BOATS, FISH, MAX_BOAT, RARITY, SPOTS,
  bagValue, migrate, redeemCoupon, rodStats, sellAll, tryBuyBoat, tryUpgrade, upgradeCost,
} from './logic';
import type { GameState } from './logic';
import { furnitureAt } from './world';
import type { BaseId } from './world';
import { renderHome, renderHarbor, W, H, CANVAS_W, CANVAS_H } from './pixel';

type Panel = 'dex' | 'sell' | 'rod' | 'boat' | null;

interface Props {
  base: BaseId; // 'home'(마을 집) | 'harbor'(대양 항구)
  game: GameState;
  setGame: (g: GameState) => void;
  setToast: (msg: string) => void;
  goField: () => void;   // 문(마을) / 승선(대양)
  goTravel?: () => void; // 항구 여객선 → 마을
}

export default function Base({ base, game, setGame, setToast, goField, goTravel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [panel, setPanel] = useState<Panel>(null);

  const dexCount = FISH.filter(f => (game.caught[f.id] ?? 0) > 0).length;
  const boatName = game.boat === 0 ? '배 없음' : BOATS[game.boat - 1].name;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    (base === 'home' ? renderHome : renderHarbor)(ctx, game.rod, boatName, dexCount, FISH.length);
  }, [base, game.rod, boatName, dexCount]);

  // 캔버스 클릭 → 내부 좌표 → 시설 히트테스트 → 오버레이 (R1~R3b)
  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const el = canvasRef.current!;
    const rect = el.getBoundingClientRect();
    const sx = rect.width ? W / rect.width : 1;
    const sy = rect.height ? H / rect.height : 1;
    const f = furnitureAt(base, (e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy);
    if (!f) return;
    switch (f.id) {
      case 'sell': case 'rod': case 'boat': case 'dex':
        setPanel(f.id);
        return;
      case 'exit':
        goField();
        return;
      case 'travel':
        goTravel?.();
        return;
    }
  };

  // 이사 코드 — 세이브 내보내기/불러오기 
  const exportSave = async () => {
    const code = btoa(encodeURIComponent(JSON.stringify(game)));
    try {
      await navigator.clipboard.writeText(code);
      setToast('이사 코드를 클립보드에 복사했다. 다른 브라우저에서 불러오기.');
    } catch {
      window.prompt('복사해서 보관하세요 (이사 코드):', code);
    }
  };

  const importSave = () => {
    const code = window.prompt('이사 코드를 붙여넣으세요:');
    if (!code) return;
    try {
      const parsed = JSON.parse(decodeURIComponent(atob(code.trim())));
      setGame(migrate(parsed));
      setToast('세이브를 불러왔다!');
    } catch {
      setToast('이사 코드가 올바르지 않다.');
    }
  };

  // 쿠폰 — 클라이언트 검증 (P1 서버 도입 시 이관)
  const enterCoupon = () => {
    const code = window.prompt('쿠폰 코드를 입력하세요:');
    if (!code) return;
    const res = redeemCoupon(game, code);
    if (!res.ok) {
      setToast(res.reason === 'used' ? '이미 사용한 쿠폰이다.' : '없는 쿠폰 코드다.');
      return;
    }
    setGame(res.state);
    setToast(`🎟️ 쿠폰 사용! +${res.reward.gold}G — ${res.reward.desc}`);
  };

  return (
    <>
      <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="game"
              aria-label={base === 'home' ? '집' : '항구'} onClick={onClick} />
      <div className="status">
        {base === 'home'
          ? '궤짝=판매 · 작업대=강화 · 목공소=배 · 책장=도감 · 문=마을로'
          : '어시장=판매 · 공방=강화 · 조선소=배 · 사무소=도감 · 승선=출항 · 여객선=마을로'}
      </div>
      <div className="ui">
        <button onClick={exportSave}>📤 이사 코드</button>
        <button onClick={importSave}>📥 불러오기</button>
        <button onClick={enterCoupon}>🎟️ 쿠폰</button>
      </div>

      {panel === 'sell' && (
        <SellPanel game={game} onClose={() => setPanel(null)}
          onSell={() => {
            const value = bagValue(game);
            setGame(sellAll(game));
            setPanel(null);
            setToast(`물고기를 팔아 ${value}G를 벌었다!`);
          }} />
      )}
      {panel === 'rod' && (
        <RodPanel game={game} onClose={() => setPanel(null)}
          onUpgrade={() => {
            const next = tryUpgrade(game);
            if (!next) return;
            setGame(next);
            setToast(`낚싯대가 Lv.${next.rod}이 되었다! 입질이 빨라지고 PERFECT 존이 넓어진다.`);
          }} />
      )}
      {panel === 'boat' && (
        <BoatPanel game={game} onClose={() => setPanel(null)}
          onBuy={() => {
            const bought = tryBuyBoat(game);
            if (!bought) return;
            const b = BOATS[bought.boat - 1];
            const opened = SPOTS.find(s => s.boatTier === bought.boat);
            setGame(bought);
            setPanel(null);
            setToast(bought.boat === 1
              ? `${b.name} 구매! 이제 포구에서 대양으로 나갈 수 있다.`
              : `${b.name} 구매! 더 빠르고${opened ? `, [${opened.name}] 해역이 열렸다!` : ' 튼튼하다.'}`);
          }} />
      )}
      {panel === 'dex' && <DexPanel game={game} dexCount={dexCount} onClose={() => setPanel(null)} />}
    </>
  );
}

// ---------- 오버레이들 ----------

function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: ReactNode;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
        <button onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}

// R1: 판매 확인 오버레이
function SellPanel({ game, onSell, onClose }: {
  game: GameState; onSell: () => void; onClose: () => void;
}) {
  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of game.bag) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts.entries()].map(([id, n]) => ({ fish: FISH.find(f => f.id === id)!, n }));
  }, [game.bag]);
  const total = bagValue(game);

  return (
    <Modal title={`판매 — 가방 (${game.bag.length}마리)`} onClose={onClose}>
      {rows.length === 0 ? (
        <p className="panel-note">가방이 비어 있다. 낚시하러 가자.</p>
      ) : (
        <>
          <table className="data-table">
            <thead><tr><th>어종</th><th>등급</th><th>수량</th><th>소계</th></tr></thead>
            <tbody>
              {rows.map(({ fish, n }) => (
                <tr key={fish.id}>
                  <td>{fish.name}</td>
                  <td style={{ color: RARITY[fish.rarity].color }}>{RARITY[fish.rarity].name}</td>
                  <td>×{n}</td>
                  <td>{fish.price * n}G</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="primary" onClick={onSell}>전부 판매하기 (+{total}G)</button>
        </>
      )}
    </Modal>
  );
}

// R2: 낚싯대 강화 오버레이 (상한 없음)
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
    <Modal title={`낚싯대 강화 — Lv.${game.rod} → Lv.${game.rod + 1}`} onClose={onClose}>
      <table className="data-table">
        <thead><tr><th>스탯</th><th>현재</th><th>강화 후</th></tr></thead>
        <tbody>
          <tr><td>입질 대기</td><td>{c.bite}</td><td>{n.bite}</td></tr>
          <tr><td>바 시간</td><td>{c.sweep}</td><td>{n.sweep}</td></tr>
          <tr><td>PERFECT 존</td><td>{c.zone}</td><td>{n.zone}</td></tr>
        </tbody>
      </table>
      <p className="panel-note">보유 💰{game.gold}G · 비용 💰{cost.toLocaleString()}G · 상한 없음(효율 체감)</p>
      <button className="primary" disabled={game.gold < cost} onClick={onUpgrade}>
        강화하기 (-{cost.toLocaleString()}G)
      </button>
    </Modal>
  );
}

// R2b: 배 구매 오버레이 (골드 차감 + 명성 하한 검증)
function BoatPanel({ game, onBuy, onClose }: {
  game: GameState; onBuy: () => void; onClose: () => void;
}) {
  if (game.boat >= MAX_BOAT) {
    return (
      <Modal title="조선소" onClose={onClose}>
        <p className="panel-note">이미 최고의 배({BOATS[MAX_BOAT - 1].name})다. 온 바다가 네 것.</p>
      </Modal>
    );
  }
  const next = BOATS[game.boat];
  const opened = SPOTS.find(s => s.boatTier === next.tier);
  const lackFame = game.fame < next.fameReq;
  const lackGold = game.gold < next.price;

  return (
    <Modal title={`배 구매 — ${next.name} (${next.tier}단계)`} onClose={onClose}>
      <table className="data-table">
        <tbody>
          <tr><td>가격</td><td>💰{next.price.toLocaleString()}G (보유 {game.gold.toLocaleString()}G)</td></tr>
          <tr><td>필요 명성</td><td>⭐{next.fameReq.toLocaleString()} (보유 {game.fame.toLocaleString()}, 소모 없음)</td></tr>
          <tr><td>항해 속도</td><td>{next.speed} (현재 {game.boat === 0 ? '-' : BOATS[game.boat - 1].speed})</td></tr>
          <tr><td>효과</td><td>{next.tier === 1 ? '대양 진입 + 태평양 낚시' : opened ? `[${opened.name}] 해역 해금` : '항해 속도 상승'}</td></tr>
        </tbody>
      </table>
      {lackFame && <p className="panel-note warn">명성이 부족하다 — 물고기를 더 잡아 명성을 쌓자.</p>}
      {!lackFame && lackGold && <p className="panel-note warn">골드가 부족하다 — 물고기를 팔자.</p>}
      <button className="primary" disabled={lackFame || lackGold} onClick={onBuy}>
        구매하기 (-{next.price.toLocaleString()}G)
      </button>
    </Modal>
  );
}

// R3: 도감
function DexPanel({ game, dexCount, onClose }: {
  game: GameState; dexCount: number; onClose: () => void;
}) {
  return (
    <Modal title={`도감 (${dexCount}/${FISH.length})`} onClose={onClose}>
      <div className="dex-grid">
        {FISH.map(f => {
          const n = game.caught[f.id] ?? 0;
          const r = RARITY[f.rarity];
          return (
            <div key={f.id} className="dex-item" style={{ borderLeft: `4px solid ${r.color}` }}>
              {n > 0 ? (
                <>
                  <b>{f.name}</b><br />
                  <span style={{ color: r.color }}>{r.name}</span> · {f.price}G<br />
                  <span className="cnt">{n}마리 잡음</span>
                </>
              ) : (
                <>
                  <b>???</b><br />
                  <span className="cnt">{SPOTS.find(s => s.id === f.spot)!.name}</span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
