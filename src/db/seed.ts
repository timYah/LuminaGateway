import { getDb } from "./index";
import { providers } from "./schema";

async function main() {
  const db = getDb();

  await db.delete(models);
  await db.delete(providers);

  await db.insert(providers).values([
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
    ]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
