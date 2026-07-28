process.argv[2] ??= 'commonmark';
await import('./update-baseline.mjs');
