import { BadRequestException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HourLogExportService } from './hour-log-export.service'

const prisma = { hourLog: { findMany: vi.fn() } }

const validLog = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  date: new Date('2026-04-01T12:00:00.000Z'),
  startTime: '08:00',
  endTime: '12:00',
  hours: 4,
  activity: 'Soporte',
  status: 'APPROVED',
  reviewedById: null,
  ...overrides,
})

describe('HourLogExportService', () => {
  let service: HourLogExportService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new HourLogExportService(prisma as never)
  })

  it('exports rows, escapes CSV delimiters and appends the total', async () => {
    prisma.hourLog.findMany.mockResolvedValue([
      validLog({ activity: 'Soporte, "urgente"\nsegunda línea' }),
      validLog({ id: 2, hours: 2, activity: 'Seguimiento', reviewedById: 8 }),
    ])

    await expect(service.exportRows(7)).resolves.toEqual([
      ['id', 'fecha', 'inicio', 'fin', 'horas', 'actividad', 'estado', 'revisadoPor'],
      [1, '2026-04-01', '08:00', '12:00', 4, '"Soporte, ""urgente""\nsegunda línea"', 'APPROVED', ''],
      [2, '2026-04-01', '08:00', '12:00', 2, 'Seguimiento', 'APPROVED', 8],
      ['', '', '', '', 6, 'TOTAL', '', ''],
    ])
  })

  it('exports only the header and a zero total when there are no records', async () => {
    prisma.hourLog.findMany.mockResolvedValue([])

    await expect(service.exportRows(7)).resolves.toEqual([
      ['id', 'fecha', 'inicio', 'fin', 'horas', 'actividad', 'estado', 'revisadoPor'],
      ['', '', '', '', 0, 'TOTAL', '', ''],
    ])
  })

  it.each([0, 11])('rejects a stored record with %s hours', async (hours) => {
    prisma.hourLog.findMany.mockResolvedValue([validLog({ hours })])

    await expect(service.exportRows(7)).rejects.toThrow(BadRequestException)
  })

  it('rejects stored records whose end time is not after their start time', async () => {
    prisma.hourLog.findMany.mockResolvedValue([validLog({ startTime: '12:00', endTime: '08:00' })])

    await expect(service.exportRows(7)).rejects.toThrow('la hora de inicio debe ser anterior a la de fin')
  })

  it('quotes an activity that contains only a double quote', async () => {
    prisma.hourLog.findMany.mockResolvedValue([validLog({ activity: '"' })])

    const rows = await service.exportRows(7)

    expect(rows[1][5]).toBe('""""')
  })
})
