export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  created: number;
  labels: Record<string, string>;
  ports: { private: number; public?: number; type: string }[];
  networks: string[];
  /** uuid del recurso de Coolify al que pertenece (si se puede deducir) */
  coolifyUuid: string | null;
}

export interface ContainerStat {
  id: string;
  cpu: number; // % (100 = 1 core)
  memUsed: number;
  memLimit: number;
  memPct: number;
  rx: number; // bytes/s
  tx: number;
  pids: number;
}

export type ContainerAction = "start" | "stop" | "restart" | "pause" | "unpause";

export interface ContainerEvent {
  action: string;
  id: string;
  name?: string;
  ts: number;
}
