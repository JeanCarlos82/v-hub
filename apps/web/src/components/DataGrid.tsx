import { useState } from "react";
import { Modal } from "./ui";

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Tabla de resultados con celdas truncadas; clic en una celda para ver el valor completo. */
export function DataGrid({ columns, rows, offset = 0 }: { columns: string[]; rows: Record<string, unknown>[]; offset?: number }) {
  const [detail, setDetail] = useState<{ col: string; value: unknown } | null>(null);
  if (!columns.length) return <div className="px-4 py-8 text-center text-[13px] text-muted">Sin columnas que mostrar.</div>;
  return (
    <>
      <div className="overflow-auto">
        <table className="w-max min-w-full border-separate border-spacing-0 font-mono text-xs">
          <thead className="sticky top-0 z-10 bg-panel-2">
            <tr>
              <th className="sticky left-0 z-10 w-10 border-b border-r border-line bg-panel-2 px-2 py-2 text-right font-normal text-faint">#</th>
              {columns.map((c) => (
                <th key={c} className="border-b border-r border-line px-3 py-2 text-left font-medium text-muted">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-white/[0.02]">
                <td className="sticky left-0 border-b border-r border-line bg-panel px-2 py-1.5 text-right text-faint">{offset + i + 1}</td>
                {columns.map((c) => {
                  const v = r[c];
                  const text = cell(v);
                  return (
                    <td
                      key={c}
                      onClick={() => setDetail({ col: c, value: v })}
                      className="max-w-[320px] cursor-pointer truncate border-b border-r border-line px-3 py-1.5"
                    >
                      {v === null ? <span className="text-faint">NULL</span> : typeof v === "boolean" ? <span className="text-info">{text}</span> : typeof v === "number" ? <span className="text-warn">{text}</span> : text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="px-4 py-8 text-center text-[13px] text-muted">Sin filas.</div>}
      </div>
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.col ?? ""} wide>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded-md bg-bg p-3 font-mono text-xs">
          {detail && (typeof detail.value === "object" && detail.value !== null ? JSON.stringify(detail.value, null, 2) : cell(detail.value) || "NULL")}
        </pre>
      </Modal>
    </>
  );
}
