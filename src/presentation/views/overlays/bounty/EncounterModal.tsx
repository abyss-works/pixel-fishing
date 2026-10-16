// 조우 창 — 바다 위 스테이지 모달. 흔적 카드의 추적 버튼이 연다.
// 들어가며(목격담 + 조우 버튼) → 결투(멈추지 않고 왕복하는 커서로 존을 맞힌다. 맞히면 네임드 체력이
// 줄고 존이 다른 자리로 옮겨 가며 빨라진다. 놓치거나 한 번 왕복하도록 치지 않으면 도주 게이지가 찬다) →
// 이기면 이름이 드러나고 토벌 버튼이 결과를 서버로 보낸다. 지면 즉시 실패를 보내고 흔적은 사라진다.
// 횟수 규칙(네임드 체력만큼 히트면 성공·4번째 실패 탈락)은 strikeChallenge가 정본이고, 움직임은 결투 모델이 정한다.
// 승부 중에는 닫을 수 없다 — 닫기가 도망이 되면 실패가 흔적을 지우는 규칙이 비어 버린다.
// 시도 판정은 클라 주장(PERFECT 선례) — 서버는 티켓 유효+수주 활성+주장 정합성만 본다.
// 키는 exclusive 스코프로 가져간다 — 아래 필드 낚시로 새지 않는다 (hotkeys 계층).
import { useCallback, useEffect, useRef, useState } from 'react';
import { CHALLENGE_MAX_MISS, CHALLENGE_YELLOW } from '../../../../game/rules/balance.js';
import { newChallenge, strikeChallenge } from '../../../../game/rules/challenge.js';
import type { ChallengeRun } from '../../../../game/rules/challenge.js';
import type { EncounterData } from '../../../../features/bounty/model/challenge';
import {
  DUEL_IDLE_SWEEPS, duelCursor, duelHit, duelSweepMs, duelZoneCenter,
} from '../../../../features/bounty/model/duel';
import { useKeyScope } from '../../../ui/hotkeys';
import { cx } from '../../../ui/cx';
import Button from '../../../ui/Button';
import FishSprite from '../../../ui/fish/FishSprite';
import Modal from '../../../ui/Modal';
import Panel from '../../../ui/Panel';
import { josa } from '../../../ui/format';

const TICK_MS = 50;
/** 도주 게이지 칸 수 — 이만큼 차면 놓친다 */
const ESCAPE_SLOTS = CHALLENGE_MAX_MISS + 1;

export interface EncounterResult { hits: number; misses: number; success: boolean }

type Phase = 'intro' | 'run' | 'won' | 'lost';
type Flash = 'hit' | 'miss' | null;

/** 칸 게이지 — 체력은 남은 칸이 빨간색, 도주는 찬 칸이 회색 */
function Slots({ label, total, filled, tone }: { label: string; total: number; filled: number; tone: 'danger' | 'dim' }) {
  return (
    <span className="flex items-center gap-2" aria-label={`${label} ${filled}/${total}`}>
      <span className="w-8 text-left text-xs text-text-dim">{label}</span>
      <span className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cx('w-4 h-3 border border-line',
            i < filled && (tone === 'danger' ? 'bg-danger' : 'bg-text-dim'))} />
        ))}
      </span>
    </span>
  );
}

