// 쿠폰 구역 — 동적 보상 쿠폰을 발행하고, 유효 기간·선착순 한도·활성 상태를 관리한다.
import { useEffect, useRef, useState } from 'react';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import CheckToggle from '../../../ui/CheckToggle';
import DataTable from '../../../ui/DataTable';
import Field from '../../../ui/Field';
import { fmtGold } from '../../../ui/format';
import ItemBadge from '../../../ui/ItemBadge';
import Note from '../../../ui/Note';
import SelectList from '../../../ui/SelectList';
import TableBox from '../../../ui/TableBox';
import TextInput from '../../../ui/TextInput';
import { useDialogs } from '../../../ui/useDialogs';
import {
  COUPON_CODE_MAX,
  COUPON_DESC_MAX,
  STACKABLE_ITEM_KIND_LABEL,
  buildCouponRequest,
  couponScopeText,
  couponStatusOf,
  findStackableItem,
  nextCouponBoundaryMs,
  removeMailAttachment,
  searchAttachableItems,
  upsertMailAttachment,
  type CouponStatus,
  type MailItemAttachment,
} from '../../../../features/admin/model/couponDraft';
import { fmtDT, isoToLocalInput } from '../../../../features/admin/model/metrics';
import type { AdminCouponRow } from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { readAdminCoupons } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminCoupons } from '../../../../features/admin/service/useAdminCoupons';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { Cell, CellGrid, TabState } from '../layout';

const NO_COUPONS: AdminCouponRow[] = [];
const currentNowMs = () => Date.now();

const STATUS_TONE: Record<CouponStatus, 'gold' | 'accent' | 'dim'> = {
  활성: 'gold',
  예약: 'accent',
  만료: 'dim',
  비활성: 'dim',
};

