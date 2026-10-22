import { Role } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { canAccessPlacement } from './placement-access'

const placement = { studentId: 5, tutorId: 7 }

describe('canAccessPlacement', () => {
  it('allows the owner student, the assigned tutor and any coordinator', () => {
    expect(canAccessPlacement(placement, 5, Role.STUDENT)).toBe(true)
    expect(canAccessPlacement(placement, 7, Role.TUTOR)).toBe(true)
    expect(canAccessPlacement(placement, 99, Role.COORDINATOR)).toBe(true)
  })

  it('denies anyone else', () => {
    expect(canAccessPlacement(placement, 99, Role.STUDENT)).toBe(false)
    expect(canAccessPlacement(placement, 99, Role.TUTOR)).toBe(false)
  })
})
