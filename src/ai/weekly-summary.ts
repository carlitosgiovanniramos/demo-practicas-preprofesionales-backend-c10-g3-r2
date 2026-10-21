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
 * Prompt del borrador semanal. Los datos van como JSON para que el modelo no los mezcle con
 * instrucciones; la regla de no inventar actividades es explícita.
 */
export function buildWeeklySummaryPrompt(entries: WeeklyEntry[]): string {
  const data = entries.map((e) => ({
    fecha: e.date.toISOString().slice(0, 10),
    inicio: e.startTime,
    fin: e.endTime,
    horas: e.hours,
    actividad: e.activity,
  }))
  return [
    'Redacta en español un borrador de informe semanal de prácticas preprofesionales.',
    'Usa únicamente las jornadas del JSON. No inventes actividades, fechas ni horas.',
    'Máximo 120 palabras, en primera persona, con un párrafo y el total de horas.',
    '',
    'Jornadas (JSON):',
    JSON.stringify(data),
  ].join('\n')
}
