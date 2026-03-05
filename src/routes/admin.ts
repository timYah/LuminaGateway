import { Hono } from "hono";
import { createProvider, getAllProviders } from "../services/providerService";

export const adminRoutes = new Hono();

adminRoutes.get("/admin/providers", async (c) => {
  const providers = await getAllProviders();
  return c.json({ providers });
});

adminRoutes.post("/admin/providers", async (c) => {
  const body = await c.req.json();
  const provider = await createProvider(body);
  return c.json({ provider }, 201);
});
