import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { RequestGate } from "../src/lifecycle/request-gate";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

test("applies only the newest response when an older response arrives last", async () => {
  const gate = new RequestGate();
  const applied: string[] = [];
  const first = gate.begin();
  const second = gate.begin();
  const firstResponse = deferred<string>();
  const secondResponse = deferred<string>();

  const apply = async (request: number, response: Promise<string>) => {
    const value = await response;
    if (gate.isCurrent(request)) applied.push(value);
  };

  const secondApply = apply(second, secondResponse.promise);
  const firstApply = apply(first, firstResponse.promise);
  secondResponse.resolve("newer");
  await secondApply;
  firstResponse.resolve("older");
  await firstApply;

  assert.deepEqual(applied, ["newer"]);
});

test("drops an older response that arrives while a newer request is pending", async () => {
  const gate = new RequestGate();
  const applied: string[] = [];
  const first = gate.begin();
  const firstResponse = deferred<string>();

  const firstApply = (async () => {
    const value = await firstResponse.promise;
    if (gate.isCurrent(first)) applied.push(value);
  })();

  gate.begin();
  firstResponse.resolve("older");
  await firstApply;

  assert.deepEqual(applied, []);
});

test("drops responses that arrive after the view is closed", async () => {
  const gate = new RequestGate();
  const applied: string[] = [];
  const request = gate.begin();
  const response = deferred<string>();

  const apply = (async () => {
    const value = await response.promise;
    if (gate.isCurrent(request)) applied.push(value);
  })();

  gate.cancel();
  response.resolve("after-close");
  await apply;

  assert.deepEqual(applied, []);
  assert.equal(gate.isCurrent(gate.begin()), true);
});

test("views invalidate pending requests when they close", async () => {
  const views = await Promise.all(
    [
      "../src/preview/preview-view.ts",
      "../src/diagnostics/diagnostics-view.ts",
      "../src/publication/publication-view.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );

  for (const source of views) {
    const onClose = methodBody(source, "onClose()");
    assert.match(onClose, /\.cancel\(\)/);
  }

  const publication = methodBody(views[2] as string, "onClose()");
  assert.equal(publication.match(/\.cancel\(\)/g)?.length, 3);
  assert.match(
    views[2] as string,
    /private render\([^)]*\): void \{\n\s+if \(this\.closed\) return;/,
  );
});

function methodBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `missing ${signature}`);
  const end = source.indexOf("\n  }", start);
  assert.ok(end > start, `unterminated ${signature}`);
  return source.slice(start, end);
}
