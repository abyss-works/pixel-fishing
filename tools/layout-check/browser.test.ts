import { describe, expect, it } from 'vitest';
import { chromeCandidates } from './browser';

describe('chromeCandidates', () => {
  it('CHROME_PATH가 있으면 그것만 쓴다', () => {
    expect(chromeCandidates('win32', { CHROME_PATH: 'X:/chrome.exe', ProgramFiles: 'C:/PF' })).toEqual(['X:/chrome.exe']);
  });
  it('Windows는 설치 폴더 환경변수 아래의 통상 경로를 찾는다', () => {
    const list = chromeCandidates('win32', { ProgramFiles: 'C:/PF' });
    expect(list).toHaveLength(1);
    expect(list[0].replaceAll('\\', '/')).toBe('C:/PF/Google/Chrome/Application/chrome.exe');
  });
  it('macOS와 Linux는 통상 경로를 준다', () => {
    expect(chromeCandidates('darwin', {})[0]).toContain('Google Chrome.app');
    expect(chromeCandidates('linux', {})).toContain('/usr/bin/google-chrome');
  });
});
