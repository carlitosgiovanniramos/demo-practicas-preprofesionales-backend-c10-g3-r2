import type { SubCursor } from './checkpoint'

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
 * starts at the beginning. Caller composes this with the per-entity scope
 * clause via `keysetAndScope` so the keyset is never orphaned.
 */
export function buildKeysetWhere(cursor: SubCursor | null): KeysetWhere {
  if (!cursor) return {}
  const ts = new Date(cursor.updatedAt)
  return {
    OR: [
      { updatedAt: { gt: ts } },
      { updatedAt: ts, id: { gt: cursor.id } },
    ],
  }
}
