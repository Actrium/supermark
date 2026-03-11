declare module 'markdown-it-emoji' {
  import type MarkdownIt from 'markdown-it';

  interface EmojiOptions {
    defs?: Record<string, string>;
    shortcuts?: Record<string, string | string[]>;
    enabled?: string[];
  }

  function emoji(md: MarkdownIt, options?: EmojiOptions): void;

  export default emoji;
}
