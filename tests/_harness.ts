/**
 * Lightweight runner-agnostic test harness used by the Galaxy spec suite.
 *
 * Tests register synchronously via describe()/it(); the runner executes them
 * sequentially in registration order. This mirrors the style established by
 * tests/planner-conflict.spec.ts so the whole suite can be driven with `tsx`
 * without depending on vitest, jest, or any other runtime.
 */
type AnyFn = () => void | Promise<void>;

interface Test { name: string; fn: AnyFn; }
interface Group { name: string; tests: Test[]; }

const groups: Group[] = [];
let currentTests: Test[] | null = null;

export function describe(name: string, fn: AnyFn): void {
  const tests: Test[] = [];
  const prev = currentTests;
  currentTests = tests;
  try {
    const ret = fn();
    if (ret && typeof (ret as any).then === "function") {
      throw new Error(`describe(${JSON.stringify(name)}) body must be synchronous`);
    }
  } finally {
    currentTests = prev;
  }
  groups.push({ name, tests });
}

export function it(name: string, fn: AnyFn): void {
  if (!currentTests) throw new Error(`it(${JSON.stringify(name)}) called outside describe()`);
  currentTests.push({ name, fn });
}

export function expect<T>(actual: T) {
  return {
    toBe(v: T) {
      if (actual !== v) throw new Error(`expected ${j(actual)} === ${j(v)}`);
    },
    toEqual(v: any) {
      if (j(actual) !== j(v)) throw new Error(`expected deep eq ${j(actual)} === ${j(v)}`);
    },
    toContain(v: any) {
      const arr = actual as any;
      if (!arr || !arr.includes(v)) throw new Error(`expected ${j(actual)} to include ${j(v)}`);
    },
    toBeTruthy() {
      if (!actual) throw new Error(`expected truthy got ${j(actual)}`);
    },
    toBeFalsy() {
      if (actual) throw new Error(`expected falsy got ${j(actual)}`);
    },
    toBeNull() {
      if (actual !== null) throw new Error(`expected null got ${j(actual)}`);
    },
    toBeGreaterThan(v: number) {
      if (!((actual as any) > v)) throw new Error(`expected > ${v} got ${j(actual)}`);
    },
    toBeGreaterThanOrEqual(v: number) {
      if (!((actual as any) >= v)) throw new Error(`expected >= ${v} got ${j(actual)}`);
    },
    toBeLessThanOrEqual(v: number) {
      if (!((actual as any) <= v)) throw new Error(`expected <= ${v} got ${j(actual)}`);
    },
    toMatch(re: RegExp) {
      if (typeof actual !== "string" || !re.test(actual)) {
        throw new Error(`expected ${j(actual)} to match ${re}`);
      }
    },
  };
}

function j(v: any): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

export async function run(): Promise<void> {
  let passed = 0;
  const failures: string[] = [];
  for (const g of groups) {
    console.log(`\n# ${g.name}`);
    for (const t of g.tests) {
      try {
        await t.fn();
        passed++;
        console.log(`  \u2713 ${t.name}`);
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        failures.push(`${g.name} > ${t.name}: ${msg}`);
        console.log(`  \u2717 ${t.name}: ${msg}`);
      }
    }
  }
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    for (const f of failures) console.log(`FAIL: ${f}`);
    process.exitCode = 1;
  }
}
