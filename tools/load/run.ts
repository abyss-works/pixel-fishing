// 부하 실행 진입점 — 단계마다 가상 플레이어를 늘리며 유지하고, 측정값을 모아 결과 파일로 쓴다.
// 사용: 먼저 pnpm load:accounts로 계정을 준비한 뒤
//   pnpm load:run --target <origin> --build-id <커밋 SHA> --accounts <세션 파일> --out <폴더> [--steps 10,25,50] [--step-seconds 120] ...
// 운영 도메인은 부하 대상으로 받지 않는다. 감시용 --probe에만 허용한다.
import { exec } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { assertSecretPath, parseAccountsFile, usableAccounts } from './accounts';
import { MoveClock } from './clock';
import { guardedFetch } from './http';
import { parseOptions } from './options';
import type { Options } from './options';
import { abortReason, exitCodeOf } from './plan';
import { Player } from './player';
import { StepStats, toStepResult } from './recorder';
import type { EndReason } from './recorder';
import { renderMarkdown } from './report';
import type { RunResult } from './report';

// 새 플레이어를 접속시키는 속도(초당). 로그인은 미리 만든 세션을 쓰므로 인증 한도와 무관하다.
// 단계를 올릴 때 접속이 한꺼번에 몰리지 않게 하는 값이다
const JOINS_PER_SEC = 5;
const PROBE_EVERY_MS = 5000;
const PROBE_TIMEOUT_MS = 5000;
const METRICS_EVERY_MS = 10_000;
const METRICS_TIMEOUT_MS = 20_000;
const CHECK_EVERY_MS = 1000;
const CLOCK_MAX_AGE_MS = 30_000;

/** 게스트 채팅 가능 여부를 실행 결과에서 읽어 적는다 */
function chatNote(run: RunResult, chatRate: number): string {
  if (chatRate <= 0) return '채팅을 보내지 않았다(--chat-rate 0). 전달 지연은 위치 메시지로 쟀다.';
  const sent = run.steps.reduce((n, s) => n + s.chat.sent, 0);
  const rejected = run.steps.reduce((n, s) => n + s.chat.guestRejected, 0);
  const measured = run.steps.reduce((n, s) => n + s.chat.ms.count, 0);
  if (rejected > 0 && measured === 0) {
    return `게스트 계정은 채팅을 보낼 수 없다(서버가 chat-guest로 거부 ${rejected}건). 채팅 측정은 하지 않았고 전달 지연은 위치 메시지로 쟀다.`;
  }
  return `채팅 ${sent}건을 보냈고 전달 지연 ${measured}건을 쟀다.`;
}

function cpuTimes(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const c of cpus()) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
  }
  return { idle, total };
}

function runShell(cmd: string): Promise<string> {
  return new Promise((resolve) => {
    exec(cmd, { timeout: METRICS_TIMEOUT_MS, maxBuffer: 1 << 20, windowsHide: true }, (err, stdout, stderr) => {
      resolve(`${stdout}${stderr}${err ? `\n[종료 코드 ${err.code ?? err.signal ?? 'unknown'}]` : ''}`);
    });
  });
}

