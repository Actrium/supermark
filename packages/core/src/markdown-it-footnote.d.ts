declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it';

  function footnote(md: MarkdownIt): void;

  export default footnote;
}
