import { useRef, useState } from 'react';
import { SETTING_PROMPTS } from '../../../../features/announcements/model/whatsNew';
import {
  ALERT_COPY, ALERT_DENIED_TEXT, ALERT_DENIED_TOAST, ALERT_ORDER, PERMISSION_BLOCK_LINES, PERMISSION_LABEL, PERMISSION_TIP,
} from '../../../../features/alerts/model/alerts';
import type { AlertKind, NotificationPermissionState } from '../../../../features/alerts/model/alerts';
import { useAlertSettings } from '../../../../features/alerts/service/alertSettings';
import type { AlertToggle } from '../../../../features/alerts/service/alertSettings';
import { setToastEnabled, useToastEnabled } from '../../../../features/display/service/toastEnabled';
import { sendNotice } from '../../../../features/display/model/toastPolicy';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import type { GameAction } from '../../../../game/rules/actions';
import { REJECT_TEXT } from '../../../../game/rules/rules';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import Inset from '../../../ui/Inset';
import KeyValueRow from '../../../ui/KeyValueRow';
import Modal from '../../../ui/Modal';
import SectionTitle from '../../../ui/SectionTitle';
import Tip, { TipCard } from '../../../ui/Tip';
import ToggleChip from '../../../ui/ToggleChip';
import type { Notify } from '../../../ui/hud/messageFeed';
import { PromptChoices } from '../whats-new/SettingsStep';

const FISH_ART = SETTING_PROMPTS.find(p => p.id === 'fish-art')!;

const AUTO_LOCK_HINT = [
  '어종과 돌연변이별로 더 큰 물고기를 낚으면 자동으로 잠그고 기존 자동 잠금을 풀어요.',
  '직접 잠근 물고기는 그대로 유지돼요.',
] as const;
const PERMISSION_TONE = { granted: 'accent', default: 'dim', denied: 'danger', unsupported: 'dim' } as const;
const FLOATING_TOAST_HINT = [
  '중요한 획득, 업적, 의뢰, 길드 알림을 화면 아래 1줄 알림으로 함께 띄워요.',
  '꺼도 메시지 창 기록은 그대로 남아요.',
] as const;

function AlertRow({ kind, toggle, blocked, blockedLines }: {
  kind: AlertKind;
  toggle: AlertToggle;
  /** 권한이 없으면 토글을 흐리게 둔다 */
  blocked: boolean;
  /** 권한 때문에 켜고 끌 수 없을 때의 이유 줄. 있으면 이유를 툴팁으로 보인다 */
  blockedLines: readonly string[] | undefined;
}) {
  const { label, hint } = ALERT_COPY[kind];
  const chip = (
    <ToggleChip pressed={toggle.on} disabled={blocked} aria-label={label}
                onClick={() => { if (toggle.on) toggle.disable(); else void toggle.enable(); }}>
      {toggle.on ? '켜짐' : '꺼짐'}
    </ToggleChip>
  );
  return (
    <KeyValueRow label={<Tip text={<TipCard title={label} description={hint} />}>{label}</Tip>} value=""
                 action={blockedLines
                   ? (
                     <Tip wraps text={(
                       <TipCard
                         title={label}
                         badge={<Badge tone="dim-plain" size="2xs">차단</Badge>}
                         status={{ tone: 'warn', lines: blockedLines }}
                       />
                     )}>
                       {chip}
                     </Tip>
                   )
                   : chip} />
  );
}

/** 브라우저 알림 권한 줄 - 상태를 꼬리표로 보이고, 허용 전이면 허용 버튼을 둔다. 차단됨과 지원 안 함은 꼬리표가 이유를 툴팁으로 연다 */
function PermissionRow({ permission, onAllow }: { permission: NotificationPermissionState; onAllow: () => void }) {
  const tag = <Badge tone={PERMISSION_TONE[permission]} size="xs">{PERMISSION_LABEL[permission]}</Badge>;
  const lines = PERMISSION_BLOCK_LINES[permission];
  return (
    <KeyValueRow label={<Tip text={PERMISSION_TIP}>브라우저 알림</Tip>} value=""
                 action={(
                   <>
                     {lines
                       ? (
                         <Tip plain text={(
                           <TipCard title="브라우저 알림" badge={<Badge tone={PERMISSION_TONE[permission]} size="2xs">{PERMISSION_LABEL[permission]}</Badge>}
                                    status={{ tone: 'warn', lines }} />
                         )}>
                           {tag}
                         </Tip>
                       )
                       : tag}
                     {permission === 'default' && <Button size="sm" variant="primary" onClick={onAllow}>허용</Button>}
                   </>
                 )} />
  );
}

