import { useEffect, useState } from 'react';
import { newState, levelForXp } from './logic';
import type { GameState } from './logic';
import Home from './Home';
import Field from './Field';

const SAVE_KEY = 'pixel-fishing-save';

type Scene = 'home' | 'field';

function load(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return { ...newState(), ...JSON.parse(raw) };
  } catch { /* 손상된 저장 데이터는 무시하고 새로 시작 */ }
  return newState();
}

export default function App() {
  const [game, setGame] = useState<GameState>(load);
  const [scene, setScene] = useState<Scene>('home');
  const [toast, setToast] = useState('집이다. 가구를 클릭해 정비하고, 문으로 나가자.');

  // R18: 자동 저장
  useEffect(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game));
  }, [game]);

  const lv = levelForXp(game.xp);

  return (
    <div className="app">
      <div className="hud">
        <span>💰 <b>{game.gold}</b>G</span>
        <span>Lv.<b>{lv.level}</b> <small>({lv.cur}/{lv.next})</small></span>
        <span>🎣 낚싯대 Lv.<b>{game.rod}</b></span>
        <span>🐟 <b>{game.bag.length}</b>마리</span>
      </div>

      {scene === 'home' ? (
        <Home game={game} setGame={setGame} setToast={setToast}
              goField={() => { setScene('field'); setToast('출항! 군집을 찾아 항해하자. 이동: 방향키/WASD'); }} />
      ) : (
        <Field game={game} setGame={setGame} setToast={setToast}
               goHome={() => { setScene('home'); setToast('귀항했다. 가구를 클릭해 정비하자.'); }} />
      )}

      <div className="toast" role="status">{toast}</div>
    </div>
  );
}
