import { useEffect, useState } from 'react';
import type { SpotId } from '../data/spots';
import {
  BOATS, COUPONS, FISH, JUDGMENT_MULT, RARITY, SPOTS,
  boatNameOf, rodCurveT, rodStats, upgradeCost,
} from '../game/logic';
import type { GameState } from '../game/logic';
import type { GameAction } from '../game/actions';
import type { DispatchResult, MaybePromise } from '../backend/types';
import { when } from '../backend/types';
import { POWER_RULES, zonesFor } from '../game/stats';
import { REJECT_TEXT } from '../game/rules';
import DataTable from '../ui/DataTable';
import Note from '../ui/Note';
import SectionTitle from '../ui/SectionTitle';
import { RarityText } from '../ui/RarityTag';
import FishSprite from '../ui/FishSprite';
import TextInput from '../ui/TextInput';
import Button from '../ui/Button';

// 관리자 탭 — 게임 데이터 전체 열람 + 파워 게이트 시뮬레이터 + 테스트용 스탯 편집.
// 노출 자체는 Sidebar가 ?admin + (로컬 또는 소유자 계정) 게이트로 통제한다.
// 여기서는 조건 없이 렌더한다: 라우팅 책임과 렌더 책임을 분리.
export default function AdminTab({ game, dispatch, setToast }: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (m: string) => void;
}) {
  const [simPower, setSimPower] = useState(60);
  const [simSpot, setSimSpot] = useState<SpotId>('deep');
  const [editGold, setEditGold] = useState(String(game.gold));
  const [editFame, setEditFame] = useState(String(game.fame));
  const [editRod, setEditRod] = useState(String(game.rod));
  const [editBoat, setEditBoat] = useState(String(game.boat));

  useEffect(() => {
    setEditGold(String(game.gold));
    setEditFame(String(game.fame));
    setEditRod(String(game.rod));
    setEditBoat(String(game.boat));
  }, [game.gold, game.fame, game.rod, game.boat]);

  const onApplyStats = () => {
    const gold = Math.floor(Number(editGold));
    const fame = Math.floor(Number(editFame));
    const rod = Math.floor(Number(editRod));
    const boat = Math.floor(Number(editBoat));
    if ([gold, fame, rod, boat].some(n => !Number.isFinite(n))) {
      setToast('숫자를 올바르게 입력하세요.');
      return;
    }
    when(dispatch({ type: 'adminSet', gold, fame, rod, boat }), r => {
      if (r.status === 'ok') setToast('스탯을 적용했다.');
      else if (r.status === 'rejected') setToast(REJECT_TEXT[r.error]);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle>내 스탯 — 테스트용 (직접 수정)</SectionTitle>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="flex flex-col gap-1">골드
          <TextInput type="number" value={editGold} onChange={e => setEditGold(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">명성
          <TextInput type="number" value={editFame} onChange={e => setEditFame(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">낚싯대 Lv
          <TextInput type="number" min={1} value={editRod} onChange={e => setEditRod(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">배 단계
          <select value={editBoat} onChange={e => setEditBoat(e.target.value)}
                  className="bg-bg border border-line rounded-sm text-text text-sm px-3 py-2 outline-none focus:border-accent">
            {[0, 1, 2, 3, 4].map(n => (
              <option key={n} value={n}>{boatNameOf(n)}</option>
            ))}
          </select>
        </label>
      </div>
      <Button size="sm" onClick={onApplyStats}>스탯 적용</Button>
      <Note>테스트용이다. 운영에선 소유자·로컬만 동작하며 서버에 즉시 저장된다.</Note>

      <SectionTitle>어종 도감 — 수역별 묶음 ({FISH.length}종)</SectionTitle>
      {SPOTS.map(spot => {
        const list = FISH.filter(f => f.spot === spot.id);
        if (list.length === 0) return null;
        return (
          <div key={spot.id} className="flex flex-col gap-2">
            <h4 className="text-sm text-gold">{spot.name} <span className="text-text-dim text-xs">({list.length}종)</span></h4>
            <div className="overflow-x-auto">
              <DataTable>
                <thead><tr><th>그림</th><th className="whitespace-nowrap">이름</th><th className="whitespace-nowrap">등급</th><th>가격</th><th>가중치</th></tr></thead>
                <tbody>
                  {list.map(f => (
                    <tr key={f.id}>
                      <td><div className="flex items-center gap-1">
                        <FishSprite fish={f} preset="thumb" />
                        <FishSprite fish={f} preset="thumb" form="variant" />
                      </div></td>
                      <td className="whitespace-nowrap">
                        <div>{f.name}</div>
                        <div className="text-2xs text-text-dim">{f.variant.name}</div>
                      </td>
                      <td className="whitespace-nowrap"><RarityText rarity={f.rarity} /></td>
                      <td className="whitespace-nowrap">{f.price}G</td>
                      <td>{RARITY[f.rarity].weight}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          </div>
        );
      })}

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
                <tr><th scope="row">노란 존 (GOOD)</th><td>{z.yellow}%</td></tr>
                <tr><th scope="row">빨간 존 (PERFECT)</th><td>{z.red > 0 ? `${z.red}%` : '—'}</td></tr>
                <tr><th scope="row">일반 가중치</th><td>{simPower >= req ? '그대로' : `×${z.mult}`}</td></tr>
                <tr><th scope="row">입질 추가</th><td>{z.biteExtra > 0 ? `+${z.biteExtra}초` : '—'}</td></tr>
              </>
            );
          })()}
        </tbody>
      </DataTable>
      <Note>규칙: 총 보너스 = min(100, 초과+10%p) — 같을 때 기본 10% · 빨간 존 = 초과 {POWER_RULES.redMinExcess}%p 초과시 1씩 증가, 상한 {POWER_RULES.redCap}%p (30→0, 31→1 … 50→20) ·
        미달 배수 = 2^(⌊부족/{POWER_RULES.shortStep}⌋+1), 상한 ×{POWER_RULES.shortCap} · 입질 +부족/{POWER_RULES.biteDiv}초.
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
    </div>
  );
}
