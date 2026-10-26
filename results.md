# Results

Written by `npm run verify`.

✓ means that the entry chunk runs the same side effects in the same order as the source entry, and exports the same values. Each cell lists the chunks that the entry chunk imports, in output order. Each chunk is shown by its modules. A cell also shows the error of the entry chunk when it is not the same as the error of the source entry.

| Case / entry | Source | Rolldown 1.2.11 | Rolldown #11298 (e26073afaf) | Rollup 4.64.0 | esbuild 0.28.2 |
| --- | --- | --- | --- | --- | --- |
| `chunk_import_source_order` / a | set ready; value = "unset" | ✓ `[read.js]` `[init.js]` | ✓ `[read.js]` `[init.js]` | ✓ `[read.js+c.js]` | ✗ `[init.js]` `[read.js]`<br>set ready; value = "ready" |
| `chunk_import_source_order` / b | set ready; value = "ready" | ✗ `[read.js]` `[init.js]`<br>set ready; value = "unset" | ✓ `[init.js]` `[read.js]` | ✗ `[init.js+a.js+b.js]` `[read.js+c.js]`<br>set ready; value = "unset" | ✓ `[init.js]` `[read.js]` |
| `chunk_import_source_order` / c | no side effects; value = "unset" | ✓ `[read.js]` | ✓ `[read.js]` | ✓ no imports | ✓ `[read.js]` |
| `122-a` / entry1 | log c | ✓ `[c.js]` | ✓ `[c.js]` | ✓ no imports | ✓ `[c.js]` |
| `122-a` / entry2 | log b, log c | ✗ `[c.js]` `[b.js]`<br>log c, log b | ✓ `[b.js]` `[c.js]` | ✗ `[c.js+entry1.js]`<br>log c, log b | ✓ `[b.js]` `[c.js]` |
| `122-a` / entry3 | log a, log b, log c | ✗ `[c.js]` `[b.js]`<br>log c, log b, log a | ✗ `[b.js]` `[c.js]`<br>log b, log c, log a | ✗ `[b.js+entry2.js]` `[c.js+entry1.js]`<br>log c, log b, log a | ✗ `[b.js]` `[c.js]`<br>log b, log c, log a |
| `122-b` / a | log 1, log 2, log a | ✓ `[1.js]` `[2.js]` | ✓ `[1.js]` `[2.js]` | ✓ `[1.js]` `[2.js]` | ✗ `[2.js]` `[1.js]`<br>log 2, log 1, log a |
| `122-b` / b | log 2, log 1, log a | ✗ `[1.js]` `[2.js]`<br>log 1, log 2, log a | ✓ `[2.js]` `[1.js]` | ✓ `[2.js]` `[1.js]` | ✓ `[2.js]` `[1.js]` |
| `122-b` / c | log 1, log c | ✓ `[1.js]` | ✓ `[1.js]` | ✓ `[1.js]` | ✓ `[1.js]` |
| `8989` / entry0 | set node0 | ✓ no imports | ✓ no imports | ✓ no imports | ✓ `[runtime]` |
| `8989` / entry1 | set node4, set node3, set node2, set node1; throws TypeError: Cannot assign to property 'ref' of [object Module] | ✓ `[runtime.js+node4.js+node3.js]` `[node2.js]`<br>does not throw | ✓ `[node2.js]` `[runtime.js+node4.js+node3.js]`<br>does not throw | ✓ `[node2.js]` `[node4.js+node3.js]`<br>throws TypeError: Cannot add property ref, object is not extensible | ✗ `[node2.js]` `[node3.js]` `[node4.js]` `[runtime]`<br>set node3, set node2, set node4, set node1; does not throw |
| `8989` / entry2 | set node4, set node3, set node2 | ✓ `[runtime.js+node4.js+node3.js]` | ✓ `[runtime.js+node4.js+node3.js]` | ✓ `[node4.js+node3.js]` | ✗ `[node2.js]` `[node3.js]` `[node4.js]` `[runtime]`<br>set node3, set node2, set node4 |
| `8989` / entry3 | set node4, set node3 | ✓ no imports | ✓ no imports | ✓ no imports | ✗ `[node3.js]` `[node4.js]` `[runtime]`<br>set node3, set node4 |

Entries with ✓:

- Rolldown 1.2.11: 9 of 13
- Rolldown #11298 (e26073afaf): 12 of 13
- Rollup 4.64.0: 10 of 13
- esbuild 0.28.2: 7 of 13
