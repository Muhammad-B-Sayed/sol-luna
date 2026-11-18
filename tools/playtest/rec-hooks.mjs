// Module hook: when tools/botlib.js loads, make its tick loop also report each tick's inputs
// to globalThis.__rec, so the playtest can replay the bot's exact inputs as browser key events.
// The source file is not changed; only the in-memory copy that this process loads.
export async function load(url, context, next) {
  const r = await next(url, context);
  if (url.endsWith('/tools/botlib.js')) {
    let src = String(r.source);
    const needle = 'step(L, S, [a, b]);';
    if (!src.includes(needle)) throw new Error('rec-hooks: botlib tick loop not found');
    src = src.replace(needle, 'globalThis.__rec && globalThis.__rec(a, b, S); step(L, S, [a, b]);');
    return { ...r, source: src, shortCircuit: true };
  }
  return r;
}
