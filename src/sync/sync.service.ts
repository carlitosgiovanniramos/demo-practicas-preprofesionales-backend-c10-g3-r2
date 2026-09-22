import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { type Checkpoint, decodeCheckpoint, encodeCheckpoint } from './checkpoint'
import type { SyncOperationInput, SyncOperationResult } from './dto/push.dto'

// Los dos estados que solo el tutor puede poner. Mientras la hora no esté en
// uno de ellos, nadie resolvió nada y la edición del estudiante es válida.
const RESOLVED_BY_TUTOR: Record<string, string | undefined> = {
  APPROVED: 'aprobó',
  REJECTED: 'rechazó',
}

// baseVersion no decide si la edición se aplica — eso lo decide el estado.
// Sirve para saber qué explicarle al estudiante: si editó sobre una versión
// anterior a la que ya tiene el servidor, el tutor resolvió mientras él estaba
// sin conexión, y conviene decírselo así en vez de culparlo.
// El hourLog se lee con include: { placement: true } para comprobar de quién
// es. El placement no es asunto del cliente — la respuesta de 'applied'
// tampoco lo lleva — así que se saca antes de devolverlo.
function withoutPlacement<T extends { placement: unknown }>(row: T): Omit<T, 'placement'> {
  const copy: Partial<T> = { ...row }
  delete copy.placement
  return copy as Omit<T, 'placement'>
}

function rejectionReason(verbo: string, baseVersion: number | null, serverVersion: number): string {
  const editabaUnaCopiaVieja = baseVersion !== null && baseVersion < serverVersion
  return editabaUnaCopiaVieja
    ? `el tutor ${verbo} este registro mientras estabas sin conexión, así que tu edición no se aplicó`
    : `el tutor ya ${verbo} este registro y no admite más cambios`
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
      let result: SyncOperationResult
      try {
        // D-01: sync_operations se escribe pero NUNCA se consulta antes de
        // aplicar. Un reintento con el mismo clientOpId aplica dos veces.
        result = await this.applyOperation(userId, op)
      } catch (err) {
        result = {
          clientOpId: op.clientOpId,
          status: 'rejected',
          server: null,
          reason: err instanceof Error ? err.message : 'no se pudo aplicar la operación',
        }
      }
      try {
        await this.prisma.syncOperation.create({
          data: { clientOpId: op.clientOpId, userId, response: result as unknown as object },
        })
      } catch {
        // clientOpId es la clave primaria: un reintento choca con el
        // registro previo. El log de sync_operations se ignora, pero la
        // operación de negocio ya se aplicó arriba — eso es D-01.
      }
      results.push(result)
    }
    return { results }
  }

  private async applyOperation(userId: number, op: SyncOperationInput): Promise<SyncOperationResult> {
    if (op.entity !== 'hourLog') {
      return { clientOpId: op.clientOpId, status: 'rejected', server: null, reason: 'entidad no sincronizable desde el cliente' }
    }

    if (op.op === 'create') {
      const placement = await this.prisma.placement.findUnique({ where: { id: Number(op.payload.placementId) } })
      if (!placement || placement.studentId !== userId) {
        return { clientOpId: op.clientOpId, status: 'rejected', server: null, reason: 'el placement no pertenece al usuario' }
      }

      const created = await this.prisma.hourLog.create({
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

    const existing = await this.prisma.hourLog.findUnique({
      where: { id: Number(op.payload.id) },
      include: { placement: true },
    })
    if (!existing || existing.placement.studentId !== userId) {
      return { clientOpId: op.clientOpId, status: 'rejected', server: null, reason: 'el registro no pertenece al usuario' }
    }

    // E1-04: el servidor es la autoridad sobre el estado. Una hora que el
    // tutor ya resolvió no se vuelve a tocar desde el cliente, por vieja que
    // sea la copia que traía el teléfono.
    //
    // La guarda va antes de separar update de delete a propósito: borrar una
    // hora aprobada destruye la decisión del tutor igual que editarla, y
    // dejar el delete por fuera sería cerrar la puerta y olvidar la ventana.
    const resolution = RESOLVED_BY_TUTOR[existing.status]
    if (resolution) {
      return {
        clientOpId: op.clientOpId,
        status: 'conflict',
        server: withoutPlacement(existing) as never,
        reason: rejectionReason(resolution, op.baseVersion, existing.version),
      }
    }

    if (op.op === 'update') {
      // La actualización aplica los campos recibidos y avanza version.
      const updated = await this.prisma.hourLog.update({
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

    const deleted = await this.prisma.hourLog.update({
      where: { id: Number(op.payload.id) },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    })
    return { clientOpId: op.clientOpId, status: 'applied', server: deleted as never, reason: null }
  }
}
