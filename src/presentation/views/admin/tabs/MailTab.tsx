// 우편 구역 — 60:40 2열 작업대(좌 60% 칩 기반 수신자·작성 + 우 40% 실시간 수신 미리보기 및 최근 발송 요약)로 구성한다.
// 상세 보기에서는 하단에 전체 보낸 우편 상세 표를 펼친다. 보내기는 미리보기 확인 뒤에만 열린다.
import { useEffect, useMemo, useState } from 'react';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import DataTable from '../../../ui/DataTable';
import Field from '../../../ui/Field';
import { fmtGold } from '../../../ui/format';
import HatBadge from '../../../ui/HatBadge';
import Inset from '../../../ui/Inset';
import ItemBadge from '../../../ui/ItemBadge';
import Modal from '../../../ui/Modal';
import Note from '../../../ui/Note';
import SelectList from '../../../ui/SelectList';
import TextArea from '../../../ui/TextArea';
import TextInput from '../../../ui/TextInput';
import { useDialogs } from '../../../ui/useDialogs';
import { fmtDT } from '../../../../features/admin/model/metrics';
import {
  HAT_SOURCE_LABEL,
  MAIL_PROBLEM_TEXT,
  MAX_MAIL_BATCH_TOTAL_GOLD,
  STACKABLE_ITEM_KIND_LABEL,
  addMailHat,
  addRecipient,
  findStackableItem,
  formatMailHatsSummary,
  formatMailItemsSummary,
  parseRecipients,
  removeMailAttachment,
  removeMailHat,
  removeRecipient,
  resolveHatDisplay,
  searchAttachableHats,
  searchAttachableItems,
  searchRecipients,
  upsertMailAttachment,
} from '../../../../features/admin/model/mailDraft';
import type { MailItemAttachment } from '../../../../features/admin/model/mailDraft';
import { adminIdentityLookup, adminUserLabel } from '../../../../features/admin/model/adminViews';
import { filterSentMails, sentMailStatus } from '../../../../features/admin/model/sentMailView';
import { readAdminMails, readAdminUsers, searchAdminUsers } from '../../../../features/admin/service/queries';
import type { writeAdminMail } from '../../../../features/admin/service/queries';
import { useAdminMailWriter } from '../../../../features/admin/service/useAdminMail';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import type { AdminSentMailRow, AdminUserRow } from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { AdminCard, AdminQueueItem, AdminSplit, AdminTableWrap, TabState } from '../layout';
import SentMailCard from '../SentMailCard';
import UserIdentity from '../UserIdentity';
import { useAdminViewMode } from '../viewMode';
import MetricSwitch from '../widgets/MetricSwitch';

