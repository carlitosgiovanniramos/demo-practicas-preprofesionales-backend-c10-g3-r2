import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { hourLogRangeError } from './hour-log.rules'

@Injectable()
export class HourLogExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportRows(placementId: number): Promise<(string | number)[][]> {
    const logs = await this.prisma.hourLog.findMany({
      where: { placementId, deletedAt: null },
      orderBy: { date: 'asc' },
    })
    const rows: (string | number)[][] = [[
      'id', 'fecha', 'inicio', 'fin', 'horas', 'actividad', 'estado', 'revisadoPor',
    ]]

    for (const log of logs) {
      this.validateLog(log.hours, log.startTime, log.endTime)
      rows.push([
        log.id,
        log.date.toISOString().slice(0, 10),
        log.startTime,
        log.endTime,
        log.hours,
        this.escapeCsvField(log.activity),
        log.status,
        log.reviewedById ?? '',
      ])
    }

    const totalHours = rows.slice(1).reduce((total, row) => {
      const hours = row[4]
      return typeof hours === 'number' ? total + hours : total
    }, 0)
    rows.push(['', '', '', '', totalHours, 'TOTAL', '', ''])
    return rows
  }

  private validateLog(hours: number, startTime: string, endTime: string): void {
    const reason = hourLogRangeError({ hours, startTime, endTime })
    if (reason) throw new BadRequestException(reason)
  }

  private escapeCsvField(value: string): string {
    const needsQuoting = value.includes(',') || value.includes('"') || value.includes('\n')
    return needsQuoting ? `"${value.replace(/"/g, '""')}"` : value
  }
}
