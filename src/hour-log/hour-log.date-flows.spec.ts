import 'reflect-metadata'
import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncOperationInput } from '../sync/dto/push.dto'
import { SyncService } from '../sync/sync.service'
import { CreateHourLogDto } from './dto/create-hour-log.dto'
import { CALENDAR_DATE_MESSAGE } from './hour-log.date'
import { HourLogExportService } from './hour-log-export.service'
import { HourLogReportService } from './hour-log-report.service'
import { HourLogService } from './hour-log.service'

const placement = {
  id: 1, studentId: 5, tutorId: 7, status: 'ACTIVE',
  startDate: new Date('2026-03-01'), endDate: new Date('2026-07-31'), requiredHours: 240,
}
const prisma = {
  placement: { findUnique: vi.fn(), findMany: vi.fn() },
  hourLog: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  document: { findMany: vi.fn() },
  evaluation: { findMany: vi.fn() },
  syncOperation: { findUnique: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}
const hours = new HourLogService(prisma as never)
const reports = new HourLogReportService(prisma as never)
const exports = new HourLogExportService(prisma as never)
const sync = new SyncService(prisma as never)
const pipe = new ValidationPipe({ whitelist: true, transform: true })
const dto = (date: unknown) => ({ placementId: 1, date, startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Soporte' })
const op = (date: unknown, action: 'create' | 'update' = 'create'): SyncOperationInput => ({
  clientOpId: '11111111-1111-4111-8111-111111111111', entity: 'hourLog', op: action,
  baseVersion: null, payload: { ...dto(date), id: 9 },
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-04-02T02:00:00Z'))
  vi.stubEnv('INSTITUTION_TIME_ZONE', 'America/Guayaquil')
  prisma.placement.findUnique.mockResolvedValue(placement)
  prisma.placement.findMany.mockResolvedValue([])
  prisma.document.findMany.mockResolvedValue([])
  prisma.evaluation.findMany.mockResolvedValue([])
  prisma.hourLog.create.mockImplementation(({ data }) => Promise.resolve({ id: 9, ...data }))
  prisma.hourLog.update.mockImplementation(({ data }) => Promise.resolve({ id: 9, ...data }))
  prisma.hourLog.findUnique.mockResolvedValue({ id: 9, status: 'SUBMITTED', version: 1, placement })
  prisma.syncOperation.findUnique.mockResolvedValue(null)
  prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma))
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function httpCreate(date: unknown) {
  const input = await pipe.transform(dto(date), { type: 'body', metatype: CreateHourLogDto })
  return hours.create(input, 5)
}

describe('fecha: HTTP, sync y compatibilidad', () => {
  it.each(['America/Guayaquil', 'Asia/Tokyo', 'Pacific/Auckland', 'America/Los_Angeles'])(
    'un dispositivo en %s guarda el mismo día en HTTP y sync', async (zone) => {
      vi.stubEnv('TZ', zone)
      // El dispositivo serializa la selección de su calendario, no toISOString() de un instante.
      const selected = new Date(2026, 3, 1)
      const day = `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(selected.getDate()).padStart(2, '0')}`
      const online = await httpCreate(day)
      const offline = await sync.push(5, [op(day)])
      expect(JSON.parse(JSON.stringify(online)).date).toBe('2026-04-01T00:00:00.000Z')
      expect(offline.results[0]).toMatchObject({ status: 'applied', server: { date: online.date } })
    },
  )

  it.each(['2026-04-01', '2026-04-01T00:00:00.000Z'])('la edición offline normaliza %s', async (date) => {
    const result = await sync.push(5, [op(date, 'update')])
    expect(result.results[0]).toMatchObject({ status: 'applied', server: { date: new Date('2026-04-01') } })
  })

  it('HTTP acepta el ISO heredado sin convertirlo a la víspera', async () => {
    expect((await httpCreate('2026-04-01T00:00:00.000Z')).date.toISOString()).toBe('2026-04-01T00:00:00.000Z')
  })

  it.each(['2026-02-28', '2026-08-01', '2026-04-02', '2026-02-30', '2026-04-01T23:00:00-05:00', null])(
    'rechaza %j por las tres vías antes de escribir', async (date) => {
      await expect(httpCreate(date)).rejects.toMatchObject({ status: 400 })
      for (const action of ['create', 'update'] as const) {
        const result = await sync.push(5, [op(date, action)])
        expect(result.results[0]).toMatchObject({ status: 'rejected', server: null })
        expect(result.results[0].reason).not.toContain('reintentará')
      }
      expect(prisma.hourLog.create).not.toHaveBeenCalled()
      expect(prisma.hourLog.update).not.toHaveBeenCalled()
    },
  )

  it('HTTP y sync informan el mismo rango válido', async () => {
    const error = 'La fecha debe estar entre 2026-03-01 y 2026-07-31 (inclusive)'
    await expect(httpCreate('2026-02-28')).rejects.toThrow(error)
    expect((await sync.push(5, [op('2026-02-28')])).results[0].reason).toBe(error)
  })

  it('un reintento previamente aplicado no revalida ni modifica la fecha histórica', async () => {
    const response = { status: 'applied', server: { date: '2025-01-01T18:00:00.000Z' } }
    prisma.syncOperation.findUnique.mockResolvedValue({ response })
    expect((await sync.push(5, [op('2025-01-01')])).results[0]).toEqual(response)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('conserva la decisión del tutor antes de validar una edición', async () => {
    prisma.hourLog.findUnique.mockResolvedValue({ id: 9, status: 'APPROVED', version: 2, placement })
    expect((await sync.push(5, [op('2026-08-01', 'update')])).results[0].status).toBe('conflict')
    expect(prisma.hourLog.update).not.toHaveBeenCalled()
  })

  it('un borrado no requiere fecha ni revalida un registro histórico', async () => {
    expect((await sync.push(5, [{ ...op(undefined), op: 'delete', payload: { id: 9 } }])).results[0].status).toBe('applied')
  })

  it.each(['2026-03-02T00:00:00Z', '2026-03-02T18:30:00Z'])(
    'leer, sincronizar y exportar %s conserva el día sin escribirlo', async (date) => {
      const old = { id: 9, ...dto(date), date: new Date(date), status: 'APPROVED', updatedAt: new Date(date) }
      prisma.hourLog.findMany.mockResolvedValue([old])
      vi.stubEnv('TZ', 'America/Los_Angeles')
      expect(await hours.listForPlacement(1)).toEqual([old])
      expect((await sync.pull(5, undefined, 200)).changes.hourLogs).toEqual([old])
      expect((await exports.exportRows(1))[1][1]).toBe('2026-03-02')
      expect((await reports.weeklySummary(1))[0].week).toBe('2026-W10')
      expect(prisma.hourLog.update).not.toHaveBeenCalled()
      expect(prisma.hourLog.create).not.toHaveBeenCalled()
    },
  )
})

describe('outbox con fechas no canónicas (sync rechaza sin escribir ni reinterpretar)', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'America/Guayaquil')
  })

  // Timestamps que una versión previa del cliente pudo dejar en el outbox: no son el ISO de
  // medianoche UTC, así que se rechazan en vez de adivinar el día.
  it.each(['2026-04-01T05:00:00.000Z', '2026-04-01T00:00:00+00:00', '2026-04-01T00:00:01.000Z'])(
    'create con %s se rechaza, se persiste el rechazo y el reintento devuelve el mismo motivo', async (date) => {
      const first = await sync.push(5, [op(date)])
      expect(first.results[0]).toMatchObject({ status: 'rejected', server: null, reason: CALENDAR_DATE_MESSAGE })
      expect(prisma.hourLog.create).not.toHaveBeenCalled()
      expect(prisma.syncOperation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clientOpId: '11111111-1111-4111-8111-111111111111',
          userId: 5,
          response: expect.objectContaining({ status: 'rejected', reason: CALENDAR_DATE_MESSAGE }),
        }),
      })

      prisma.syncOperation.findUnique.mockResolvedValue({ response: first.results[0] })
      const retry = await sync.push(5, [op(date)])
      expect(retry.results[0]).toEqual(first.results[0])
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['2026-04-01T05:00:00.000Z', '2026-04-01T00:00:00+00:00'])(
    'update con %s se rechaza y no modifica la fila histórica', async (date) => {
      const result = await sync.push(5, [op(date, 'update')])
      expect(result.results[0]).toMatchObject({ status: 'rejected', server: null, reason: CALENDAR_DATE_MESSAGE })
      expect(prisma.hourLog.update).not.toHaveBeenCalled()
    },
  )

  it('la misma edición con YYYY-MM-DD sí se aplica tras el rechazo', async () => {
    expect((await sync.push(5, [op('2026-04-01T05:00:00.000Z', 'update')])).results[0].status).toBe('rejected')
    expect((await sync.push(5, [{ ...op('2026-04-01', 'update'), clientOpId: '22222222-2222-4222-8222-222222222222' }])).results[0].status).toBe('applied')
    expect(prisma.hourLog.update).toHaveBeenCalledTimes(1)
  })
})

