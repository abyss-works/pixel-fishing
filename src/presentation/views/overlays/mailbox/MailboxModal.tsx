import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { REJECT_TEXT } from '../../../../game/rules/logic';
import type { GameAction } from '../../../../game/rules/actions';
import {
  claimMailNoticeText,
  claimMailToastText,
  hasReward,
  isClaimable,
  isPending,
  mailRewardSummary,
} from '../../../../features/mailbox/model/mailbox';
import type { MailItem } from '../../../../features/mailbox/model/mailbox';
import { useMailbox } from '../../../../features/mailbox/service/useMailbox';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import { sendNotice } from '../../../../features/display/model/toastPolicy';
import { resolveItemDetail } from '../../../../features/inventory/model/items';
import { when } from '../../../../shared/lib/when';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import { GradeName, HighlightRarityText } from '../../../ui/fish/RarityTag';
import { fmtGold, fmtMinutes, fmtNum } from '../../../ui/format';
import type { Notify } from '../../../ui/hud/messageFeed';
import Inset from '../../../ui/Inset';
import ItemBadge from '../../../ui/ItemBadge';
import ItemSprite from '../../../ui/ItemSprite';
import KeyValueRow from '../../../ui/KeyValueRow';
import LoreParagraph from '../../../ui/LoreParagraph';
import TableBox from '../../../ui/TableBox';
import DataTable from '../../../ui/DataTable';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import PixelIcon from '../../../ui/PixelIcon';
import Tip, { TipCard } from '../../../ui/Tip';
import { useDialogs } from '../../../ui/useDialogs';
import { SCROLL_Y } from '../../../ui/scrollArea';

// 우편함 창. 게임 스테이지 안에 뜨고, 680 폭에 탭이 없어 내용 높이를 따른다.
// 위는 우편 표(아이콘, 제목, 받은 날, 골드)로 표 머리와 다섯 줄 높이이고 넘치면 칸 안에서 굴린다. 아래는 고른 우편의 본문 칸이다.
// 할 일이 남은 우편은 골드 아이콘과 굵은 제목으로, 받지 않은 골드는 골드색으로 보인다. 처음 연 우편에 읽음이 남는다.
// 본문 칸 맨 아래 한 줄은 첨부 골드와 받기 자리이고, 골드가 없는 우편에서도 비워 두어 칸 높이가 같다.
const dateOf = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
const HEAD = 'h-[30px] px-2 font-normal border-b border-line';

