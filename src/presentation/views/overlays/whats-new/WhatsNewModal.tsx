import type { GameState } from '../../../../game/rules/logic';
import { useWhatsNew } from '../../../../features/announcements/service/whatsNew';
import type { WhatsNewStep } from '../../../../features/announcements/model/whatsNew';
import Modal from '../../../ui/Modal';
import Button from '../../../ui/Button';
import CheckToggle from '../../../ui/CheckToggle';
import { cx } from '../../../ui/cx';
import NewsStep from './NewsStep';
import SettingsStep from './SettingsStep';

const STEP_TITLE: Record<WhatsNewStep, string> = { news: '업데이트 소식', settings: '새 설정' };

/** 단계 표시 — 두 단계 이상일 때만. 지금 단계를 골드로, 지난 단계는 본문색, 남은 단계는 보조색 */
function StepTrail({ steps, index }: { steps: readonly WhatsNewStep[]; index: number }) {
  if (steps.length < 2) return null;
  return (
    <ol className="flex items-center gap-1.5 mb-3 text-2xs" aria-label="단계">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className="w-4 h-px bg-line" />}
          <span className={cx('flex items-center gap-1',
            i === index ? 'text-gold' : i < index ? 'text-text' : 'text-text-dim')}
                aria-current={i === index ? 'step' : undefined}>
            <span className={cx('pf-accent w-4 h-4 inline-flex items-center justify-center rounded-sm border',
              i === index ? 'border-gold' : 'border-line')}>{i + 1}</span>
            {STEP_TITLE[s]}
          </span>
        </li>
      ))}
    </ol>
  );
}

// 업데이트 소식 창 — 접속 후 세이브가 준비되면 이번 버전 소식과 새 설정을 차례로 보여 준다.
// 소식은 "이번 소식 다시 보지 않기"를 체크하고 닫아야 더 뜨지 않는다. 고른 설정은 이미 적용돼 있다.
export default function WhatsNewModal({ game, ready }: {
  game: Pick<GameState, 'fame' | 'dex'>;
  /** 세이브가 준비됐는지 — 준비 전의 빈 상태로 "처음 시작"을 판정하지 않게 */
  ready: boolean;
}) {
  const w = useWhatsNew(game, ready);
  if (!w.open || !w.step) return null;
  const last = w.index === w.steps.length - 1;
  const nextStep = w.steps[w.index + 1];

  return (
    <Modal title={STEP_TITLE[w.step]} onClose={w.close}>
      <StepTrail steps={w.steps} index={w.index} />
      {w.step === 'news' && w.news && <NewsStep news={w.news} />}
      {w.step === 'settings' && <SettingsStep prompts={w.prompts} />}

      <div className="border-t border-line mt-3 pt-3 flex flex-col gap-2">
        {w.step === 'news' && (
          <CheckToggle checked={w.dismiss} onChange={w.setDismiss} label="이번 소식 다시 보지 않기" />
        )}
        <div className="flex gap-2">
          {w.index > 0 && <Button variant="ghost" onClick={w.back}>이전</Button>}
          <Button variant="primary" className="flex-1" onClick={w.next}>
            {last ? (w.step === 'settings' ? '완료' : '확인') : `다음: ${STEP_TITLE[nextStep]} 고르기`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
