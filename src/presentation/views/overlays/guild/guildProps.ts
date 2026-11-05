import type { GuildConfirm, GuildInfo, GuildOp } from '../../../../features/guild/model/guild';
import type { Notify } from '../../../ui/hud/messageFeed';

// 길드 창 조각들이 함께 받는 속성. 요청은 창이 보내고, 조각은 요청과 확인 창을 창에 넘기기만 한다.

/** 요청 하나를 보낸다 — 거부나 연결 실패면 안내 문장, 성공하면 null */
export type GuildRun = (op: GuildOp) => Promise<string | null>;

/** 확인 창을 띄운다 — 확정하면 창이 그 요청을 보내고 결과를 알린다 */
export type GuildAsk = (confirm: GuildConfirm) => void;

/** 길드가 있을 때 조각들이 받는 공통 속성 */
export interface GuildPartProps {
  guild: GuildInfo;
  /** 내 uid */
  me: string;
  /** 요청을 보내는 중이면 동작 버튼을 막는다 */
  busy: boolean;
  run: GuildRun;
  setToast: Notify;
}
