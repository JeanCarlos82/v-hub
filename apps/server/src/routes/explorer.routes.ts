import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Services } from "../container.js";

export function explorerRoutes({ explorer }: Services) {
  return async (app: FastifyInstance) => {
    app.get<{ Params: { id: string } }>("/api/explorer/:id/info", (req) => explorer.info(req.params.id));

    app.get<{ Params: { id: string } }>("/api/explorer/:id/namespaces", (req) => explorer.namespaces(req.params.id));

    app.get<{ Params: { id: string }; Querystring: { ns: string } }>("/api/explorer/:id/tables", (req) =>
      explorer.tables(req.params.id, req.query.ns),
    );

    app.get<{ Params: { id: string }; Querystring: { ns: string; table: string } }>("/api/explorer/:id/structure", (req) =>
      explorer.structure(req.params.id, req.query.ns, req.query.table),
    );

    app.get<{
      Params: { id: string };
      Querystring: { ns: string; table: string; limit?: string; offset?: string; search?: string };
    }>("/api/explorer/:id/rows", (req) =>
      explorer.rows(req.params.id, req.query.ns, req.query.table, {
        limit: Number(req.query.limit ?? 50),
        offset: Number(req.query.offset ?? 0),
        search: req.query.search,
      }),
    );

    app.post<{ Params: { id: string } }>("/api/explorer/:id/query", async (req) => {
      const { text, ns } = z.object({ text: z.string().min(1), ns: z.string().optional() }).parse(req.body);
      return explorer.query(req.params.id, text, ns);
    });
  };
}
