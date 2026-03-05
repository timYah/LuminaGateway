import { Hono } from "hono";
import { z } from "zod";
import {
  createProvider,
  getAllProviders,
  updateProvider,
} from "../services/providerService";

const providerSchema = z.object({
  name: z.string().min(1),
  protocol: z.enum(["openai", "anthropic", "google"]),
  baseUrl: z.string().min(1),
  apiKey: z.string().min(1),
  balance: z.number().optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().optional(),
});

export const adminRoutes = new Hono();

adminRoutes.get("/admin/providers", async (c) => {
  const providers = await getAllProviders();
  return c.json({ providers });
});

adminRoutes.post("/admin/providers", async (c) => {
  const body = await c.req.json();
  const parsed = providerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: "Invalid request" } }, 400);
  }
  const provider = await createProvider(parsed.data);
  return c.json({ provider }, 201);
});

adminRoutes.patch("/admin/providers/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  const provider = await updateProvider(id, body);
  return c.json({ provider });
});
