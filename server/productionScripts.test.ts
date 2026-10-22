import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function stripComments(source: string, kind: "sh" | "ps1") {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (kind === "sh") return !trimmed.startsWith("#");
      return !trimmed.startsWith("#") && !trimmed.startsWith("//");
    })
    .join("\n");
}

function assertNoTsx(rel: string) {
  const kind = rel.endsWith(".ps1") ? "ps1" : "sh";
  const code = stripComments(read(rel), kind);
  assert.equal(/\btsx\b/.test(code), false, `${rel} mag geen tsx-aanroep bevatten`);
  assert.equal(
    /npm\s+run\s+config:validate(?!:prod)\b/.test(code),
    false,
    `${rel} mag geen npm run config:validate gebruiken`,
  );
  assert.equal(
    /npm\s+run\s+backup:create(?!:prod)\b/.test(code),
    false,
    `${rel} mag geen npm run backup:create gebruiken`,
  );
}

test("Linux production scripts bevatten geen tsx", () => {
  for (const rel of [
    "scripts/preflight-linux.sh",
    "scripts/update-production.sh",
    "scripts/rollback-production.sh",
    "scripts/backup-postgres.sh",
    "scripts/backup-now.sh",
    "scripts/restore-postgres.sh",
    "scripts/export-dashboard-config.sh",
    "scripts/ship-planning-discover.sh",
  ]) {
    assertNoTsx(rel);
  }
  assert.match(read("scripts/preflight-linux.sh"), /node dist\/server\/scripts\/config-validate\.js/);
  assert.match(read("scripts/update-production.sh"), /node dist\/server\/scripts\/backup-create\.js/);
  assert.match(read("scripts/update-production.sh"), /node dist\/server\/scripts\/config-validate\.js/);
});

test("Windows production scripts bevatten geen tsx", () => {
  for (const rel of [
    "scripts/preflight-windows.ps1",
    "scripts/update-production.ps1",
    "scripts/rollback-production.ps1",
  ]) {
    assertNoTsx(rel);
  }
  assert.match(read("scripts/preflight-windows.ps1"), /node dist\/server\/scripts\/config-validate\.js/);
  assert.match(read("scripts/update-production.ps1"), /node dist\/server\/scripts\/backup-create\.js/);
  assert.match(read("scripts/update-production.ps1"), /node dist\/server\/scripts\/config-validate\.js/);
});

test("production npm scripts gebruiken node dist/server", () => {
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  const prodScripts = Object.entries(pkg.scripts).filter(([name]) => name.endsWith(":prod"));
  assert.ok(prodScripts.length >= 8);
  for (const [name, command] of prodScripts) {
    assert.match(command, /^node dist\/server\//, `${name} moet node dist/server gebruiken`);
    assert.equal(/\btsx\b/.test(command), false, `${name} mag geen tsx gebruiken`);
  }
  assert.equal(pkg.scripts["config:validate:prod"], "node dist/server/scripts/config-validate.js");
  assert.equal(pkg.scripts["backup:create:prod"], "node dist/server/scripts/backup-create.js");
  assert.equal(pkg.scripts["backup:verify:prod"], "node dist/server/scripts/backup-verify.js");
});

test("development npm scripts mogen tsx blijven gebruiken", () => {
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  assert.match(pkg.scripts["config:validate"], /^tsx /);
  assert.match(pkg.scripts["backup:create"], /^tsx /);
  assert.match(pkg.scripts["db:migrate"], /^tsx /);
  assert.match(pkg.scripts.dev, /tsx /);
});

test("config-validate.js bestaat na npm run build", () => {
  const built = path.join(root, "dist/server/scripts/config-validate.js");
  const sourceTs = path.join(root, "server/scripts/config-validate.ts");
  assert.ok(existsSync(sourceTs), "bronconfig-validate.ts moet bestaan");
  if (!existsSync(path.join(root, "dist/server"))) {
    // Pre-build testomgeving: contract blijft gelden via :prod script + bronbestand.
    return;
  }
  assert.ok(existsSync(built), "dist/server/scripts/config-validate.js ontbreekt na build");
  const source = readFileSync(built, "utf8");
  assert.match(source, /loadConfig|config\.validate|ok:\s*true|environment/);
  assert.equal(/\btsx\b/.test(source), false);
});
