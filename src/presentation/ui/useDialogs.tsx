import { useState } from 'react';
import type { ReactNode } from 'react';
import ConfirmDialog from './ConfirmDialog';
import InputDialog from './InputDialog';
import NoticeDialog from './NoticeDialog';

type Pending =
  | { kind: 'confirm'; title: string; body: ReactNode; confirmLabel: string; resolve: (ok: boolean) => void }
  | { kind: 'input'; title: string; body?: ReactNode; label: string; placeholder?: string; confirmLabel: string; resolve: (v: string | null) => void }
  | { kind: 'notice'; title: string; body: ReactNode; value?: string; resolve: () => void };

/** 게임 대화상자 — 브라우저 confirm·prompt·alert 대신 쓴다. 각 함수는 사용자가 답할 때까지 기다리는 Promise를
 *  돌려주므로 호출 흐름은 그대로 두고 `if (!(await confirm(...))) return;`처럼 쓴다.
 *  돌려받은 dialogs를 화면 어딘가(보통 맨 끝)에 렌더해야 창이 뜬다. */
export function useDialogs() {
  const [pending, setPending] = useState<Pending | null>(null);
  const close = () => setPending(null);

  const confirm = (o: { title: string; body: ReactNode; confirmLabel: string }) =>
    new Promise<boolean>(resolve => setPending({ kind: 'confirm', ...o, resolve }));
  const input = (o: { title: string; body?: ReactNode; label: string; placeholder?: string; confirmLabel: string }) =>
    new Promise<string | null>(resolve => setPending({ kind: 'input', ...o, resolve }));
  const notice = (o: { title: string; body: ReactNode; value?: string }) =>
    new Promise<void>(resolve => setPending({ kind: 'notice', ...o, resolve }));

  const dialogs = !pending ? null
    : pending.kind === 'confirm' ? (
      <ConfirmDialog title={pending.title} confirmLabel={pending.confirmLabel}
                     onConfirm={() => { close(); pending.resolve(true); }}
                     onCancel={() => { close(); pending.resolve(false); }}>
        <div className="text-sm leading-relaxed whitespace-pre-line">{pending.body}</div>
      </ConfirmDialog>
    ) : pending.kind === 'input' ? (
      <InputDialog title={pending.title} body={pending.body} label={pending.label} placeholder={pending.placeholder}
                   confirmLabel={pending.confirmLabel}
                   onSubmit={v => { close(); pending.resolve(v); }}
                   onCancel={() => { close(); pending.resolve(null); }} />
    ) : (
      <NoticeDialog title={pending.title} body={pending.body} value={pending.value}
                    onClose={() => { close(); pending.resolve(); }} />
    );

  return { confirm, input, notice, dialogs };
}
