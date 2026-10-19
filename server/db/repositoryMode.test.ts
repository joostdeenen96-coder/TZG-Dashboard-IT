import assert from "node:assert/strict";
import test from "node:test";
import { resolveRepositoryMode } from "./repositoryMode.js";

test("productie zonder expliciete json-modus gebruikt postgres", () => {
  const previousEnv = process.env.NODE_ENV;
  const previousUrl = process.env.DATABASE_URL;
  const previousMode = process.env.DASHBOARD_REPOSITORY;
  process.env.NODE_ENV = "production";
  delete process.env.DATABASE_URL;
  delete process.env.DASHBOARD_REPOSITORY;
  try {
    assert.equal(resolveRepositoryMode(), "postgres");
  } finally {
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousMode === undefined) delete process.env.DASHBOARD_REPOSITORY;
    else process.env.DASHBOARD_REPOSITORY = previousMode;
  }
});
