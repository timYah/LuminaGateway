import { getDb } from "./index";
import { models, providers } from "./schema";

async function main() {
  const db = getDb();

  await db.delete(models);
  await db.delete(providers);

  const insertedProviders = await db
    .insert(providers)
    .values([
      {
        name: "OpenAI Main",
        protocol: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-openai-demo",
        balance: 100,
        isActive: true,
        priority: 1,
      },
      {
        name: "Anthropic Backup",
        protocol: "anthropic",
        baseUrl: "https://api.anthropic.com",
        apiKey: "sk-anthropic-demo",
        balance: 50,
        isActive: true,
        priority: 2,
      },
      {
        name: "Third-Party Proxy",
        protocol: "openai",
        baseUrl: "https://proxy.example.com/v1",
        apiKey: "sk-proxy-demo",
        balance: 20,
        isActive: true,
        priority: 3,
      },
    ])
    .returning({ id: providers.id, name: providers.name });

  const providerMap = new Map(insertedProviders.map((p) => [p.name, p.id]));

  await db.insert(models).values([
    {
      providerId: providerMap.get("OpenAI Main")!,
      slug: "gpt-4o",
      upstreamName: "gpt-4o",
      inputPrice: 5,
      outputPrice: 15,
    },
    {
      providerId: providerMap.get("OpenAI Main")!,
      slug: "gpt-4o-mini",
      upstreamName: "gpt-4o-mini",
      inputPrice: 0.15,
      outputPrice: 0.6,
    },
    {
      providerId: providerMap.get("Anthropic Backup")!,
      slug: "claude-sonnet-4-20250514",
      upstreamName: "claude-sonnet-4-20250514",
      inputPrice: 3,
      outputPrice: 15,
    },
    {
      providerId: providerMap.get("Anthropic Backup")!,
      slug: "claude-haiku-3-20240307",
      upstreamName: "claude-haiku-3-20240307",
      inputPrice: 0.25,
      outputPrice: 1.25,
    },
    {
      providerId: providerMap.get("Third-Party Proxy")!,
      slug: "gpt-4o",
      upstreamName: "gpt-4o",
      inputPrice: 5.5,
      outputPrice: 16,
    },
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
