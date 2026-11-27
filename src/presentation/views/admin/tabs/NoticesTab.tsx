// 공지 구역 — 게임 화면 상단 카드와 공지사항 창에 띄우는 기간제 상시 공지를 등록·수정·즉시 마감·삭제한다.
import { useEffect, useState } from 'react';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import DataTable from '../../../ui/DataTable';
import Field from '../../../ui/Field';
import Note from '../../../ui/Note';
import TableBox from '../../../ui/TableBox';
import TextArea from '../../../ui/TextArea';
import TextInput from '../../../ui/TextInput';
import { useDialogs } from '../../../ui/useDialogs';
import { fmtDT, isoToLocalInput, toLocalInputValue } from '../../../../features/admin/model/metrics';
import { readAdminNotices } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminNotices } from '../../../../features/admin/service/useAdminNotices';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import type { AdminNoticeRow } from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { nextNoticeBoundaryMs, NOTICE_BODY_MAX, NOTICE_TITLE_MAX, normalizeNoticeDraft } from '../../../../features/live/model/notice';
import { Cell, CellGrid, TabState } from '../layout';

const NO_NOTICES: AdminNoticeRow[] = [];
const BODY_PREVIEW_CHARS = 70;
const currentNowMs = () => Date.now();

type NoticeStatus = '활성' | '예약' | '마감';

const STATUS_TONE: Record<NoticeStatus, 'gold' | 'accent' | 'dim'> = {
  활성: 'gold',
  예약: 'accent',
  마감: 'dim',
};

function noticeStatusOf(notice: Pick<AdminNoticeRow, 'startsAt' | 'endsAt'>, now: number): NoticeStatus {
  const start = Date.parse(notice.startsAt);
  const end = Date.parse(notice.endsAt);
  if (Number.isFinite(start) && now < start) return '예약';
  if (Number.isFinite(end) && now < end) return '활성';
  return '마감';
}

function localInputToIso(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}

function bodyPreview(body: string): { summary: string; truncated: boolean } {
  const firstLine = body.split('\n')[0] ?? '';
  const chars = [...firstLine];
  if (body.includes('\n') || chars.length > BODY_PREVIEW_CHARS) {
    return { summary: `${chars.slice(0, BODY_PREVIEW_CHARS).join('')}…`, truncated: true };
  }
  return { summary: body, truncated: false };
}

const DRAFT_ERROR_TEXT: Record<'bad-title' | 'bad-body' | 'bad-window', string> = {
  'bad-title': `제목은 1자 이상 ${NOTICE_TITLE_MAX}자 이하로 입력해 주세요.`,
  'bad-body': `본문은 1자 이상 ${NOTICE_BODY_MAX}자 이하로 입력해 주세요.`,
  'bad-window': '시작 시각과 마감 시각을 확인해 주세요. 마감 시각은 시작 시각보다 뒤여야 해요.',
};

