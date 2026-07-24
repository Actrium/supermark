export type WebDiagramEngineOptions = Record<string, unknown>;

export function createWebDiagramEngine() {
  return {
    async render() {
      return {
        success: false,
        format: 'text',
        payload: '',
        error: { message: 'CommonMark fixture must not invoke a diagram engine' },
      };
    },
  };
}
