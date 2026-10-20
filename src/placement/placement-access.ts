import { Role } from '@prisma/client'

/** Quién puede consultar un placement: el coordinador, el estudiante dueño o su tutor. */
export function canAccessPlacement(placement: { studentId: number; tutorId: number }, userId: number, role: Role): boolean {
  return role === Role.COORDINATOR || placement.studentId === userId || placement.tutorId === userId
}
