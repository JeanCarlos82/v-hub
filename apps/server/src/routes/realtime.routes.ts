import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import type { Services } from "../container.js";

type Send = (topic: string, data: unknown) => void;
/** Empieza a emitir el topic por `send` y devuelve la función que lo detiene. */
type TopicHandler = (topic: string, send: Send) => (() => void) | Promise<() => void>;

/**
 * Topics disponibles. Las claves que acaban en ":" son prefijos (p. ej. "logs:<containerId>").
 * Para añadir un stream nuevo basta con registrar aquí su handler.
 */
function topicHandlers({ telemetry, containers }: Services): Record<string, TopicHandler> {
  return {
    host: (topic, send) => telemetry.subscribe((s) => send(topic, s)),

    containers: (topic, send) => {
      const off = containers.subscribeStats((s) => send(topic, s));
      const latest = containers.latestStats();
      if (latest.length) send(topic, latest);
      return off;
    },

    events: (topic, send) => containers.subscribeEvents((e) => send(topic, e)),

    "logs:": async (topic, send) => {
      try {
        const { stream, stop } = await containers.streamLogs(topic.slice(5));
        let buffer = "";
        stream.on("data", (chunk: Buffer) => {
          buffer += chunk.toString("utf8");
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          if (lines.length) send(topic, lines);
        });
        stream.on("end", () => send(topic, ["[V-HUB] stream de logs finalizado"]));
        return stop;
      } catch (e: any) {
        send(topic, [`[V-HUB] error: ${e.message}`]);
        return () => {};
      }
    },
  };
}

/**
 * WebSocket único en /api/ws. El cliente envía {type:"subscribe"|"unsubscribe", topic}
 * y el servidor responde {topic, data}.
 */
export function realtimeRoutes(services: Services) {
  const handlers = topicHandlers(services);
  const handlerFor = (topic: string) =>
    handlers[topic] ?? Object.entries(handlers).find(([k]) => k.endsWith(":") && topic.startsWith(k))?.[1];

  return async (app: FastifyInstance) => {
    app.get("/api/ws", { websocket: true }, (socket: WebSocket) => {
      const cleanups = new Map<string, () => void>();
      const send: Send = (topic, data) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ topic, data }));
      };

      async function subscribe(topic: string) {
        const handler = handlerFor(topic);
        if (!handler || cleanups.has(topic)) return;
        cleanups.set(topic, () => {}); // reserva para evitar dobles suscripciones mientras arranca
        const stop = await handler(topic, send);
        // Si se desuscribió (o se cerró el socket) mientras arrancaba, lo paramos ya
        if (cleanups.has(topic)) cleanups.set(topic, stop);
        else stop();
      }

      function unsubscribe(topic: string) {
        cleanups.get(topic)?.();
        cleanups.delete(topic);
      }

      socket.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "subscribe" && typeof msg.topic === "string") void subscribe(msg.topic);
          if (msg.type === "unsubscribe" && typeof msg.topic === "string") unsubscribe(msg.topic);
        } catch {}
      });
      socket.on("close", () => {
        for (const t of [...cleanups.keys()]) unsubscribe(t);
      });
    });
  };
}
