import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AppError } from "../../domain/errors.js";

/** Traduce los errores de las capas inferiores a respuestas HTTP `{ error }`. */
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: "Datos inválidos", issues: err.issues });
    if (err instanceof AppError) return reply.code(err.status).send({ error: err.message });
    const status = err.statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.code(status).send({ error: err.message ?? "Error interno" });
  });
}
