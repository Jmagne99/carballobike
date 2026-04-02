/** Columnas Kanban Service (3 = semáforo): ingreso/diagnóstico → taller → listo */
export type ServiceKanbanCol = "svc_ingreso" | "svc_reparacion" | "svc_listo";

export function serviceColumnOf(estado: string): ServiceKanbanCol {
  if (estado === "ingresada" || estado === "diagnostico") return "svc_ingreso";
  if (estado === "en_reparacion") return "svc_reparacion";
  if (estado === "listo") return "svc_listo";
  return "svc_ingreso";
}

/** Nuevo estado al soltar en otra columna; null = sin cambio */
export function serviceEstadoAfterDrop(col: ServiceKanbanCol, estadoActual: string): string | null {
  if (serviceColumnOf(estadoActual) === col) return null;
  if (col === "svc_ingreso") return "diagnostico";
  if (col === "svc_reparacion") return "en_reparacion";
  return "listo";
}