// 설정 창 — 화면(물고기 그래픽), 가방(낚을 때 자동 잠금), 알림. 값은 창 안에서 바로 고르고 고르는 즉시 적용된다.
// 물고기 그래픽 질문 정의는 소식 창의 새 설정과 같은 것을 써서 문구, 선택지, 미리보기가 어긋나지 않는다.
export default function SettingsModal({ autoLockOnCatch, dispatch, setToast, onClose }: {
  autoLockOnCatch: boolean;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
  onClose: () => void;
}) {
  const alerts = useAlertSettings();
  const { permission } = alerts;
  const toastEnabled = useToastEnabled();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const blocked = permission !== 'granted';
  const allowAll = () => {
    void alerts.allowAll().then(next => {
      if (next === 'denied') sendNotice(setToast, { kind: 'system.modalRejected', text: ALERT_DENIED_TEXT, toastText: ALERT_DENIED_TOAST });
    });
  };
  const hint = '다른 화면을 보고 있을 때 브라우저 알림과 탭 제목 깜빡임으로 알려 줘요.';
  // 상태 변경 토글 in-flight 가드 — 응답을 기다리는 동안 중복 요청을 막고, 인프라 실패는 전역 구독으로 흘려보낸다
  const toggleAutoLock = () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const finish = () => { busyRef.current = false; setBusy(false); };
    const handle = (r: DispatchResult) => {
      finish();
      if (r.status === 'rejected') sendNotice(setToast, { kind: 'system.modalRejected', text: REJECT_TEXT[r.error] });
    };
    const res = dispatch({ type: 'setAutoLockOnCatch', on: !autoLockOnCatch });
    if (res instanceof Promise) {
      void res.then(handle, err => { finish(); throw err; });
    } else {
      handle(res);
    }
  };
  return (
    <Modal layer="app" title="설정" narrow onClose={onClose}>
      <PromptChoices prompt={FISH_ART} describeInTip />
      <SectionTitle>가방</SectionTitle>
      <Inset divided>
        <KeyValueRow
          label={<Tip text={<TipCard title="낚을 때 자동 잠금" bullets={AUTO_LOCK_HINT} />}>낚을 때 자동 잠금</Tip>}
          value=""
          action={(
            <ToggleChip pressed={autoLockOnCatch} disabled={busy} aria-label="낚을 때 자동 잠금" onClick={toggleAutoLock}>
              {autoLockOnCatch ? '켜짐' : '꺼짐'}
            </ToggleChip>
          )}
        />
      </Inset>
      <SectionTitle>
        <Tip text={hint}>알림</Tip>
      </SectionTitle>
      <Inset divided>
        <KeyValueRow
          label={<Tip text={<TipCard title="주요 화면 알림" bullets={FLOATING_TOAST_HINT} />}>주요 화면 알림</Tip>}
          value=""
          action={(
            <ToggleChip pressed={toastEnabled} aria-label="주요 화면 알림" onClick={() => setToastEnabled(!toastEnabled)}>
              {toastEnabled ? '켜짐' : '꺼짐'}
            </ToggleChip>
          )}
        />
        <PermissionRow permission={permission} onAllow={allowAll} />
        {ALERT_ORDER.map(kind => (
          <AlertRow key={kind} kind={kind} toggle={alerts[kind]} blocked={blocked} blockedLines={PERMISSION_BLOCK_LINES[permission]} />
        ))}
      </Inset>
    </Modal>
  );
}
