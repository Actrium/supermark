declare module 'markdown-it-container' {
  import type MarkdownIt from 'markdown-it';

  interface ContainerOptions {
    marker?: string;
    validate?(params: string, markup: string): boolean;
    render?(
      tokens: any[],
      idx: number,
      options: unknown,
      env: unknown,
      self: { renderToken(tokens: any[], idx: number, options: unknown, env: unknown, self: unknown): string }
    ): string;
  }

  type ContainerPlugin = (md: MarkdownIt, name: string, options?: ContainerOptions) => void;

  const container: ContainerPlugin;
  export default container;
}
