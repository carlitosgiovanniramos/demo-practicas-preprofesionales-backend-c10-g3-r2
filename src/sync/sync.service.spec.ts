import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncService, keysetAndScope, pickEntityCheckpoints } from './sync.service'
import { decodeCheckpoint, encodeCheckpoint } from './checkpoint'

type Row = {
  id: number
  placementId: number
  updatedAt: Date
  date: Date
  startTime: string
  endTime: string
  hours: number
  activity: string
  version: number
}
type Cursor = { updatedAt: Date; id: number }

type CrossEntity = 'placement' | 'hourLog' | 'document' | 'evaluation'
type CrossRow = { id: number; updatedAt: Date; studentId?: number; tutorId?: number; placementId?: number; deletedAt?: Date | null }

function readKeysetFromClause(clause: Record<string, unknown>): Cursor | null {
  const orClauses = clause.OR
  if (Array.isArray(orClauses)) {
    for (const c of orClauses) {
      if (c.updatedAt instanceof Date) {
        const idGt = (c.id as { gt?: number } | undefined)?.gt
        if (idGt != null) return { updatedAt: c.updatedAt, id: idGt }
      }
    }
  }
  const upGt = (clause as { updatedAt?: { gt?: Date | string } }).updatedAt?.gt
  if (upGt != null) return { updatedAt: new Date(upGt), id: 0 }
  return null
}

function extractEntityCursor(
  where: Record<string, unknown> | undefined,
  entity: 'placement' | 'hourLog' | 'document' | 'evaluation',
): Cursor | null {
  if (!where) return null
  const and = (where as { AND?: Array<Record<string, unknown>> }).AND
  if (Array.isArray(and)) {
    for (const clause of and) {
      const cursor = readKeysetFromClause(clause)
      if (cursor) return cursor
    }
  }
  if (entity === 'placement') return readKeysetFromClause(where)
  return null
}

