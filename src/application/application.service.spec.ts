import { BadRequestException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApplicationService } from './application.service'

const prisma = {
  application: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  offer: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
}
const offers = { acceptedCount: vi.fn() }

describe('ApplicationService', () => {
  let service: ApplicationService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ApplicationService(prisma as never, offers as never)
  })

  it('accepts an application when there are seats left', async () => {
    prisma.application.findUnique.mockResolvedValue({ id: 7, offerId: 1, status: 'SUBMITTED' })
    prisma.offer.findUnique.mockResolvedValue({ id: 1, seats: 3, status: 'PUBLISHED' })
    offers.acceptedCount.mockResolvedValue(2)
    prisma.application.update.mockImplementation(({ data }) => Promise.resolve({ id: 7, ...data }))

    const result = await service.decide(7, 'ACCEPTED' as never)

    expect(result.status).toBe('ACCEPTED')
    expect(result.decidedAt).toBeInstanceOf(Date)
  })

  it('rejects accepting when the offer is already full', async () => {
    prisma.application.findUnique.mockResolvedValue({ id: 7, offerId: 1, status: 'SUBMITTED' })
    prisma.offer.findUnique.mockResolvedValue({ id: 1, seats: 3, status: 'PUBLISHED' })
    offers.acceptedCount.mockResolvedValue(3)

    await expect(service.decide(7, 'ACCEPTED' as never)).rejects.toThrow(BadRequestException)
  })

  it('lists applications of an offer with their student', async () => {
    prisma.application.findMany.mockResolvedValue([
      { id: 1, studentId: 10, status: 'SUBMITTED' },
      { id: 2, studentId: 11, status: 'SUBMITTED' },
    ])
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 10, fullName: 'Estudiante 10' })
      .mockResolvedValueOnce({ id: 11, fullName: 'Estudiante 11' })

    const result = await service.listByOffer(1)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 1, student: { fullName: 'Estudiante 10' } })
  })
})