export default function NoticesTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const noticesQuery = useAdminQuery(adminKeys.notices, readAdminNotices, granted);
  const writeNotice = useAdminNotices();
  const notices = noticesQuery.data ?? NO_NOTICES;
  const { confirm, dialogs } = useDialogs();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [startsInput, setStartsInput] = useState(() => toLocalInputValue(Date.now()));
  const [endsInput, setEndsInput] = useState(() => toLocalInputValue(Date.now() + 24 * 3600_000));
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<number>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const resetForm = () => {
    const current = Date.now();
    setEditingId(null);
    setTitle('');
    setBody('');
    setStartsInput(toLocalInputValue(current));
    setEndsInput(toLocalInputValue(current + 24 * 3600_000));
  };

  const startEdit = (n: AdminNoticeRow) => {
    setEditingId(n.id);
    setTitle(n.title);
    setBody(n.body);
    setStartsInput(isoToLocalInput(n.startsAt));
    setEndsInput(isoToLocalInput(n.endsAt));
    setFailure(null);
    setDone(null);
  };

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    setFailure(null);
    setDone(null);
    const normalized = normalizeNoticeDraft({
      title,
      body,
      startsAt: localInputToIso(startsInput),
      endsAt: localInputToIso(endsInput),
    });
    if (!normalized.ok) {
      setFailure(DRAFT_ERROR_TEXT[normalized.code]);
      return;
    }
    setBusy(true);
    try {
      if (editingId !== null) {
        await writeNotice({ op: 'update', id: editingId, ...normalized.draft });
        setDone('공지를 수정했어요.');
      } else {
        await writeNotice({ op: 'create', ...normalized.draft });
        setDone('새 공지를 등록했어요.');
      }
      setNow(currentNowMs());
      resetForm();
    } catch (e) {
      setFailure(String((e as { message?: unknown }).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const handleEnd = async (n: AdminNoticeRow) => {
    const ok = await confirm({
      layer: 'app',
      title: '공지 즉시 마감',
      confirmLabel: '즉시 마감',
      body: `'${n.title}' 공지를 지금 바로 마감할까요?`,
    });
    if (!ok) return;
    setBusyId(n.id);
    setFailure(null);
    setDone(null);
    try {
      await writeNotice({ op: 'end', id: n.id });
      setNow(currentNowMs());
      setDone('공지를 마감했어요.');
    } catch (e) {
      setFailure(String((e as { message?: unknown }).message ?? e));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (n: AdminNoticeRow) => {
    const ok = await confirm({
      layer: 'app',
      title: '공지 삭제',
      confirmLabel: '삭제',
      body: `'${n.title}' 공지를 삭제할까요? 삭제한 공지는 되돌릴 수 없어요.`,
    });
    if (!ok) return;
    setBusyId(n.id);
    setFailure(null);
    setDone(null);
    try {
      await writeNotice({ op: 'delete', id: n.id });
      if (editingId === n.id) resetForm();
      setDone('공지를 삭제했어요.');
    } catch (e) {
      setFailure(String((e as { message?: unknown }).message ?? e));
    } finally {
      setBusyId(null);
    }
  };

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const delay = nextNoticeBoundaryMs(notices, now);
    if (delay === null) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(delay, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [notices, now]);

  return (
    <>
      <TabState loading={noticesQuery.loading && granted} error={noticesQuery.error} onRetry={noticesQuery.refresh} />
      {!granted && <Note className="my-0">운영 DB에 연결하거나 admins에 등록하면 채워져요.</Note>}
      <CellGrid side>
        <Cell title={`공지 목록 (${notices.length})`}>
          <TableBox className="max-h-[560px] px-1">
            <DataTable>
              <thead>
                <tr>
                  <th className="text-left">내용</th>
                  <th className="text-left">기간</th>
                  <th className="text-left">상태</th>
                  <th className="text-left">조치</th>
                </tr>
              </thead>
              <tbody>
                {notices.map(n => {
                  const status = noticeStatusOf(n, now);
                  const preview = bodyPreview(n.body);
                  const expanded = expandedIds.has(n.id);
                  return (
                    <tr key={n.id}>
                      <td className="align-top text-xs min-w-[180px]">
                        <div className="font-bold text-text">{n.title}</div>
                        <div className="mt-1 whitespace-pre-wrap text-text-dim break-words">
                          {expanded || !preview.truncated ? n.body : preview.summary}
                        </div>
                        {preview.truncated && (
                          <Button
                            size="xs"
                            variant="ghost"
                            className="mt-1"
                            onClick={() => toggleExpand(n.id)}
                          >
                            {expanded ? '접기' : '펼치기'}
                          </Button>
                        )}
                      </td>
                      <td className="align-top text-2xs text-text-dim whitespace-nowrap">
                        <div>{`시작 ${fmtDT(n.startsAt)}`}</div>
                        <div>{`마감 ${fmtDT(n.endsAt)}`}</div>
                      </td>
                      <td className="align-top">
                        <Badge tone={STATUS_TONE[status]} size="xs">{status}</Badge>
                      </td>
                      <td className="align-top">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!granted || busyId === n.id}
                            onClick={() => startEdit(n)}
                          >
                            수정
                          </Button>
                          <Button
                            size="sm"
                            disabled={!granted || busyId === n.id}
                            onClick={() => void handleEnd(n)}
                          >
                            즉시 마감
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={!granted || busyId === n.id}
                            onClick={() => void handleDelete(n)}
                          >
                            삭제
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {notices.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-3 text-center text-text-dim">
                      등록된 공지가 없어요.
                    </td>
                  </tr>
                )}
              </tbody>
            </DataTable>
          </TableBox>
        </Cell>
        <Cell title={editingId !== null ? '공지 수정' : '새 공지'}>
          <div className="flex flex-col gap-3">
            <Field label="제목" hint={`최대 ${NOTICE_TITLE_MAX}자`}>
              <TextInput
                value={title}
                maxLength={NOTICE_TITLE_MAX}
                onChange={e => { setTitle(e.target.value); setFailure(null); setDone(null); }}
              />
            </Field>
            <Field label="본문" hint={`최대 ${NOTICE_BODY_MAX}자`}>
              <TextArea
                rows={5}
                value={body}
                maxLength={NOTICE_BODY_MAX}
                onChange={e => { setBody(e.target.value); setFailure(null); setDone(null); }}
              />
            </Field>
            <Field label="시작 시각">
              <TextInput
                type="datetime-local"
                value={startsInput}
                onChange={e => { setStartsInput(e.target.value); setFailure(null); setDone(null); }}
              />
            </Field>
            <Field label="마감 시각">
              <TextInput
                type="datetime-local"
                value={endsInput}
                onChange={e => { setEndsInput(e.target.value); setFailure(null); setDone(null); }}
              />
            </Field>
            {failure && <Note tone="warn" className="my-0">{failure}</Note>}
            {done && <Note className="my-0">{done}</Note>}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={!granted || busy}
                onClick={() => void submit()}
              >
                {editingId !== null ? '수정 저장' : '공지 등록'}
              </Button>
              {editingId !== null && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={resetForm}>
                  취소
                </Button>
              )}
            </div>
          </div>
        </Cell>
      </CellGrid>
      {dialogs}
    </>
  );
}
