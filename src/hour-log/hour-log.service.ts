import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { HourLogStatus, PlacementStatus, Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateHourLogDto } from './dto/create-hour-log.dto'
import { canAccessPlacement } from '../placement/placement-access'
import { hourLogRangeError } from './hour-log.rules'

// D-02 (deuda sembrada, documentada a propósito): este servicio es un
// "god service". `create` valida el DTO, persiste el registro y dispara
// una notificación al tutor; `review` maneja la máquina de estados de
// aprobación; `approvedHours`/`progressReport`/`weeklySummary`/`exportRows`
// agregan y transforman datos para reportes. Ese código convive en el mismo archivo
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

    const rangeError = hourLogRangeError(dto)
    if (rangeError) throw new BadRequestException(rangeError)

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
    if (!canAccessPlacement(placement, userId, role)) throw new ForbiddenException('no tienes acceso a este placement')
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
    const placement = await this.prisma.placement.findUnique({ where: { id: log.placementId } })
    if (!placement) throw new NotFoundException('placement no encontrado')
    if (placement.tutorId !== reviewerId) throw new ForbiddenException('solo el tutor asignado puede revisar este registro')
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
      // D-06: misma regla que en `create`, compartida desde hour-log.rules.
      const rangeError = hourLogRangeError(dto)
      if (rangeError) throw new BadRequestException(rangeError)

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