function rowAfter(row: { updatedAt: Date; id: number }, cursor: Cursor | null): boolean {
  if (!cursor) return true
  const t = row.updatedAt.getTime() - cursor.updatedAt.getTime()
  return t > 0 || (t === 0 && row.id > cursor.id)
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
    const since = encodeCheckpoint({
      v: 2,
      placement: null,
      hourLog: { updatedAt: ts, id: 10 },
      document: null,
      evaluation: null,
    })

    prisma.hourLog.findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
      const fixture = [{
        id: 11, placementId: 1, updatedAt: new Date(ts), date: new Date(ts),
        startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Soporte', version: 1,
      }]
      const cursor = extractEntityCursor(args.where, 'hourLog')
      return Promise.resolve(fixture.filter((r) => rowAfter(r, cursor)))
    })

    const result = await service.pull(5, since, 200)

    expect(result.changes.hourLogs.map((r: { id: number }) => r.id)).toContain(11)
  })

  it('pagina 4.000 hourLogs sin perder ni duplicar (incluyendo mismos updatedAt)', async () => {
    const N = 4000
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
        const cursor = extractEntityCursor(args.where, 'hourLog')
        const filtered = fixture.filter((r) => rowAfter(r, cursor))
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

  describe('cross-entity pagination', () => {
    const userId = 5
    const T0 = Date.parse('2026-04-01T00:00:00.000Z')
    const at = (offset: number) => new Date(T0 + offset * 60_000)

    type Fixture = Record<CrossEntity, CrossRow[]>
    const buildFixture = (): Fixture => ({
      placement: [{ id: 1, studentId: userId, tutorId: 7, updatedAt: at(0) }],
      hourLog: [
        { id: 10, placementId: 1, updatedAt: at(1) },
        { id: 11, placementId: 1, updatedAt: at(3) },
        { id: 12, placementId: 1, updatedAt: at(6), deletedAt: new Date('2026-04-01T00:30:00.000Z') },
        { id: 13, placementId: 1, updatedAt: at(9) },
        { id: 14, placementId: 1, updatedAt: at(9) },
      ],
      document: [
        { id: 20, placementId: 1, updatedAt: at(2) },
        { id: 21, placementId: 1, updatedAt: at(5) },
        { id: 22, placementId: 1, updatedAt: at(8) },
      ],
      evaluation: [
        { id: 30, placementId: 1, updatedAt: at(4) },
        { id: 31, placementId: 1, updatedAt: at(7) },
        { id: 32, placementId: 1, updatedAt: at(10) },
      ],
    })

    const sortedByKeyset = (rows: CrossRow[]) =>
      [...rows].sort((a, b) => {
        const t = a.updatedAt.getTime() - b.updatedAt.getTime()
        return t !== 0 ? t : a.id - b.id
      })

    const inScope = (row: CrossRow, entity: CrossEntity, uid: number): boolean => {
      if (entity === 'placement') return row.studentId === uid || row.tutorId === uid
      return true
    }

    function wireMocks(fixture: Fixture) {
      const f = (entity: CrossEntity) =>
        vi.fn(async (args: { where?: Record<string, unknown>; take?: number }) => {
          const cursor = extractEntityCursor(args.where, entity)
          const filtered = sortedByKeyset(fixture[entity]).filter((r) => inScope(r, entity, userId) && rowAfter(r, cursor))
          return Promise.resolve(args.take != null ? filtered.slice(0, args.take) : filtered)
        })
      prisma.placement.findMany.mockImplementation(f('placement'))
      prisma.hourLog.findMany.mockImplementation(f('hourLog'))
      prisma.document.findMany.mockImplementation(f('document'))
      prisma.evaluation.findMany.mockImplementation(f('evaluation'))
    }

    function collectPage(result: Awaited<ReturnType<SyncService['pull']>>, seen: Set<string>): number {
      let tombstones = 0
      for (const r of result.changes.placements) seen.add(`placement:${r.id}`)
      for (const r of result.changes.hourLogs) {
        seen.add(`hourLog:${r.id}`)
        if ((r as { deletedAt?: Date | null }).deletedAt) {
          tombstones++
        }
      }
      for (const r of result.changes.documents) seen.add(`document:${r.id}`)
      for (const r of result.changes.evaluations) seen.add(`evaluation:${r.id}`)
      return tombstones
    }

    async function drain(svc: SyncService, limit: number): Promise<{ seen: Set<string>; tombstones: number; checkpoints: number }> {
      const seen = new Set<string>()
      let tombstones = 0
      let checkpoints = 0
      let since: string | undefined
      let pages = 0
      while (true) {
        const result = await svc.pull(userId, since, limit)
        tombstones += collectPage(result, seen)
        if (result.checkpoint) {
          checkpoints++
          const decoded = decodeCheckpoint(result.checkpoint)
          expect(decoded).not.toBeNull()
          expect((decoded as { v?: number } | null)?.v).toBe(2)
        }
        if (!result.hasMore || !result.checkpoint) break
        since = result.checkpoint
        pages++
        if (pages > 100) throw new Error('demasiadas páginas — el cursor no avanza')
      }
      return { seen, tombstones, checkpoints }
    }

    it('pagina 12 rows cross-entity sin perder ni duplicar (limit=2)', async () => {
      const fixture = buildFixture()
      wireMocks(fixture)
      const { seen, tombstones } = await drain(service, 2)

      expect(seen.size).toBe(12)
      expect(seen.has('placement:1')).toBe(true)
      expect(seen.has('hourLog:10')).toBe(true)
      expect(seen.has('hourLog:12')).toBe(true)
      expect(seen.has('hourLog:13')).toBe(true)
      expect(seen.has('hourLog:14')).toBe(true)
      expect(seen.has('document:20')).toBe(true)
      expect(seen.has('evaluation:30')).toBe(true)
      expect(tombstones).toBeGreaterThanOrEqual(1)
    })

    it('pagina 12 rows cross-entity sin perder ni duplicar (limit=1) amplificando presión por sub-cursor', async () => {
      const fixture = buildFixture()
      wireMocks(fixture)
      const { seen } = await drain(service, 1)

      expect(seen.size).toBe(12)
      for (const key of seen) {
        expect(key).toMatch(/^(placement|hourLog|document|evaluation):\d+$/)
      }
    })
  })

  // E1-04 · El servidor es la autoridad sobre el estado.
  //
  // El README ("Resolución de conflictos") ya lo promete: si un HourLog pasó a
  // APPROVED o REJECTED, la edición offline del estudiante se rechaza; si
  // ambos lados están en DRAFT o SUBMITTED, gana la más reciente. Estas dos
  // ramas son las dos que pide el criterio de aceptación.
  describe('push · edición de una hora que el tutor ya resolvió (E1-04)', () => {
    const editOf = (id: number, baseVersion: number | null) => ({
      clientOpId: '22222222-2222-4222-8222-222222222222',
      entity: 'hourLog' as const,
      op: 'update' as const,
      baseVersion,
      payload: { id, date: '2026-04-02', startTime: '08:00', endTime: '13:00', hours: 5, activity: 'Soporte corregido' },
    })

    const serverRow = (status: string, version = 3) => ({
      id: 42,
      placementId: 1,
      date: new Date('2026-04-02'),
      startTime: '08:00',
      endTime: '12:00',
      hours: 4,
      activity: 'Soporte',
      status,
      version,
      placement: { id: 1, studentId: 5, tutorId: 9 },
    })

    // Rama 1 del criterio: el tutor ya resolvió.
    it.each([
      ['APPROVED', 'aprobó'],
      ['REJECTED', 'rechazó'],
    ])('rechaza la edición cuando la hora está en %s y devuelve el motivo', async (status, verbo) => {
      prisma.hourLog.findUnique.mockResolvedValue(serverRow(status))

      const result = await service.push(5, [editOf(42, 2)])

      expect(result.results[0]).toMatchObject({ status: 'conflict', reason: expect.stringContaining(verbo) })
      // La edición no se aplicó: el estado del tutor manda.
      expect(prisma.hourLog.update).not.toHaveBeenCalled()
    })

    // El cliente necesita el estado que quedó en el servidor para poder
    // mostrárselo al estudiante sin recargar la aplicación.
    it('devuelve el estado real del servidor junto con el conflicto', async () => {
      prisma.hourLog.findUnique.mockResolvedValue(serverRow('APPROVED', 7))

      const result = await service.push(5, [editOf(42, 2)])

      expect(result.results[0].server).toMatchObject({ id: 42, status: 'APPROVED', version: 7 })
      // El placement viene del include y no es asunto del cliente: la
      // respuesta de "applied" tampoco lo lleva.
      expect(result.results[0].server).not.toHaveProperty('placement')
    })

    // baseVersion no decide si se aplica o no — decide qué se le explica al
    // estudiante. Si editó sobre una versión vieja, el tutor resolvió
    // mientras él estaba sin conexión, y eso no es culpa suya.
    it('distingue si el estudiante editaba una versión vieja o la ya resuelta', async () => {
      prisma.hourLog.findUnique.mockResolvedValue(serverRow('APPROVED', 7))
      const desactualizado = await service.push(5, [editOf(42, 2)])

      vi.clearAllMocks()
      prisma.hourLog.findUnique.mockResolvedValue(serverRow('APPROVED', 7))
      const alDia = await service.push(5, [editOf(42, 7)])

      expect(desactualizado.results[0].reason).toContain('sin conexión')
      expect(alDia.results[0].reason).not.toContain('sin conexión')
    })

    // Rama 2 del criterio: nadie resolvió nada todavía.
    it.each(['DRAFT', 'SUBMITTED'])('aplica la edición cuando la hora sigue en %s', async (status) => {
      prisma.hourLog.findUnique.mockResolvedValue(serverRow(status))
      prisma.hourLog.update.mockResolvedValue({ id: 42, status, version: 4, hours: 5 })

      const result = await service.push(5, [editOf(42, 1)])

      expect(result.results[0]).toMatchObject({ status: 'applied' })
      expect(prisma.hourLog.update).toHaveBeenCalledTimes(1)
    })

    // "Gana la más reciente": una baseVersion vieja no frena la edición
    // mientras el tutor no haya resuelto. Bloquear acá dejaría al estudiante
    // con una hora varada que no puede resolver desde la aplicación.
    it('aplica aunque la baseVersion del cliente esté atrasada, si nadie resolvió', async () => {
      prisma.hourLog.findUnique.mockResolvedValue(serverRow('SUBMITTED', 9))
      prisma.hourLog.update.mockResolvedValue({ id: 42, status: 'SUBMITTED', version: 10 })

      const result = await service.push(5, [editOf(42, 1)])

      expect(result.results[0]).toMatchObject({ status: 'applied' })
    })

    // Borrar es tan destructivo como editar: si el tutor ya resolvió, el
    // delete offline tampoco puede entrar. La guarda vive antes de separar
    // update de delete justamente para que las dos ramas queden cubiertas.
    it.each(['APPROVED', 'REJECTED'])('rechaza también el borrado cuando la hora está en %s', async (status) => {
      prisma.hourLog.findUnique.mockResolvedValue(serverRow(status))

      const result = await service.push(5, [{ ...editOf(42, 2), op: 'delete' as const }])

      expect(result.results[0]).toMatchObject({ status: 'conflict' })
      expect(prisma.hourLog.update).not.toHaveBeenCalled()
    })

    it('permite borrar mientras nadie haya resuelto la hora', async () => {
      prisma.hourLog.findUnique.mockResolvedValue(serverRow('SUBMITTED'))
      prisma.hourLog.update.mockResolvedValue({ id: 42, version: 4 })

      const result = await service.push(5, [{ ...editOf(42, 2), op: 'delete' as const }])

      expect(result.results[0]).toMatchObject({ status: 'applied' })
      expect(prisma.hourLog.update).toHaveBeenCalledTimes(1)
    })
  })
})

