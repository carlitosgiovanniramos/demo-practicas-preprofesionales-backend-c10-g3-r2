import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { HourLogStatus, PlacementStatus, Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateHourLogDto } from './dto/create-hour-log.dto'

// D-02 (deuda sembrada, documentada a propósito): este servicio es un
// "god service". `create` valida el DTO, persiste el registro y dispara
// una notificación al tutor; `review` maneja la máquina de estados de
// aprobación; `approvedHours`/`progressReport`/`weeklySummary`/`exportRows`
// agregan y transforman datos para reportes. Todo vive en el mismo archivo
// a propósito: no lo dividas en `HourLogValidationService`,
// `HourLogNotificationService` ni `HourLogReportService`. El objetivo de
// producto es que el equipo que reciba el template identifique el problema
// de mantenibilidad y decida cómo (y cuándo) separarlo — no que nazca ya
// separado.
@Injectable()
export class HourLogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra una jornada de horas para el placement del estudiante.
   *
   * Hace tres cosas en un solo método (síntoma de D-02): revalida el rango
   * de horas y el orden de `startTime`/`endTime` (ver D-06), persiste el
   * registro en estado `SUBMITTED`, y dispara la notificación al tutor.
   *
   * @param dto DTO ya validado por `ValidationPipe` a nivel de HTTP.
   * @param studentId id del usuario autenticado que registra la jornada.
   */
  async create(dto: CreateHourLogDto, studentId: number) {
    const placement = await this.prisma.placement.findUnique({ where: { id: dto.placementId } })
    if (!placement) throw new NotFoundException('placement no encontrado')
    if (placement.studentId !== studentId) throw new BadRequestException('el placement no es tuyo')
    if (placement.status !== PlacementStatus.ACTIVE) {
      throw new BadRequestException('el placement no está activo')
    }

    // D-06 (copia 2): la misma validación que el DTO, con tope 10 en vez de 12.
    if (dto.hours <= 0 || dto.hours > 10) {
      throw new BadRequestException('las horas deben estar entre 0 y 10')
    }
    const [startHour, startMinute] = dto.startTime.split(':').map(Number)
    const [endHour, endMinute] = dto.endTime.split(':').map(Number)
    if (startHour * 60 + startMinute >= endHour * 60 + endMinute) {
      throw new BadRequestException('la hora de inicio debe ser anterior a la de fin')
    }

    // La fecha del registro llega desde el cliente y se persiste tal como fue recibida.
    const created = await this.prisma.hourLog.create({
      data: {
        placementId: dto.placementId,
        date: dto.date,
        startTime: dto.startTime,
        endTime: dto.endTime,
        hours: dto.hours,
        activity: dto.activity,
        status: HourLogStatus.SUBMITTED,
      },
    })

    this.notifyTutor(placement.tutorId, created.id)
    return created
  }

  // D-02: notificación dentro del mismo servicio que persiste y valida.
  private notifyTutor(tutorId: number, hourLogId: number): void {
    console.log(`[notificación] tutor ${tutorId}: nueva hora registrada #${hourLogId}`)
  }

  /**
   * Verifica que quien consulta un placement sea el estudiante dueño, su
   * tutor asignado, o un coordinador.
   */
  async assertPlacementAccess(placementId: number, userId: number, role: Role): Promise<void> {
    const placement = await this.prisma.placement.findUnique({ where: { id: placementId } })
    if (!placement) throw new NotFoundException('placement no encontrado')
    const allowed = role === Role.COORDINATOR || placement.studentId === userId || placement.tutorId === userId
    if (!allowed) throw new ForbiddenException('no tienes acceso a este placement')
  }

  /** Lista el libro de horas completo de un placement, más reciente primero. */
  listForPlacement(placementId: number) {
    return this.prisma.hourLog.findMany({
      where: { placementId, deletedAt: null },
      orderBy: { date: 'desc' },
    })
  }

  /**
   * Aprueba o rechaza un registro de horas.
   *
   * Valida la máquina de estados: solo se revisan registros que están en
   * `SUBMITTED`; de ahí pasan a `APPROVED` o `REJECTED`.
   */
  async review(id: number, status: HourLogStatus, reviewerId: number, note?: string) {
    const log = await this.prisma.hourLog.findUnique({ where: { id } })
    if (!log) throw new NotFoundException('registro de horas no encontrado')
    if (log.status !== HourLogStatus.SUBMITTED) {
      throw new BadRequestException('solo se revisan registros en SUBMITTED')
    }
    return this.prisma.hourLog.update({
      where: { id },
      data: {
        status,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: note,
        version: { increment: 1 },
      },
    })
  }

  /**
   * Suma las horas ya `APPROVED` de un placement.
   *
   * D-02: agregación de reporte en el mismo servicio que valida, persiste
   * y notifica.
   */
  async approvedHours(placementId: number): Promise<number> {
    const result = await this.prisma.hourLog.aggregate({
      where: { placementId, status: HourLogStatus.APPROVED, deletedAt: null },
      _sum: { hours: true },
    })
    return result._sum.hours ?? 0
  }

  /**
   * Reporte de avance de un placement: horas requeridas, horas aprobadas,
   * registros pendientes de revisión, y porcentaje de avance.
   */
  async progressReport(placementId: number) {
    const placement = await this.prisma.placement.findUnique({ where: { id: placementId } })
    if (!placement) throw new NotFoundException('placement no encontrado')
    const approved = await this.approvedHours(placementId)
    const pending = await this.prisma.hourLog.count({
      where: { placementId, status: HourLogStatus.SUBMITTED, deletedAt: null },
    })
    return {
      placementId,
      requiredHours: placement.requiredHours,
      approvedHours: approved,
      pendingLogs: pending,
      percentage: Math.round((approved / placement.requiredHours) * 100),
    }
  }

  // D-02: otra agregación de reporte más, en el mismo servicio que valida,
  // persiste y notifica. Debería vivir en un `HourLogReportService`, pero
  // el punto de la deuda es que nadie lo separó todavía.
  async weeklySummary(placementId: number): Promise<
    {
      week: string
      approvedHours: number
      submittedHours: number
      logsCount: number
      expectedHoursPercentage: number
    }[]
  > {
    const placement = await this.prisma.placement.findUnique({ where: { id: placementId } })
    if (!placement) throw new NotFoundException('placement no encontrado')

    const logs = await this.prisma.hourLog.findMany({
      where: { placementId, deletedAt: null },
      orderBy: { date: 'asc' },
    })

    // Reparto ingenuo de `requiredHours` entre las semanas del placement,
    // para poder comparar el avance semana a semana contra "lo esperado".
    // No es un cálculo de negocio serio (no contempla feriados, licencias,
    // etc.) — es exactamente el tipo de atajo que un `HourLogReportService`
    // dedicado habría cuestionado en revisión de diseño.
    const totalDays = Math.max(
      1,
      Math.ceil((placement.endDate.getTime() - placement.startDate.getTime()) / 86400000),
    )
    const totalWeeks = Math.max(1, Math.ceil(totalDays / 7))
    const expectedHoursPerWeek = placement.requiredHours / totalWeeks

    // No usamos ninguna librería de fechas para agrupar por semana ISO:
    // se calcula a mano, lo que suma más complejidad ciclomática al
    // servicio en vez de delegarla a un util compartido.
    const buckets = new Map<string, { approvedHours: number; submittedHours: number; logsCount: number }>()

    for (const log of logs) {
      // Solo contamos horas que ya pasaron por algún tipo de revisión o
      // que están esperando revisión; los DRAFT no entran al resumen.
      if (log.status !== HourLogStatus.APPROVED && log.status !== HourLogStatus.SUBMITTED) {
        continue
      }

      const week = this.isoWeekLabel(log.date)
      const bucket = buckets.get(week) ?? { approvedHours: 0, submittedHours: 0, logsCount: 0 }

      if (log.status === HourLogStatus.APPROVED) {
        bucket.approvedHours += log.hours
      } else {
        bucket.submittedHours += log.hours
      }
      bucket.logsCount += 1

      buckets.set(week, bucket)
    }

    const summary: {
      week: string
      approvedHours: number
      submittedHours: number
      logsCount: number
      expectedHoursPercentage: number
    }[] = []

    for (const [week, bucket] of buckets.entries()) {
      const expectedHoursPercentage =
        expectedHoursPerWeek > 0 ? Math.round((bucket.approvedHours / expectedHoursPerWeek) * 100) : 0

      summary.push({
        week,
        approvedHours: bucket.approvedHours,
        submittedHours: bucket.submittedHours,
        logsCount: bucket.logsCount,
        expectedHoursPercentage,
      })
    }

    // Orden cronológico. Como `week` tiene formato `AAAA-Wnn`, el orden
    // lexicográfico coincide con el orden cronológico dentro del mismo año.
    summary.sort((a, b) => {
      if (a.week < b.week) return -1
      if (a.week > b.week) return 1
      return 0
    })

    return summary
  }

  // D-02: cálculo manual de semana ISO 8601. Otra pieza de lógica que
  // debería vivir en un helper de fechas compartido y en cambio vive aquí,
  // pegada al resto de responsabilidades del servicio.
  private isoWeekLabel(date: Date): string {
    // Copiamos la fecha a UTC para no arrastrar el timezone del proceso.
    const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))

    // Lunes = 1 ... domingo = 7, para poder mover la fecha al jueves de
    // la misma semana ISO (regla estándar de cálculo de semana ISO 8601).
    const isoDayNumber = copy.getUTCDay() === 0 ? 7 : copy.getUTCDay()
    copy.setUTCDate(copy.getUTCDate() + 4 - isoDayNumber)

    const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1))
    const daysSinceYearStart = (copy.getTime() - yearStart.getTime()) / 86400000
    const weekNumber = Math.ceil((daysSinceYearStart + 1) / 7)

    return `${copy.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`
  }

  // D-02: exporta el libro de horas a filas de CSV, en el mismo servicio
  // que valida y persiste. Debería vivir en un `HourLogExportService`.
  async exportRows(placementId: number): Promise<(string | number)[][]> {
    const logs = await this.prisma.hourLog.findMany({
      where: { placementId, deletedAt: null },
      orderBy: { date: 'asc' },
    })

    const header = ['id', 'fecha', 'inicio', 'fin', 'horas', 'actividad', 'estado', 'revisadoPor']
    const rows: (string | number)[][] = [header]

    for (const dto of logs) {
      // D-06 (copia 3): la misma validación que en `create`, pegada de
      // nuevo en vez de compartida — otra copia más de la divergencia de
      // umbrales entre el DTO (tope 12) y el servicio (tope 10).
      if (dto.hours <= 0 || dto.hours > 10) {
        throw new BadRequestException('las horas deben estar entre 0 y 10')
      }
      const [startHour, startMinute] = dto.startTime.split(':').map(Number)
      const [endHour, endMinute] = dto.endTime.split(':').map(Number)
      if (startHour * 60 + startMinute >= endHour * 60 + endMinute) {
        throw new BadRequestException('la hora de inicio debe ser anterior a la de fin')
      }

      rows.push([
        dto.id,
        dto.date.toISOString().slice(0, 10),
        dto.startTime,
        dto.endTime,
        dto.hours,
        this.escapeCsvField(dto.activity),
        dto.status,
        dto.reviewedById ?? '',
      ])
    }

    // Fila de totales al final del CSV. Se recorren las filas ya
    // construidas en vez de reutilizar `approvedHours` — otra oportunidad
    // perdida de reusar código en vez de recalcular a mano.
    let totalHours = 0
    for (const row of rows.slice(1)) {
      const hoursCell = row[4]
      if (typeof hoursCell === 'number') totalHours += hoursCell
    }
    rows.push(['', '', '', '', totalHours, 'TOTAL', '', ''])

    return rows
  }

  // D-02: escapado de CSV a mano (RFC 4180 mínimo viable), otra
  // responsabilidad más colgada del mismo servicio en vez de una utilidad
  // compartida de exportación.
  private escapeCsvField(value: string): string {
    const needsQuoting = value.includes(',') || value.includes('"') || value.includes('\n')
    if (!needsQuoting) return value
    return `"${value.replace(/"/g, '""')}"`
  }
}
