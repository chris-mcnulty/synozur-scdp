// Clipboard parsing utilities for TSV/CSV (Excel-compatible)

export function parseClipboard(text: string): string[][] {
  if (!text) return [];
  const trimmed = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const hasTab = trimmed.includes("\t");
  if (hasTab) {
    return trimmed.split("\n").filter((l, i, arr) => !(i === arr.length - 1 && l === "")).map((line) => line.split("\t"));
  }
  return parseCsv(trimmed);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      current += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(current);
      current = "";
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }
  return rows;
}

export function toTsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => (c ?? "").toString().replace(/\t/g, " ").replace(/\n/g, " ")).join("\t")).join("\n");
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const v = (c ?? "").toString();
          if (/[,"\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
          return v;
        })
        .join(","),
    )
    .join("\n");
}

// Parse various date inputs to YYYY-MM-DD; returns null on failure.
export function coerceDate(input: string): string | null {
  if (!input) return null;
  const s = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // M/D or M/D/YYYY
  const md = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (md) {
    const month = parseInt(md[1], 10);
    const day = parseInt(md[2], 10);
    let year: number;
    if (md[3]) {
      year = parseInt(md[3], 10);
      if (year < 100) year += 2000;
    } else {
      year = new Date().getFullYear();
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  // ISO datetime
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${yr}-${mo}-${da}`;
  }
  return null;
}

export function coerceHours(input: string): number | null {
  if (!input) return null;
  const v = parseFloat(input.toString().trim());
  if (isNaN(v)) return null;
  if (v <= 0 || v > 24) return null;
  return Math.round(v * 100) / 100;
}

export function coerceBoolean(input: string): boolean | null {
  if (input === undefined || input === null) return null;
  const s = input.toString().trim().toLowerCase();
  if (["true", "yes", "y", "1", "billable"].includes(s)) return true;
  if (["false", "no", "n", "0", "non-billable", "nonbillable"].includes(s)) return false;
  return null;
}
