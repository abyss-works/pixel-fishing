// 가상 플레이어 한 명 — 실제 클라이언트와 같은 형식과 간격으로 서버와 주고받는다.
//   접속: 준비된 익명 세션으로 상태·프로필·마지막 위치 읽기 → boot 액션 → 실시간 채널 연결(hello까지). 끊기면 백오프로 다시 연결
//   위치: 100ms마다 실제 클라이언트의 송신 판정(nextPositionMessage)으로 보낸다. 줄을 드리운 채 가만히 있으면 거의 보내지 않는다
//   낚시: 던지기(GET 워밍) → 입질 대기 → 판정 → catch 액션 → 획득 표시 시간 → 재캐스트. 일정 시간마다 줄을 거두고 다른 어군으로 옮긴다
//   채팅: 분당 chat-rate회. 게스트라 서버가 거부하면 그 플레이어는 보내기를 멈춘다
// 서버의 간격 검사(액션 150ms, 캐치 1초와 사이클, 초당 메시지 15개)를 넘지 않는 속도로만 움직인다.
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { DEFAULT_LOOK } from '../../src/game/content/wardrobe';
import { V_SCHOOLS, V_SPAWN } from '../../src/game/world/regions/village';
import { FISH, judgeTiming, newState } from '../../src/game/rules/logic';
import { effectiveBite, powerZones, rodAxes } from '../../src/game/rules/stats';
import { phaseDurationMs } from '../../src/game/rules/fishing';
import { LIVE_CLOSE_OUTDATED, LIVE_CLOSE_REPLACED, LIVE_MOVE_MS, LIVE_PATH, LIVE_PING_MS } from '../../src/game/rules/live';
import type { ClientMessage, ServerMessage } from '../../src/game/rules/live';
import { CAST_RANGE, WALK_SPEED } from '../../src/game/rules/balance';
import { nextPositionMessage } from '../../src/features/live/model/live';
import type { MyPosition, SentPosition } from '../../src/features/live/model/live';
import type { SpotId } from '../../src/game/content/spots';
import type { MoveClock } from './clock';
import { Downtime } from './downtime';
import { guardedFetch } from './http';
import { nextRetryMs, RETRY_MIN_MS } from './plan';
import type { StepStats } from './recorder';

export interface World {
  /** 대상 서버의 origin. 실시간 채널의 Origin 헤더와 같은 값이다 */
  origin: string;
  buildId: string;
  clientVersion: string;
  idleRatio: number;
  chatRate: number;
  /** 지금 측정 중인 단계 */
  stats(): StepStats;
  clock: MoveClock;
  /** 이어갈 수 없는 오류(서버가 이 클라이언트를 낡았다고 판정함) */
  fatal(reason: 'version-mismatch'): void;
}

const ACTION_TIMEOUT_MS = 10_000;
const HELLO_TIMEOUT_MS = 30_000;
// 한 어군 앞에서 머무는 시간. 지나면 줄을 거두고 다른 어군으로 옮긴다
const STAY_MS = [60_000, 120_000] as const;
// 규칙 거부나 오류 뒤 다시 던지기까지의 시간
const RECAST_MS = 1000;

interface Channel { helloMs: number; closed: Promise<number> }

type CatchBody = { result?: { fishId?: string } } | null;

const between = (min: number, max: number): number => min + Math.random() * (max - min);
// 낚싯대 Lv1의 새 계정. 입질 대기와 판정 구간은 이 상태의 규칙값을 쓴다
const START_STATE = newState();

export class Player {
  private readonly abort = new AbortController();
  private readonly clientId = crypto.randomUUID();
  private readonly idle: boolean;
  private readonly cookie: string;
  private uid = '';
  private ws: WebSocket | null = null;
  private connected = false;
  private spot: SpotId = 'pond';
  private pos: MyPosition = { region: 'village', zone: null, x: V_SPAWN.x, y: V_SPAWN.y, line: false, bob: null, look: DEFAULT_LOOK };
  private last: SentPosition | null = null;
  private resultAt: number | null = null;
  private chatOff = false;
  private readonly down = new Downtime();
  private timers: ReturnType<typeof setInterval>[] = [];

  private readonly world: World;

  /** cookie: 미리 만들어 둔 익명 계정의 세션. 실행 중에는 로그인 요청을 보내지 않는다 */
  constructor(world: World, cookie: string) {
    this.world = world;
    this.cookie = cookie;
    this.idle = Math.random() < world.idleRatio;
  }

  get online(): boolean { return this.connected; }

  /** 끊겨 있는 동안 쌓인 시간을 지금 단계에 더한다. 단계가 끝날 때 부른다 */
  settleDowntime(): void {
    this.world.stats().downMs += this.down.take(Date.now());
  }

  /** 접속해서 hello까지 받으면 낚시를 시작하고 true를 돌려준다. 실패하면 false다 */
  async join(): Promise<boolean> {
    const stats = this.world.stats();
    stats.connectAttempts++;
    let channel: Channel;
    try {
      await Promise.all([this.get('/api/me?q=state'), this.get('/api/me?q=profile'), this.get('/api/me/position')]);
      await this.post({ type: 'boot', buildId: this.world.buildId });
      channel = await this.openChannel();
      stats.connectOk++;
      stats.connectMs.add(channel.helloMs);
    } catch {
      this.stop();
      return false;
    }
    void this.play();
    this.keepChannel(channel.closed).catch(() => { /* 중단 */ });
    return true;
  }

