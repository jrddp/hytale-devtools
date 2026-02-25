export const COMMENT_DEFAULT_NAME = 'Comment';
export const COMMENT_DEFAULT_TEXT = '';
export const COMMENT_DEFAULT_WIDTH = 320;
export const COMMENT_DEFAULT_HEIGHT = 220;
export const COMMENT_MIN_WIDTH = 220;
export const COMMENT_MIN_HEIGHT = 140;
export const COMMENT_DEFAULT_FONT_SIZE = 13;
export const COMMENT_MIN_FONT_SIZE = 8;
export const COMMENT_MAX_FONT_SIZE = 128;

export function readCommentName(candidateName: unknown) {
  return typeof candidateName === 'string' ? candidateName : COMMENT_DEFAULT_NAME;
}

export function readCommentText(candidateText: unknown) {
  return typeof candidateText === 'string' ? candidateText : COMMENT_DEFAULT_TEXT;
}

export function readCommentFontSize(candidateFontSize: unknown) {
  const fontSize = Number(candidateFontSize);
  return Number.isFinite(fontSize) ? fontSize : COMMENT_DEFAULT_FONT_SIZE;
}
