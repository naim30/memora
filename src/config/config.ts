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

  MEMORA_PATH: str({ default: "" }),

  AGENT_NAME: str({ default: "default", devDefault: "default" }),
  AGENT_MEMORA_PATH: str({ default: "" }),
});

const basePath = config.MEMORA_PATH
  ? resolve(rootPath, `${config.MEMORA_PATH}/memora`)
  : resolve(rootPath, "data");

const globalMemPath = resolve(basePath, "global");

const agentMemPath = config.AGENT_MEMORA_PATH
  ? resolve(rootPath, `${config.AGENT_MEMORA_PATH}/${config.AGENT_NAME}`)
  : resolve(basePath, `agents/${config.AGENT_NAME}`);

const databasePath = resolve(basePath, `memory.db`);
const databaseSchemaPath = resolve(rootPath, `src/database/schema.sql`);

export const paths = {
  globalMem: globalMemPath,
  agentMem: agentMemPath,
  database: databasePath,
  databaseSchema: databaseSchemaPath,
};