export default function MailboxModal({ dispatch, setToast, onClose }: {
  dispatch: (action: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
  onClose: () => void;
}) {
  const { mails, loading, failed, markRead, claim } = useMailbox();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [claiming, setClaiming] = useState(false);
  const { notice, dialogs } = useDialogs();
  const selected = mails?.find(m => m.id === selectedId) ?? null;

  const openAttachmentDetail = (id: string, qty: number) => {
    const detail = resolveItemDetail(id);
    if (!detail) {
      void notice({
        layer: 'stage',
        title: id,
        body: `첨부 수량 ${fmtNum(qty)}개`,
      });
      return;
    }
    const duration = detail.durationMinutes !== null ? fmtMinutes(detail.durationMinutes) : detail.durationLabel;
    void notice({
      layer: 'stage',
      title: detail.name,
      body: (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            {detail.spriteKind ? (
              <ItemSprite kind={detail.spriteKind} id={detail.id} preset="hero" className="shrink-0" />
            ) : (
              <PixelIcon glyph="gem" size={24} className="shrink-0 text-accent" />
            )}
            <div className="flex flex-wrap items-baseline gap-2 min-w-0">
              <b className="text-base text-text"><GradeName name={detail.name} grade={detail.grade} /></b>
              <Badge>{detail.kindLabel}</Badge>
              <span className="pf-accent text-xs text-gold">×{fmtNum(qty)}</span>
            </div>
          </div>
          {detail.description && (
            <LoreParagraph className="text-xs leading-[1.8] text-text-dim">{detail.description}</LoreParagraph>
          )}
          {(detail.effects.length > 0 || duration) && (
            <Inset divided>
              {detail.effects.map(e => (
                'text' in e ? (
                  <div key={e.text} className="px-2 py-1.5 text-sm text-accent">
                    <HighlightRarityText text={e.text} />
                  </div>
                ) : (
                  <KeyValueRow
                    key={`${e.label}-${e.value}`}
                    label={<HighlightRarityText text={e.label} />}
                    value={<HighlightRarityText text={e.value} />}
                    valueEnd
                    valueClassName={/\d/.test(e.value) ? 'pf-accent text-accent' : 'font-bold text-accent'}
                  />
                )
              ))}
              {duration && <KeyValueRow label="지속 시간" value={duration} valueEnd />}
            </Inset>
          )}
          {detail.note && <Note className="my-0">{detail.note}</Note>}
        </div>
      ),
    });
  };

  const select = (mail: MailItem) => {
    setSelectedId(mail.id);
    markRead(mail.id);
  };
  const onClaim = (mail: MailItem) => {
    setClaiming(true);
    void Promise.resolve(when(claim(dispatch, mail.id), result => {
      if (result.status === 'rejected') sendNotice(setToast, { kind: 'system.modalRejected', text: REJECT_TEXT[result.error] });
      else sendNotice(setToast, {
        kind: 'social.modalAction',
        text: claimMailNoticeText(mail),
        toastText: claimMailToastText(mail),
        tone: 'gold',
      });
    })).finally(() => setClaiming(false));
  };
  const onRowKey = (e: KeyboardEvent, mail: MailItem) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    select(mail);
  };

  return (
    <>
      <Modal layer="stage" md onClose={onClose}>
        <ModalCard title="우편함" onClose={onClose}>
        <div className="flex flex-col gap-3">
          {/* 표 머리 한 줄과 우편 다섯 줄 높이 */}
          <TableBox className="h-[212px] px-3 pb-2">
            {mails && mails.length > 0 ? (
              <DataTable cols={['1.25rem', null, '110px', '7.5rem']} nameMin="10rem" aria-label="받은 우편">
                <thead>
                  <tr className="sticky top-0 bg-[color-mix(in_oklab,var(--c-bg)_45%,var(--c-surface))] text-2xs text-text-dim">
                    <th className={cx(HEAD, 'pl-0')} aria-label="상태" />
                    <th className={cx(HEAD, 'text-left')}>제목</th>
                    <th className={cx(HEAD, 'text-right')}>받은 날</th>
                    <th className={cx(HEAD, 'text-right pr-0')}>보상</th>
                  </tr>
                </thead>
                <tbody>
                  {mails.map((m, i) => {
                    const pending = isPending(m);
                    const on = m.id === selectedId;
                    const cell = cx('h-[34px]', i > 0 && 'border-t border-line/60', on && 'bg-gold/[0.07]');
                    return (
                      <tr key={m.id} tabIndex={0} aria-selected={on} onClick={() => select(m)} onKeyDown={e => onRowKey(e, m)}
                          className="cursor-pointer hover:bg-surface-2/50 focus-visible:outline-1 focus-visible:outline-gold">
                        <td className={cell}>
                          <PixelIcon glyph="letter" size={12} className={pending ? 'text-gold' : 'text-text-dim'} />
                        </td>
                        <td className={cx(cell, 'px-2 truncate', pending ? 'font-bold' : 'font-normal',
                          on ? 'text-gold' : pending ? 'text-text' : 'text-text-dim')}>{m.title}</td>
                        <td className={cx(cell, 'px-2 text-right pf-accent text-2xs text-text-dim')}>{dateOf(m.createdAt)}</td>
                        <td className={cx(cell, 'pl-2 text-right pf-accent text-xs truncate', isClaimable(m) ? 'text-gold' : 'text-text-dim')}>
                          {mailRewardSummary(m)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            ) : (
              <div className="flex h-full items-center justify-center">
                {loading ? <Note>우편을 불러오는 중이에요.</Note>
                  : failed ? <Note tone="warn">우편을 열지 못했어요.<br />잠시 뒤 다시 열어 주세요.</Note>
                  : <Note>받은 우편이 없어요.</Note>}
              </div>
            )}
          </TableBox>
          <Inset className="h-[190px] px-3 pt-2.5 pb-2 flex flex-col gap-2">
            {selected ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <b className="text-gold truncate">{selected.title}</b>
                  <span className="pf-accent text-2xs text-text-dim shrink-0">{dateOf(selected.createdAt)}</span>
                </div>
                <p className={`${SCROLL_Y} flex-1 min-h-0 whitespace-pre-line text-sm leading-relaxed`}>{selected.body}</p>
                {/* 받기 버튼(41px)과 구분선 아래 8px이 들어가는 높이. 첨부 배지가 많으면 줄을 늘린다 */}
                <div className="min-h-[50px] shrink-0 flex items-center justify-between gap-2 border-t border-line pt-2">
                  {hasReward(selected) && (
                    <>
                      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
                        {selected.gold > 0 && (
                          <span className="inline-flex items-center gap-1.5 text-gold">
                            <PixelIcon glyph="coin" size={12} />
                            <span className="pf-accent text-xs">{fmtGold(selected.gold)}</span>
                          </span>
                        )}
                        {selected.items.map(att => {
                          const detail = resolveItemDetail(att.id);
                          const badge = (
                            <ItemBadge
                              id={att.id}
                              qty={att.qty}
                              onClick={() => openAttachmentDetail(att.id, att.qty)}
                            />
                          );
                          return detail ? (
                            <Tip
                              key={att.id}
                              wraps
                              hoverOnly
                              text={(
                                <TipCard
                                  title={<GradeName name={detail.name} grade={detail.grade} />}
                                  badge={<Badge tone="dim-plain" size="2xs">{detail.kindLabel}</Badge>}
                                  description={detail.description ?? detail.note ?? undefined}
                                />
                              )}
                            >
                              {badge}
                            </Tip>
                          ) : (
                            <span key={att.id}>{badge}</span>
                          );
                        })}
                      </div>
                      <div className="shrink-0">
                        {isClaimable(selected) ? (
                          <Button variant="primary" disabled={claiming} onClick={() => onClaim(selected)}>받기</Button>
                        ) : (
                          <span className="text-xs text-text-dim">받음</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                {mails && mails.length > 0 && <Note>위에서 우편을 골라 주세요.</Note>}
              </div>
            )}
          </Inset>
        </div>
        </ModalCard>
      </Modal>
      {dialogs}
    </>
  );
}
