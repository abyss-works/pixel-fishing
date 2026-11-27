// 브라우저 Document PiP 미니 모니터 상단 바다 디오라마 캔버스 렌더러.
// React와 전역 DOM(window/document)에 의존하지 않고 2D 컨텍스트에만 그린다.
import type { FormId } from '../../../content/fish.js';
import type { RarityId } from '../../../content/rarity.js';
import { DEFAULT_LOOK, type Look } from '../../../content/wardrobe.js';
import type { Ctx } from '../../pixel/common.js';
import { fishArt } from '../../pixel/fishArt/index.js';
import type { FishArtStyle, FishArtSubject } from '../../pixel/fishArt/index.js';
import { drawPerson } from '../../pixel/sprites/actors.js';

export interface PipDioramaLeap {
  elapsedS: number;
  flipped: boolean;
  rarity: RarityId;
  form: FormId;
  fishSubject: FishArtSubject;
}

export interface PipDioramaState {
  timeMs: number;
  gameHour: number;
  fishingActive: boolean;
  spotName: string;
  seaTheme: string;
  look?: Look;
  leap: PipDioramaLeap | null;
  fishArtStyle: FishArtStyle;
  reducedMotion?: boolean;
}

interface SkyStop {
  h: number;
  skyTop: string;
  skyBot: string;
  cloud: string;
  waterTop: string;
  waterMid: string;
  waterBot: string;
  horizon: string;
  star: number;
  glow: number;
}

const JUMP_DURATION_S = 0.6;
const JUMP_HEIGHT_PX = 14;

const DEEP_SKY_STOPS: readonly SkyStop[] = [
  { h: 0.0, skyTop: '#060b16', skyBot: '#0e1b33', cloud: '#1d304f', waterTop: '#223f61', waterMid: '#0b2545', waterBot: '#051329', horizon: '#5a8ab8', star: 1.0, glow: 0.9 },
  { h: 5.0, skyTop: '#101b36', skyBot: '#343c5e', cloud: '#49527a', waterTop: '#29486d', waterMid: '#112c4d', waterBot: '#071830', horizon: '#7c8bb0', star: 0.65, glow: 0.5 },
  { h: 6.5, skyTop: '#426491', skyBot: '#e8a882', cloud: '#ffd9bf', waterTop: '#3b7097', waterMid: '#1e4d73', waterBot: '#143554', horizon: '#ffd6b0', star: 0.0, glow: 0.0 },
  { h: 11.5, skyTop: '#6db2dc', skyBot: '#a8daf0', cloud: '#f5fbff', waterTop: '#3f8bc2', waterMid: '#1d6396', waterBot: '#103d6c', horizon: '#d6f0ff', star: 0.0, glow: 0.0 },
  { h: 17.5, skyTop: '#6a9ec4', skyBot: '#d4be9e', cloud: '#fff2e0', waterTop: '#317096', waterMid: '#1d4f73', waterBot: '#154062', horizon: '#ffe4bd', star: 0.0, glow: 0.0 },
  { h: 19.0, skyTop: '#4b5378', skyBot: '#e0825f', cloud: '#ffb899', waterTop: '#2d546d', waterMid: '#18354b', waterBot: '#0d2030', horizon: '#ffab76', star: 0.1, glow: 0.1 },
  { h: 21.5, skyTop: '#15203b', skyBot: '#2b3b60', cloud: '#354873', waterTop: '#244261', waterMid: '#0c203b', waterBot: '#07152a', horizon: '#6c8ab0', star: 0.75, glow: 0.6 },
  { h: 24.0, skyTop: '#060b16', skyBot: '#0e1b33', cloud: '#1d304f', waterTop: '#223f61', waterMid: '#0b2545', waterBot: '#051329', horizon: '#5a8ab8', star: 1.0, glow: 0.9 },
];

function normalizeHour(hourFloat: number): number {
  if (!Number.isFinite(hourFloat)) return 0;
  return ((hourFloat % 24) + 24) % 24;
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function lerpRgb(hexA: string, hexB: string, f: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bl = Math.round(a[2] + (b[2] - a[2]) * f);
  return `rgb(${r},${g},${bl})`;
}

function sampleSkyPalette(hourFloat: number, _seaTheme: string) {
  const stops = DEEP_SKY_STOPS;
  const h = normalizeHour(hourFloat);
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (h >= a.h && h <= b.h) {
      const span = Math.max(0.001, b.h - a.h);
      const f = (h - a.h) / span;
      return {
        skyTop: lerpRgb(a.skyTop, b.skyTop, f),
        skyBot: lerpRgb(a.skyBot, b.skyBot, f),
        cloud: lerpRgb(a.cloud, b.cloud, f),
        waterTop: lerpRgb(a.waterTop, b.waterTop, f),
        waterMid: lerpRgb(a.waterMid, b.waterMid, f),
        waterBot: lerpRgb(a.waterBot, b.waterBot, f),
        horizon: lerpRgb(a.horizon, b.horizon, f),
        star: a.star + (b.star - a.star) * f,
        glow: a.glow + (b.glow - a.glow) * f,
      };
    }
  }
  return stops[0];
}

