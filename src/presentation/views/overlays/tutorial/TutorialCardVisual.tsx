import { useEffect, useRef } from 'react';
import {
  TUTORIAL_BOAT_LABELS,
  TUTORIAL_PLAYER_LOOK,
  TUTORIAL_ZONE_NAMES,
} from '../../../../features/tutorial/model/tutorial';
import Badge from '../../../ui/Badge';
import BoatSprite from '../../../ui/BoatSprite';
import GearSprite from '../../../ui/GearSprite';
import Inset from '../../../ui/Inset';
import PersonSprite from '../../../ui/PersonSprite';
import PixelIcon from '../../../ui/PixelIcon';
import SlotGauge from '../../../ui/SlotGauge';

export type TutorialVisualKind =
  | 'village-move' | 'village-cast' | 'village-idle' | 'village-home'
  | 'sea-zones' | 'sea-boat' | 'sea-power' | 'sea-harbor' | 'sea-map'
  | 'quest-accept' | 'quest-complete' | 'quest-reset'
  | 'named-encounter' | 'named-trace' | 'named-duel' | 'named-alert' | 'named-relic';

interface VisualProps {
  kind: TutorialVisualKind;
  dailyCap?: number;
  resetText?: string;
  expiryText?: string;
  missLimit?: number;
}

function TutorialKeyCap({ label }: { label: string }) {
  return (
    <Inset border="gold" tone="light" className="min-w-7 h-7 px-2 flex items-center justify-center pf-accent text-xs font-bold text-gold">
      {label}
    </Inset>
  );
}

function TutorialBobberCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const s = 4;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 24 * s, 14 * s);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    // 물결 바탕
    ctx.fillStyle = '#0e2444';
    ctx.fillRect(1, 6, 22, 7);
    ctx.fillStyle = '#183a68';
    ctx.fillRect(2, 6, 6, 1);
    ctx.fillRect(14, 6, 7, 1);
    ctx.fillRect(5, 9, 5, 1);
    ctx.fillRect(15, 11, 5, 1);
    // 어군 실루엣
    ctx.fillStyle = '#ffd54f';
    ctx.fillRect(5, 8, 4, 2);
    ctx.fillRect(4, 8, 1, 1);
    ctx.fillRect(15, 9, 5, 2);
    ctx.fillRect(14, 10, 1, 1);
    // 낚싯줄과 찌
    ctx.fillStyle = '#b8c2cc';
    ctx.fillRect(11, 0, 1, 3);
    ctx.fillStyle = '#ff8a80';
    ctx.fillRect(10, 3, 3, 2);
    ctx.fillStyle = '#f2f7fb';
    ctx.fillRect(10, 5, 3, 2);
  }, []);
  return (
    <canvas
      ref={ref}
      width={96}
      height={56}
      aria-hidden="true"
      className="block [image-rendering:pixelated]"
    />
  );
}

