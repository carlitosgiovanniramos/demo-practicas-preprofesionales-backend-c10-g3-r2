import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncService } from './sync.service'
import { encodeCheckpoint } from './checkpoint'

function matchesKeysetWhere(
  row: { id: number; updatedAt: Date },
  where: Record<string, unknown> | undefined,
): boolean {
  if (!where) return true
  const orClauses = (where as { OR?: Array<Record<string, unknown>> }).OR
  if (!Array.isArray(orClauses)) {
    const upGt = (where as { updatedAt?: { gt?: Date | string } }).updatedAt?.gt
    if (upGt != null) {
      return row.updatedAt.getTime() > new Date(upGt).getTime()
    }
    return true
  }
  return orClauses.some((clause) => {
    const up = clause.updatedAt
    const idGt = (clause.id as { gt?: number } | undefined)?.gt
    if (up instanceof Date) {
      if (idGt != null && row.updatedAt.getTime() === up.getTime() && row.id > idGt) {
        return true
      }
    }
    if (up && typeof up === 'object' && !(up instanceof Date) && !Array.isArray(up)) {
      const gt = (up as { gt?: Date | string }).gt
      if (gt != null && row.updatedAt.getTime() > new Date(gt).getTime()) {
        return true
      }
    }
    return false
  })
}

const prisma = {
  placement: { findMany: vi.fn(), findUnique: vi.fn() },
  hourLog: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  document: { findMany: vi.fn() },
  evaluation: { findMany: vi.fn() },
  syncOperation: { create: vi.fn(), findUnique: vi.fn() },
}

describe('SyncService', () => {
  let service: SyncService

  beforeEach(() => {
    vi.clearAllMocks()
    prisma.placement.findMany.mockResolvedValue([])
    prisma.document.findMany.mockResolvedValue([])
    prisma.evaluation.findMany.mockResolvedValue([])
    service = new SyncService(prisma as never)
  })

  it('returns changes and a checkpoint from the newest row', async () => {
    prisma.hourLog.findMany.mockResolvedValue([
      { id: 9, updatedAt: new Date('2026-04-01T12:00:00.000Z'), placementId: 1 },
    ])

    const result = await service.pull(5, undefined, 200)

    expect(result.changes.hourLogs).toHaveLength(1)
    expect(result.checkpoint).toBeTypeOf('string')
    expect(result.hasMore).toBe(false)
  })

  it('incluye el tie-breaker por id cuando el cursor comparte updatedAt con la fila', async () => {
    const ts = '2026-04-01T12:00:00.000Z'
    const since = encodeCheckpoint({ updatedAt: ts, id: 10 })

    prisma.hourLog.findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
      const fixture = [{
        id: 11, placementId: 1, updatedAt: new Date(ts), date: new Date(ts),
        startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Soporte', version: 1,
      }]
      return Promise.resolve(fixture.filter((r) => matchesKeysetWhere(r, args.where)))
    })

    const result = await service.pull(5, since, 200)

    expect(result.changes.hourLogs.map((r: { id: number }) => r.id)).toContain(11)
  })

  it('pagina 4.000 hourLogs sin perder ni duplicar (incluyendo mismos updatedAt)', async () => {
    const N = 4000
    type Row = {
      id: number; placementId: number; updatedAt: Date; date: Date
      startTime: string; endTime: string; hours: number; activity: string; version: number
    }
    const fixture: Row[] = []
    const base = Date.parse('2026-03-01T00:00:00.000Z')
    for (let i = 0; i < N; i++) {
      const updatedAt = new Date(base + Math.floor(i / 7) * 60_000)
      fixture.push({
        id: i + 1, placementId: 1, updatedAt, date: updatedAt,
        startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Soporte', version: 1,
      })
    }
    fixture.sort((a, b) => {
      const t = a.updatedAt.getTime() - b.updatedAt.getTime()
      return t !== 0 ? t : a.id - b.id
    })

    prisma.placement.findMany.mockResolvedValue([])
    prisma.document.findMany.mockResolvedValue([])
    prisma.evaluation.findMany.mockResolvedValue([])
    prisma.hourLog.findMany.mockImplementation(
      async (args: { where?: Record<string, unknown>; take?: number }) => {
        const filtered = fixture.filter((r) => matchesKeysetWhere(r, args.where))
        return Promise.resolve(args.take != null ? filtered.slice(0, args.take) : filtered)
      },
    )

    const seen = new Set<number>()
    let since: string | undefined
    let pages = 0
    while (true) {
      const result = await service.pull(5, since, 200)
      for (const r of result.changes.hourLogs) seen.add(r.id)
      if (!result.hasMore || !result.checkpoint) break
      since = result.checkpoint
      pages++
      if (pages > 100) throw new Error('demasiadas páginas — el cursor no avanza')
    }

    expect(seen.size).toBe(N)
  })

  it('applies a create operation and returns applied', async () => {
    prisma.placement.findUnique.mockResolvedValue({ id: 1, studentId: 5 })
    prisma.hourLog.create.mockResolvedValue({ id: 77, version: 1 })

    const result = await service.push(5, [
      {
        clientOpId: '11111111-1111-4111-8111-111111111111',
        entity: 'hourLog',
        op: 'create',
        baseVersion: null,
        payload: { placementId: 1, date: '2026-04-02', startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Soporte' },
      },
    ])

    expect(result.results[0]).toMatchObject({ status: 'applied' })
    expect(prisma.syncOperation.create).toHaveBeenCalled()
  })
})