  stop(): void {
    this.abort.abort();
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close(1000);
  }

  // ---------- 접속 ----------

  private async get(path: string): Promise<void> {
    const res = await guardedFetch(`${this.world.origin}${path}`, { headers: { cookie: this.cookie }, signal: AbortSignal.timeout(ACTION_TIMEOUT_MS) });
    await res.body?.cancel();
  }

  /**
   * 실시간 채널을 열고 hello를 받으면 돌려준다. hello 전에 닫히면 종료 코드를 담아 던진다.
   * closed는 연결이 닫힐 때 그 종료 코드로 정해진다
   */
  private openChannel(): Promise<Channel> {
    const { origin, buildId, clientVersion } = this.world;
    const query = new URLSearchParams({ build: buildId, version: clientVersion });
    const url = `${origin.replace(/^http/, 'ws')}${LIVE_PATH}?${query}`;
    return new Promise((resolve, reject) => {
      const started = performance.now();
      const ws = new WebSocket(url, { headers: { cookie: this.cookie, origin }, handshakeTimeout: HELLO_TIMEOUT_MS });
      this.ws = ws;
      let onClosed: (code: number) => void = () => {};
      const closed = new Promise<number>((r) => { onClosed = r; });
      const timeout = setTimeout(() => { reject(new Error('hello 시간 초과')); ws.terminate(); }, HELLO_TIMEOUT_MS);
      ws.on('message', (data) => {
        const msg = this.parse(data.toString());
        if (!msg) return;
        if (msg.t === 'hello') {
          clearTimeout(timeout);
          this.uid = msg.you;
          this.connected = true;
          // 재연결 뒤에는 현재 위치를 처음부터 다시 보낸다(실제 클라이언트가 hello마다 하는 일)
          this.last = null;
          resolve({ helloMs: performance.now() - started, closed });
        }
        this.receive(msg);
      });
      ws.on('error', (e) => { clearTimeout(timeout); reject(e); });
      ws.on('close', (code) => {
        clearTimeout(timeout);
        if (this.connected && !this.abort.signal.aborted) this.world.stats().disconnects++;
        this.connected = false;
        reject(Object.assign(new Error(`연결 종료 ${code}`), { code }));
        onClosed(code);
      });
    });
  }

  /**
   * 채널이 닫히면 실제 클라이언트처럼 대기를 두 배씩 늘려 가며 다시 연결한다. 그동안 HTTP 낚시는 계속한다.
   * 낡은 빌드로 닫히면 HTTP 426처럼 실행을 멈추게 하고, 같은 계정의 다른 연결이 가져간 경우(4000)는 다시 붙지 않는다
   */
  private async keepChannel(firstClosed: Promise<number>): Promise<void> {
    let code = await firstClosed;
    for (;;) {
      this.down.begin(Date.now());
      let retryMs = RETRY_MIN_MS;
      for (;;) {
        if (code === LIVE_CLOSE_OUTDATED) { this.settleDowntime(); this.world.fatal('version-mismatch'); return; }
        if (code === LIVE_CLOSE_REPLACED) { this.settleDowntime(); return; }
        await this.sleep(retryMs);
        retryMs = nextRetryMs(retryMs);
        try {
          const channel = await this.openChannel();
          const stats = this.world.stats();
          stats.reconnects++;
          stats.downMs += this.down.end(Date.now());
          code = await channel.closed;
          break;
        } catch (e) {
          code = (e as { code?: number }).code ?? 0;
        }
      }
    }
  }

  // ---------- 받기 ----------

  private parse(raw: string): ServerMessage | null {
    try { return JSON.parse(raw) as ServerMessage; } catch { return null; }
  }

  private receive(msg: ServerMessage): void {
    const stats = this.world.stats();
    stats.received++;
    const now = performance.now();
    if (msg.t === 'move') {
      const d = this.world.clock.delay(msg.uid, msg, now);
      if (d !== null) stats.broadcastMs.add(d);
    } else if (msg.t === 'join') {
      const d = this.world.clock.delay(msg.presence.uid, msg.presence, now);
      if (d !== null) stats.broadcastMs.add(d);
    } else if (msg.t === 'chat' && msg.line.text.startsWith('lt:')) {
      stats.chatMs.add(Date.now() - Number(msg.line.text.slice(3)));
    } else if (msg.t === 'error' && msg.code === 'chat-guest') {
      stats.chatGuestRejected++;
      this.chatOff = true;
    }
  }

  // ---------- 보내기 ----------

  private send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** 송신 주기마다 부른다. 실제 클라이언트와 같은 판정으로 위치 메시지를 보낸다 */
  private flushPosition(): void {
    if (!this.connected) return;
    if (this.resultAt === null) delete this.pos.idleMs;
    else this.pos.idleMs = Date.now() - this.resultAt;
    const next = nextPositionMessage(this.last, this.pos);
    this.last = next.sent;
    if (!next.msg) return;
    if (next.msg.t === 'move') this.world.clock.mark(this.uid, next.msg, performance.now());
    this.send(next.msg);
  }

