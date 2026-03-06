import "../env.js";
import { runMigrations } from "./runMigrations";

runMigrations().catch((error) => {
  console.error(error);
  process.exit(1);
});
