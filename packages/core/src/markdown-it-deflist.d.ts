declare module 'markdown-it-deflist' {
  import type MarkdownIt from 'markdown-it';

  function deflist(md: MarkdownIt): void;

  export default deflist;
}