  private scheduleChat(): void {
    if (this.world.chatRate <= 0) return;
    const every = 60_000 / this.world.chatRate;
    const tick = async (): Promise<void> => {
      await delay(between(every * 0.5, every * 1.5), undefined, { signal: this.abort.signal });
      if (this.chatOff) return;
      this.world.stats().chatSent++;
      this.send({ t: 'chat', text: `lt:${Date.now()}` });
      await tick();
    };
    tick().catch(() => { /* 중단 */ });
  }

  /** 액션 하나를 보내고 상태 코드와 본문을 돌려준다. 네트워크 실패와 시간 초과는 상태 대신 이름으로 기록한다 */
  private async post(action: object): Promise<{ status: number; body: CatchBody }> {
    const started = performance.now();
    let status = 0;
    let label: string;
    let body: CatchBody = null;
    try {
      const res = await guardedFetch(`${this.world.origin}/api/action`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json', cookie: this.cookie, origin: this.world.origin,
          'x-build-id': this.world.buildId, 'x-client-version': this.world.clientVersion, 'x-client-id': this.clientId,
        },
        body: JSON.stringify(action),
        signal: AbortSignal.timeout(ACTION_TIMEOUT_MS),
      });
      status = res.status;
      label = String(res.status);
      body = await res.json().catch(() => null) as CatchBody;
    } catch (e) {
      label = e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : 'network';
    }
    this.world.stats().recordAction(label, performance.now() - started);
    if (status === 426) this.world.fatal('version-mismatch');
    return { status, body };
  }

  // ---------- 낚시 ----------

  private async play(): Promise<void> {
    this.timers.push(setInterval(() => this.flushPosition(), LIVE_MOVE_MS));
    this.timers.push(setInterval(() => this.send({ t: 'ping' }), LIVE_PING_MS));
    this.scheduleChat();
    try {
      for (;;) {
        await this.goToSchool();
        const until = Date.now() + between(...STAY_MS);
        while (Date.now() < until) await this.catchCycle();
        this.pos = { ...this.pos, line: false, bob: null };
        this.resultAt = null;
      }
    } catch {
      /* 중단 */
    }
  }

  private sleep(ms: number): Promise<void> {
    return delay(ms, undefined, { signal: this.abort.signal });
  }

  /** 어군 가까이 걸어가서 줄을 던진다 */
  private async goToSchool(): Promise<void> {
    const school = V_SCHOOLS[Math.floor(Math.random() * V_SCHOOLS.length)] as (typeof V_SCHOOLS)[number];
    const angle = Math.random() * 2 * Math.PI;
    const reach = Math.random() * (CAST_RANGE * 0.7);
    const to = { x: school.x + Math.cos(angle) * reach, y: school.y + Math.sin(angle) * reach };
    const stepPx = WALK_SPEED * (LIVE_MOVE_MS / 1000);
    for (;;) {
      const dx = to.x - this.pos.x;
      const dy = to.y - this.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= stepPx) { this.pos = { ...this.pos, x: to.x, y: to.y }; break; }
      this.pos = { ...this.pos, x: this.pos.x + (dx / dist) * stepPx, y: this.pos.y + (dy / dist) * stepPx };
      await this.sleep(LIVE_MOVE_MS);
    }
    await this.sleep(between(300, 1000));
    this.spot = school.spot;
    this.pos = { ...this.pos, line: true, bob: { x: school.x, y: school.y } };
    // 던지는 순간의 워밍 핑. 결과는 쓰지 않는다
    guardedFetch(`${this.world.origin}/api/action`, { signal: AbortSignal.timeout(ACTION_TIMEOUT_MS) })
      .then(r => r.body?.cancel(), () => { /* 워밍 실패는 무시 */ });
  }

  /** 입질 대기 → 판정 → catch → 획득 표시. 줄은 그대로 두고 자동으로 다시 던진다 */
  private async catchCycle(): Promise<void> {
    const bite = effectiveBite(START_STATE, this.spot);
    await this.sleep(between(bite.min.value, bite.max.value) * 1000);
    const sweepMs = rodAxes(START_STATE).sweep.value * 1000;
    let judgment: 'auto' | 'perfect' | 'good' | 'normal' = 'auto';
    if (this.idle) {
      await this.sleep(sweepMs);
    } else {
      const cursor = Math.random();
      await this.sleep(cursor * sweepMs);
      const zones = powerZones(START_STATE, this.spot);
      judgment = judgeTiming(cursor, zones.yellow / 100, zones.red / 100);
    }
    const { status, body } = await this.post({ type: 'catch', spot: this.spot, judgment });
    if (status !== 200) { await this.sleep(RECAST_MS); return; }
    this.resultAt ??= Date.now();
    const rarity = FISH.find(f => f.id === body?.result?.fishId)?.rarity;
    await this.sleep(phaseDurationMs('catch', START_STATE.rod, undefined, rarity));
  }
}
