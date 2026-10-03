import { BadRequestError } from "../domain/errors.js";
import type { AuditLog } from "../domain/ports.js";
import type { ConnectionService } from "./connection.service.js";

/** Cualquier fallo del driver (SQL inválido, conexión caída...) se devuelve como 400 con su mensaje. */
async function asBadRequest<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    throw new BadRequestError(e?.message ?? String(e));
  }
}

/** Navegación y consultas sobre una conexión del explorador. */
export class ExplorerService {
  constructor(
    private readonly connections: ConnectionService,
    private readonly audit: AuditLog,
  ) {}

  private driver(id: string) {
    return this.connections.getDriver(id);
  }

  info(id: string) {
    return asBadRequest(async () => {
      const { driver, name } = await this.driver(id);
      return { name, kind: driver.kind, ...(await driver.info()) };
    });
  }

  namespaces(id: string) {
    return asBadRequest(async () => (await this.driver(id)).driver.namespaces());
  }

  tables(id: string, ns: string) {
    return asBadRequest(async () => (await this.driver(id)).driver.tables(ns));
  }

  structure(id: string, ns: string, table: string) {
    return asBadRequest(async () => (await this.driver(id)).driver.structure(ns, table));
  }

  rows(id: string, ns: string, table: string, opts: { limit: number; offset: number; search?: string }) {
    const limit = Math.min(opts.limit, 1000);
    const offset = Math.max(opts.offset, 0);
    return asBadRequest(async () =>
      (await this.driver(id)).driver.rows(ns, table, { limit, offset, search: opts.search || undefined }),
    );
  }

  query(id: string, text: string, ns?: string) {
    return asBadRequest(async () => {
      const res = await (await this.driver(id)).driver.query(text, ns);
      this.audit.log("explorer.query", id, { text: text.slice(0, 500) });
      return res;
    });
  }
}
