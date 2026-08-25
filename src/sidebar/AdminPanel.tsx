import { useState } from 'react';
import type { SpotId } from '../data/spots';
import {
  BOATS, COUPONS, FISH, JUDGMENT_MULT, RARITY, SPOTS,
  rodCurveT, rodStats, upgradeCost,
} from '../game/logic';
import { POWER_RULES, zonesFor } from '../game/stats';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import Modal from '../ui/Modal';
import Note from '../ui/Note';
import SectionTitle from '../ui/SectionTitle';
import { RarityText } from '../ui/RarityTag';
import { isAdminUrl, isLocalOrigin, OWNER_EMAIL } from './shared';

// 관리자 대시보드 — 노출 조건은 둘 다: URL ?admin **그리고** 로컬 오리진 또는 운영자 계정.
// ?admin만으로는 친구가 링크를 유출하는 순간 열리므로 신원 조건을 AND로 묶는다(2026-08-25).
export default function AdminPanel({ account }: { account?: string | null }) {
  const [open, setOpen] = useState(false);
  const [simPower, setSimPower] = useState(60);
  const [simSpot, setSimSpot] = useState<SpotId>('deep');
  if (!isAdminUrl()) return null;
  if (!(isLocalOrigin() || (account ?? '').toLowerCase() === OWNER_EMAIL)) return null;

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
            <thead><tr><th>Lv</th><th>다음 강화 비용</th><th>입질(초)</th><th>바 sweep</th><th>파워</th></tr></thead>
            <tbody>
              {[1, 2, 3, 5, 7, 10, 15, 20, 30, 50].map(lv => {
                const st = rodStats(lv);
                return (
                  <tr key={lv}>
                    <td>{lv}</td>
                    <td>{upgradeCost(lv).toLocaleString()}G</td>
                    <td>{st.biteMin.toFixed(1)}~{st.biteMax.toFixed(1)}</td>
                    <td>{st.sweep.toFixed(2)}s</td>
                    <td>{Math.round(rodCurveT(lv) * 99) + 1}</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>

          <SectionTitle>판정 배수</SectionTitle>
          <DataTable>
            <thead><tr><th>판정</th><th>일반 가중치 ÷배수</th></tr></thead>
            <tbody>
              {Object.entries(JUDGMENT_MULT).map(([j, m]) => (
                <tr key={j}><td>{j}</td><td>{m === 1 ? '—' : `÷${m}`}</td></tr>
              ))}
              <tr><td>auto (방치)</td><td>추첨 없음 — 해당 수역 최하 어종 고정</td></tr>
            </tbody>
          </DataTable>

          <SectionTitle>파워 게이트 시뮬레이터</SectionTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-2 flex-1 min-w-[180px]">
              파워
              <input type="range" min={1} max={100} value={simPower}
                     onChange={e => setSimPower(Number(e.target.value))} className="flex-1" />
              <span className="pf-accent w-8 text-right">{simPower}</span>
            </label>
            <select value={simSpot} onChange={e => setSimSpot(e.target.value as SpotId)}
                    className="bg-surface border border-line rounded-sm px-1 py-0.5 text-xs">
              {SPOTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <DataTable>
            <tbody>
              {(() => {
                const req = SPOTS.find(s => s.id === simSpot)?.powerReq ?? 0;
                const z = zonesFor(simPower, req);
                return (
                  <>
                    <tr><th scope="row">요구 파워</th><td>{req || '제한 없음'}</td></tr>
                    <tr><th scope="row">노란 존 (PERFECT)</th><td>{z.yellow}%</td></tr>
                    <tr><th scope="row">빨간 존 (SUPERB)</th><td>{z.red > 0 ? `${z.red}%` : '—'}</td></tr>
                    <tr><th scope="row">일반 가중치</th><td>{simPower >= req ? '그대로' : `×${z.mult}`}</td></tr>
                    <tr><th scope="row">입질 추가</th><td>{z.biteExtra > 0 ? `+${z.biteExtra}초` : '—'}</td></tr>
                  </>
                );
              })()}
            </tbody>
          </DataTable>
          <Note>규칙: 빨간 존 = 초과 {POWER_RULES.redMinExcess}%p부터 min(초과×2, {POWER_RULES.redCap}%p) ·
            미달 배수 = 2^(⌊부족/{POWER_RULES.shortStep}⌋+1) · 입질 +부족/{POWER_RULES.biteDiv}초.
            값 수정은 코드(balance·spots)와 서버가 함께 가야 한다 — 이 화면은 현재 규칙의 계산기다.</Note>

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