// 튜토리얼 카드 17종의 픽셀 도해 — 공용 스프라이트·아이콘·시맨틱 토큰으로 그린다.
export default function TutorialCardVisual({ kind, dailyCap = 1, resetText = '', expiryText = '', missLimit = 3 }: VisualProps) {
  switch (kind) {
    case 'village-move':
      return (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <TutorialKeyCap label="W" />
            <div className="flex items-center gap-1">
              <TutorialKeyCap label="A" />
              <TutorialKeyCap label="S" />
              <TutorialKeyCap label="D" />
            </div>
          </div>
          <PixelIcon glyph="caretRight" size={12} className="text-text-dim" />
          <PersonSprite look={TUTORIAL_PLAYER_LOOK} scale={2} />
        </div>
      );
    case 'village-cast':
      return (
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <TutorialBobberCanvas />
          <TutorialKeyCap label="Space" />
          <Badge tone="accent" size="sm">터치 가능</Badge>
        </div>
      );
    case 'village-idle':
      return (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge tone="dim" size="sm">찌 유지</Badge>
          <PixelIcon glyph="caretRight" size={12} className="text-text-dim" />
          <Badge tone="dim" size="sm" inline>
            <PixelIcon glyph="clock" size={12} />대기
          </Badge>
          <PixelIcon glyph="caretRight" size={12} className="text-text-dim" />
          <Badge tone="gold" size="sm" inline>
            <PixelIcon glyph="fish" size={12} />자동 포획
          </Badge>
        </div>
      );
    case 'village-home':
      return (
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Inset border="gold" className="px-3 py-2 flex items-center gap-2 text-xs text-text">
            <PixelIcon glyph="coin" size={16} className="text-gold" />
            <span>궤짝 판매</span>
            <span className="pf-accent text-gold">+G</span>
          </Inset>
          <Inset border="accent" className="px-3 py-2 flex items-center gap-2 text-xs text-text">
            <GearSprite kind="rod" preset="row" />
            <span>작업대 강화</span>
            <span className="pf-accent text-accent">+파워</span>
          </Inset>
        </div>
      );
    case 'sea-zones':
      return (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {TUTORIAL_ZONE_NAMES.map((name, i) => (
            <Badge key={name} tone={i === 0 ? 'gold' : 'dim'} size="sm" inline>
              <PixelIcon glyph="fish" size={12} />
              {name}
            </Badge>
          ))}
        </div>
      );
    case 'sea-boat':
      return (
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Inset border="line" className="px-2.5 py-1.5 flex flex-col items-center gap-1">
            <BoatSprite tier={1} preset="row" />
            <span className="text-xs text-text-dim">{TUTORIAL_BOAT_LABELS.tier1}</span>
          </Inset>
          <PixelIcon glyph="caretRight" size={12} className="text-gold" />
          <Inset border="gold" className="px-2.5 py-1.5 flex flex-col items-center gap-1">
            <BoatSprite tier={2} preset="row" />
            <span className="text-xs text-gold">{TUTORIAL_BOAT_LABELS.tier2}</span>
          </Inset>
        </div>
      );
    case 'sea-power':
      return (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <GearSprite kind="rod" preset="row" />
          <span className="border border-danger bg-surface px-2 py-1 text-xs text-danger">내 파워 부족</span>
          <PixelIcon glyph="caretRight" size={12} className="text-text-dim" />
          <Badge tone="gold" size="sm">해역 요구 파워</Badge>
        </div>
      );
    case 'sea-harbor':
      return (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Inset border="gold" className="px-2.5 py-1.5 flex items-center gap-1.5 text-xs text-gold">
            <PixelIcon glyph="coin" size={14} />항구 정비
          </Inset>
          <PixelIcon glyph="caretRight" size={12} className="text-text-dim" />
          <Inset border="accent" className="px-2.5 py-1.5 flex items-center gap-1.5 text-xs text-accent">
            <PixelIcon glyph="boat" size={14} />여객선 마을 복귀
          </Inset>
        </div>
      );
    case 'sea-map':
      return (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Inset border="line" className="px-2.5 py-1.5 flex items-center gap-1.5 text-xs text-text">
            <PixelIcon glyph="compass" size={14} className="text-accent" />오른쪽 아래 미니맵
          </Inset>
          <PixelIcon glyph="caretRight" size={12} className="text-gold" />
          <Badge tone="gold" size="sm">세계지도 열기</Badge>
        </div>
      );
    case 'quest-accept':
      return (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge tone="gold" size="sm">1 수주</Badge>
          <PixelIcon glyph="caretRight" size={12} className="text-text-dim" />
          <Badge tone="accent" size="sm">2 해당 구역 포획</Badge>
          <PixelIcon glyph="caretRight" size={12} className="text-text-dim" />
          <Badge tone="dim" size="sm">진척 반영</Badge>
        </div>
      );
    case 'quest-complete':
      return (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Inset border="line" className="px-2.5 py-1.5 flex items-center gap-1.5 text-xs text-text">
            <PixelIcon glyph="backpack" size={14} />가방 물고기 유지
          </Inset>
          <PixelIcon glyph="caretRight" size={12} className="text-gold" />
          <Badge tone="gold" size="sm" inline>
            <PixelIcon glyph="coin" size={12} />완료 (+G)
          </Badge>
        </div>
      );
    case 'quest-reset':
      return (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge tone="gold" size="sm">하루 {dailyCap}번</Badge>
          <Badge tone="dim" size="sm" inline>
            <PixelIcon glyph="clock" size={12} />{resetText} 교체
          </Badge>
        </div>
      );
    case 'named-encounter':
      return (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge tone="gold" size="sm">토벌 수주</Badge>
          <PixelIcon glyph="caretRight" size={12} className="text-text-dim" />
          <Badge tone="dim" size="sm">해당 구역 낚시</Badge>
          <PixelIcon glyph="caretRight" size={12} className="text-text-dim" />
          <Inset border="epic" className="px-2 py-0.5 text-xs text-epic">흔적 포착</Inset>
        </div>
      );
    case 'named-trace':
      return (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Inset border="epic" className="px-2.5 py-1.5 flex items-center gap-1.5 text-xs text-epic">
            <PixelIcon glyph="warn" size={14} />바다 흔적 카드
          </Inset>
          <Badge tone="dim" size="sm" inline>
            <PixelIcon glyph="clock" size={12} />{expiryText}
          </Badge>
        </div>
      );
    case 'named-duel':
      return (
        <div className="flex flex-col items-center gap-2.5">
          <div className="flex items-center gap-2">
            <div className="relative w-36 h-4 bg-surface border border-line" aria-hidden="true">
              <div className="absolute top-0 bottom-0 left-[38%] w-[24%] bg-gold" />
              <div className="absolute top-0 bottom-0 left-[49%] w-0.5 bg-text" />
            </div>
            <Badge tone="gold" size="xs">금색 칸 명중</Badge>
          </div>
          <SlotGauge label="도주" total={missLimit} filled={1} tone="dim" />
        </div>
      );
    case 'named-alert':
      return (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge tone="dim" size="sm" inline>
            <PixelIcon glyph="gear" size={12} />알림 켜짐
          </Badge>
          <PixelIcon glyph="caretRight" size={12} className="text-text-dim" />
          <Badge tone="gold" size="sm" inline>
            <PixelIcon glyph="warn" size={12} />브라우저 알림
          </Badge>
        </div>
      );
    case 'named-relic':
      return (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Inset border="accent" className="px-2.5 py-1.5 flex items-center gap-1.5 text-xs text-accent">
            <PixelIcon glyph="gem" size={14} />교환 재료
          </Inset>
          <PixelIcon glyph="caretRight" size={12} className="text-gold" />
          <Inset border="gold" className="px-2.5 py-1.5 flex items-center gap-1.5 text-xs text-gold">
            <PixelIcon glyph="star" size={14} />수배판 유물 교환
          </Inset>
        </div>
      );
  }
}
