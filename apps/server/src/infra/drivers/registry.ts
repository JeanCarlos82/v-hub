import type { DbKind, Driver } from "../../domain/database.js";
import type { DriverFactory } from "../../domain/ports.js";
import { mongoDriver } from "./mongo.js";
import { mysqlDriver } from "./mysql.js";
import { postgresDriver } from "./postgres.js";
import { redisDriver } from "./redis.js";

/** Un driver por motor. Para añadir uno: implementa `Driver` y regístralo aquí. */
const registry: Record<DbKind, (url: string) => Driver> = {
  postgres: postgresDriver,
  mysql: mysqlDriver,
  redis: redisDriver,
  mongodb: mongoDriver,
};

export const driverFactory: DriverFactory = {
  create: (kind, url) => registry[kind](url),
};
