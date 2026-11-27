// 브라우저 Document Picture-in-Picture 창 열기, 크기 조절, 스타일 이식을 맡는 플랫폼 어댑터.

export interface DocumentPipWindowOptions {
  width: number;
  height: number;
  disallowReturnToOpener?: boolean;
  preferInitialWindowPlacement?: boolean;
}

interface DocumentPictureInPictureApi {
  requestWindow?: (options?: DocumentPipWindowOptions) => Promise<Window>;
}

function getDocumentPipApi(): DocumentPictureInPictureApi | undefined {
  if (typeof window === 'undefined' || !('documentPictureInPicture' in window)) {
    return undefined;
  }
  return (window as Window & { documentPictureInPicture?: DocumentPictureInPictureApi }).documentPictureInPicture;
}

/** 현재 브라우저가 Document Picture-in-Picture API를 지원하는지 판정한다 */
export function isDocumentPipSupported(): boolean {
  const api = getDocumentPipApi();
  return typeof api?.requestWindow === 'function';
}

/** 지정한 크기의 Document Picture-in-Picture 창을 연다 */
export async function openDocumentPipWindow(opts: DocumentPipWindowOptions): Promise<Window> {
  const api = getDocumentPipApi();
  if (!api?.requestWindow) {
    throw new Error('Document Picture-in-Picture API is not supported');
  }
  return api.requestWindow(opts);
}

/** 창 프레임(브라우저 크롬) 오프셋을 더해 목표 내부 뷰포트 크기에 맞게 PiP 창 크기를 조절한다 */
export function resizeDocumentPipWindow(pipWin: Window, innerW: number, innerH: number): void {
  try {
    const chromeW = Math.max(0, pipWin.outerWidth - pipWin.innerWidth);
    const chromeH = Math.max(0, pipWin.outerHeight - pipWin.innerHeight);
    pipWin.resizeTo(Math.round(innerW + chromeW), Math.round(innerH + chromeH));
  } catch {
    // 브라우저 환경에 따라 창 크기 조절이 제한될 수 있다
  }
}

/** 오프너 문서의 스타일시트와 전용 CSS를 PiP 문서에 이식한다 */
export function injectPipStyles(pipDoc: Document, extraCss: string): void {
  pipDoc.documentElement.lang = 'ko';
  pipDoc.documentElement.className = document.documentElement.className;

  for (const prev of pipDoc.head.querySelectorAll('[data-pf-pip-style]')) {
    prev.remove();
  }

  for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) {
    if (node.tagName === 'LINK') {
      const srcLink = node as HTMLLinkElement;
      if (!srcLink.href) continue;
      const link = pipDoc.createElement('link');
      link.rel = 'stylesheet';
      link.href = srcLink.href;
      if (srcLink.crossOrigin) link.crossOrigin = srcLink.crossOrigin;
      link.setAttribute('data-pf-pip-style', 'inherited');
      pipDoc.head.appendChild(link);
    } else if (node.textContent) {
      const style = pipDoc.createElement('style');
      style.textContent = node.textContent;
      style.setAttribute('data-pf-pip-style', 'inherited');
      pipDoc.head.appendChild(style);
    }
  }

  const pipStyle = pipDoc.createElement('style');
  pipStyle.setAttribute('data-pf-pip', '');
  pipStyle.setAttribute('data-pf-pip-style', 'own');
  pipStyle.textContent = [
    'html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: var(--c-bg, #0a1526); }',
    extraCss,
  ].join('\n');
  pipDoc.head.appendChild(pipStyle);
}