export default function EncounterModal({ data, onResolve, onClose }: {
  data: EncounterData;
  /** 승부 결과 확정 — 이기면 토벌 버튼이, 지면 승부가 끝나는 즉시 부른다 */
  onResolve: (r: EncounterResult) => void;
  onClose: () => void;
}) {
  const { named, fish, found, sighting, sweepMs, hp } = data;
  const [phase, setPhase] = useState<Phase>('intro');
  const [run, setRun] = useState<ChallengeRun>(newChallenge);
  const [cursor, setCursor] = useState(0);
  const [flash, setFlash] = useState<Flash>(null);
  // 진행량 u(편도 1)를 시간에 따라 적분한다 — 속도가 바뀌어도 커서가 순간이동하지 않는다.
  // ref가 정본이고 state는 표시용이다(렌더가 배치돼도 같은 베이스에 중복 집계되지 않게).
  const uRef = useRef(0);
  const lastTickRef = useRef(0);
  const lastStrikeRef = useRef(0);
  const sweepRef = useRef(sweepMs);
  const runRef = useRef(run);
  const doneRef = useRef(false);
  const resolveRef = useRef(onResolve);
  // ref 대입은 이펙트에서만 — 렌더 중 ref를 읽거나 쓰지 않는다 (Field 선례)
  useEffect(() => { resolveRef.current = onResolve; });

  /** 지금 시각까지 진행량을 적분해 커서 위치를 돌려준다 */
  const sample = useCallback((now: number): number => {
    uRef.current += (now - lastTickRef.current) / sweepRef.current;
    lastTickRef.current = now;
    return duelCursor(uRef.current);
  }, []);

  const advance = useCallback((hit: boolean, now: number) => {
    const next = strikeChallenge(runRef.current, hit, hp);
    runRef.current = next;
    setRun(next);
    setFlash(hit ? 'hit' : 'miss');
    lastStrikeRef.current = now;
    sweepRef.current = duelSweepMs(sweepMs, next.hits);
    if (!next.done) return;
    doneRef.current = true;
    setPhase(next.success ? 'won' : 'lost');
    // 실패는 확정 버튼 없이 바로 보낸다 — 서버가 도전권을 지우고 흔적이 사라진다
    if (!next.success) resolveRef.current({ hits: next.hits, misses: next.misses, success: false });
  }, [sweepMs, hp]);

  const strike = () => {
    if (phase !== 'run' || runRef.current.done || doneRef.current) return;
    const now = Date.now();
    const pos = sample(now);
    setCursor(pos);
    advance(duelHit(pos, duelZoneCenter(runRef.current.hits)), now);
  };
  const strikeRef = useRef(strike);
  useEffect(() => { strikeRef.current = strike; });

  const closable = phase !== 'run';
  const closableRef = useRef(closable);
  useEffect(() => { closableRef.current = closable; });
  useKeyScope(e => {
    if (e.code === 'Space') { e.preventDefault(); strikeRef.current(); return true; }
    // 모달 자체의 Esc는 이 exclusive 스코프 아래라 닿지 않는다 — 여기서 같은 출구를 연다
    if (e.key === 'Escape') { e.preventDefault(); if (closableRef.current) onClose(); return true; }
  }, { exclusive: true });

  useEffect(() => {
    if (phase !== 'run') return;
    const start = Date.now();
    uRef.current = 0;
    lastTickRef.current = start;
    lastStrikeRef.current = start;
    sweepRef.current = duelSweepMs(sweepMs, 0);
    const id = setInterval(() => {
      if (runRef.current.done || doneRef.current) return;
      const now = Date.now();
      setCursor(sample(now));
      // 한 번 왕복하도록 치지 않으면 도주 1칸 — 기다리기만 해서는 이길 수 없다
      if (now - lastStrikeRef.current >= DUEL_IDLE_SWEEPS * sweepRef.current) advance(false, now);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [phase, sweepMs, sample, advance]);

  // 명중·빗나감 표시는 잠깐만 보인다
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 400);
    return () => clearTimeout(id);
  }, [flash, run]);

  const revealed = found || phase === 'won';
  const center = duelZoneCenter(run.hits);
  return (
    <Modal layer="stage" onClose={onClose} closable={closable}>
      <Panel title={phase === 'won' ? '토벌' : '조우'} onClose={closable ? onClose : undefined}
             className="bg-surface text-center text-sm">
        <FishSprite fish={fish} preset="portrait" discovered={revealed} animate={revealed}
                    ariaLabel={revealed ? named.name : '그림자'}
                    className={cx('block mx-auto transition-transform', flash === 'hit' && 'translate-x-1')} />
        {phase === 'intro' && (
          <>
            <span className="text-text-dim italic text-xs">{sighting}</span>
            <span>그림자가 돌아선다.</span>
            <Button variant="primary" full onClick={() => setPhase('run')}>조우</Button>
          </>
        )}
        {phase === 'run' && (
          <>
            <span className="flex flex-col items-center gap-1">
              <Slots label="체력" total={hp} filled={hp - run.hits} tone="danger" />
              <Slots label="도주" total={ESCAPE_SLOTS} filled={run.misses} tone="dim" />
            </span>
            {/* 결투 바 — 커서는 멈추지 않고 왕복한다. 존은 맞힐 때마다 자리를 옮긴다 */}
            <div
              className={cx('relative w-full h-8 bg-surface-2 border cursor-pointer',
                flash === 'miss' ? 'border-text-dim' : flash === 'hit' ? 'border-gold' : 'border-line')}
              onClick={() => strikeRef.current()}
              role="button"
              aria-label="챔질"
            >
              <div
                data-duel="zone"
                className="absolute top-0 bottom-0 bg-gold/70 transition-[left] duration-200"
                style={{ left: `${(center - CHALLENGE_YELLOW / 2) * 100}%`, width: `${CHALLENGE_YELLOW * 100}%` }}
              />
              <div
                data-duel="cursor"
                className="absolute top-[-3px] bottom-[-3px] w-1 bg-text"
                style={{ left: `${cursor * 100}%` }}
              />
            </div>
            <span className={cx('h-5 text-xs', flash === 'miss' ? 'text-text-dim' : 'text-gold')}>
              {flash === 'hit' ? '명중!' : flash === 'miss' ? '빗나갔다 — 그림자가 멀어진다.' : ''}
            </span>
            <Button variant="primary" full onClick={() => strikeRef.current()}>챔질!</Button>
          </>
        )}
        {phase === 'won' && (
          <>
            <b className="pf-accent text-gold text-lg">{named.name}</b>
            <span>{josa(named.name, '이/가')} 수면 위로 떠올랐다.</span>
            <Button variant="primary" full
                    onClick={() => onResolve({ hits: run.hits, misses: run.misses, success: true })}>
              토벌
            </Button>
          </>
        )}
        {phase === 'lost' && (
          <>
            <span>놓쳤다 — 흔적이 사라졌다. 다시 조우해야 한다.</span>
            <Button full onClick={onClose}>돌아가기</Button>
          </>
        )}
      </Panel>
    </Modal>
  );
}
