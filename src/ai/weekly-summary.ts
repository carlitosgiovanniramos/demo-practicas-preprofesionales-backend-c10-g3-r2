export interface WeeklyEntry {
  date: Date
  startTime: string
  endTime: string
  hours: number
  activity: string
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Rango [from, to) de una semana que empieza en `weekStart` (AAAA-MM-DD).
 * Las jornadas se guardan como medianoche UTC del día elegido, así que el rango usa UTC.
 * Devuelve `null` si la fecha no existe (por ejemplo 2026-02-31).
 */
export function weekRange(weekStart: string): { from: Date; to: Date } | null {
  const from = new Date(`${weekStart}T00:00:00.000Z`)
  if (Number.isNaN(from.getTime()) || from.toISOString().slice(0, 10) !== weekStart) return null
  return { from, to: new Date(from.getTime() + 7 * DAY_MS) }
}

/**
 * Plantilla fija del borrador semanal. Solo viajan fecha, horas y actividad (sin inicio ni fin,
 * que no aportan al texto), y la salida tiene forma fija para acotar tokens.
 */
export function buildWeeklySummaryPrompt(entries: WeeklyEntry[]): string {
  const data = entries.map((e) => ({
    fecha: e.date.toISOString().slice(0, 10),
    horas: e.hours,
    actividad: e.activity,
  }))
  return [
    'Rol: redactor de informes de prácticas. Idioma: español. Primera persona, un párrafo de máximo 90 palabras.',
    'Plantilla: "Esta semana registré {total} h en {n} jornadas: {actividades resumidas}. Total: {total} h."',
    'Reglas: usa solo las jornadas del JSON. No inventes actividades ni horas.',
    `Jornadas: ${JSON.stringify(data)}`,
  ].join('\n')
}
