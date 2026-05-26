/**
 * Generic click-to-sort for static tables. Mark a table `data-sortable`
 * and give each sortable header `data-sort` (plus optional
 * `data-sort-type="num"`; default is text). For correct numeric sorting
 * regardless of how a cell is formatted (e.g. "1.79 TB/s" vs "640 GB/s"),
 * put the raw value on each cell as `data-sort-value`; the runtime falls
 * back to the cell's text when that attribute is absent.
 *
 * Clicking a header sorts the tbody rows and toggles direction; cells
 * with no value ("—") sort last. Delegated/re-init on navigation so it
 * works across the prerendered site.
 */

function cellValue(row: HTMLTableRowElement, idx: number): { num: number; text: string; empty: boolean } {
  const cell = row.cells[idx];
  if (!cell) return { num: NaN, text: "", empty: true };
  const raw = cell.getAttribute("data-sort-value");
  const text = (raw ?? cell.textContent ?? "").trim();
  const empty = text === "" || text === "—";
  const num = parseFloat(raw ?? text.replace(/[^0-9.\-]/g, ""));
  return { num, text, empty };
}

function sortBy(table: HTMLTableElement, th: HTMLTableCellElement): void {
  const tbody = table.tBodies[0];
  if (!tbody) return;
  const idx = th.cellIndex;
  const type = th.getAttribute("data-sort-type") === "num" ? "num" : "text";
  const dir = th.getAttribute("data-sort-dir") === "asc" ? "desc" : "asc";
  const sign = dir === "asc" ? 1 : -1;

  // Clear indicators on sibling headers.
  th.parentElement?.querySelectorAll("th[data-sort]").forEach((h) => {
    if (h !== th) {
      h.removeAttribute("data-sort-dir");
      h.removeAttribute("aria-sort");
    }
  });
  th.setAttribute("data-sort-dir", dir);
  th.setAttribute("aria-sort", dir === "asc" ? "ascending" : "descending");

  const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>(":scope > tr"));
  rows.sort((a, b) => {
    const va = cellValue(a, idx);
    const vb = cellValue(b, idx);
    if (va.empty && vb.empty) return 0;
    if (va.empty) return 1; // empties always last
    if (vb.empty) return -1;
    if (type === "num") return (va.num - vb.num) * sign;
    return va.text.localeCompare(vb.text) * sign;
  });
  for (const r of rows) tbody.appendChild(r);
}

function init(): void {
  document.querySelectorAll<HTMLTableElement>("table[data-sortable]").forEach((table) => {
    table.querySelectorAll<HTMLTableCellElement>("th[data-sort]").forEach((th) => {
      if ((th as HTMLElement & { __sortable?: boolean }).__sortable) return;
      (th as HTMLElement & { __sortable?: boolean }).__sortable = true;
      th.classList.add("th-sortable");
      th.setAttribute("tabindex", "0");
      th.addEventListener("click", () => sortBy(table, th));
      th.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          sortBy(table, th);
        }
      });
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
document.addEventListener("astro:page-load", init);

export {};
