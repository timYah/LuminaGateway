import { Hono } from "hono";
import { getAllProviders } from "../services/providerService";

export const adminRoutes = new Hono();

adminRoutes.get("/admin/providers", async (c) => {
  const providers = await getAllProviders();
  return c.json({ providers });
});
