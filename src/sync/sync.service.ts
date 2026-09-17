import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { type Checkpoint, decodeCheckpoint, encodeCheckpoint } from './checkpoint'
import type { SyncOperationInput, SyncOperationResult } from './dto/push.dto'

// Cliente usado dentro de applyOperation: this.prisma para lecturas sueltas,
// o el cliente de una transacción cuando aplicamos + registramos de forma atómica.
type OperationClient = Pick<PrismaService, 'placement' | 'hourLog'>

function isDuplicateClientOpId(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

// La identidad de una operación es (userId, clientOpId): el UUID lo genera
// el cliente y solo es único dentro de su propia sesión, así que sin userId
// dos usuarios distintos con el mismo clientOpId colisionarían.
function syncOpKey(userId: number, clientOpId: string) {
  return { userId_clientOpId: { userId, clientOpId } }
}

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async pull(userId: number, since: string | undefined, limit: number) {
    const cursor = decodeCheckpoint(since)
    // El cursor avanza por updatedAt.
    const where = cursor ? { updatedAt: { gt: new Date(cursor.updatedAt) } } : {}
    const order = { updatedAt: 'asc' as const }
    const scope = { placement: { OR: [{ studentId: userId }, { tutorId: userId }] } }

    const [placements, hourLogs, documents, evaluations] = await Promise.all([
      this.prisma.placement.findMany({
        where: { ...where, OR: [{ studentId: userId }, { tutorId: userId }] },
        orderBy: order,
        take: limit,
      }),
      this.prisma.hourLog.findMany({ where: { ...where, ...scope }, orderBy: order, take: limit }),
      this.prisma.document.findMany({ where: { ...where, ...scope }, orderBy: order, take: limit }),
      this.prisma.evaluation.findMany({ where: { ...where, ...scope }, orderBy: order, take: limit }),
    ])

    const newest = [...placements, ...hourLogs, ...documents, ...evaluations]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]

    const checkpoint: Checkpoint | null = newest
      ? { updatedAt: new Date(newest.updatedAt).toISOString(), id: newest.id }
      : cursor

    return {
      changes: { placements, hourLogs, documents, evaluations },
      checkpoint: checkpoint ? encodeCheckpoint(checkpoint) : null,
      hasMore: [placements, hourLogs, documents, evaluations].some((rows) => rows.length === limit),
    }
  }

  async push(userId: number, ops: SyncOperationInput[]) {
    const results: SyncOperationResult[] = []
    for (const op of ops) {
      results.push(await this.processOperation(userId, op))
    }
    return { results }
  }

  private async processOperation(userId: number, op: SyncOperationInput): Promise<SyncOperationResult> {
    // Camino feliz de un reintento secuencial: la operación ya quedó
    // registrada de una pasada anterior, devolvemos la misma respuesta sin
    // volver a tocar la tabla de negocio.
    const existing = await this.prisma.syncOperation.findUnique({ where: syncOpKey(userId, op.clientOpId) })
    if (existing) {
      return existing.response as unknown as SyncOperationResult
    }

    try {
      return await this.applyAndRecord(userId, op)
    } catch (err) {
      return await this.recoverFromFailedApply(userId, op, err)
    }
  }

  // Aplicar la operación y dejar constancia en sync_operations ocurre en la
  // misma transacción: si dos reintentos llegan a la vez, ambos corren
  // applyOperation, pero el segundo INSERT en sync_operations (clientOpId es
  // la PK) choca contra el que ya comprometió el primero y Postgres hace
  // rollback de toda la transacción perdedora, incluida la escritura de
  // negocio. Así solo queda una fila en ambas tablas.
  private async applyAndRecord(userId: number, op: SyncOperationInput): Promise<SyncOperationResult> {
    return this.prisma.$transaction(async (tx) => {
      const result = await this.applyOperation(tx, userId, op)
      await tx.syncOperation.create({
        data: { clientOpId: op.clientOpId, userId, response: result as unknown as object },
      })
      return result
    })
  }

  private async recoverFromFailedApply(userId: number, op: SyncOperationInput, err: unknown): Promise<SyncOperationResult> {
    if (isDuplicateClientOpId(err)) {
      // Perdimos la carrera: otro reintento concurrente ya comprometió su
      // transacción con este (userId, clientOpId). Devolvemos su resultado.
      const persisted = await this.prisma.syncOperation.findUnique({ where: syncOpKey(userId, op.clientOpId) })
      if (persisted) return persisted.response as unknown as SyncOperationResult
    }

    const rejected: SyncOperationResult = {
      clientOpId: op.clientOpId,
      status: 'rejected',
      server: null,
      reason: err instanceof Error ? err.message : 'no se pudo aplicar la operación',
    }
    return this.recordRejection(userId, op, rejected)
  }

  private async recordRejection(userId: number, op: SyncOperationInput, rejected: SyncOperationResult): Promise<SyncOperationResult> {
    try {
      await this.prisma.syncOperation.create({
        data: { clientOpId: op.clientOpId, userId, response: rejected as unknown as object },
      })
    } catch (createErr) {
      if (isDuplicateClientOpId(createErr)) {
        const persisted = await this.prisma.syncOperation.findUnique({ where: syncOpKey(userId, op.clientOpId) })
        if (persisted) return persisted.response as unknown as SyncOperationResult
      }
    }
    return rejected
  }

  private async applyOperation(client: OperationClient, userId: number, op: SyncOperationInput): Promise<SyncOperationResult> {
    if (op.entity !== 'hourLog') {
      return { clientOpId: op.clientOpId, status: 'rejected', server: null, reason: 'entidad no sincronizable desde el cliente' }
    }

    if (op.op === 'create') {
      const placement = await client.placement.findUnique({ where: { id: Number(op.payload.placementId) } })
      if (!placement || placement.studentId !== userId) {
        return { clientOpId: op.clientOpId, status: 'rejected', server: null, reason: 'el placement no pertenece al usuario' }
      }

      const created = await client.hourLog.create({
        data: {
          placementId: Number(op.payload.placementId),
          date: new Date(String(op.payload.date)),
          startTime: String(op.payload.startTime),
          endTime: String(op.payload.endTime),
          hours: Number(op.payload.hours),
          activity: String(op.payload.activity),
          status: 'SUBMITTED',
        },
      })
      return { clientOpId: op.clientOpId, status: 'applied', server: created as never, reason: null }
    }

    const existing = await client.hourLog.findUnique({
      where: { id: Number(op.payload.id) },
      include: { placement: true },
    })
    if (!existing || existing.placement.studentId !== userId) {
      return { clientOpId: op.clientOpId, status: 'rejected', server: null, reason: 'el registro no pertenece al usuario' }
    }

    if (op.op === 'update') {
      // La actualización aplica los campos recibidos y avanza version.
      const updated = await client.hourLog.update({
        where: { id: Number(op.payload.id) },
        data: {
          date: new Date(String(op.payload.date)),
          startTime: String(op.payload.startTime),
          endTime: String(op.payload.endTime),
          hours: Number(op.payload.hours),
          activity: String(op.payload.activity),
          version: { increment: 1 },
        },
      })
      return { clientOpId: op.clientOpId, status: 'applied', server: updated as never, reason: null }
    }

    const deleted = await client.hourLog.update({
      where: { id: Number(op.payload.id) },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    })
    return { clientOpId: op.clientOpId, status: 'applied', server: deleted as never, reason: null }
  }
}
