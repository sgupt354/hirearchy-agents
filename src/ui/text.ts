// Display-only clean-up: the copy and engine layers still carry emoji, the UI never shows them.

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{2604}\u{2606}-\u{26FF}\u{2700}-\u{2712}\u{2714}\u{2716}\u{2718}-\u{27BF}\u{23E9}-\u{23FA}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;

/** Removes emoji (keeps ✓ ✗ ★ arrows and normal punctuation) and tidies the spacing they leave behind. */
export function clean(text: string): string {
  return text
    // "in ✅ I'll" → "in. I'll": an emoji used as a sentence break becomes a full stop.
    .replace(new RegExp(`([A-Za-z0-9’'])\\s*(?:${EMOJI.source})+\\s+(?=[A-Z0-9])`, 'gu'), '$1. ')
    .replace(EMOJI, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ([.,!?:;)])/g, '$1')
    .replace(/\( /g, '(')
    .trim();
}
