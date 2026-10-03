import { useEffect, useRef } from "react";

type Listener = (data: any) => void;

/** Un único WebSocket compartido por toda la app, con reconexión y re-suscripción automáticas. */
class Realtime {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private retry = 0;
  private timer: number | undefined;
  status: "connecting" | "open" | "closed" = "closed";
  private statusListeners = new Set<(s: Realtime["status"]) => void>();

  private setStatus(s: Realtime["status"]) {
    this.status = s;
    this.statusListeners.forEach((fn) => fn(s));
  }

  onStatus(fn: (s: Realtime["status"]) => void) {
    this.statusListeners.add(fn);
    return () => void this.statusListeners.delete(fn);
  }

  private connect() {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/ws`);
    this.ws = ws;
    this.setStatus("connecting");
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus("open");
      for (const topic of this.listeners.keys()) this.send({ type: "subscribe", topic });
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      this.listeners.get(msg.topic)?.forEach((fn) => fn(msg.data));
    };
    ws.onclose = () => {
      this.setStatus("closed");
      this.ws = null;
      if (this.listeners.size === 0) return;
      const delay = Math.min(1000 * 2 ** this.retry++, 15_000);
      this.timer = window.setTimeout(() => this.connect(), delay);
    };
  }

  private send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  subscribe(topic: string, fn: Listener): () => void {
    let set = this.listeners.get(topic);
    if (!set) {
      set = new Set();
      this.listeners.set(topic, set);
      this.send({ type: "subscribe", topic });
    }
    set.add(fn);
    this.connect();
    return () => {
      set!.delete(fn);
      if (set!.size === 0) {
        this.listeners.delete(topic);
        this.send({ type: "unsubscribe", topic });
      }
      if (this.listeners.size === 0) {
        window.clearTimeout(this.timer);
        // dejamos el socket abierto un momento por si otra vista se suscribe enseguida
        window.setTimeout(() => {
          if (this.listeners.size === 0) this.ws?.close();
        }, 5000);
      }
    };
  }
}

export const realtime = new Realtime();

export function useTopic<T>(topic: string | null, onData: (data: T) => void) {
  const ref = useRef(onData);
  ref.current = onData;
  useEffect(() => {
    if (!topic) return;
    return realtime.subscribe(topic, (d) => ref.current(d));
  }, [topic]);
}