function rect(
  ctx: Ctx,
  scale: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x) * scale, Math.round(y) * scale, Math.round(w) * scale, Math.round(h) * scale);
}

function drawJumpSparks(
  ctx: Ctx,
  scale: number,
  bobX: number,
  bobY: number,
  jumpElapsedS: number,
  rarity: RarityId,
  ringW: number,
): void {
  if (rarity !== 'epic' && rarity !== 'legendary') return;
  if (jumpElapsedS <= 0 || jumpElapsedS >= JUMP_DURATION_S) return;

  const progress = jumpElapsedS / JUMP_DURATION_S;
  const spread = 0.72 + progress * 0.36;

  if (rarity === 'legendary') {
    const xOffsets = [-10, 10, -7, 8, -1, -11, 11, 5];
    const yOffsets = [-6, -8, -1, -2, -11, 2, 1, -13];

    for (let k = 1; k <= 8; k++) {
      const sampleT = Math.max(0.02, jumpElapsedS - 0.034 * k);
      const sampleP = sampleT / JUMP_DURATION_S;
      const sampleLift = Math.round(Math.sin(sampleP * Math.PI) * JUMP_HEIGHT_PX);
      const sx = Math.max(130, Math.min(154, Math.round(bobX + xOffsets[k - 1] * spread)));
      const sy = Math.round(bobY - sampleLift + yOffsets[k - 1]);

      if (k <= 2) {
        rect(ctx, scale, sx - 2, sy, 5, 1, '#ffd54f');
        rect(ctx, scale, sx, sy - 2, 1, 5, '#ffd54f');
        rect(ctx, scale, sx - 1, sy, 3, 1, '#fff59d');
        rect(ctx, scale, sx, sy - 1, 1, 3, '#fff59d');
        rect(ctx, scale, sx, sy, 1, 1, '#ffffff');
      } else if (k <= 5) {
        rect(ctx, scale, sx - 1, sy, 3, 1, '#ffd54f');
        rect(ctx, scale, sx, sy - 1, 1, 3, '#ffd54f');
        rect(ctx, scale, sx, sy, 1, 1, '#fff8e1');
      } else if (k <= 7) {
        rect(ctx, scale, sx, sy, 2, 2, '#ffd54f');
      } else {
        rect(ctx, scale, sx, sy, 1, 1, '#fff8e1');
      }
    }

    rect(
      ctx,
      scale,
      bobX - ringW + 1,
      bobY + 2,
      Math.max(3, (ringW - 1) * 2 + 1),
      1,
      'rgba(255, 213, 79, 0.75)',
    );
    return;
  }

  const xOffsets = [-9, 9, -6, 8, -10, 6, -2];
  const yOffsets = [-5, -7, -1, 1, -10, -3, -12];

  for (let k = 1; k <= 7; k++) {
    const sampleT = Math.max(0.02, jumpElapsedS - 0.036 * k);
    const sampleP = sampleT / JUMP_DURATION_S;
    const sampleLift = Math.round(Math.sin(sampleP * Math.PI) * JUMP_HEIGHT_PX);
    const sx = Math.max(129, Math.min(155, Math.round(bobX + xOffsets[k - 1] * spread)));
    const sy = Math.round(bobY - sampleLift + yOffsets[k - 1]);

    if (k <= 3) {
      rect(ctx, scale, sx - 1, sy, 3, 1, '#ba68c8');
      rect(ctx, scale, sx, sy - 1, 1, 3, '#ba68c8');
      rect(ctx, scale, sx, sy, 1, 1, '#e1bee7');
    } else if (k <= 5) {
      rect(ctx, scale, sx, sy, 2, 2, '#ba68c8');
    } else {
      rect(ctx, scale, sx, sy, 1, 1, '#ba68c8');
    }
  }
}

