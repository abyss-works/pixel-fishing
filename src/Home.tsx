import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import {
  FISH, RARITY, SPOTS,
  bagValue, sellAll, tryUpgrade, MAX_ROD,
} from './logic';
import type { GameState } from './logic';
import { furnitureAt } from './world';
import { renderHome, W, H } from './pixel';

interface Props {
  game: GameState;
  setGame: (g: GameState) => void;
  setToast: (msg: string) => void;
  goField: () => void;
}

export default function Home({ game, setGame, setToast, goField }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dexOpen, setDexOpen] = useState(false);

  const dexCount = FISH.filter(f => (game.caught[f.id] ?? 0) > 0).length;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) renderHome(ctx, game.rod, dexCount, FISH.length);
  }, [game.rod, dexCount]);

  // 캔버스 클릭 → 내부 좌표 → 가구 히트테스트 (R1~R3b)
  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const el = canvasRef.current!;
    const rect = el.getBoundingClientRect();
    const sx = rect.width ? W / rect.width : 1;
    const sy = rect.height ? H / rect.height : 1;
    const x = (e.clientX - rect.left) * sx;
    const y = (e.clientY - rect.top) * sy;
    const f = furnitureAt(x, y);
    if (!f) return;

    switch (f.id) {
      case 'sell': { // R1
        if (game.bag.length === 0) { setToast('팔 물고기가 없다. 낚시하러 가자.'); return; }
        const value = bagValue(game);
        setGame(sellAll(game));
        setToast(`물고기를 팔아 ${value}G를 벌었다!`);
        return;
      }
      case 'rod': { // R2
        if (game.rod >= MAX_ROD) { setToast('낚싯대는 이미 최대 강화 상태다.'); return; }
        const next = tryUpgrade(game);
        if (!next) { setToast('골드가 부족하다. 물고기를 더 팔자.'); return; }
        setGame(next);
        setToast(`낚싯대가 Lv.${next.rod}이 되었다! 입질이 빨라지고 희귀한 물고기가 잘 잡힌다.`);
        return;
      }
      case 'dex': // R3
        setDexOpen(true);
        return;
      case 'exit': // R3b
        goField();
        return;
    }
  };

  return (
    <>
      <canvas ref={canvasRef} width={W} height={H} className="game"
              aria-label="집" onClick={onClick} />
      <div className="status">궤짝=판매 · 작업대=강화 · 책장=도감 · 문=출항</div>

      {dexOpen && (
        <div className="modal-backdrop" onClick={() => setDexOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>도감 ({dexCount}/{FISH.length})</h3>
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
            <button onClick={() => setDexOpen(false)}>닫기</button>
          </div>
        </div>
      )}
    </>
  );
}
