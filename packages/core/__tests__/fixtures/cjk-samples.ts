// cjk-allow-file: multi-byte (CJK + emoji) sample text used to exercise UTF-8/UTF-16
// byte-offset accounting in the parser; the exact bytes are load-bearing for the
// assertions that consume this fixture.

/**
 * A short heading containing CJK characters and an emoji, used to verify that
 * `position.byte_offset` / `position.utf16_offset` correctly account for
 * multi-byte UTF-8 sequences (3-byte CJK characters, 4-byte emoji).
 */
export const CJK_HEADING_SAMPLE = '# 标题 😄';
