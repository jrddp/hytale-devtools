export const COMMENT_DEFAULT_NAME = 'Comment';
export const COMMENT_DEFAULT_TEXT = '';
export const COMMENT_DEFAULT_WIDTH = 320;
export const COMMENT_DEFAULT_HEIGHT = 220;
export const COMMENT_MIN_WIDTH = 220;
export const COMMENT_MIN_HEIGHT = 140;
export const COMMENT_DEFAULT_FONT_SIZE = 13;
export const COMMENT_MIN_FONT_SIZE = 8;
export const COMMENT_MAX_FONT_SIZE = 128;

export function normalizeCommentName(candidateName) {
  return typeof candidateName === 'string' && candidateName.trim()
    ? candidateName.trim()
    : COMMENT_DEFAULT_NAME;
}

export function normalizeCommentText(candidateText) {
  return typeof candidateText === 'string' ? candidateText : COMMENT_DEFAULT_TEXT;
}

export function normalizeCommentFontSize(candidateFontSize) {
  const normalizedFontSize = Number(candidateFontSize);
  if (!Number.isFinite(normalizedFontSize)) {
    return COMMENT_DEFAULT_FONT_SIZE;
  }

  const roundedFontSize = Math.round(normalizedFontSize);
  return Math.max(COMMENT_MIN_FONT_SIZE, Math.min(COMMENT_MAX_FONT_SIZE, roundedFontSize));
}
