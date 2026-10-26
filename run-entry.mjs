// Runs one entry in this fresh process and prints the order of its side effects as JSON.
// Usage: node run-entry.mjs <file URL of the entry>
import { registerHooks } from 'node:module';

// The 122/a sources import './a' with no extension, which bundlers resolve and Node does not.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[cm]?js$/.test(specifier)) return nextResolve(`${specifier}.js`, context);
      throw error;
    }
  },
});

const entry = process.argv[2];
const trace = [];
console.log = (...args) => trace.push(`log ${args.join(' ')}`);

// The fixtures write these globals. A setter records each write in order.
const watched = ['ready', '__acyclic_output_fuzz_0', '__acyclic_output_fuzz_1', '__acyclic_output_fuzz_2', '__acyclic_output_fuzz_3', '__acyclic_output_fuzz_4'];
const store = {};
for (const key of watched) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    get: () => store[key],
    set: (value) => {
      store[key] = value;
      trace.push(`set ${key.replace('__acyclic_output_fuzz_', 'node')}`);
    },
  });
}

let ns = {};
let error;
try {
  ns = await import(entry);
} catch (e) {
  error = `${e.name}: ${e.message}`;
}
await new Promise((resolve) => setTimeout(resolve, 20));
const values = {};
for (const [key, value] of Object.entries(ns)) {
  if (typeof value === 'string' || typeof value === 'number') values[key] = value;
}
process.stdout.write(JSON.stringify({ trace, values, ...(error ? { threw: error } : {}) }));
