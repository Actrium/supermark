// Visual mode is just run.mjs with the browser comparison switched on, so this
// wrapper only sets the flag and re-enters it.
//
// The source name is not forwarded explicitly and does not need to be: run.mjs
// reads it from process.argv[2], and importing a module does not rewrite argv.
// So `run-visual.mjs cmark-gfm` — how the workflow invokes it — leaves argv[2]
// as "cmark-gfm" for run.mjs to pick up unchanged.
process.env.VISUAL_COMPARE = '1';

await import('./run.mjs');