export default function CouponsTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const couponsQuery = useAdminQuery(adminKeys.coupons, readAdminCoupons, granted);
  const writeCoupon = useAdminCoupons();
  const coupons = couponsQuery.data ?? NO_COUPONS;
  const { confirm, dialogs } = useDialogs();

  const [editingCode, setEditingCode] = useState<string | null>(null);
  const editingCodeRef = useRef<string | null>(null);
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [gold, setGold] = useState('0');
  const [items, setItems] = useState<MailItemAttachment[]>([]);
  const [itemQuery, setItemQuery] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemError, setItemError] = useState<string | undefined>(undefined);
  const [active, setActive] = useState(true);
  const [startsInput, setStartsInput] = useState('');
  const [endsInput, setEndsInput] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [perAccountLimit, setPerAccountLimit] = useState('1');
  const [savingForm, setSavingForm] = useState(false);
  const [busyCodes, setBusyCodes] = useState<ReadonlySet<string>>(() => new Set());
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const editingRowBusy = editingCode !== null && busyCodes.has(editingCode);
  const markCodeBusy = (targetCode: string, activeBusy: boolean) => {
    setBusyCodes(prev => {
      const next = new Set(prev);
      if (activeBusy) next.add(targetCode);
      else next.delete(targetCode);
      return next;
    });
  };

  useEffect(() => {
    editingCodeRef.current = editingCode;
  }, [editingCode]);

  useEffect(() => {
    const delay = nextCouponBoundaryMs(coupons, now);
    if (delay === null) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(delay, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [coupons, now]);

  const clearNotice = () => {
    setFailure(null);
    setDone(null);
  };

  const resetForm = () => {
    editingCodeRef.current = null;
    setEditingCode(null);
    setCode('');
    setDescription('');
    setGold('0');
    setItems([]);
    setItemQuery('');
    setItemQty('1');
    setItemError(undefined);
    setActive(true);
    setStartsInput('');
    setEndsInput('');
    setMaxRedemptions('');
    setPerAccountLimit('1');
  };

  const startEdit = (c: AdminCouponRow) => {
    if (savingForm || busyCodes.has(c.code)) return;
    editingCodeRef.current = c.code;
    setEditingCode(c.code);
    setCode(c.code);
    setDescription(c.description);
    setGold(String(c.gold));
    setItems([...c.items]);
    setItemQuery('');
    setItemQty('1');
    setItemError(undefined);
    setActive(c.active);
    setStartsInput(isoToLocalInput(c.startsAt));
    setEndsInput(isoToLocalInput(c.endsAt));
    setMaxRedemptions(c.maxRedemptions === null ? '' : String(c.maxRedemptions));
    setPerAccountLimit(String(c.perAccountLimit));
    clearNotice();
  };

  const foundItems = searchAttachableItems(itemQuery);

  const pickItem = (id: string) => {
    const qty = Number(itemQty);
    const next = upsertMailAttachment(items, id, qty);
    if (next.error) {
      setItemError(next.error);
      return;
    }
    setItemError(undefined);
    setItems(next.items);
    setItemQuery('');
    clearNotice();
  };

  const removeItem = (id: string) => {
    setItemError(undefined);
    setItems(removeMailAttachment(items, id));
    clearNotice();
  };

  const submit = async () => {
    if (savingForm || editingRowBusy) return;
    clearNotice();
    const built = buildCouponRequest({
      code: editingCode ?? code,
      description,
      gold,
      items,
      active,
      startsAt: startsInput,
      endsAt: endsInput,
      maxRedemptions,
      perAccountLimit,
    }, editingCode !== null ? 'update' : 'create');

    if (!built.ok) {
      setFailure(built.error);
      return;
    }

    setSavingForm(true);
    try {
      await writeCoupon(built.request);
      setNow(currentNowMs());
      setDone(editingCodeRef.current !== null ? '쿠폰을 수정했어요.' : '새 쿠폰을 발행했어요.');
      resetForm();
    } catch (e) {
      setFailure(String((e as { message?: unknown }).message ?? e));
    } finally {
      setSavingForm(false);
    }
  };

  const handleToggleActive = async (c: AdminCouponRow) => {
    if (busyCodes.has(c.code) || (savingForm && editingCodeRef.current === c.code)) return;
    markCodeBusy(c.code, true);
    clearNotice();
    const nextActive = !c.active;
    try {
      await writeCoupon({
        op: 'update',
        code: c.code,
        gold: c.gold,
        items: [...c.items],
        description: c.description,
        active: nextActive,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        maxRedemptions: c.maxRedemptions,
        perAccountLimit: c.perAccountLimit,
      });
      if (editingCodeRef.current === c.code) setActive(nextActive);
      setNow(currentNowMs());
      setDone(nextActive ? `'${c.code}' 쿠폰을 활성화했어요.` : `'${c.code}' 쿠폰을 비활성화했어요.`);
    } catch (e) {
      setFailure(String((e as { message?: unknown }).message ?? e));
    } finally {
      markCodeBusy(c.code, false);
    }
  };

  const handleDelete = async (c: AdminCouponRow) => {
    if (busyCodes.has(c.code) || (savingForm && editingCodeRef.current === c.code)) return;
    const body = c.redeemedCount > 0
      ? `'${c.code}' 쿠폰을 삭제할까요? 이미 ${c.redeemedCount.toLocaleString('ko-KR')}회 사용된 쿠폰이며, 기존 사용 이력도 함께 삭제되어 되돌릴 수 없어요.`
      : `'${c.code}' 쿠폰을 삭제할까요? 삭제한 쿠폰은 되돌릴 수 없어요.`;
    const ok = await confirm({
      layer: 'app',
      title: '쿠폰 삭제',
      confirmLabel: '삭제',
      body,
    });
    if (!ok || busyCodes.has(c.code) || (savingForm && editingCodeRef.current === c.code)) return;

    markCodeBusy(c.code, true);
    clearNotice();
    try {
      await writeCoupon({ op: 'delete', code: c.code });
      if (editingCodeRef.current === c.code) resetForm();
      setDone('쿠폰을 삭제했어요.');
    } catch (e) {
      setFailure(String((e as { message?: unknown }).message ?? e));
    } finally {
      markCodeBusy(c.code, false);
    }
  };

  return (
    <>
      <TabState loading={couponsQuery.loading && granted} error={couponsQuery.error} onRetry={couponsQuery.refresh} />
      {!granted && <Note className="my-0">운영 DB에 연결하거나 admins에 등록하면 채워져요.</Note>}
      <CellGrid side>
        <Cell title={`발행된 쿠폰 (${coupons.length})`}>
          <TableBox className="max-h-[560px] px-1">
            <DataTable>
              <thead>
                <tr>
                  <th className="text-left">상태</th>
                  <th className="text-left">코드</th>
                  <th className="text-left">보상</th>
                  <th className="text-left">사용 현황</th>
                  <th className="text-left">유효 기간</th>
                  <th className="text-left">조치</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map(c => {
                  const status = couponStatusOf(c, now);
                  const rowBusy = busyCodes.has(c.code);
                  const rowLockedByForm = savingForm && editingCode === c.code;
                  return (
                    <tr key={c.code}>
                      <td className="align-top">
                        <Badge tone={STATUS_TONE[status]} size="xs">{status}</Badge>
                      </td>
                      <td className="align-top text-xs min-w-[140px]">
                        <div className="font-mono font-bold text-text">{c.code}</div>
                        <div className="mt-1 text-text-dim break-words">{c.description}</div>
                      </td>
                      <td className="align-top text-xs min-w-[140px]">
                        <div className="flex flex-col gap-1">
                          {c.gold > 0 && <div>{fmtGold(c.gold)}</div>}
                          {c.items.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {c.items.map(att => <ItemBadge key={att.id} id={att.id} qty={att.qty} />)}
                            </div>
                          )}
                          {c.gold === 0 && c.items.length === 0 && <span className="text-text-dim">-</span>}
                        </div>
                      </td>
                      <td className="align-top text-xs whitespace-nowrap">
                        <div className="text-text">
                          {c.maxRedemptions === null
                            ? `${c.redeemedCount.toLocaleString('ko-KR')}회 사용`
                            : `${c.redeemedCount.toLocaleString('ko-KR')} / ${c.maxRedemptions.toLocaleString('ko-KR')}명`}
                        </div>
                        <div className="mt-0.5 text-2xs text-text-dim">
                          {`${couponScopeText(c)}, 계정당 ${c.perAccountLimit.toLocaleString('ko-KR')}회`}
                        </div>
                      </td>
                      <td className="align-top text-2xs text-text-dim whitespace-nowrap">
                        {!c.startsAt && !c.endsAt ? (
                          <span>상시</span>
                        ) : (
                          <div>
                            <div>{`시작 ${c.startsAt ? fmtDT(c.startsAt) : '즉시'}`}</div>
                            <div>{`종료 ${c.endsAt ? fmtDT(c.endsAt) : '무기한'}`}</div>
                          </div>
                        )}
                      </td>
                      <td className="align-top">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!granted || rowBusy || savingForm}
                            onClick={() => startEdit(c)}
                          >
                            수정
                          </Button>
                          <Button
                            size="sm"
                            disabled={!granted || rowBusy || rowLockedByForm}
                            onClick={() => void handleToggleActive(c)}
                          >
                            {c.active ? '비활성화' : '활성화'}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={!granted || rowBusy || rowLockedByForm}
                            onClick={() => void handleDelete(c)}
                          >
                            삭제
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {coupons.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-3 text-center text-text-dim">
                      등록된 쿠폰이 없어요.
                    </td>
                  </tr>
                )}
              </tbody>
            </DataTable>
          </TableBox>
        </Cell>

        <Cell title={editingCode !== null ? '쿠폰 수정' : '새 쿠폰 발행'}>
          <div className="flex flex-col gap-3">
            <Field
              label="코드"
              hint={editingCode !== null ? '수정 중에는 코드를 바꿀 수 없어요.' : `1자 이상 ${COUPON_CODE_MAX}자 이하`}
            >
              <TextInput
                value={code}
                maxLength={COUPON_CODE_MAX}
                readOnly={editingCode !== null}
                className={editingCode !== null ? 'opacity-70 cursor-not-allowed' : undefined}
                onChange={e => { setCode(e.target.value); clearNotice(); }}
              />
            </Field>
            <Field label="설명" hint={`최대 ${COUPON_DESC_MAX}자`}>
              <TextInput
                value={description}
                maxLength={COUPON_DESC_MAX}
                onChange={e => { setDescription(e.target.value); clearNotice(); }}
              />
            </Field>
            <Field label="보상 골드" hint="0 이상 10억 이하 정수">
              <TextInput
                inputMode="numeric"
                value={gold}
                onChange={e => { setGold(e.target.value); clearNotice(); }}
              />
            </Field>

            <div className="grid grid-cols-[1fr_7rem] gap-2 items-start">
              <Field label="첨부 품목 찾기" hint="이름, 종류(비약, 생명의 기운, 도시락, 미끼, 재료), id 일부를 입력해 고르세요.">
                <TextInput
                  value={itemQuery}
                  onChange={e => setItemQuery(e.target.value)}
                  placeholder="품목 이름 또는 종류"
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
                label="품목 검색 결과"
                items={foundItems}
                keyOf={item => item.id}
                selectedKey=""
                onSelect={pickItem}
                renderItem={item => (
                  <span className="flex items-center gap-2 min-w-0">
                    <Badge size="2xs">{STACKABLE_ITEM_KIND_LABEL[item.kind]}</Badge>
                    <ItemBadge id={item.id} />
                    <span className="text-2xs text-text-dim truncate">{item.id}</span>
                  </span>
                )}
              />
            )}
            {itemQuery.trim() !== '' && foundItems.length === 0 && (
              <Note size="xs" className="my-0">찾는 품목이 없어요.</Note>
            )}
            {items.length > 0 && (
              <div className="flex flex-wrap gap-1.5" aria-label="첨부된 품목">
                {items.map(att => (
                  <span key={att.id} className="inline-flex items-center gap-1">
                    <ItemBadge id={att.id} qty={att.qty} />
                    <Button
                      size="sm"
                      onClick={() => removeItem(att.id)}
                      aria-label={`${findStackableItem(att.id)?.name ?? att.id} 첨부 빼기`}
                    >
                      삭제
                    </Button>
                  </span>
                ))}
              </div>
            )}

            <CheckToggle
              checked={active}
              onChange={v => { setActive(v); clearNotice(); }}
              label="활성화"
            />

            <Field label="시작 시각" hint="비워 두면 즉시 시작해요.">
              <TextInput
                type="datetime-local"
                value={startsInput}
                onChange={e => { setStartsInput(e.target.value); clearNotice(); }}
              />
            </Field>
            <Field label="종료 시각" hint="비워 두면 무기한이에요.">
              <TextInput
                type="datetime-local"
                value={endsInput}
                onChange={e => { setEndsInput(e.target.value); clearNotice(); }}
              />
            </Field>
            <Field
              label="총 사용 한도"
              hint="비워 두면 무제한이며 게스트도 수령할 수 있어요. 숫자를 정하면 정식 계정만 선착순으로 수령할 수 있어요."
            >
              <TextInput
                inputMode="numeric"
                value={maxRedemptions}
                placeholder="무제한"
                onChange={e => { setMaxRedemptions(e.target.value); clearNotice(); }}
              />
            </Field>
            <Field label="계정당 사용 한도" hint="1 이상 정수">
              <TextInput
                inputMode="numeric"
                value={perAccountLimit}
                onChange={e => { setPerAccountLimit(e.target.value); clearNotice(); }}
              />
            </Field>

            {failure && <Note tone="warn" className="my-0">{failure}</Note>}
            {done && <Note className="my-0">{done}</Note>}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={!granted || savingForm || editingRowBusy}
                onClick={() => void submit()}
              >
                {editingCode !== null ? '수정 저장' : '쿠폰 발행'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={savingForm || editingRowBusy}
                onClick={() => { resetForm(); clearNotice(); }}
              >
                {editingCode !== null ? '취소' : '초기화'}
              </Button>
            </div>
          </div>
        </Cell>
      </CellGrid>
      {dialogs}
    </>
  );
}
