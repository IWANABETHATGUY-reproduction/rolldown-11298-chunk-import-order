// Builds the cases of rolldown/rolldown#11298 with Rolldown 1.2.11, a Rolldown build of the PR, Rollup
// and esbuild. For each entry, it records the order of the chunk imports, runs the entry chunk in a
// fresh Node process and compares its side effects with the source entry. It prints the results and
// writes them to results.md.
//
// Usage: ROLLDOWN_PR=<rolldown checkout of the PR, built with `just build-rolldown`> node verify.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { init, parse } from 'es-module-lexer';
import esbuild from 'esbuild';
import * as rolldown from 'rolldown';
import { rollup, VERSION as rollupVersion } from 'rollup';

const ROOT = import.meta.dirname;
const prDir = process.env.ROLLDOWN_PR;
if (!prDir) {
  console.error('Set ROLLDOWN_PR to a rolldown checkout of the PR, built with `just build-rolldown`.');
  process.exit(1);
}
const rolldownPr = await import(pathToFileURL(path.join(prDir, 'packages/rolldown/dist/index.mjs')).href);
const prCommit = spawnSync('git', ['-C', prDir, 'rev-parse', '--short=10', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
await init;

const cases = [
  { name: 'chunk_import_source_order', input: { a: 'a.js', b: 'b.js', c: 'c.js' } },
  { name: '122-a', input: { entry1: 'entry1.js', entry2: 'entry2.js', entry3: 'entry3.js' } },
  { name: '122-b', input: { a: 'a.js', b: 'b.js', c: 'c.js' } },
  {
    name: '8989',
    input: { entry0: 'node0.js', entry1: 'node1.js', entry2: 'node2.js', entry3: 'node3.js' },
    preserveEntrySignatures: 'allow-extension',
  },
];

const base = (id) => path.basename(id).replace(/\?.*$/, '');
const inputOf = (c, src) => Object.fromEntries(Object.entries(c.input).map(([k, v]) => [k, path.join(src, v)]));

async function buildRolldown(api, c, src, out) {
  const bundle = await api.rolldown({
    input: inputOf(c, src),
    preserveEntrySignatures: c.preserveEntrySignatures ?? 'exports-only',
    logLevel: 'silent',
  });
  const { output } = await bundle.write({ dir: out, format: 'es', entryFileNames: '[name].js', chunkFileNames: '[name]-[hash].js' });
  await bundle.close();
  return output.filter((o) => o.type === 'chunk').map((o) => ({ file: o.fileName, isEntry: o.isEntry, name: o.name, modules: o.moduleIds.map(base), code: o.code }));
}

async function buildRollup(c, src, out) {
  const bundle = await rollup({
    input: inputOf(c, src),
    preserveEntrySignatures: c.preserveEntrySignatures ?? 'exports-only',
    onwarn() {},
  });
  const { output } = await bundle.write({ dir: out, format: 'es', entryFileNames: '[name].js', chunkFileNames: '[name]-[hash].js' });
  await bundle.close();
  return output.filter((o) => o.type === 'chunk').map((o) => ({ file: o.fileName, isEntry: o.isEntry, name: o.name, modules: Object.keys(o.modules).map(base), code: o.code }));
}

async function buildEsbuild(c, src, out) {
  const input = inputOf(c, src);
  const result = await esbuild.build({
    entryPoints: input,
    bundle: true,
    splitting: true,
    format: 'esm',
    outdir: out,
    absWorkingDir: ROOT,
    metafile: true,
    chunkNames: 'chunk-[hash]',
    logLevel: 'silent',
  });
  const chunks = [];
  for (const [file, meta] of Object.entries(result.metafile.outputs)) {
    if (!file.endsWith('.js')) continue;
    const abs = path.join(ROOT, file);
    chunks.push({
      file: path.relative(out, abs),
      isEntry: Boolean(meta.entryPoint),
      name: meta.entryPoint ? Object.keys(input).find((k) => input[k] === path.join(ROOT, meta.entryPoint)) : undefined,
      modules: Object.keys(meta.inputs).map(base),
      code: fs.readFileSync(abs, 'utf8'),
    });
  }
  return chunks;
}

// The static imports of a chunk, in output order. Each item names the modules of the imported chunk.
function chunkImports(chunk, chunks) {
  const [imports] = parse(chunk.code);
  const seen = new Set();
  const list = [];
  for (const item of imports) {
    if (item.d !== -1 || !item.n?.startsWith('./')) continue;
    const file = item.n.slice(2);
    if (seen.has(file)) continue;
    seen.add(file);
    const target = chunks.find((c) => c.file === file);
    list.push(target ? `[${target.modules.filter((m) => m !== '<runtime>').join('+') || 'runtime'}]` : file);
  }
  return list;
}

function run(file) {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'run-entry.mjs'), pathToFileURL(file).href], { encoding: 'utf8' });
  if (result.status !== 0) return { error: result.stderr.split('\n').find((l) => /Error/.test(l)) ?? `exit ${result.status}` };
  return JSON.parse(result.stdout);
}

