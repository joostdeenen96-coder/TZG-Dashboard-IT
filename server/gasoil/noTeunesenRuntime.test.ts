import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.dirname(fileURLToPath(import.meta.url));

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listFiles(full));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry) && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

test("geen runtime-request naar teunesen.nl/verkoop in gasoil-code", () => {
  const files = listFiles(root);
  assert.ok(files.length > 0);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.equal(
      text.includes("teunesen.nl/verkoop"),
      false,
      `${path.relative(root, file)} mag teunesen.nl/verkoop niet bevatten`,
    );
  }
});
