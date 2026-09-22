import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { type Checkpoint, decodeCheckpoint, encodeCheckpoint } from './checkpoint'
import type { SyncOperationInput, SyncOperationResult } from './dto/push.dto'

// Cliente usado dentro de applyOperation: this.prisma para lecturas sueltas,
// o el cliente de una transacción cuando aplicamos + registramos de forma atómica.
type OperationClient = Pick<PrismaService, 'placement' | 'hourLog'>

// Solo cuenta como colisión de clientOpId la violación de la PK compuesta
// (userId, clientOpId) de sync_operations — no cualquier P2002, para que un
// futuro índice único en otra tabla no se confunda con esta carrera.
function isDuplicateClientOpId(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false
  const target = err.meta?.target
  let fields: unknown[] = []
  if (Array.isArray(target)) fields = target
  else if (typeof target === 'string') fields = [target]
  return fields.includes('userId') && fields.includes('clientOpId')
}

// La identidad de una operación es (userId, clientOpId): el UUID lo genera
// el cliente y solo es único dentro de su propia sesión, así que sin userId
// dos usuarios distintos con el mismo clientOpId colisionarían.
function syncOpKey(userId: number, clientOpId: string) {
  return { userId_clientOpId: { userId, clientOpId } }
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name)

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

    // Lo que llega aquí sin ser la colisión de arriba es un error
    // *lanzado* por applyAndRecord: los rechazos de negocio (placement ajeno,
    // entidad no sincronizable) ya se registraron dentro de la transacción en
    // applyOperation y nunca lanzan. Lo que queda es infraestructura —
    // timeout de la transacción interactiva, caída de conexión, pool
    // agotado— y no sabemos si es transitorio. Por eso NO lo persistimos en
    // sync_operations: si quedara cacheado, un reintento con el mismo
    // clientOpId (justo lo que hace el cliente ante una señal intermitente)
    // encontraría la fila y devolvería para siempre este rechazo, perdiendo
    // la hora aunque el fallo ya no exista. Al no persistir, el próximo
    // intento con el mismo clientOpId vuelve a correr applyAndRecord de cero.
    this.logger.error(`Fallo al aplicar la operación de sync ${op.clientOpId} (userId=${userId})`, err instanceof Error ? err.stack : err)

    return {
      clientOpId: op.clientOpId,
      status: 'rejected',
      server: null,
      reason: 'no se pudo aplicar la operación, se reintentará',
    }
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
