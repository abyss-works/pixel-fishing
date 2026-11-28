// 시각 효과 재생 요청 창구와 중재자 저장소. 흐름은 사건을 요청으로 넣기만 하고,
// 렌더러(잡기 결과 카드, PiP, 필드 캔버스)는 여기서 중재된 지시를 읽어 그린다.
import { useSyncExternalStore } from 'react';
import type { JumpFx } from '../../../game/rendering/pixel/sprites/overlays';
import type { FieldFxFrame } from '../../../game/runtime/fieldEngine';
import { JUMP_S } from '../../../game/rendering/pixel/sprites/schoolView';
import { createFxMediatorState, mediateFx } from '../model/fxPolicy';
import type { FxDirective, FxMediatorState, FxRenderer, FxRequest } from '../model/fxPolicy';
import type { FxEventKind } from '../model/toastPolicy';
import { getReducedMotion } from './reducedMotion';

/** 동시에 남길 다른 플레이어 포획 지시 수 */
const MAX_PEER_FIELD_DIRECTIVES = 12;
const JUMP_MS = JUMP_S * 1000;

type DomRenderer = Exclude<FxRenderer, 'field'>;

let mediator: FxMediatorState = createFxMediatorState();
const latest: Record<DomRenderer, FxDirective | null> = { 'catch-card': null, pip: null };
let fieldDirectives: FxDirective[] = [];
let windowsOpen: () => boolean = () => false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

const isPeer = (d: FxDirective): boolean => d.request.kind === 'live.peerCatch';

export function requestFx(request: FxRequest): void {
  const result = mediateFx(mediator, request, {
    windowsOpen: windowsOpen(),
    reducedMotion: getReducedMotion(),
    jumpMs: JUMP_MS,
  });
  mediator = result.state;
  let domChanged = false;
  for (const directive of result.directives) {
    if (directive.renderer === 'field') {
      fieldDirectives.push(directive);
    } else {
      latest[directive.renderer] = directive;
      domChanged = true;
    }
  }
  const peers = fieldDirectives.filter(isPeer);
  if (peers.length > MAX_PEER_FIELD_DIRECTIVES) {
    const dropped = new Set(peers.slice(0, peers.length - MAX_PEER_FIELD_DIRECTIVES));
    fieldDirectives = fieldDirectives.filter(d => !dropped.has(d));
  }
  if (domChanged) notify();
}

export function subscribeFx(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** 그 렌더러의 유효한 최신 지시. 만료됐으면 null */
export function getFxDirective(renderer: DomRenderer): FxDirective | null {
  const directive = latest[renderer];
  return directive && directive.endsAt > Date.now() ? directive : null;
}

export function useFxDirective(renderer: DomRenderer): FxDirective | null {
  return useSyncExternalStore(subscribeFx, () => getFxDirective(renderer), () => null);
}

/** 그 지역에서 아직 유효한 필드 지시. 만료된 지시는 이 때 정리한다 */
export function activeFieldDirectives(region: string, wallMs: number): FxDirective[] {
  fieldDirectives = fieldDirectives.filter(d => d.endsAt > wallMs);
  return fieldDirectives.filter(d => d.request.subject.region === region && d.startAt <= wallMs);
}

function jumpOf(d: FxDirective, wallMs: number): JumpFx {
  const t = (wallMs - d.startAt) / 1000;
  const { subject } = d.request;
  const target = subject.to ? { toX: subject.to.x, toY: subject.to.y } : {};
  const form = subject.form !== undefined ? { form: subject.form } : {};
  return { x: subject.from.x, y: subject.from.y, ...target, fishId: subject.fishId, ...form, t, intensity: d.intensity, reducedMotion: d.reducedMotion };
}

/** 엔진 주입용. 그 지역의 유효한 필드 지시를 점프로 바꿔 내 것과 다른 플레이어 것으로 나눈다 */
export function fieldFxFrame(region: string, wallMs: number): FieldFxFrame {
  const active = activeFieldDirectives(region, wallMs);
  return {
    reducedMotion: getReducedMotion(),
    localJumps: active.filter(d => !isPeer(d)).map(d => jumpOf(d, wallMs)),
    peerJumps: active.filter(isPeer).map(d => jumpOf(d, wallMs)),
  };
}

/** 그 종류의 지시를 모두 비운다. 실시간 재접속과 초기화 때 쓴다 */
export function clearFx(kind: FxEventKind): void {
  fieldDirectives = fieldDirectives.filter(d => d.request.kind !== kind);
  let domChanged = false;
  for (const renderer of ['catch-card', 'pip'] as const) {
    if (latest[renderer]?.request.kind === kind) { latest[renderer] = null; domChanged = true; }
  }
  if (domChanged) notify();
}

/** 앱 조립이 차단 창 판정을 묶는다. 묶기 전에는 창 없음으로 본다 */
export function bindFxEnvironment(env: { windowsOpen: () => boolean }): () => void {
  windowsOpen = env.windowsOpen;
  return () => { if (windowsOpen === env.windowsOpen) windowsOpen = () => false; };
}

/** 테스트 격리와 계정 교체 때 지시와 중재 상태를 비운다 */
export function resetFxPlayback(): void {
  mediator = createFxMediatorState();
  latest['catch-card'] = null;
  latest.pip = null;
  fieldDirectives = [];
  notify();
}
