// 조우 창 — 바다 위 스테이지 모달. 흔적 카드의 추적 버튼이 연다.
// 들어가며(목격담 + 조우 버튼) → 승부(5배폭 단일 바에 10회 시도, 4번째 실패에 탈락) →
// 이기면 이름이 드러나고 토벌 버튼이 결과를 서버로 보낸다. 지면 감사만 보내고 흔적은 남는다.
// 시도 판정은 클라 주장(PERFECT 선례) — 서버는 티켓 유효+수주 활성+주장 정합성만 본다.
// 키는 exclusive 스코프로 가져간다 — 아래 필드 낚시로 새지 않는다 (hotkeys 계층).
import { useCallback, useEffect, useRef, useState } from 'react';
import { CHALLENGE_MAX_MISS, CHALLENGE_RED, CHALLENGE_ROUNDS, CHALLENGE_YELLOW } from '../../../../game/rules/balance.js';
import { newChallenge, strikeChallenge } from '../../../../game/rules/challenge.js';
import type { ChallengeRun } from '../../../../game/rules/challenge.js';
import { judgeTiming } from '../../../../game/rules/logic.js';
import { selectChallengeAttempt } from '../../../../features/bounty/model/challenge';
import type { EncounterData } from '../../../../features/bounty/model/challenge';
import { useKeyScope } from '../../../ui/hotkeys';
import Button from '../../../ui/Button';
import FishSprite from '../../../ui/fish/FishSprite';
import Modal from '../../../ui/Modal';
import Panel from '../../../ui/Panel';
import { josa } from '../../../ui/format';

const TICK_MS = 50;

export interface EncounterResult { hits: number; misses: number; success: boolean }

type Phase = 'intro' | 'run' | 'won' | 'lost';

export default function EncounterModal({ data, onResolve, onClose }: {
  data: EncounterData;
  /** 승부 결과 확정 — 이기면 토벌 버튼이, 지면 승부가 끝나는 즉시 부른다 */
  onResolve: (r: EncounterResult) => void;
  onClose: () => void;
}) {
  const { named, fish, found, sighting, sweepMs } = data;
  const [phase, setPhase] = useState<Phase>('intro');
  const [run, setRun] = useState<ChallengeRun>(newChallenge);
  const [t, setT] = useState(0);
  const startRef = useRef<number>(0);
  const runRef = useRef(run);
  const doneRef = useRef(false);
  const resolveRef = useRef(onResolve);
  // ref 대입은 이펙트에서만 — 렌더 중 ref를 읽거나 쓰지 않는다 (Field 선례)
  useEffect(() => { resolveRef.current = onResolve; });

  // ref 미러를 동기로 갱신한다 — 렌더가 배치되면(테스트 fake timer·연타)
  // ref가 낡아 같은 베이스에 중복 집계된다. ref가 정본, state는 표시용이다.
  const advance = useCallback((hit: boolean) => {
    const next = strikeChallenge(runRef.current, hit);
    runRef.current = next;
    setRun(next);
    if (!next.done) {
      startRef.current = Date.now();
      setT(0);
      return;
    }
    doneRef.current = true;
    setPhase(next.success ? 'won' : 'lost');
    // 실패는 확정 버튼 없이 감사만 보낸다 — 흔적은 남아 다시 추적할 수 있다
    if (!next.success) resolveRef.current({ hits: next.hits, misses: next.misses, success: false });
  }, []);

  const strike = () => {
    if (phase !== 'run' || runRef.current.done || doneRef.current) return;
    const pos = Math.min((Date.now() - startRef.current) / sweepMs, 1);
    const j = judgeTiming(pos, CHALLENGE_YELLOW, CHALLENGE_RED);
    advance(j !== 'normal');
  };
  const strikeRef = useRef(strike);
  useEffect(() => { strikeRef.current = strike; });

  useKeyScope(e => {
    if (e.code === 'Space') { e.preventDefault(); strikeRef.current(); return true; }
    // 모달 자체의 Esc는 이 exclusive 스코프 아래라 닿지 않는다 — 여기서 같은 출구를 연다
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return true; }
  }, { exclusive: true });

  useEffect(() => {
    if (phase !== 'run') return;
    startRef.current = Date.now();
    const id = setInterval(() => {
      if (runRef.current.done || doneRef.current) return;
      const pos = (Date.now() - startRef.current) / sweepMs;
      if (pos >= 1) {
        // 시간 초과 = 실패 (챔질 안 함)
        advance(false);
      } else {
        setT(pos);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [phase, sweepMs, advance]);

  const attempt = selectChallengeAttempt(run);
  const revealed = found || phase === 'won';
  return (
    <Modal layer="stage" onClose={onClose}>
      <Panel title={phase === 'won' ? '토벌' : '조우'} onClose={onClose}
             className="bg-surface text-center text-sm">
        <FishSprite fish={fish} preset="portrait" discovered={revealed} animate={revealed}
                    ariaLabel={revealed ? named.name : '그림자'} className="block mx-auto" />
        {phase === 'intro' && (
          <>
            <span className="text-text-dim italic text-xs">{sighting}</span>
            <span>그림자가 돌아선다.</span>
            <Button variant="primary" full onClick={() => setPhase('run')}>조우</Button>
          </>
        )}
        {phase === 'run' && (
          <>
            <span className="text-text-dim text-xs">
              {attempt}/{CHALLENGE_ROUNDS}회 · 실패 {run.misses}/{CHALLENGE_MAX_MISS}회까지
            </span>
            {/* 5배폭 바 — 일반 바 100 기준 500 스케일. 존은 고정 관대값(노랑 30·빨강 10) */}
            <div
              className="relative w-full h-6 bg-surface-2 border border-line cursor-pointer"
              onClick={() => strikeRef.current()}
              role="button"
              aria-label="챔질"
            >
              <div
                className="absolute top-0 bottom-0 bg-gold/70"
                style={{ left: `${(1 - CHALLENGE_YELLOW) / 2 * 100}%`, width: `${CHALLENGE_YELLOW * 100}%` }}
              />
              <div
                className="absolute top-0 bottom-0 bg-danger"
                style={{ left: `${(1 - CHALLENGE_RED) / 2 * 100}%`, width: `${CHALLENGE_RED * 100}%` }}
              />
              <div
                className="absolute top-[-2px] bottom-[-2px] w-0.5 bg-text"
                style={{ left: `${Math.min(t, 1) * 100}%` }}
              />
            </div>
            <span className="flex justify-center gap-1" aria-label="시도 현황">
              {Array.from({ length: CHALLENGE_ROUNDS }, (_, i) => (
                <span
                  key={i}
                  className={`size-2 rounded-full border border-line ${i < run.hits ? 'bg-gold' : i < run.hits + run.misses ? 'bg-danger' : ''}`}
                />
              ))}
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
            <span>놓쳤다 — 흔적은 아직 남아 있다.</span>
            <Button full onClick={onClose}>돌아가기</Button>
          </>
        )}
      </Panel>
    </Modal>
  );
}
