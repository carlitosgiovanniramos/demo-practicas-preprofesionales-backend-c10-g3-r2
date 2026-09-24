import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import type { CheckpointV2 } from './checkpoint'
import { decodeCheckpoint, encodeCheckpoint } from './checkpoint'

describe('checkpoint', () => {
  it('round-trips a v2 checkpoint through base64 with all sub-cursors preserved', () => {
    const cp: CheckpointV2 = {
      v: 2,
      placement: { updatedAt: '2026-04-01T12:00:00.000Z', id: 42 },
      hourLog: { updatedAt: '2026-04-02T08:00:00.000Z', id: 99 },
      document: null,
      evaluation: { updatedAt: '2026-04-03T15:30:00.000Z', id: 7 },
    }

    expect(decodeCheckpoint(encodeCheckpoint(cp))).toEqual(cp)
  })

  it('lifts a legacy v1 cursor into the v2 shape, replicating the pair into all four slots', () => {
    const legacy = Buffer.from(
      JSON.stringify({ updatedAt: '2026-04-01T12:00:00.000Z', id: 10 }),
      'utf8',
    ).toString('base64')

    expect(decodeCheckpoint(legacy)).toEqual({
      v: 2,
      placement: { updatedAt: '2026-04-01T12:00:00.000Z', id: 10 },
      hourLog: { updatedAt: '2026-04-01T12:00:00.000Z', id: 10 },
      document: { updatedAt: '2026-04-01T12:00:00.000Z', id: 10 },
      evaluation: { updatedAt: '2026-04-01T12:00:00.000Z', id: 10 },
    })
  })

  it('returns null for a missing cursor, garbage base64, non-JSON, or neither-v1-nor-v2 input', () => {
    expect(decodeCheckpoint(undefined)).toBeNull()
    expect(decodeCheckpoint('no-es-base64-valido!!')).toBeNull()
    expect(decodeCheckpoint(Buffer.from('not-json', 'utf8').toString('base64'))).toBeNull()
    expect(
      decodeCheckpoint(Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf8').toString('base64')),
    ).toBeNull()
    expect(
      decodeCheckpoint(Buffer.from(JSON.stringify({ v: 3, foo: 'bar' }), 'utf8').toString('base64')),
    ).toBeNull()
  })
})
