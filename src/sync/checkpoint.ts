export interface SubCursor {
  updatedAt: string
  id: number
}

export interface CheckpointV1 {
  updatedAt: string
  id: number
}

export interface CheckpointV2 {
  v: 2
  placement: SubCursor | null
  hourLog: SubCursor | null
  document: SubCursor | null
  evaluation: SubCursor | null
}

export type Checkpoint = CheckpointV1 | CheckpointV2

export function encodeCheckpoint(cp: CheckpointV2): string {
  return Buffer.from(JSON.stringify(cp), 'utf8').toString('base64')
}

function isSubCursor(value: unknown): value is SubCursor {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.updatedAt === 'string' && typeof v.id === 'number'
}

function readSubCursor(value: unknown): SubCursor | null {
  return isSubCursor(value) ? value : null
}

function readCheckpointV2(obj: Record<string, unknown>): CheckpointV2 {
  return {
    v: 2,
    placement: readSubCursor(obj.placement),
    hourLog: readSubCursor(obj.hourLog),
    document: readSubCursor(obj.document),
    evaluation: readSubCursor(obj.evaluation),
  }
}

function liftV1ToV2(updatedAt: string, id: number): CheckpointV2 {
  const sub: SubCursor = { updatedAt, id }
  return { v: 2, placement: sub, hourLog: sub, document: sub, evaluation: sub }
}

function parseRaw(raw: string): Record<string, unknown> | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  return parsed as Record<string, unknown>
}

export function decodeCheckpoint(raw: string | undefined): Checkpoint | null {
  if (!raw) return null
  const obj = parseRaw(raw)
  if (obj === null) return null
  if (obj.v === 2) return readCheckpointV2(obj)
  if (typeof obj.updatedAt === 'string' && typeof obj.id === 'number') {
    return liftV1ToV2(obj.updatedAt, obj.id)
  }
  return null
}
