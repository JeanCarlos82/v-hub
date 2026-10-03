export interface HostSample {
  ts: number;
  cpu: number; // %
  cores: number;
  mem: { total: number; used: number; pct: number };
  swap: { total: number; used: number };
  disk: { total: number; used: number; pct: number };
  net: { rx: number; tx: number }; // bytes/s
  load: [number, number, number];
  uptime: number; // s
}

/** Agregado por minuto que se guarda para el histórico */
export interface MinuteSample {
  ts: number;
  cpu: number;
  mem: number;
  disk: number;
  rx: number;
  tx: number;
  load1: number;
}
