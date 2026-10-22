// 우편 구역 — 플레이어에게 우편(제목·본문·골드)을 보내고, 최근 보낸 우편의 읽음·받음을 본다.
// 보내기는 미리보기로 대상 수와 골드 합계를 확인한 뒤에만 열린다. 운영 스크립트(pnpm mail:send)와 같은 서버 모듈을 쓴다.
import { useState } from 'react';
import Button from '../../../ui/Button';
import DataTable from '../../../ui/DataTable';
import Field from '../../../ui/Field';
import { fmtGold } from '../../../ui/format';
import Note from '../../../ui/Note';
import SubTabs from '../../../ui/SubTabs';
import TextArea from '../../../ui/TextArea';
import TextInput from '../../../ui/TextInput';
import { useDialogs } from '../../../ui/useDialogs';
import { fmtDT } from '../../../../features/admin/model/metrics';
import { MAIL_PROBLEM_TEXT, parseRecipients } from '../../../../features/admin/model/mailDraft';
import { readAdminMails } from '../../../../features/admin/service/queries';
import type { writeAdminMail } from '../../../../features/admin/service/queries';
import { useAdminMailWriter } from '../../../../features/admin/service/useAdminMail';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { Cell, CellGrid, TabState } from '../layout';

type TargetKind = 'users' | 'all';
type Plan = Awaited<ReturnType<typeof writeAdminMail>>;
const EMPTY: Awaited<ReturnType<typeof readAdminMails>> = [[], []];

export default function MailTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const writeMail = useAdminMailWriter();
  const { data, loading, error, refresh } = useAdminQuery(adminKeys.mails, readAdminMails, granted);
  const [mails, users] = data ?? EMPTY;
  const { confirm, dialogs } = useDialogs();

  const [kind, setKind] = useState<TargetKind>('users');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [recipientText, setRecipientText] = useState('');
  const [allGold, setAllGold] = useState('0');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const parsed = parseRecipients(recipientText);
  const gold = Number(allGold);
  const request = {
    title, body,
    target: kind === 'all' ? { kind: 'all' as const, gold } : { kind: 'users' as const, recipients: parsed.recipients },
  };
  const inputBad = kind === 'users' ? parsed.badLines.length > 0 : !Number.isSafeInteger(gold) || gold < 0;
  // 입력이 바뀌면 이전 미리보기는 무효다
  const edit = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPlan(null); setFailure(null); setDone(null); };

  const run = async (op: 'preview' | 'send') => {
    setBusy(true);
    setFailure(null);
    setDone(null);
    try {
      const result = await writeMail(op, request);
      setPlan(op === 'send' ? null : result);
      if (op === 'send') {
        if (result.problems.length > 0) {
          // 거절되면 입력을 남겨 고칠 수 있게 한다
          setFailure(result.problems.map(p => MAIL_PROBLEM_TEXT[p]).join(' '));
        } else {
          setTitle(''); setBody(''); setRecipientText(''); setAllGold('0');
          setDone(`${result.sent ?? 0}통을 보냈어요. 골드 합계 ${fmtGold(result.preview?.totalGold ?? 0)}.`);
        }
      }
    } catch (e) {
      setFailure(String((e as { message?: unknown }).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!plan?.preview) return;
    const ok = await confirm({
      layer: 'app', title: '우편 보내기', confirmLabel: '보내기',
      body: `${plan.preview.count}명에게 보내요. 골드 합계 ${fmtGold(plan.preview.totalGold)}. 보낸 우편은 되돌릴 수 없어요.`,
    });
    if (ok) await run('send');
  };

  const labelOf = (uid: string): string => users.find(u => u.user_id === uid)?.email ?? `${uid.slice(0, 8)}…`;

  return (
    <>
      <TabState loading={loading && granted} error={error} onRetry={refresh} />
      {!granted && <Note className="my-0">운영 DB에 연결하거나 admins에 등록하면 채워져요.</Note>}
      <CellGrid side>
        <Cell title="보낸 우편">
          <div className="pf-scroll-panel max-h-[560px] overflow-auto px-1">
            <DataTable>
              <thead>
                <tr>
                  <th className="text-left">시각</th>
                  <th className="text-left">받는 사람</th>
                  <th className="text-left">제목</th>
                  <th className="text-right">골드</th>
                  <th className="text-left">상태</th>
                </tr>
              </thead>
              <tbody>
                {mails.map(m => (
                  <tr key={m.id}>
                    <td className="text-2xs text-text-dim whitespace-nowrap">{fmtDT(m.createdAt)}</td>
                    <td className="text-xs">{labelOf(m.userId)}</td>
                    <td className="text-xs">{m.title}</td>
                    <td className="text-xs text-right">{m.gold > 0 ? fmtGold(m.gold) : '–'}</td>
                    <td className="text-xs text-text-dim">{m.claimedAt ? '받음' : m.readAt ? '읽음' : '안 읽음'}</td>
                  </tr>
                ))}
                {mails.length === 0 && (
                  <tr><td colSpan={5} className="text-text-dim text-center py-3">보낸 우편이 없어요.</td></tr>
                )}
              </tbody>
            </DataTable>
          </div>
        </Cell>
        <Cell title="우편 쓰기">
          <div className="flex flex-col gap-3">
            <SubTabs items={[{ key: 'users', label: '지정 계정' }, { key: 'all', label: '전체 플레이어' }]}
                     activeKey={kind} onSelect={edit(setKind)} />
            <Field label="제목">
              <TextInput value={title} maxLength={60} onChange={e => edit(setTitle)(e.target.value)} />
            </Field>
            <Field label="본문">
              <TextArea rows={5} value={body} maxLength={2000} onChange={e => edit(setBody)(e.target.value)} />
            </Field>
            {kind === 'users' ? (
              <Field label="받는 사람(한 줄에 '계정 id 골드')"
                     error={parsed.badLines.length > 0 ? `형식이 틀린 줄: ${parsed.badLines.join(', ')}` : undefined}>
                <TextArea rows={5} value={recipientText} onChange={e => edit(setRecipientText)(e.target.value)}
                          className="font-mono text-xs" />
              </Field>
            ) : (
              <Field label="한 사람당 골드" hint="저장 상태가 있고 제재되지 않은 모든 계정에 보내요.">
                <TextInput inputMode="numeric" value={allGold} onChange={e => edit(setAllGold)(e.target.value)} />
              </Field>
            )}
            {plan && plan.problems.length > 0 && (
              <Note tone="warn" className="my-0">{plan.problems.map(p => MAIL_PROBLEM_TEXT[p]).join(' ')}</Note>
            )}
            {plan?.preview && (
              <Note className="my-0">
                {`대상 ${plan.preview.count}명, 골드 합계 ${fmtGold(plan.preview.totalGold)}.`}
                {plan.preview.missing.length > 0 && ` 계정이 없어 빠지는 대상 ${plan.preview.missing.length}명.`}
              </Note>
            )}
            {failure && <Note tone="warn" className="my-0">{failure}</Note>}
            {done && <Note className="my-0">{done}</Note>}
            <div className="flex gap-2">
              <Button size="sm" disabled={!granted || busy || inputBad} onClick={() => void run('preview')}>미리보기</Button>
              <Button size="sm" variant="primary" disabled={!granted || busy || !plan?.preview || plan.preview.count === 0}
                      onClick={() => void send()}>보내기</Button>
            </div>
          </div>
        </Cell>
      </CellGrid>
      {dialogs}
    </>
  );
}