type TargetKind = 'users' | 'all';
type Plan = Awaited<ReturnType<typeof writeAdminMail>>;
const NO_MAILS: AdminSentMailRow[] = [];
const NO_USERS: AdminUserRow[] = [];
const RECENT_QUEUE_LIMIT = 6;
const TARGET_MODE_OPTIONS: readonly { key: TargetKind; label: string }[] = [
  { key: 'users', label: '특정 플레이어' },
  { key: 'all', label: '전체 플레이어' },
];
const newDraftKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function MailTab({ to = null }: {
  /** 받는 사람 입력에 미리 넣을 계정 id */
  to?: string | null;
}) {
  const { access, canViewEmail } = useAdminAuth();
  const { viewMode } = useAdminViewMode();
  const granted = access === 'granted';
  const writeMail = useAdminMailWriter();
  const mailsQuery = useAdminQuery(adminKeys.mails, readAdminMails, granted);
  const usersQuery = useAdminQuery(adminKeys.users, readAdminUsers, granted);
  const mails = mailsQuery.data ?? NO_MAILS;
  const users = usersQuery.data ?? NO_USERS;
  const loading = mailsQuery.loading || usersQuery.loading;
  const error = mailsQuery.error ?? usersQuery.error;
  const refresh = () => {
    mailsQuery.refresh();
    usersQuery.refresh();
  };
  const { confirm, dialogs } = useDialogs();

  const [kind, setKind] = useState<TargetKind>('users');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [recipientText, setRecipientText] = useState(() => (to ? addRecipient('', to) : ''));
  const [showBulkInput, setShowBulkInput] = useState(false);
  const [userDefaultGold, setUserDefaultGold] = useState('0');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [allGold, setAllGold] = useState('0');
  const [attachments, setAttachments] = useState<MailItemAttachment[]>([]);
  const [itemQuery, setItemQuery] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemError, setItemError] = useState<string | undefined>(undefined);
  const [hatAttachments, setHatAttachments] = useState<string[]>([]);
  const [hatQuery, setHatQuery] = useState('');
  const [hatError, setHatError] = useState<string | undefined>(undefined);
  const [idempotencyKey, setIdempotencyKey] = useState(newDraftKey);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [mailQuery, setMailQuery] = useState('');
  const [selectedMailId, setSelectedMailId] = useState<number | null>(null);

  useEffect(() => {
    const trimmed = search.trim();
    if (!trimmed) return;
    const timer = setTimeout(() => setDebouncedSearch(trimmed), 200);
    return () => clearTimeout(timer);
  }, [search]);

  const activeSearch = search.trim() ? debouncedSearch : '';
  const userSearchEnabled = granted && activeSearch.length > 0;
  const userSearchQuery = useAdminQuery(
    adminKeys.userSearch(activeSearch),
    () => searchAdminUsers(activeSearch, 15),
    userSearchEnabled,
  );

  const parsed = parseRecipients(recipientText);
  const gold = Number(allGold);
  const defaultGoldNum = Number(userDefaultGold);
  const request = {
    title, body,
    target: kind === 'all' ? { kind: 'all' as const, gold } : { kind: 'users' as const, recipients: parsed.recipients },
    ...(attachments.length > 0 ? { items: attachments } : {}),
    ...(hatAttachments.length > 0 ? { hats: hatAttachments } : {}),
    idempotencyKey,
  };
  const clientTotalGold = kind === 'users' ? parsed.recipients.reduce((sum, r) => sum + r.gold, 0) : null;
  const clientCapExceeded = clientTotalGold !== null && clientTotalGold > MAX_MAIL_BATCH_TOTAL_GOLD;
  const hasEmptyReward = attachments.length === 0
    && hatAttachments.length === 0
    && (kind === 'users' ? parsed.recipients.every(r => r.gold === 0) : gold === 0);
  const inputBad = kind === 'users'
    ? parsed.badLines.length > 0 || parsed.duplicates.length > 0
    : !Number.isSafeInteger(gold) || gold < 0;

  // 입력이 바뀌면 이전 미리보기와 멱등 키를 새로 만든다
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setIdempotencyKey(newDraftKey());
    setPlan(null);
    setFailure(null);
    setDone(null);
  };

  const run = async (op: 'preview' | 'send') => {
    setBusy(true);
    setFailure(null);
    setDone(null);
    const itemsSummary = attachments.length > 0 ? formatMailItemsSummary(attachments) : '';
    const hatsSummary = hatAttachments.length > 0 ? formatMailHatsSummary(hatAttachments) : '';
    try {
      const result = await writeMail(op, request);
      setPlan(op === 'send' ? null : result);
      if (op === 'send') {
        if (result.idempotent) {
          setDone('이미 발송이 완료된 우편 요청이에요. 중복 발송을 건너뛰었어요.');
        } else if (result.problems.length > 0) {
          const extraDupes = result.duplicates?.length ? ` (${result.duplicates.join(', ')})` : '';
          setFailure(`${result.problems.map(p => MAIL_PROBLEM_TEXT[p] ?? p).join(' ')}${extraDupes}`);
        } else {
          setTitle(''); setBody(''); setRecipientText(''); setAllGold('0'); setUserDefaultGold('0');
          setAttachments([]); setItemQuery(''); setItemQty('1'); setItemError(undefined);
          setHatAttachments([]); setHatQuery(''); setHatError(undefined);
          setIdempotencyKey(newDraftKey());
          const itemSuffix = itemsSummary ? `, 첨부 아이템 ${itemsSummary}` : '';
          const hatSuffix = hatsSummary ? `, 첨부 모자 ${hatsSummary}` : '';
          setDone(`${result.sent ?? 0}통을 보냈어요. 골드 합계 ${fmtGold(result.preview?.totalGold ?? 0)}${itemSuffix}${hatSuffix}.`);
        }
      }
    } catch (e) {
      const msg = String((e as { message?: unknown }).message ?? e);
      setFailure(msg.includes('duplicate-mail')
        ? '최근 10분 이내에 동일한 제목, 본문, 보상, 수신자로 보낸 우편이 있어 중복 발송을 막았어요.'
        : msg);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!plan?.preview || plan.preview.capExceeded || clientCapExceeded) return;
    const itemSuffix = attachments.length > 0 ? `, 첨부 아이템 ${formatMailItemsSummary(attachments)}` : '';
    const hatSuffix = hatAttachments.length > 0 ? `, 첨부 모자 ${formatMailHatsSummary(hatAttachments)}` : '';
    const ok = await confirm({
      layer: 'app', title: '우편 보내기', confirmLabel: '보내기',
      body: `${plan.preview.count}명에게 보내요. 골드 합계 ${fmtGold(plan.preview.totalGold)}${itemSuffix}${hatSuffix}. 보낸 우편은 되돌릴 수 없어요.`,
    });
    if (ok) await run('send');
  };

  const identityOf = adminIdentityLookup([...users, ...(userSearchQuery.data ?? NO_USERS)]);
  const filteredMails = useMemo(() => filterSentMails(mails, users, mailQuery), [mails, users, mailQuery]);
  const recentMails = useMemo(() => mails.slice(0, RECENT_QUEUE_LIMIT), [mails]);
  const selectedMail = selectedMailId === null ? null : (mails.find(m => m.id === selectedMailId) ?? null);
  const found = userSearchEnabled && userSearchQuery.data
    ? userSearchQuery.data.slice(0, 12)
    : searchRecipients(users, search);

  const pick = (uid: string) => {
    const initialGold = Number.isSafeInteger(defaultGoldNum) && defaultGoldNum >= 0 ? defaultGoldNum : 0;
    edit(setRecipientText)(addRecipient(recipientText, uid, initialGold));
    setSearch('');
  };
  const dropRecipient = (uid: string) => {
    edit(setRecipientText)(removeRecipient(recipientText, uid));
  };
  const applyDefaultGoldToAll = () => {
    if (!Number.isSafeInteger(defaultGoldNum) || defaultGoldNum < 0 || parsed.recipients.length === 0) return;
    const next = parsed.recipients.map(r => `${r.userId} ${defaultGoldNum}`).join('\n');
    edit(setRecipientText)(next);
  };

  const foundItems = searchAttachableItems(itemQuery);
  const pickItem = (id: string) => {
    const qty = Number(itemQty);
    const next = upsertMailAttachment(attachments, id, qty);
    if (next.error) {
      setItemError(next.error);
      return;
    }
    setItemError(undefined);
    edit(setAttachments)(next.items);
    setItemQuery('');
  };
  const removeItem = (id: string) => {
    setItemError(undefined);
    edit(setAttachments)(removeMailAttachment(attachments, id));
  };

  const foundHats = searchAttachableHats(hatQuery);
  const pickHat = (id: string) => {
    const next = addMailHat(hatAttachments, id);
    if (next.error) {
      setHatError(next.error);
      return;
    }
    setHatError(undefined);
    edit(setHatAttachments)(next.hats);
    setHatQuery('');
  };
  const removeHat = (id: string) => {
    setHatError(undefined);
    edit(setHatAttachments)(removeMailHat(hatAttachments, id));
  };

  const recipientError = [
    parsed.badLines.length > 0 ? `형식이 틀린 줄: ${parsed.badLines.join(', ')}` : null,
    parsed.duplicates.length > 0 ? `중복된 계정 id: ${parsed.duplicates.join(', ')}` : null,
  ].filter(Boolean).join(', ') || undefined;
  const visibleProblems = plan?.problems.filter(p => !(p === 'totalGold' && plan.preview?.capExceeded)) ?? [];

  return (
    <>
      <TabState loading={loading && granted} error={error} onRetry={refresh} />
      {!granted && <Note className="my-0">운영 DB에 연결하거나 admins에 등록하면 채워져요.</Note>}

      <AdminSplit variant="60-40" className="items-start">
        <AdminCard
          title="우편 쓰기"
          badge={<Badge tone="accent" size="xs">운영 한도 적용</Badge>}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <MetricSwitch
                value={kind}
                options={TARGET_MODE_OPTIONS}
                onChange={edit(setKind)}
                ariaLabel="발송 대상 선택"
              />
              {kind === 'users' && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-expanded={showBulkInput}
                  onClick={() => setShowBulkInput(prev => !prev)}
                >
                  {showBulkInput ? '대량 텍스트 입력 접기' : '대량 텍스트 입력'}
                </Button>
              )}
            </div>

            {kind === 'users' ? (
              <Inset tone="deep" className="flex flex-col gap-2.5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-text-dim">
                    {`수신 대상 선택 (${parsed.recipients.length}명)`}
                  </span>
                </div>

                {parsed.recipients.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5" aria-label="선택된 수신자 칩">
                    {parsed.recipients.map(r => {
                      const label = adminUserLabel(identityOf(r.userId));
                      return (
                        <span key={r.userId} className="inline-flex items-center gap-1">
                          <Badge tone="gold" size="xs">
                            {r.gold > 0 ? `${label} (${fmtGold(r.gold)})` : label}
                          </Badge>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => dropRecipient(r.userId)}
                            aria-label={`${label} 수신자 제거`}
                          >
                            x
                          </Button>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <Note size="2xs" className="my-0">
                    아래에서 플레이어를 검색해 선택하면 수신자 칩으로 추가돼요.
                  </Note>
                )}

                <Field
                  label="계정 찾기"
                  hint={canViewEmail
                    ? '닉네임, 이메일, UUID 일부를 입력하고 결과를 누르면 수신자 칩에 더해요.'
                    : '닉네임, UUID 일부를 입력하고 결과를 누르면 수신자 칩에 더해요.'}
                >
                  <TextInput
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={canViewEmail ? '닉네임, 이메일, UUID 검색' : '닉네임, UUID 검색'}
                  />
                </Field>
                {found.length > 0 && (
                  <SelectList
                    label="검색 결과"
                    items={found}
                    keyOf={u => u.user_id}
                    selectedKey=""
                    onSelect={pick}
                    renderItem={u => <UserIdentity inline user={u} />}
                  />
                )}
                {search.trim() !== '' && !(userSearchEnabled && userSearchQuery.loading) && found.length === 0 && (
                  <Note size="xs" className="my-0">찾는 계정이 없어요.</Note>
                )}

                {(showBulkInput || Boolean(recipientError)) && (
                  <Field label="받는 사람(한 줄에 '계정 id 골드')" error={recipientError}>
                    <TextArea
                      rows={4}
                      value={recipientText}
                      onChange={e => edit(setRecipientText)(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </Field>
                )}
              </Inset>
            ) : (
              <Inset tone="deep" border="gold" className="px-3 py-2 text-xs text-text-dim">
                전체 플레이어 발송 모드예요. 저장 상태가 있고 제재되지 않은 모든 계정에 보내요.
              </Inset>
            )}

            <Field label="제목">
              <TextInput value={title} maxLength={60} onChange={e => edit(setTitle)(e.target.value)} />
            </Field>
            <Field label="본문">
              <TextArea rows={4} value={body} maxLength={2000} onChange={e => edit(setBody)(e.target.value)} />
            </Field>

            <AdminSplit variant="3" className="items-start">
              <div className="flex flex-col gap-2">
                {kind === 'all' ? (
                  <Field label="한 사람당 골드" hint="0 이상 정수">
                    <TextInput inputMode="numeric" value={allGold} onChange={e => edit(setAllGold)(e.target.value)} />
                  </Field>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <Field label="골드 첨부" hint="새 칩 추가 시 기본 골드">
                      <TextInput
                        inputMode="numeric"
                        value={userDefaultGold}
                        onChange={e => setUserDefaultGold(e.target.value)}
                      />
                    </Field>
                    {parsed.recipients.length > 0 && (
                      <Button size="xs" variant="ghost" onClick={applyDefaultGoldToAll}>
                        선택된 {parsed.recipients.length}명 일괄 적용
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-[1fr_4.5rem] gap-1.5 items-start">
                  <Field label="첨부 아이템 찾기">
                    <TextInput
                      value={itemQuery}
                      onChange={e => setItemQuery(e.target.value)}
                      placeholder="이름 또는 종류"
                    />
                  </Field>
                  <Field label="첨부 수량" error={itemError}>
                    <TextInput
                      inputMode="numeric"
                      value={itemQty}
                      onChange={e => { setItemQty(e.target.value); setItemError(undefined); }}
                    />
                  </Field>
                </div>
                {foundItems.length > 0 && (
                  <SelectList
                    label="아이템 검색 결과"
                    items={foundItems}
                    keyOf={item => item.id}
                    selectedKey=""
                    onSelect={pickItem}
                    renderItem={item => (
                      <span className="flex items-center gap-2 min-w-0">
                        <Badge size="2xs">{STACKABLE_ITEM_KIND_LABEL[item.kind]}</Badge>
                        <ItemBadge id={item.id} />
                      </span>
                    )}
                  />
                )}
                {itemQuery.trim() !== '' && foundItems.length === 0 && (
                  <Note size="xs" className="my-0">찾는 아이템이 없어요.</Note>
                )}
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" aria-label="첨부된 아이템">
                    {attachments.map(att => (
                      <span key={att.id} className="inline-flex items-center gap-1">
                        <ItemBadge id={att.id} qty={att.qty} />
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => removeItem(att.id)}
                          aria-label={`${findStackableItem(att.id)?.name ?? att.id} 첨부 빼기`}
                        >
                          삭제
                        </Button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Field label="첨부 모자 찾기" error={hatError}>
                  <TextInput
                    value={hatQuery}
                    onChange={e => { setHatQuery(e.target.value); setHatError(undefined); }}
                    placeholder="모자 이름 또는 출처"
                  />
                </Field>
                {foundHats.length > 0 && (
                  <SelectList
                    label="모자 검색 결과"
                    items={foundHats}
                    keyOf={hat => hat.id}
                    selectedKey=""
                    onSelect={pickHat}
                    renderItem={hat => (
                      <span className="flex items-center gap-2 min-w-0">
                        <Badge size="2xs">{HAT_SOURCE_LABEL[hat.source]}</Badge>
                        <HatBadge id={hat.id} />
                      </span>
                    )}
                  />
                )}
                {hatQuery.trim() !== '' && foundHats.length === 0 && (
                  <Note size="xs" className="my-0">찾는 모자가 없어요.</Note>
                )}
                {hatAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" aria-label="첨부된 모자">
                    {hatAttachments.map(hatId => (
                      <span key={hatId} className="inline-flex items-center gap-1">
                        <HatBadge id={hatId} />
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => removeHat(hatId)}
                          aria-label={`${resolveHatDisplay(hatId).name} 첨부 빼기`}
                        >
                          삭제
                        </Button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </AdminSplit>

            {visibleProblems.length > 0 && (
              <Note tone="warn" className="my-0">
                {visibleProblems.map(p => MAIL_PROBLEM_TEXT[p] ?? p).join(' ')}
                {plan?.duplicates?.length ? ` (${plan.duplicates.join(', ')})` : ''}
              </Note>
            )}
            {plan?.preview && (
              <Note className="my-0">
                {`대상 ${plan.preview.recipientCount ?? plan.preview.count}명, 골드 합계 ${fmtGold(plan.preview.totalGold)}${attachments.length > 0 ? `, 1인당 첨부 아이템 ${formatMailItemsSummary(attachments)}` : ''}${hatAttachments.length > 0 ? `, 1인당 첨부 모자 ${formatMailHatsSummary(hatAttachments)}` : ''}.`}
                {plan.preview.missing.length > 0 && ` 계정이 없어 빠지는 대상 ${plan.preview.missing.length}명.`}
              </Note>
            )}
            {(plan?.preview?.capExceeded || clientCapExceeded) && (
              <Note tone="warn" className="my-0">
                {plan?.preview?.capExceeded
                  ? `총 지급 골드(${fmtGold(plan.preview.totalGold)})가 일괄 발송 상한(${fmtGold(plan.preview.maxTotalGold)})을 초과해 발송할 수 없어요.`
                  : `입력한 총 지급 골드(${fmtGold(clientTotalGold ?? 0)})가 일괄 발송 상한(${fmtGold(MAX_MAIL_BATCH_TOTAL_GOLD)})을 초과해 발송할 수 없어요.`}
              </Note>
            )}
            {failure && <Note tone="warn" className="my-0">{failure}</Note>}
            {done && <Note className="my-0">{done}</Note>}

            <div className="flex justify-end gap-2">
              <Button size="sm" disabled={!granted || busy || inputBad} onClick={() => void run('preview')}>미리보기</Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!granted || busy || !plan?.preview || plan.preview.count === 0 || plan.preview.capExceeded || clientCapExceeded || plan.problems.length > 0 || hasEmptyReward}
                onClick={() => void send()}
              >
                보내기
              </Button>
            </div>
          </div>
        </AdminCard>

        <div className="flex flex-col gap-3">
          <AdminCard title="실시간 수신 미리보기">
            <Inset tone="deep" border="gold" className="flex flex-col gap-2 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gold">{title.trim() || '제목 없음'}</span>
                <Badge tone="dim" size="2xs">
                  {kind === 'all' ? '전체 발송' : `${parsed.recipients.length}명 대상`}
                </Badge>
              </div>
              <p className="whitespace-pre-wrap text-xs text-text">
                {body.trim() || '본문을 입력하면 이곳에 미리보기가 표시돼요.'}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-line">
                {kind === 'all' && gold > 0 && <Badge tone="gold" size="xs">{fmtGold(gold)}</Badge>}
                {kind === 'users' && (clientTotalGold ?? 0) > 0 && (
                  <Badge tone="gold" size="xs">합계 {fmtGold(clientTotalGold ?? 0)}</Badge>
                )}
                {attachments.map(att => <ItemBadge key={att.id} id={att.id} qty={att.qty} />)}
                {hatAttachments.map(hatId => <HatBadge key={hatId} id={hatId} />)}
              </div>
            </Inset>
          </AdminCard>

          <AdminCard
            title="최근 발송 내역"
            badge={<Badge tone="dim" size="2xs">{`${mails.length}건`}</Badge>}
          >
            {recentMails.length > 0 ? (
              <div className="pf-admin-queue-list">
                {recentMails.map(m => {
                  const status = sentMailStatus(m);
                  return (
                    <AdminQueueItem key={m.id}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-text">{m.title}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs text-text-dim">
                          <UserIdentity inline user={identityOf(m.userId)} />
                          {m.gold > 0 && <span>{fmtGold(m.gold)}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge tone={status === '받음' ? 'gold' : 'dim'} size="2xs">{status}</Badge>
                        <Button size="xs" variant="ghost" onClick={() => setSelectedMailId(m.id)}>보기</Button>
                      </div>
                    </AdminQueueItem>
                  );
                })}
              </div>
            ) : (
              <Note size="xs" className="my-0">보낸 우편이 없어요.</Note>
            )}
          </AdminCard>
        </div>
      </AdminSplit>

      {viewMode === 'detail' && (
        <AdminCard
          title="보낸 우편 상세 내역"
          badge={<Badge tone="dim" size="2xs">{`${filteredMails.length}/${mails.length}건`}</Badge>}
          actions={(
            <TextInput
              value={mailQuery}
              onChange={e => setMailQuery(e.target.value)}
              placeholder="제목, 본문, 받는 사람 검색"
              className="w-[220px]"
              aria-label="보낸 우편 검색"
            />
          )}
        >
          <AdminTableWrap scroll>
            <DataTable className="pf-admin-table">
              <thead>
                <tr>
                  <th className="text-left">시각</th>
                  <th className="text-left">받는 사람</th>
                  <th className="text-left">제목</th>
                  <th className="text-right">골드</th>
                  <th className="text-left">아이템</th>
                  <th className="text-left">상태</th>
                  <th className="text-left">상세</th>
                </tr>
              </thead>
              <tbody>
                {filteredMails.map(m => {
                  const items = m.items ?? [];
                  const hats = m.hats ?? [];
                  return (
                    <tr key={m.id}>
                      <td className="text-2xs text-text-dim whitespace-nowrap">{fmtDT(m.createdAt)}</td>
                      <td><UserIdentity user={identityOf(m.userId)} /></td>
                      <td className="text-xs">{m.title}</td>
                      <td className="text-xs text-right">{m.gold > 0 ? fmtGold(m.gold) : '-'}</td>
                      <td className="text-xs">
                        {items.length > 0 || hats.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {items.map(att => <ItemBadge key={att.id} id={att.id} qty={att.qty} />)}
                            {hats.map(hatId => <HatBadge key={hatId} id={hatId} />)}
                          </div>
                        ) : <span className="text-text-dim">-</span>}
                      </td>
                      <td className="text-xs text-text-dim">{sentMailStatus(m)}</td>
                      <td>
                        <Button size="sm" variant="ghost" onClick={() => setSelectedMailId(m.id)}>보기</Button>
                      </td>
                    </tr>
                  );
                })}
                {filteredMails.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-text-dim text-center py-3">
                      {mails.length === 0 ? '보낸 우편이 없어요.' : '검색 결과가 없어요.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </DataTable>
          </AdminTableWrap>
        </AdminCard>
      )}

      {selectedMail && (
        <Modal
          layer="app"
          wide
          title={`보낸 우편 상세: ${selectedMail.title}`}
          onClose={() => setSelectedMailId(null)}
        >
          <SentMailCard mail={selectedMail} recipient={identityOf(selectedMail.userId)} />
        </Modal>
      )}
      {dialogs}
    </>
  );
}
