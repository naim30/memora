import { config as loadDotenv } from "dotenv";
import { cleanEnv, str } from "envalid";
import { findPackageJSON } from "node:module";
import { dirname, resolve } from "node:path";

export const rootPath = dirname(findPackageJSON("./", import.meta.url)!);
loadDotenv({ path: resolve(rootPath, ".env") });

export const config = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ["development", "production"],
    default: "production",
    devDefault: "development",
  }),

  SQL_MEMORY_PATH: str({ default: "data", devDefault: "data" }),

  AGENT_NAME: str({ default: "" }),
  AGENT_MEMORY_PATH: str({ default: "" }),
});

const sqlMemoryPath = resolve(rootPath, config.SQL_MEMORY_PATH);

const globalMemoryPath = resolve(sqlMemoryPath, "global");

const agent = config.AGENT_NAME || "default";
const agentBasePath = config.AGENT_MEMORY_PATH
  ? resolve(rootPath, config.AGENT_MEMORY_PATH)
  : resolve(sqlMemoryPath, "agents");
const agentMemoryPath = resolve(agentBasePath, agent);

const databasePath = resolve(sqlMemoryPath, `memory.db`);
const databaseSchemaPath = resolve(rootPath, `src/database/schema.sql`);

export const paths = {
  globalMem: globalMemoryPath,
  agentMem: agentMemoryPath,
  database: databasePath,
  databaseSchema: databaseSchemaPath,
};
