import "../env.js";
import { getDb, type SqliteDatabase } from "./index";
import { providers, usageLogs } from "./schema";

async function main() {
  const client = getDb() as SqliteDatabase;

  await client.delete(usageLogs);
  await client.delete(providers);

  await client
    .insert(providers)
    .values([
      {
        name: "OpenAI Main",
        protocol: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-openai-demo",
        balance: 100,
        inputPrice: 5,
        outputPrice: 15,
        isActive: true,
        priority: 1,
      },
      {
        name: "Anthropic Backup",
        protocol: "anthropic",
        baseUrl: "https://api.anthropic.com",
        apiKey: "sk-anthropic-demo",
        balance: 50,
        inputPrice: 3,
        outputPrice: 15,
        isActive: true,
        priority: 2,
      },
      {
        name: "Third-Party Proxy",
        protocol: "openai",
        baseUrl: "https://proxy.example.com/v1",
        apiKey: "sk-proxy-demo",
        balance: 20,
        inputPrice: 5.5,
        outputPrice: 16,
        isActive: true,
        priority: 3,
      },
    ])
    .returning({ id: providers.id, name: providers.name });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
