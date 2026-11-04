import type { ReactNode } from "react";
import { EmptyState } from "./card";

export type Column<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  /** "primary" : titre de la carte sur téléphone ; "hide-mobile" : masqué sur téléphone */
  mobile?: "primary" | "show" | "hide-mobile";
  className?: string;
};

/**
 * Tableau responsive : tableau classique à partir de la tablette, cartes empilées sur téléphone.
 * Aucune barre de défilement horizontale sur la page.
 */
export function DataTable<T>({ rows, columns, rowKey, empty = "Aucun élément.", caption }:
  { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; empty?: string; caption?: string }) {
  if (rows.length === 0) return <EmptyState title={empty} />;
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <table className="w-full text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="hidden bg-white/5 text-left text-xs tracking-wide text-muted uppercase md:table-header-group">
          <tr>{columns.map((c) => <th key={c.header} scope="col" className={`px-4 py-3 font-semibold ${c.className ?? ""}`}>{c.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {rows.map((r) => (
            <tr key={rowKey(r)} className="relative flex flex-col gap-1.5 px-4 py-3 hover:bg-white/5 md:table-row md:p-0">
              {columns.map((c) => (
                <td key={c.header} className={`${c.mobile === "hide-mobile" ? "hidden md:table-cell" : "block md:table-cell"} md:px-4 md:py-3 ${c.className ?? ""}`}>
                  {c.mobile !== "primary" && c.mobile !== "hide-mobile" && <span className="mr-2 text-xs text-muted md:hidden">{c.header} :</span>}
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