/** 2배 정수 픽셀 스케일로 바다 디오라마 장면을 그린다 */
export function renderPipDiorama(
  ctx: Ctx,
  width: number,
  height: number,
  state: PipDioramaState,
): void {
  const reduced = state.reducedMotion === true;
  const t = reduced ? 0 : state.timeMs * 0.001;
  const scale = 2;
  const pw = Math.floor(width / scale);
  const ph = Math.floor(height / scale);
  const horizonY = 22;
  const h = normalizeHour(state.gameHour);
  const pal = sampleSkyPalette(h, state.seaTheme);

  const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY * scale);
  skyGrad.addColorStop(0, pal.skyTop);
  skyGrad.addColorStop(1, pal.skyBot);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, pw * scale, horizonY * scale);

  if (pal.star > 0.04) {
    const stars: readonly [number, number][] = [
      [26, 15],
      [56, 13],
      [96, 5],
      [116, 10],
      [134, 6],
      [150, 12],
      [172, 16],
    ];
    for (let i = 0; i < stars.length; i++) {
      const twinkle = 0.65 + 0.35 * Math.sin(t * 2.1 + i * 1.7);
      const alpha = Math.min(1, pal.star * twinkle);
      rect(ctx, scale, stars[i][0], stars[i][1], 1, 1, `rgba(242,247,251,${alpha.toFixed(2)})`);
    }
  }

  let sunX = -1;
  if (h >= 6 && h < 22) {
    const p = (h - 6) / 16;
    sunX = Math.round(92 + p * 60);
    const sunY = Math.round(18 - Math.sin(p * Math.PI) * 11);
    const warmSun = p < 0.15 || p > 0.85 ? '#ffab76' : '#ffd54f';
    rect(ctx, scale, sunX - 2, sunY - 2, 5, 5, warmSun);
    rect(ctx, scale, sunX - 1, sunY - 3, 3, 7, warmSun);
  }

  let moonX = -1;
  if (h >= 22 || h < 6) {
    const mh = h >= 22 ? h - 22 : h + 2;
    const mp = mh / 8;
    moonX = Math.round(92 + mp * 60);
    const moonY = Math.round(18 - Math.sin(mp * Math.PI) * 11);
    rect(ctx, scale, moonX - 2, moonY - 2, 5, 5, '#ffd54f');
    rect(ctx, scale, moonX, moonY - 1, 3, 3, pal.skyTop);
  }

  const drift = Math.floor(t * 1.1) % (pw + 26);
  const c1x = drift - 14;
  rect(ctx, scale, c1x, 12, 10, 3, pal.cloud);
  rect(ctx, scale, c1x + 2, 10, 6, 2, pal.cloud);

  const waterGrad = ctx.createLinearGradient(0, horizonY * scale, 0, ph * scale);
  waterGrad.addColorStop(0, pal.waterTop);
  waterGrad.addColorStop(0.45, pal.waterMid);
  waterGrad.addColorStop(1, pal.waterBot);
  ctx.fillStyle = waterGrad;
  ctx.fillRect(0, horizonY * scale, pw * scale, (ph - horizonY) * scale);

  rect(ctx, scale, 0, horizonY, pw, 1, pal.horizon);

  const celX = sunX >= 0 ? sunX : moonX;
  if (celX >= 0) {
    const refCol = sunX >= 0 ? 'rgba(255,220,160,0.34)' : 'rgba(159,216,255,0.28)';
    for (let r = 0; r < 4; r++) {
      const rw = Math.max(2, 6 - r);
      const rx = celX - Math.floor(rw / 2) + Math.round(Math.sin(t * 2 + r) * 1.5);
      rect(ctx, scale, rx, horizonY + 3 + r * 4, rw, 1, refCol);
    }
  }

  for (let i = 0; i < 6; i++) {
    const wy = horizonY + 4 + i * 4;
    if (wy >= ph - 2) break;
    const wx = 40 + ((i * 29 + Math.sin(t * 0.8 + i) * 6) % 125);
    rect(ctx, scale, wx, wy, 7, 1, 'rgba(255, 255, 255, 0.16)');
  }

  for (let i = 0; i < 4; i++) {
    if (Math.sin(t * 3 + i * 1.7) > 0.25) {
      const gx = 42 + ((i * 31 + 10) % 120);
      const gy = horizonY + 3 + ((i * 5) % Math.max(4, ph - horizonY - 5));
      rect(ctx, scale, gx, gy, 2, 1, 'rgba(255, 255, 255, 0.28)');
    }
  }

  if (pal.glow > 0.1) {
    const specks: readonly [number, number][] = [
      [48, Math.max(horizonY + 1, ph - 7)],
      [116, Math.max(horizonY + 1, ph - 5)],
      [164, Math.max(horizonY + 1, ph - 8)],
    ];
    for (let i = 0; i < specks.length; i++) {
      if (Math.sin(t * 2.4 + i) > 0) {
        rect(
          ctx,
          scale,
          specks[i][0],
          specks[i][1],
          1,
          1,
          `rgba(159,216,255,${(pal.glow * 0.65).toFixed(2)})`,
        );
      }
    }
  }

  const boatX = 68;
  const boatY = 38;
  // 배 흔들림 범위를 [0, 1]로 제한해 좌상단 해역 칩과 모자 사이 여백을 유지한다
  const rock = reduced ? 0 : Math.round((Math.sin(t * 2.2) + 1) * 0.5);
  const px = boatX + 1;
  const py = boatY - 1 + rock;

  rect(ctx, scale, boatX - 9, boatY - 3 + rock, 18, 1, '#a1887f');
  rect(ctx, scale, boatX - 9, boatY - 2 + rock, 18, 5, '#8d6e63');
  rect(ctx, scale, boatX - 7, boatY + 3 + rock, 14, 2, '#6d4c41');

  ctx.save();
  ctx.scale(scale, scale);
  drawPerson(ctx, px, py, state.look ?? DEFAULT_LOOK);
  ctx.restore();

  if (!state.fishingActive) return;

  const bobX = 142;
  const bobY = 37;
  const rodTipX = px + 13;
  const rodTipY = py - 19;

  for (let i = 0; i < 3; i++) {
    const a = t * 1.6 + i * 2.09;
    const fx = bobX + Math.cos(a) * 7;
    const fy = Math.max(horizonY + 1, Math.min(ph - 4, Math.round(bobY + 2 + Math.sin(a) * 2)));
    rect(ctx, scale, fx - 2, fy, 5, 2, 'rgba(8, 25, 38, 0.55)');
    rect(ctx, scale, fx + 3, fy - 1, 2, 4, 'rgba(8, 25, 38, 0.55)');
  }

  const leap = state.leap;
  const leapActive = leap !== null && (reduced || (leap.elapsedS >= 0 && leap.elapsedS < JUMP_DURATION_S));
  const leapSampleS = leap ? (reduced ? JUMP_DURATION_S / 2 : leap.elapsedS) : -1;
  const bobShift = leapActive && !reduced
    ? Math.sin(t * 28) * 2
    : (reduced ? 0 : Math.round(Math.sin(t * 2)));
  const curBobY = bobY + bobShift;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.52)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rodTipX * scale, rodTipY * scale);
  ctx.lineTo(bobX * scale, (curBobY - 2) * scale);
  ctx.stroke();

  rect(ctx, scale, bobX - 1, curBobY - 2, 3, 3, '#e53935');
  rect(ctx, scale, bobX - 1, curBobY - 4, 3, 2, '#ffffff');

  if (leapActive && leap) {
    const progress = leapSampleS / JUMP_DURATION_S;
    const offsetWorldPx = Math.round(Math.sin(progress * Math.PI) * JUMP_HEIGHT_PX);
    const ringW = Math.round(3 + progress * 8);

    drawJumpSparks(ctx, scale, bobX, bobY, leapSampleS, leap.rarity, ringW);

    if (offsetWorldPx > 0) {
      const fishX = bobX;
      const fishY = bobY - offsetWorldPx;
      fishArt(state.fishArtStyle).drawCentered(
        ctx,
        leap.fishSubject,
        Math.round(fishX * scale),
        Math.round(fishY * scale),
        {
          scale: 1,
          form: leap.form,
          discovered: true,
          flip: leap.flipped,
        },
      );
    }

    rect(ctx, scale, bobX - ringW, bobY + 1, ringW * 2 + 1, 1, 'rgba(242, 247, 251, 0.52)');
    if (progress < 0.35 || progress > 0.65) {
      const dropLift = progress < 0.35 ? Math.round(progress * 16) : Math.round((1 - progress) * 16);
      rect(ctx, scale, bobX - 5, bobY - 2 - dropLift, 1, 1, 'rgba(242, 247, 251, 0.8)');
      rect(ctx, scale, bobX + 5, bobY - 3 - dropLift, 1, 1, 'rgba(242, 247, 251, 0.8)');
      rect(ctx, scale, bobX + 1, bobY - 4 - dropLift, 1, 1, 'rgba(159, 216, 255, 0.85)');
    }
  }

  for (let s = 0; s < 9; s++) {
    rect(ctx, scale, px + 4 + s, py - 10 - s, 2, 1, '#c9a227');
  }
}
