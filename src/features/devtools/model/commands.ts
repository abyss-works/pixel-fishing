// 개발 도구 명령 목록 — 패널이 이 목록을 읽어 버튼·입력칸을 그린다.
// 서버 명령(debug 액션)의 화면 정의만 둔다. 명령의 계산은 게임 규칙(reduceDebug)이,
// 허용 판정은 서버가 맡는다. 선택지는 기존 콘텐츠 표에서 만든다(복제 금지).
import { DEBUG_ZONES } from '../../../game/rules/debug';
import type { DebugCommandId } from '../../../game/rules/debug';
import { zoneById } from '../../../game/content/zones';
import { selectAdminBoatOptions } from '../../admin/model/stats';

export type DevGroup = 'state' | 'bounty';

export const DEV_GROUP_LABEL: Record<DevGroup, string> = { state: '상태', bounty: '수배' };

export interface DevOption { value: string; label: string }

export type DevParam =
  | { key: string; label: string; kind: 'int' }
  | { key: string; label: string; kind: 'select'; options: () => DevOption[] };

export interface DevCommand {
  id: DebugCommandId;
  group: DevGroup;
  label: string;
  hint: string;
  params: DevParam[];
}

/** 수배 구역 선택지 — 라이선스 명성 표의 구역을 구역 짧은 이름으로 */
export const devZoneOptions = (): DevOption[] =>
  DEBUG_ZONES.map(zone => ({ value: zone, label: zoneById(zone)?.shortName ?? zone }));

const boatOptions = (): DevOption[] =>
  selectAdminBoatOptions().map(b => ({ value: String(b.tier), label: `${b.tier} · ${b.name}` }));

const zoneParam: DevParam = { key: 'zone', label: '구역', kind: 'select', options: devZoneOptions };

export const DEV_COMMANDS: readonly DevCommand[] = [
  {
    id: 'stats.set', group: 'state', label: '스탯 설정', hint: '빈 칸은 그대로 둔다.',
    params: [
      { key: 'gold', label: '골드', kind: 'int' },
      { key: 'fame', label: '명성', kind: 'int' },
      { key: 'rod', label: '낚싯대 Lv', kind: 'int' },
      { key: 'boat', label: '배', kind: 'select', options: boatOptions },
    ],
  },
  {
    id: 'dex.completeZone', group: 'state', label: '구역 도감 채우기',
    hint: '네임드 라이선스 도감 조건이 비었다고 보는 어종을 1마리씩 채운다.',
    params: [zoneParam],
  },
  {
    id: 'bounty.grantMaterial', group: 'bounty', label: '교환 재료 지급',
    hint: '구역 유물의 교환 재료 1개.', params: [zoneParam],
  },
  {
    id: 'bounty.ticketNearExpiry', group: 'bounty', label: '흔적 만료 직전',
    hint: '보유 도전권을 만료 1분 전으로 옮긴다.', params: [],
  },
  { id: 'bounty.clearTickets', group: 'bounty', label: '흔적 지우기', hint: '도전권을 모두 지운다.', params: [] },
  {
    id: 'bounty.resetToday', group: 'bounty', label: '오늘 클리어 초기화',
    hint: '오늘 클리어 기록을 지워 일일 한도를 되돌린다.', params: [],
  },
  { id: 'bounty.clearProgress', group: 'bounty', label: '진행 의뢰 정리', hint: '진행 중 의뢰를 모두 지운다.', params: [] },
];

/** 입력칸 문자열 → 명령 인자. 정수 칸은 내림, 빈 칸은 보내지 않는다. 숫자가 아니면 거부 */
export function parseDevArgs(
  command: DevCommand, raw: Record<string, string>,
): { ok: true; args: Record<string, unknown> } | { ok: false } {
  const args: Record<string, unknown> = {};
  for (const param of command.params) {
    const text = (raw[param.key] ?? '').trim();
    if (text === '') continue;
    if (param.kind === 'int' || param.key === 'boat') {
      const n = Math.floor(Number(text));
      if (!Number.isFinite(n)) return { ok: false };
      args[param.key] = n;
    } else {
      args[param.key] = text;
    }
  }
  return { ok: true, args };
}
