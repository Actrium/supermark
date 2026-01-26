// Side-effect import: registers container renderers from generated registry.
// This file is safe even if the generated output is missing in dev environments.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('../../../generated/container.renderers.rn');
} catch {
  // ignore
}
