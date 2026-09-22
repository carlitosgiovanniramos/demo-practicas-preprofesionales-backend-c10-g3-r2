import { describe, expect, it } from 'vitest'
import { buildKeysetWhere } from './keyset'

describe('buildKeysetWhere', () => {
  it('returns an empty filter when there is no cursor (first page)', () => {
    expect(buildKeysetWhere(null)).toEqual({})
  })

  it('emits the compound OR clause for a non-null cursor', () => {
    const cursor = { updatedAt: '2026-04-01T12:00:00.000Z', id: 10 }
    const ts = new Date('2026-04-01T12:00:00.000Z')

    expect(buildKeysetWhere(cursor)).toEqual({
      OR: [
        { updatedAt: { gt: ts } },
        { updatedAt: ts, id: { gt: 10 } },
      ],
    })
  })
})
