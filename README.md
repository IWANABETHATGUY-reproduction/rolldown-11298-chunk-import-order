# rolldown#11298: chunk import order in Rolldown, Rollup and esbuild

A reproduction for [rolldown/rolldown#11298](https://github.com/rolldown/rolldown/pull/11298), "fix(code-splitting): keep the source order of chunk imports".

It builds the cases of the PR with Rolldown 1.2.11 (before the PR), a Rolldown build of the PR, Rollup 4.64.0 and esbuild 0.28.2. Then it runs each entry chunk in Node and compares its side effects with the source entry.

## Results

The 5 entries that #11298 changes (✓ = runs like the source):

| Case / entry                    | Source order       | Rolldown 1.2.11 | #11298 | Rollup 4.64.0 | esbuild 0.28.2 |
| ------------------------------- | ------------------ | --------------- | ------ | ------------- | -------------- |
| `chunk_import_source_order` / b | init, read         | ✗               | ✓      | ✗ (1)         | ✓              |
| `122-a` / entry2                | b, c               | ✗               | ✓      | ✗ (1)         | ✓              |
| `122-a` / entry3                | a, b, c            | ✗               | ✗ (2)  | ✗             | ✗ (2)          |
| `122-b` / b                     | 2, 1               | ✗               | ✓      | ✓             | ✓              |
| `8989` / entry1                 | node4 before node3 | ✓               | ✓      | ✓             | ✗              |

1. Rollup moves shared modules into entry chunks, for example `init.js` into `a.js`. The code of a chunk runs after its imports.
2. `a.js` is inside the entry chunk, so it runs after the imports. All four tools do this.

All 13 entries: #11298 runs 12 like the source, Rollup 10, Rolldown 1.2.11 9, and esbuild 7. [results.md](results.md) shows each entry with its chunk imports and its side effects.

## Run it

```sh
npm ci

# In a rolldown checkout: build the PR.
git fetch origin pull/11298/head
git checkout FETCH_HEAD
just build-rolldown

# Here: build each case with each tool, run the output and write results.md.
ROLLDOWN_PR=/path/to/rolldown npm run verify
```

The runner needs a Node version with `module.registerHooks`. I tested with Node 26.8.1.

## Cases

Each folder in `cases/` is a copy of a Rolldown test fixture:

| Folder                      | Rolldown fixture                                                                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chunk_import_source_order` | [`code_splitting/chunk_import_source_order`](https://github.com/rolldown/rolldown/tree/e26073afafc5a443b321cc60405d318a34a1ef04/crates/rolldown/tests/rolldown/code_splitting/chunk_import_source_order) (added by #11298) |
| `122-a`                     | [`issues/122/a`](https://github.com/rolldown/rolldown/tree/e26073afafc5a443b321cc60405d318a34a1ef04/crates/rolldown/tests/rolldown/issues/122/a)                                 |
| `122-b`                     | [`issues/122/b`](https://github.com/rolldown/rolldown/tree/e26073afafc5a443b321cc60405d318a34a1ef04/crates/rolldown/tests/rolldown/issues/122/b)                                 |
| `8989`                      | [`issues/8989`](https://github.com/rolldown/rolldown/tree/e26073afafc5a443b321cc60405d318a34a1ef04/crates/rolldown/tests/rolldown/issues/8989), with `preserveEntrySignatures: 'allow-extension'` |

`run-entry.mjs` runs one entry in a new Node process. It records each `console.log` call and each write to the globals that the fixtures set: `ready`, and `__acyclic_output_fuzz_0` to `__acyclic_output_fuzz_4` (shown as `node0` to `node4`).

#11298 also changes the snapshot of `issues/9225`. That fixture uses `codeSplitting.groups`, a Rolldown option, so it is not here.
