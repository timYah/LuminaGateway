import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createApp } from "../app";

const testRoot = ".runtime/admin-ui-test";

afterEach(() => {
  delete process.env.ADMIN_DIST_ROOT;
  delete process.env.GATEWAY_API_KEY;
  rmSync(testRoot, { recursive: true, force: true });
});

describe("admin ui static serving", () => {
  it("serves the built admin ui for browser routes", async () => {
    mkdirSync(join(testRoot, "assets"), { recursive: true });
    writeFileSync(join(testRoot, "index.html"), "<!doctype html><title>Lumina Admin</title>");
    writeFileSync(join(testRoot, "assets", "app.js"), 'console.log("admin")');
    process.env.ADMIN_DIST_ROOT = testRoot;

    const app = createApp();

    const rootRes = await app.request("/");
    expect(rootRes.status).toBe(200);
    expect(await rootRes.text()).toContain("Lumina Admin");

    const providersRes = await app.request("/providers");
    expect(providersRes.status).toBe(200);
    expect(await providersRes.text()).toContain("Lumina Admin");

    const assetRes = await app.request("/assets/app.js");
    expect(assetRes.status).toBe(200);
    expect(await assetRes.text()).toContain('console.log("admin")');
  });

  it("does not hide admin api routes behind the static ui", async () => {
    mkdirSync(testRoot, { recursive: true });
    writeFileSync(join(testRoot, "index.html"), "<!doctype html><title>Lumina Admin</title>");
    process.env.ADMIN_DIST_ROOT = testRoot;
    process.env.GATEWAY_API_KEY = "test-key";

    const app = createApp();
    const res = await app.request("/admin/providers");

    expect(res.status).toBe(401);
  });
});
