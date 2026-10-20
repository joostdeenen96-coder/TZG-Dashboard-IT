import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { resolveTrustProxyHops } from "./trustProxy.js";
import { clientKey } from "./rateLimit.js";

test("resolveTrustProxyHops accepteert 1, true en weigert ongeldig", () => {
  assert.equal(resolveTrustProxyHops("1"), 1);
  assert.equal(resolveTrustProxyHops("true"), 1);
  assert.equal(resolveTrustProxyHops("yes"), 1);
  assert.equal(resolveTrustProxyHops("0"), 0);
  assert.equal(resolveTrustProxyHops("false"), 0);
  assert.equal(resolveTrustProxyHops(""), 0);
  assert.equal(resolveTrustProxyHops("abc"), 0);
  assert.equal(resolveTrustProxyHops("99"), 0);
  assert.equal(resolveTrustProxyHops("2"), 2);
});

test("trust proxy zet req.ip uit X-Forwarded-For", async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.get("/ip", (req, res) => res.json({ ip: req.ip, secure: req.secure, key: clientKey(req) }));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  // Eén hop (nginx): X-Forwarded-For bevat alleen het client-IP; trust proxy=1 negeert socket=127.0.0.1.
  const response = await fetch(`http://127.0.0.1:${port}/ip`, {
    headers: {
      "x-forwarded-for": "203.0.113.50",
      "x-forwarded-proto": "https",
    },
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { ip: string; secure: boolean; key: string };
  assert.equal(body.ip, "203.0.113.50");
  assert.equal(body.secure, true);
  assert.equal(body.key, "203.0.113.50");
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});
