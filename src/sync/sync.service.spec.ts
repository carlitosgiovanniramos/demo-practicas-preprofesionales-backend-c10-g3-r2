import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncService } from './sync.service'

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`userId`,`clientOpId`)', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['userId', 'clientOpId'] },
  })

const prisma = {
  placement: { findMany: vi.fn(), findUnique: vi.fn() },
  hourLog: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  document: { findMany: vi.fn() },
  evaluation: { findMany: vi.fn() },
  syncOperation: { create: vi.fn(), findUnique: vi.fn() },
  $transaction: vi.fn(),
}

describe('SyncService', () => {
  let service: SyncService

  beforeEach(() => {
    vi.clearAllMocks()
    prisma.placement.findMany.mockResolvedValue([])
    prisma.document.findMany.mockResolvedValue([])
    prisma.evaluation.findMany.mockResolvedValue([])
    prisma.syncOperation.findUnique.mockResolvedValue(null)
    // El servicio corre applyOperation + syncOperation.create dentro de
    // $transaction; en el mock simplemente lo ejecutamos contra el mismo
    // prisma, como haría Prisma real con el cliente de la transacción.
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma))
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

  it('D-01: un reintento con el mismo clientOpId no vuelve a aplicar la operación', async () => {
    const stored = { clientOpId: 'dup-op', status: 'applied', server: { id: 77, version: 1 }, reason: null }
    prisma.syncOperation.findUnique.mockResolvedValue({ clientOpId: 'dup-op', userId: 5, response: stored })

    const result = await service.push(5, [
      {
        clientOpId: 'dup-op',
        entity: 'hourLog',
        op: 'create',
        baseVersion: null,
        payload: { placementId: 1, date: '2026-04-02', startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Soporte' },
      },
    ])

    expect(result.results[0]).toEqual(stored)
    expect(prisma.hourLog.create).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('D-01: la identidad de la operación es (userId, clientOpId), no clientOpId solo', async () => {
    prisma.placement.findUnique.mockResolvedValue({ id: 1, studentId: 5 })
    prisma.hourLog.create.mockResolvedValue({ id: 1, version: 1 })

    await service.push(5, [
      {
        clientOpId: 'shared-uuid',
        entity: 'hourLog',
        op: 'create',
        baseVersion: null,
        payload: { placementId: 1, date: '2026-04-02', startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Soporte' },
      },
    ])

    // Si el selector fuera { clientOpId } a secas, un usuario distinto con el
    // mismo UUID leería (y "robaría") la respuesta de este usuario.
    expect(prisma.syncOperation.findUnique).toHaveBeenCalledWith({
      where: { userId_clientOpId: { userId: 5, clientOpId: 'shared-uuid' } },
    })
  })

  it('D-01: dos envíos concurrentes con el mismo clientOpId devuelven la misma respuesta y aplican una sola vez', async () => {
    prisma.placement.findUnique.mockResolvedValue({ id: 1, studentId: 5 })
    prisma.hourLog.create.mockResolvedValue({ id: 77, version: 1 })

    // Simula la carrera: ninguno ve el registro antes de aplicar, ambos
    // corren applyOperation, pero solo uno logra comprometer la fila en
    // sync_operations. El "perdedor" recibe la violación de unicidad de
    // Postgres cuando Prisma intenta el INSERT dentro de la transacción.
    const winnerResponse = { clientOpId: 'concurrent-op', status: 'applied', server: { id: 77, version: 1 }, reason: null }
    prisma.$transaction
      .mockImplementationOnce(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
      .mockImplementationOnce(async () => {
        throw uniqueViolation()
      })
    prisma.syncOperation.findUnique
      .mockResolvedValueOnce(null) // primer intento del "ganador": no hay nada aún
      .mockResolvedValueOnce(null) // primer intento del "perdedor": tampoco ve nada todavía
      .mockResolvedValueOnce({ clientOpId: 'concurrent-op', userId: 5, response: winnerResponse }) // el perdedor relee tras el choque

    const op = {
      clientOpId: 'concurrent-op',
      entity: 'hourLog' as const,
      op: 'create' as const,
      baseVersion: null,
      payload: { placementId: 1, date: '2026-04-02', startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Soporte' },
    }

    const [first, second] = await Promise.all([service.push(5, [op]), service.push(5, [op])])

    expect(first.results[0]).toEqual(winnerResponse)
    expect(second.results[0]).toEqual(winnerResponse)
    expect(prisma.hourLog.create).toHaveBeenCalledTimes(1)
  })

  it('un fallo de infraestructura no se cachea como rechazo permanente: el reintento vuelve a aplicar', async () => {
    prisma.placement.findUnique.mockResolvedValue({ id: 1, studentId: 5 })
    prisma.hourLog.create.mockResolvedValue({ id: 77, version: 1 })

    const op = {
      clientOpId: 'infra-fail-op',
      entity: 'hourLog' as const,
      op: 'create' as const,
      baseVersion: null,
      payload: { placementId: 1, date: '2026-04-02', startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Soporte' },
    }

    // Primer push: la transacción interactiva revienta por un fallo
    // transitorio (timeout, conexión caída, pool agotado) — no es P2002.
    prisma.$transaction
      .mockImplementationOnce(async () => {
        throw new Error('Transaction already closed: A query cannot be executed on a closed transaction.')
      })
      .mockImplementationOnce((fn: (tx: typeof prisma) => unknown) => fn(prisma))

    const first = await service.push(5, [op])
    expect(first.results[0]).toMatchObject({ status: 'rejected' })
    // El rechazo por fallo de infraestructura no se persiste: si quedara
    // cacheado, el reintento del cliente (misma señal intermitente) lo
    // encontraría y jamás volvería a intentar aplicar la operación — la hora
    // se perdería en vez de duplicarse.
    expect(prisma.syncOperation.create).not.toHaveBeenCalled()

    // Segundo push con el mismo clientOpId: como no hay nada persistido,
    // vuelve a correr applyAndRecord de cero y esta vez aplica.
    const second = await service.push(5, [op])
    expect(second.results[0]).toMatchObject({ status: 'applied' })
    expect(prisma.hourLog.create).toHaveBeenCalledTimes(1)
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
      prisma.syncOperation.findUnique.mockResolvedValue(null)
      prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma))
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
