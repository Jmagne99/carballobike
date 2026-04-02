/** Lee bicicletas desde fila Supabase (campo legacy `bicicleta` o JSON/array). */
export function getBicicletasList(row: {
  bicicleta?: string | null;
  bicicletas?: unknown;
}): string[] {
  if (row.bicicletas != null) {
    if (Array.isArray(row.bicicletas)) {
      return row.bicicletas.map(String).filter(Boolean);
    }
    if (typeof row.bicicletas === "string") {
      try {
        const p = JSON.parse(row.bicicletas) as unknown;
        if (Array.isArray(p)) return p.map(String).filter(Boolean);
      } catch {
        /* ignore */
      }
    }
  }
  const b = row.bicicleta;
  if (!b) return [];
  try {
    const p = JSON.parse(b) as unknown;
    if (Array.isArray(p)) return p.map(String).filter(Boolean);
  } catch {
    return [b];
  }
  return [b];
}

/** Persiste en columna `bicicleta`: texto simple o JSON array si hay varias. */
export function bicicletasToDbField(bikes: string[]): string {
  const cleaned = bikes.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];
  return JSON.stringify(cleaned);
}

export function fechaRowYmd(fecha: string | null | undefined): string {
  if (!fecha) return "";
  return fecha.split("T")[0];
}

export function inDateRange(fecha: string | null | undefined, desde: string, hasta: string): boolean {
  const d = fechaRowYmd(fecha);
  if (!d) return false;
  if (desde && d < desde) return false;
  if (hasta && d > hasta) return false;
  return true;
}
