import type { Checkpoint } from './checkpoint'

export type KeysetWhere = Record<string, unknown>

/**
 * Builds the Prisma `where` clause for a keyset (compound cursor) pagination.
 *
 * The cursor is `(updatedAt, id)`. Two clauses are emitted so rows whose
 * `updatedAt` ties with the last seen one are still advanced by `id`:
 *
 *   - `{ updatedAt: { gt: cursor.updatedAt } }`
 *   - `{ updatedAt: cursor.updatedAt, id: { gt: cursor.id } }`
 *
 * When there is no cursor (first page), returns an empty filter so the query
 * starts at the beginning.
 */
export function buildKeysetWhere(cursor: Checkpoint | null): KeysetWhere {
  if (!cursor) return {}
  const ts = new Date(cursor.updatedAt)
  return {
    OR: [
      { updatedAt: { gt: ts } },
      { updatedAt: ts, id: { gt: cursor.id } },
    ],
  }
}