async function main(): Promise<void> {
  const opts = parseOptions(process.argv.slice(2));
  mkdirSync(opts.out, { recursive: true });
  // 단계 중 가장 큰 인원만큼 준비된 계정이 있어야 시작한다. 실행 중에는 로그인 요청을 보내지 않는다
  assertSecretPath(opts.accounts);
  const accounts = usableAccounts(parseAccountsFile(readFileSync(opts.accounts, 'utf8')), opts.target, Math.max(...opts.steps));

  let stats = new StepStats();
  let fatal: EndReason | null = null;
  let interrupted = false;
  const players: Player[] = [];
  const clock = new MoveClock();
  const world = {
    origin: opts.target, buildId: opts.buildId, clientVersion: opts.clientVersion,
    idleRatio: opts.idleRatio, chatRate: opts.chatRate,
    stats: () => stats, clock,
    fatal: (reason: 'version-mismatch') => { fatal ??= reason; },
  };
  const run: RunResult = { target: opts.target, startedAt: new Date().toISOString(), endReason: 'completed', chatNote: '', steps: [] };
  const write = () => {
    run.chatNote = chatNote(run, opts.chatRate);
    writeFileSync(join(opts.out, 'result.json'), `${JSON.stringify({ ...run, options: { ...opts, metricsCmd: opts.metricsCmd ? '(설정됨)' : null } }, null, 2)}\n`, 'utf8');
    writeFileSync(join(opts.out, 'result.md'), renderMarkdown(run), 'utf8');
  };

  process.on('SIGINT', () => { interrupted = true; });

  // 부하와 별개의 감시 요청. 5초에 한 번, 가벼운 GET만 보낸다
  const probeTimer = opts.probe ? setInterval(() => {
    const started = performance.now();
    guardedFetch(`${opts.probe}/api/action`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) }).then(
      (res) => {
        stats.probeMs.push(performance.now() - started);
        if (res.status !== 204) stats.probeFailures++;
      },
      () => { stats.probeMs.push(PROBE_TIMEOUT_MS); stats.probeFailures++; },
    );
  }, PROBE_EVERY_MS) : null;

  let cpuPrev = cpuTimes();
  const cpuTimer = setInterval(() => {
    const now = cpuTimes();
    const total = now.total - cpuPrev.total;
    if (total > 0) stats.cpu.push(1 - (now.idle - cpuPrev.idle) / total);
    cpuPrev = now;
    clock.prune(performance.now(), CLOCK_MAX_AGE_MS);
  }, 1000);

  let metricsBusy = false;
  const collectMetrics = (opts.metricsCmd !== null) ? () => {
    if (metricsBusy) return;
    metricsBusy = true;
    const at = new Date().toISOString();
    const bucket = stats;
    void runShell(opts.metricsCmd as string).then((output) => { bucket.metrics.push({ at, output }); metricsBusy = false; });
  } : null;
  const metricsTimer = collectMetrics ? setInterval(collectMetrics, METRICS_EVERY_MS) : null;

  /** 지정한 시간 동안 기다리며 중단 조건을 본다. 중단하면 그 사유를 돌려준다 */
  const wait = async (ms: number, until?: () => boolean): Promise<EndReason | null> => {
    const end = Date.now() + ms;
    while (Date.now() < end && !(until?.())) {
      await delay(Math.min(CHECK_EVERY_MS, Math.max(1, end - Date.now())));
      const reason = verdict(opts, stats, fatal, interrupted);
      if (reason) return reason;
    }
    return null;
  };

  let endReason: EndReason = 'completed';
  try {
    for (const step of opts.steps) {
      stats = new StepStats();
      collectMetrics?.();
      // 새 플레이어를 초당 상한 안에서 하나씩 들인다
      const joining: Promise<boolean>[] = [];
      let stopped: EndReason | null = null;
      while (players.length < step && !stopped) {
        const player = new Player(world, (accounts[players.length] as { cookie: string }).cookie);
        players.push(player);
        joining.push(player.join());
        stopped = await wait(1000 / JOINS_PER_SEC);
      }
      let pending = joining.length;
      for (const j of joining) void j.then(() => { pending--; });
      stopped ??= await wait(60_000, () => pending === 0);
      stats.markHold();
      stopped ??= await wait(opts.stepSeconds * 1000);
      for (const p of players) p.settleDowntime();
      const connected = players.filter(p => p.online).length;
      run.steps.push(toStepResult(stats, { players: step, connected, endReason: stopped ?? 'completed' }));
      write();
      if (stopped) { endReason = stopped; break; }
    }
  } finally {
    for (const p of players) p.stop();
    for (const t of [probeTimer, cpuTimer, metricsTimer]) if (t) clearInterval(t);
  }
  run.endReason = endReason;
  write();
  console.info(`끝 사유: ${endReason}. 결과: ${join(opts.out, 'result.md')}`);
  process.exit(exitCodeOf(endReason));
}

/** 중단해야 하는 이유. 없으면 null */
function verdict(opts: Options, stats: StepStats, fatal: EndReason | null, interrupted: boolean): EndReason | null {
  if (interrupted) return 'interrupted';
  if (fatal) return fatal;
  return abortReason({ actions: stats.actions, errors: stats.actionErrors, probeMs: stats.probeMs }, opts.limits);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
