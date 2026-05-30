import Database, { type Database as DB } from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { paths } from "../config/config.js";

mkdirSync(dirname(paths.database), { recursive: true });

export const database: DB = new Database(paths.database);
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");

database.exec(readFileSync(paths.databaseSchema, "utf8"));
