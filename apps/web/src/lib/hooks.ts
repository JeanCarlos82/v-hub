import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, type ContainerInfo, type ContainerStat } from "./api";
import { useTopic } from "./realtime";

/** Lista de contenedores + estadísticas en vivo. Se refresca sola con los eventos de Docker. */
export function useContainers() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["containers"],
    queryFn: () => api<{ available: boolean; containers: ContainerInfo[]; stats: ContainerStat[] }>("/api/containers"),
    refetchInterval: 30_000,
  });
  const [stats, setStats] = useState<Map<string, ContainerStat>>(new Map());

  useTopic<ContainerStat[]>("containers", (list) => setStats(new Map(list.map((s) => [s.id, s]))));
  useTopic("events", () => qc.invalidateQueries({ queryKey: ["containers"] }));

  const merged = useMemo(() => {
    if (stats.size) return stats;
    return new Map((query.data?.stats ?? []).map((s) => [s.id, s]));
  }, [stats, query.data]);

  /** contenedores agrupados por uuid de recurso de Coolify */
  const byResource = useMemo(() => {
    const m = new Map<string, ContainerInfo[]>();
    for (const c of query.data?.containers ?? []) {
      if (!c.coolifyUuid) continue;
      (m.get(c.coolifyUuid) ?? m.set(c.coolifyUuid, []).get(c.coolifyUuid)!).push(c);
    }
    return m;
  }, [query.data]);

  return { ...query, containers: query.data?.containers ?? [], available: query.data?.available ?? false, stats: merged, byResource };
}
