// Document Picture-in-Picture 브라우저 어댑터를 기능 계층에 공개하는 API 경계.
export {
  injectPipStyles,
  isDocumentPipSupported,
  openDocumentPipWindow,
  resizeDocumentPipWindow,
} from '../adapters/documentPip';
export type { DocumentPipWindowOptions } from '../adapters/documentPip';
