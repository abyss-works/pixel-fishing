// 네임드 챌린지 모달 — 5배폭 단일 바에 10회 시도, 4번째 실패에 탈락.
// 시도 판정은 클라 주장(PERFECT 선례) — 서버는 티켓 유효+수주 활성+주장 정합성만 본다.
// 키는 exclusive 스코프로 가져간다 — 아래 필드 낚시로 새지 않는다 (hotkeys 계층).
import { useCallback, useEffect, useRef, useState } from 'react';
import { CHALLENGE_MAX_MISS, CHALLENGE_RED, CHALLENGE_ROUNDS, CHALLENGE_YELLOW } from '../game/balance.js';
import { newChallenge, strikeChallenge } from '../game/challenge.js';
import type { ChallengeRun } from '../game/challenge.js';
import { judgeTiming } from '../game/logic.js';
import { useKeyScope } from '../hotkeys';
import Button from '../ui/Button';

const TICK_MS = 50;

export default function ChallengeModal({ targetName, sweepMs, onFinish, onClose }: {
  targetName: string;
  sweepMs: number;
  onFinish: (r: { hits: number; misses: number; success: boolean }) => void;
  onClose: () => void;
}) {
  const [run, setRun] = useState<ChallengeRun>(newChallenge);
  const [t, setT] = useState(0);
  const startRef = useRef<number>(0);
  const runRef = useRef(run);
  const doneRef = useRef(false);
  const finishRef = useRef(onFinish);
  // ref 대입은 이펙트에서만 — 렌더 중 ref를 읽거나 쓰지 않는다 (Field 선례)
  useEffect(() => { finishRef.current = onFinish; });

  // ref 미러를 동기로 갱신한다 — 렌더가 배치되면(테스트 fake timer·연타)
  // ref가 낡아 같은 베이스에 중복 집계된다. ref가 정본, state는 표시용이다.
  const advance = useCallback((hit: boolean) => {
    const next = strikeChallenge(runRef.current, hit);
    runRef.current = next;
    setRun(next);
    if (!next.done) {
      startRef.current = Date.now();
      setT(0);
    } else {
      doneRef.current = true;
      finishRef.current({ hits: next.hits, misses: next.misses, success: next.success });
    }
  }, []);

  const strike = () => {
    if (runRef.current.done || doneRef.current) return;
    const pos = Math.min((Date.now() - startRef.current) / sweepMs, 1);
    const j = judgeTiming(pos, CHALLENGE_YELLOW, CHALLENGE_RED);
    advance(j !== 'normal');
  };
  const strikeRef = useRef(strike);
  // ref 대입은 이펙트에서만 — 렌더 중 ref를 읽거나 쓰지 않는다 (Field 선례)
  useEffect(() => { strikeRef.current = strike; });

  useKeyScope(e => {
    if (e.code === 'Space') { e.preventDefault(); strikeRef.current(); return true; }
  }, { exclusive: true });

  useEffect(() => {
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
  }, [sweepMs, advance]);

  const attempt = Math.min(run.hits + run.misses + 1, CHALLENGE_ROUNDS);
  return (
    <div className="border border-gold rounded-sm bg-surface p-4 flex flex-col gap-2 text-center text-sm" role="dialog" aria-label={`${targetName} 도전`}>
      <b className="pf-accent text-gold text-lg">{targetName} — 도전</b>
      <div className="border-b border-line" />
      {!run.done ? (
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
              className="absolute top-[-2px] bottom-[-2px] w-0.5 bg-white"
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
          <span className="flex justify-center">
            <Button variant="primary" onClick={() => strikeRef.current()}>챔질!</Button>
          </span>
        </>
      ) : (
        <>
          <span className="text-sm">
            {run.success ? `${targetName} 포획! 수배판에서 납품하자.` : `놓쳤다 — 도전권은 유지된다.`}
          </span>
          <span className="flex justify-center">
            <Button onClick={onClose}>닫기</Button>
          </span>
        </>
      )}
    </div>
  );
}