describe('fallos de aplicación que no son rechazos de fecha', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'America/Guayaquil')
  })

  it('un BadRequestException ajeno a la fecha no se persiste como rechazo y el reintento aplica', async () => {
    prisma.hourLog.create.mockRejectedValueOnce(new BadRequestException('error ajeno a la fecha'))

    const first = await sync.push(5, [op('2026-04-01')])
    expect(first.results[0]).toMatchObject({ status: 'rejected' })
    expect(prisma.syncOperation.create).not.toHaveBeenCalled()

    const second = await sync.push(5, [op('2026-04-01')])
    expect(second.results[0]).toMatchObject({ status: 'applied' })
    expect(prisma.hourLog.create).toHaveBeenCalledTimes(2)
  })
})

describe('semana ISO del resumen semanal sin depender de la zona del proceso', () => {
  it.each(['America/Los_Angeles', 'America/Guayaquil', 'Asia/Tokyo', 'UTC'])(
    'TZ=%s agrupa domingo 29 en W13 y lunes 30 en W14', async (zone) => {
      vi.stubEnv('TZ', zone)
      prisma.hourLog.findMany.mockResolvedValue([
        { id: 1, date: new Date('2026-03-29T00:00:00.000Z'), hours: 2, status: 'APPROVED' },
        { id: 2, date: new Date('2026-03-30T00:00:00.000Z'), hours: 3, status: 'APPROVED' },
      ])
      const weeks = await reports.weeklySummary(1)
      expect(weeks).toEqual([
        expect.objectContaining({ week: '2026-W13', approvedHours: 2 }),
        expect.objectContaining({ week: '2026-W14', approvedHours: 3 }),
      ])
    },
  )
})
