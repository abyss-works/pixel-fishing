import { useState } from 'react';
import {
  BOATS, COUPONS, FISH, JUDGMENT_MULT, RARITY, SPOTS,
  rodStats, upgradeCost,
} from '../game/logic';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import Modal from '../ui/Modal';
import SectionTitle from '../ui/SectionTitle';
import { RarityText } from '../ui/RarityTag';
import { isAdminUrl } from './shared';

// R20: 관리자 대시보드 — 게임 데이터 전체 열람 (숨김 어종 포함)
export default function AdminPanel() {
  const [open, setOpen] = useState(false);
  if (!isAdminUrl()) return null;

  return (
    <>
      <Button size="sm" className="text-left" onClick={() => setOpen(true)}>관리자 대시보드</Button>
      {open && (
        <Modal wide title="관리자 대시보드 — 게임 데이터" onClose={() => setOpen(false)}>
          <SectionTitle>어종 전체 ({FISH.length})</SectionTitle>
          <DataTable>
            <thead><tr><th>이름</th><th>해역</th><th>등급</th><th>가격</th><th>가중치</th></tr></thead>
            <tbody>
              {FISH.map(f => (
                <tr key={f.id}>
                  <td>{f.name}</td>
                  <td>{SPOTS.find(s => s.id === f.spot)!.name}</td>
                  <td><RarityText rarity={f.rarity} /></td>
                  <td>{f.price}G</td>
                  <td>{RARITY[f.rarity].weight}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>

          <SectionTitle>배 ({BOATS.length})</SectionTitle>
          <DataTable>
            <thead><tr><th>단계</th><th>이름</th><th>가격</th><th>명성 요구</th><th>속도</th><th>해금 해역</th></tr></thead>
            <tbody>
              {BOATS.map(b => (
                <tr key={b.tier}>
                  <td>{b.tier}</td><td>{b.name}</td><td>{b.price}G</td><td>{b.fameReq}</td><td>{b.speed}</td>
                  <td>{SPOTS.find(s => s.boatTier === b.tier)?.name ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>

          <SectionTitle>낚싯대 스탯 곡선 (무한 강화 — 점근 수렴)</SectionTitle>
          <DataTable>
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
          </DataTable>

          <SectionTitle>판정 배수</SectionTitle>
          <DataTable>
            <thead><tr><th>판정</th><th>희귀 이상 가중치 배수</th></tr></thead>
            <tbody>
              {Object.entries(JUDGMENT_MULT).map(([j, m]) => (
                <tr key={j}><td>{j}</td><td>×{m}</td></tr>
              ))}
              <tr><td>auto (방치)</td><td>추첨 없음 — 해당 수역 최하 어종 고정</td></tr>
            </tbody>
          </DataTable>

          <SectionTitle>쿠폰 (공유용 — 클라이언트 검증, P1에서 서버 이관)</SectionTitle>
          <DataTable>
            <thead><tr><th>코드</th><th>보상</th><th>설명</th></tr></thead>
            <tbody>
              {Object.entries(COUPONS).map(([code, c]) => (
                <tr key={code}><td><b>{code}</b></td><td>+{c.gold}G</td><td>{c.desc}</td></tr>
              ))}
            </tbody>
          </DataTable>

          <Button className="mt-3" onClick={() => setOpen(false)}>닫기</Button>
        </Modal>
      )}
    </>
  );
}