describe('keysetAndScope', () => {
  const userId = 5
  const cursor = { updatedAt: '2026-04-01T12:00:00.000Z', id: 10 }
  const expectedScope = { OR: [{ studentId: userId }, { tutorId: userId }] }

  it('composes keyset and scope in a single AND clause for placement', () => {
    expect(keysetAndScope('placement', cursor, userId)).toEqual({
      AND: [
        {
          OR: [
            { updatedAt: { gt: new Date('2026-04-01T12:00:00.000Z') } },
            { updatedAt: new Date('2026-04-01T12:00:00.000Z'), id: { gt: 10 } },
          ],
        },
        expectedScope,
      ],
    })
  })

  it('nests the scope under placement for hourLog/document/evaluation streams', () => {
    expect(keysetAndScope('hourLog', cursor, userId)).toEqual({
      AND: [
        {
          OR: [
            { updatedAt: { gt: new Date('2026-04-01T12:00:00.000Z') } },
            { updatedAt: new Date('2026-04-01T12:00:00.000Z'), id: { gt: 10 } },
          ],
        },
        { placement: expectedScope },
      ],
    })
    expect(keysetAndScope('document', cursor, userId)).toEqual({
      AND: [
        {
          OR: [
            { updatedAt: { gt: new Date('2026-04-01T12:00:00.000Z') } },
            { updatedAt: new Date('2026-04-01T12:00:00.000Z'), id: { gt: 10 } },
          ],
        },
        { placement: expectedScope },
      ],
    })
    expect(keysetAndScope('evaluation', cursor, userId)).toEqual({
      AND: [
        {
          OR: [
            { updatedAt: { gt: new Date('2026-04-01T12:00:00.000Z') } },
            { updatedAt: new Date('2026-04-01T12:00:00.000Z'), id: { gt: 10 } },
          ],
        },
        { placement: expectedScope },
      ],
    })
  })

  it('emits an empty keyset clause when there is no cursor (first page)', () => {
    expect(keysetAndScope('placement', null, userId)).toEqual({
      AND: [{}, expectedScope],
    })
  })
})

describe('pickEntityCheckpoints', () => {
  it('returns null when there are no rows and no previous sub-cursor', () => {
    expect(pickEntityCheckpoints([], null)).toBeNull()
  })

  it('preserves the previous sub-cursor when the entity returned zero rows (slow-stream guard)', () => {
    const prev = { updatedAt: '2026-04-01T12:00:00.000Z', id: 7 }
    expect(pickEntityCheckpoints([], prev)).toBe(prev)
  })

  it('advances to the last row when the entity returned rows', () => {
    const rows = [
      { updatedAt: new Date('2026-04-01T10:00:00.000Z'), id: 5 },
      { updatedAt: new Date('2026-04-01T11:00:00.000Z'), id: 9 },
      { updatedAt: new Date('2026-04-01T12:00:00.000Z'), id: 12 },
    ]
    expect(pickEntityCheckpoints(rows, null)).toEqual({
      updatedAt: '2026-04-01T12:00:00.000Z',
      id: 12,
    })
  })
})
