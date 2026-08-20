import { useState } from 'react';
import {
  BOATS, COUPONS, FISH, JUDGMENT_MULT, RARITY, SPOTS,
  rodStats, upgradeCost,
} from './logic';

// 관리자 게이트 — 지금은 URL ?admin (친구용 서비스라 충분).
// P1 계정 도입 시 서버 권한 검증으로 승격 .
const isAdmin = () => new URLSearchParams(window.location.search).has('admin');

// R20: 관리자 대시보드 — 게임 데이터 전체 열람 (숨김 어종 포함)
export default function AdminPanel() {
  const [open, setOpen] = useState(false);
  if (!isAdmin()) return null;

  return (
    <>
      <button onClick={() => setOpen(true)}>📊 관리자 대시보드</button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
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

            <button onClick={() => setOpen(false)}>닫기</button>
          </div>
        </div>
      )}
    </>
  );
}
