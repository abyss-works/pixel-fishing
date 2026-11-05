import type { AwaySummary } from '../../../../game/rules/away';
import { awayTips } from '../../../../game/rules/away';
import type { GameState } from '../../../../game/rules/logic';
import { FISH, formName } from '../../../../game/rules/logic';
import { spotById } from '../../../../game/content/spots';
import { selectStatsSummary } from '../../../../features/gameplay/model/stats';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import FishSprite from '../../../ui/fish/FishSprite';
import { RARITY_CARD, RarityText } from '../../../ui/fish/RarityTag';
import { fmtCompact, fmtNum, fmtSize } from '../../../ui/format';
import KpiTile from '../../../ui/KpiTile';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import NoteTag from '../../../ui/NoteTag';
import SectionTitle from '../../../ui/SectionTitle';
import { awayDuration, awayPeriodText, awayTipText, bagTimelineText } from './awayText';

const pct = (share: number) => `${(share * 100).toFixed(1)}%`;
const rate = (n: number) => fmtCompact(Math.round(n));

// 방치 결과 창 — 알림 카드의 자세히로 연다. 비운 시간, 지표 타일, 새 도감 어종 그림 카드, 등급 분포,
// 가방 타임라인, "다음엔" 조언 순서다. 해당하는 내용이 없는 절은 뺀다. 가방 열기는 호출부가 가방 탭을 연다.
export default function AwayReportModal({ report, game, onClose, onOpenBag }: {
  report: AwaySummary;
  game: GameState;
  onClose: () => void;
  onOpenBag: () => void;
}) {
  const dex = selectStatsSummary(game);
  const tips = awayTips(report, game);
  const spot = report.spot ? spotById(report.spot)?.name : null;
  const full = report.bagFullAfterMs;
  const fullPct = full === null ? 0 : Math.min(100, (full / report.awayMs) * 100);

  return (
    <Modal layer="stage" onClose={onClose}>
      <ModalCard title="자리를 비운 사이" onClose={onClose} confirm={(
        <div className="flex gap-2">
          <Button full onClick={onClose}>닫기</Button>
          <Button full variant="primary" onClick={onOpenBag}>가방 열기</Button>
        </div>
      )}>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="pf-accent text-gold text-2xl">{awayDuration(report.awayMs)}</span>
          <span className="text-xs text-text-dim">{awayPeriodText(report)}{spot ? `, ${spot}` : ''}</span>
        </div>

        <div className="grid grid-cols-4 gap-1.5 max-[520px]:grid-cols-2">
          <KpiTile label="잡은 물고기" value={fmtNum(report.catches)} hint={`시간당 ${rate(report.perHour.catches)}`} />
          <KpiTile label="가치" value={fmtCompact(report.value)} hint={`시간당 ${rate(report.perHour.value)}`} />
          <KpiTile label="명성" value={`+${fmtCompact(report.fame)}`} hint={`시간당 ${rate(report.perHour.fame)}`} />
          <KpiTile label="새 도감" value={fmtNum(report.newFish.length)} hint={`${dex.dexTotal}종 중 ${dex.dexFound}종`} />
        </div>

        {report.newFish.length > 0 && (
          <section aria-label="새로 도감에 오른 물고기">
            <SectionTitle>새로 도감에 오른 물고기</SectionTitle>
            <div className="grid grid-cols-3 gap-1.5">
              {report.newFish.map(n => {
                const fish = FISH.find(f => f.id === n.fishId);
                if (!fish) return null;
                return (
                  <div key={`${n.fishId}:${n.form}`} data-rarity={n.rarity}
                       className={cx(RARITY_CARD, 'flex flex-col items-center gap-0.5 px-1 py-1.5 text-xs')}>
                    <FishSprite fish={fish} form={n.form} preset="icon" className="max-w-full" />
                    <span>{formName(fish, n.form)}</span>
                    <span className="text-2xs text-text-dim"><RarityText rarity={n.rarity} />, {fmtSize(n.maxSize)}</span>
                    {n.form === 'variant'
                      ? <NoteTag tag="돌연변이" className="text-epic border-epic" />
                      : <NoteTag tag="새 도감" className="text-accent border-accent" />}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section aria-label="등급">
          <SectionTitle className="flex justify-between items-baseline">
            <span>등급</span>
            <span className="text-xs text-text-dim">돌연변이 {fmtNum(report.variants.count)}마리 ({pct(report.variants.share)})</span>
          </SectionTitle>
          <div className="flex h-2.5 border border-line" aria-hidden>
            {report.grades.map(g => g.count > 0 && (
              <span key={g.rarity} data-rarity={g.rarity} className="h-full bg-(--rarity-color)"
                    style={{ width: `${g.share * 100}%` }} />
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1 mt-1 text-2xs text-text-dim text-center">
            {report.grades.map(g => (
              <span key={g.rarity} className="flex flex-col">
                <RarityText rarity={g.rarity} />
                <b className="text-sm text-text">{fmtNum(g.count)}</b>
                <span>{pct(g.share)}</span>
              </span>
            ))}
          </div>
        </section>

        {full !== null && (
          <section aria-label="가방">
            <SectionTitle>가방</SectionTitle>
            <div className="relative h-1.5 bg-surface-2 border border-line">
              <span className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${fullPct}%` }} />
              <span className="absolute inset-y-0 right-0 bg-orange/60" style={{ width: `${100 - fullPct}%` }} />
            </div>
            <div className="flex justify-between gap-2 mt-1 text-2xs text-text-dim">
              <span>떠남</span>
              <span className="text-orange text-center">{bagTimelineText(report)}</span>
              <span>복귀</span>
            </div>
          </section>
        )}

        {tips.length > 0 && (
          <section aria-label="다음엔">
            <SectionTitle>다음엔</SectionTitle>
            <ul className="flex flex-col gap-0.5 text-xs">
              {tips.map(t => <li key={t.kind}>{awayTipText(t)}</li>)}
            </ul>
          </section>
        )}
      </ModalCard>
    </Modal>
  );
}