const bundlers = [
  { id: 'rolldown', label: `Rolldown ${rolldown.VERSION}`, build: (c, s, o) => buildRolldown(rolldown, c, s, o) },
  { id: 'rolldown-pr', label: `Rolldown #11298 (${prCommit})`, build: (c, s, o) => buildRolldown(rolldownPr, c, s, o) },
  { id: 'rollup', label: `Rollup ${rollupVersion}`, build: buildRollup },
  { id: 'esbuild', label: `esbuild ${esbuild.version}`, build: buildEsbuild },
];

const report = {};
for (const c of cases) {
  const src = path.join(ROOT, 'cases', c.name);
  report[c.name] = {};
  for (const entryName of Object.keys(c.input)) {
    report[c.name][entryName] = { source: run(path.join(src, c.input[entryName])) };
  }
  for (const b of bundlers) {
    const out = path.join(ROOT, 'out', c.name, b.id);
    fs.rmSync(out, { recursive: true, force: true });
    let chunks;
    try {
      chunks = await b.build(c, src, out);
    } catch (error) {
      for (const entryName of Object.keys(c.input)) report[c.name][entryName][b.id] = { error: String(error.message ?? error).split('\n')[0] };
      continue;
    }
    for (const entryName of Object.keys(c.input)) {
      const chunk = chunks.find((ch) => ch.isEntry && ch.name === entryName);
      report[c.name][entryName][b.id] = chunk ? { imports: chunkImports(chunk, chunks), ...run(path.join(out, chunk.file)) } : { error: 'no entry chunk' };
    }
  }
}

// ✓/✗ compares the side effects, in order, and the exported values. A different error is only shown.
const same = (r, s) => JSON.stringify([r.trace, r.values]) === JSON.stringify([s.trace, s.values]);
const describe = (r) => [r.trace.join(', ') || 'no side effects', ...Object.entries(r.values).map(([k, v]) => `${k} = ${JSON.stringify(v)}`)].join('; ');
const errorNote = (r, s) => ((r.threw ?? null) === (s.threw ?? null) ? '' : r.threw ? `throws ${r.threw}` : 'does not throw');
const describeSource = (s) => describe(s) + (s.threw ? `; throws ${s.threw}` : '');

console.log(bundlers.map((b) => b.label).join(', '));
for (const c of cases) {
  console.log(`\n=== ${c.name}`);
  for (const [entryName, results] of Object.entries(report[c.name])) {
    const s = results.source;
    console.log(`  ${entryName}: source ${describeSource(s)}`);
    for (const b of bundlers) {
      const r = results[b.id];
      if (r.error) {
        console.log(`    ${b.label.padEnd(28)} ERROR ${r.error}`);
        continue;
      }
      const ok = same(r, s);
      const notes = [ok ? '' : describe(r), errorNote(r, s)].filter(Boolean).join('; ');
      console.log(`    ${b.label.padEnd(28)} ${ok ? 'same  ' : 'DIFFER'} imports ${r.imports.join(' ') || '-'}${notes ? `  ${notes}` : ''}`);
    }
  }
}

const matches = Object.fromEntries(bundlers.map((b) => [b.id, 0]));
let total = 0;
const rows = [];
for (const c of cases) {
  for (const [entryName, results] of Object.entries(report[c.name])) {
    total++;
    const s = results.source;
    const cells = bundlers.map((b) => {
      const r = results[b.id];
      if (r.error) return `error: ${r.error}`;
      const ok = same(r, s);
      if (ok) matches[b.id]++;
      const imports = r.imports.map((i) => `\`${i}\``).join(' ') || 'no imports';
      const notes = [ok ? '' : describe(r), errorNote(r, s)].filter(Boolean).join('; ');
      return `${ok ? '✓' : '✗'} ${imports}${notes ? `<br>${notes}` : ''}`;
    });
    rows.push(`| \`${c.name}\` / ${entryName} | ${describeSource(s)} | ${cells.join(' | ')} |`);
  }
}
const md = [
  '# Results',
  '',
  'Written by `npm run verify`.',
  '',
  '✓ means that the entry chunk runs the same side effects in the same order as the source entry, and exports the same values. Each cell lists the chunks that the entry chunk imports, in output order. Each chunk is shown by its modules. A cell also shows the error of the entry chunk when it is not the same as the error of the source entry.',
  '',
  `| Case / entry | Source | ${bundlers.map((b) => b.label).join(' | ')} |`,
  `| --- | --- | ${bundlers.map(() => '---').join(' | ')} |`,
  ...rows,
  '',
  'Entries with ✓:',
  '',
  ...bundlers.map((b) => `- ${b.label}: ${matches[b.id]} of ${total}`),
];
fs.writeFileSync(path.join(ROOT, 'results.md'), `${md.join('\n')}\n`);
