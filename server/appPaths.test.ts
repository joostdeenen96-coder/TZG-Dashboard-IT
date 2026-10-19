import assert from "node:assert/strict";
import test from "node:test";
import { resolveListenPort } from "./appPaths.js";

test("resolveListenPort gebruikt PORT uit de omgeving", () => {
  const previous = process.env.PORT;
  process.env.PORT = "9090";
  try {
    assert.equal(resolveListenPort(), 9090);
  } finally {
    if (previous === undefined) delete process.env.PORT;
    else process.env.PORT = previous;
  }
});

test("resolveListenPort valt terug op 8080 in production", () => {
  const previousPort = process.env.PORT;
  const previousEnv = process.env.NODE_ENV;
  delete process.env.PORT;
  process.env.NODE_ENV = "production";
  try {
    assert.equal(resolveListenPort(), 8080);
  } finally {
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  }
});
