import { useEffect, useState } from 'react';
import {
  BOATS, COUPONS, FISH, JUDGMENT_MULT, RARITY, SPOTS,
  migrate, newState, rodStats, upgradeCost,
} from './logic';
import type { GameState } from './logic';
import Base from './Home';
import Field from './Field';

const SAVE_KEY = 'pixel-fishing-save';

// 장면: 집 ⟷ 마을 필드 ⟷ (포구, 배 필요) ⟷ 대양 필드 ⟷ 항구
type Scene = 'home' | 'village' | 'harbor' | 'ocean';

// 구버전 세이브 자동 이관. 명성이 없던 세이브는 도감 소급 인정 → 환영 문구
function load(): { game: GameState; notice: string | null } {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const game = migrate(parsed);
      const notice = parsed?.v !== 4 && game.fame > 0
        ? `업데이트! 그동안 잡은 물고기가 명성으로 소급 인정되었다. ⭐${game.fame}`
        : null;
      return { game, notice };
    }
  } catch { /* 손상된 저장 데이터는 무시하고 새로 시작 */ }
  return { game: newState(), notice: null };
}

// 관리자 게이트 — 지금은 URL ?admin (친구용 서비스라 충분).
// P1 계정 도입 시 서버 권한 검증으로 승격 .
const isAdmin = () => new URLSearchParams(window.location.search).has('admin');

export default function App() {
  const [init] = useState(load);
  const [game, setGame] = useState<GameState>(init.game);
  const [scene, setScene] = useState<Scene>('home');
  const [toast, setToast] = useState(
    init.notice ?? '집이다. 가구를 클릭해 정비하고, 문으로 나가 마을 물가에서 낚시하자.');
  const [adminOpen, setAdminOpen] = useState(false);

  const go = (s: Scene, msg: string) => { setScene(s); setToast(msg); };

  // R18: 자동 저장
  useEffect(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game));
  }, [game]);

  return (
    <div className="app">
      <div className="hud">
        <span>💰 <b>{game.gold}</b>G</span>
        <span>⭐ 명성 <b>{game.fame}</b></span>
        <span>⛵ <b>{game.boat === 0 ? '배 없음' : BOATS[game.boat - 1].name}</b></span>
        <span>🎣 낚싯대 Lv.<b>{game.rod}</b></span>
        <span>🐟 <b>{game.bag.length}</b>마리</span>
      </div>

      {scene === 'home' && (
        <Base base="home" game={game} setGame={setGame} setToast={setToast}
              goField={() => go('village', '마을이다. 물가 군집에서 낚시하자. [F]=자동 낚시')} />
      )}
      {scene === 'village' && (
        <Field region="village" game={game} setGame={setGame} setToast={setToast}
               goBase={() => go('home', '집이다. 가구를 클릭해 정비하자.')}
               goTravel={() => go('ocean', '대양으로 출항! 태평양 군집을 찾아 항해하자.')} />
      )}
      {scene === 'harbor' && (
        <Base base="harbor" game={game} setGame={setGame} setToast={setToast}
              goField={() => go('ocean', '출항! 군집 위에서 스페이스로 캐스팅.')}
              goTravel={() => go('village', '여객선을 타고 마을로 돌아왔다.')} />
      )}
      {scene === 'ocean' && (
        <Field region="ocean" game={game} setGame={setGame} setToast={setToast}
               goBase={() => go('harbor', '항구에 접안했다. 시설을 클릭해 정비하자.')} />
      )}

      <div className="toast" role="status">{toast}</div>

      {isAdmin() && (
        <button onClick={() => setAdminOpen(true)}>📊 관리자 대시보드</button>
      )}
      {adminOpen && (
        <div className="modal-backdrop" onClick={() => setAdminOpen(false)}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <h3>관리자 대시보드 — 게임 데이터</h3>

            <h4>어종 전체 ({FISH.length})</h4>
            <table className="data-table">
              <thead><tr><th>이름</th><th>해역</th><th>등급</th><th>가격</th><th>가중치</th></tr></thead>
              <tbody>
                {FISH.map(f => {
                  const r = RARITY[f.rarity];
                  return (
                    <tr key={f.id}>
                      <td>{f.name}</td>
                      <td>{SPOTS.find(s => s.id === f.spot)!.name}</td>
                      <td style={{ color: r.color }}>{r.name}</td>
                      <td>{f.price}G</td>
                      <td>{r.weight}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <h4>배 ({BOATS.length})</h4>
            <table className="data-table">
              <thead><tr><th>단계</th><th>이름</th><th>가격</th><th>명성 요구</th><th>속도</th><th>해금 해역</th></tr></thead>
              <tbody>
                {BOATS.map(b => (
                  <tr key={b.tier}>
                    <td>{b.tier}</td><td>{b.name}</td><td>{b.price}G</td><td>⭐{b.fameReq}</td><td>{b.speed}</td>
                    <td>{SPOTS.find(s => s.boatTier === b.tier)?.name ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h4>낚싯대 스탯 곡선 (무한 강화 — 점근 수렴)</h4>
            <table className="data-table">
              <thead><tr><th>Lv</th><th>다음 강화 비용</th><th>입질(초)</th><th>바 sweep</th><th>PERFECT 존</th></tr></thead>
              <tbody>
                {[1, 2, 3, 5, 7, 10, 15, 20, 30, 50].map(lv => {
                  const st = rodStats(lv);
                  return (
                    <tr key={lv}>
                      <td>{lv}</td>
                      <td>{upgradeCost(lv).toLocaleString()}G</td>
                      <td>{st.biteMin.toFixed(1)}~{st.biteMax.toFixed(1)}</td>
                      <td>{st.sweep.toFixed(2)}s</td>
                      <td>{Math.round(st.zone * 100)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <h4>판정 배수</h4>
            <table className="data-table">
              <thead><tr><th>판정</th><th>희귀 이상 가중치 배수</th></tr></thead>
              <tbody>
                {Object.entries(JUDGMENT_MULT).map(([j, m]) => (
                  <tr key={j}><td>{j}</td><td>×{m}</td></tr>
                ))}
                <tr><td>auto (방치)</td><td>추첨 없음 — 해당 수역 최하 어종 고정</td></tr>
              </tbody>
            </table>

            <h4>쿠폰 (공유용 — 클라이언트 검증, P1에서 서버 이관)</h4>
            <table className="data-table">
              <thead><tr><th>코드</th><th>보상</th><th>설명</th></tr></thead>
              <tbody>
                {Object.entries(COUPONS).map(([code, c]) => (
                  <tr key={code}><td><b>{code}</b></td><td>+{c.gold}G</td><td>{c.desc}</td></tr>
                ))}
              </tbody>
            </table>

            <button onClick={() => setAdminOpen(false)}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
