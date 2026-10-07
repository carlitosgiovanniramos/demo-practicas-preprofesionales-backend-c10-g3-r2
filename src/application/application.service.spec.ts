import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApplicationService } from './application.service'

const prisma = {
  application: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  offer: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
}
const offers = { acceptedCount: vi.fn() }

// La oferta 1 es de la empresa 100. El usuario 20 trabaja en ella; el 21, en otra.
const OWNER = 20
const OTHER_COMPANY = 21
const COORDINATOR = 1
const companyOf: Record<number, number | null> = { [OWNER]: 100, [OTHER_COMPANY]: 200 }

describe('ApplicationService', () => {
  let service: ApplicationService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ApplicationService(prisma as never, offers as never)
    prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 100, seats: 3, status: 'PUBLISHED' })
    prisma.user.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(where.id in companyOf ? { companyId: companyOf[where.id] } : null),
    )
  })

  describe('decide', () => {
    beforeEach(() => {
      prisma.application.findUnique.mockResolvedValue({ id: 7, offerId: 1, status: 'SUBMITTED' })
      prisma.application.update.mockImplementation(({ data }) => Promise.resolve({ id: 7, ...data }))
    })

    it('accepts an application of its own offer when there are seats left', async () => {
      offers.acceptedCount.mockResolvedValue(2)

      const result = await service.decide(7, 'ACCEPTED' as never, OWNER, 'COMPANY' as never)

      expect(result.status).toBe('ACCEPTED')
      expect(result.decidedAt).toBeInstanceOf(Date)
    })

    it('rejects accepting when the offer is already full', async () => {
      offers.acceptedCount.mockResolvedValue(3)

      await expect(service.decide(7, 'ACCEPTED' as never, OWNER, 'COMPANY' as never)).rejects.toThrow(
        BadRequestException,
      )
    })

    it('forbids a company from deciding an application to another company offer', async () => {
      await expect(service.decide(7, 'REJECTED' as never, OTHER_COMPANY, 'COMPANY' as never)).rejects.toThrow(
        ForbiddenException,
      )
      expect(prisma.application.update).not.toHaveBeenCalled()
    })

    it('forbids a company user that has no company associated', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ companyId: null })

      await expect(service.decide(7, 'REJECTED' as never, OWNER, 'COMPANY' as never)).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('lets the coordinator decide any application', async () => {
      const result = await service.decide(7, 'INTERVIEW' as never, COORDINATOR, 'COORDINATOR' as never)

      expect(result.status).toBe('INTERVIEW')
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })
  })

  describe('listByOffer', () => {
    beforeEach(() => {
      prisma.application.findMany.mockResolvedValue([
        { id: 1, studentId: 10, status: 'SUBMITTED' },
        { id: 2, studentId: 11, status: 'SUBMITTED' },
      ])
    })

    it('lists applications of its own offer with their student', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ companyId: 100 })
        .mockResolvedValueOnce({ id: 10, fullName: 'Estudiante 10' })
        .mockResolvedValueOnce({ id: 11, fullName: 'Estudiante 11' })

      const result = await service.listByOffer(1, OWNER, 'COMPANY' as never)

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({ id: 1, student: { fullName: 'Estudiante 10' } })
    })

    it('forbids a company from listing applications of another company offer', async () => {
      await expect(service.listByOffer(1, OTHER_COMPANY, 'COMPANY' as never)).rejects.toThrow(ForbiddenException)
      expect(prisma.application.findMany).not.toHaveBeenCalled()
    })

    it('forbids a user that is neither company nor coordinator, even without the roles guard', async () => {
      await expect(service.listByOffer(1, 10, 'STUDENT' as never)).rejects.toThrow(ForbiddenException)
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
      expect(prisma.application.findMany).not.toHaveBeenCalled()
    })

    it('fails with not found when the offer does not exist', async () => {
      prisma.offer.findUnique.mockResolvedValueOnce(null)

      await expect(service.listByOffer(999, OWNER, 'COMPANY' as never)).rejects.toThrow(NotFoundException)
      expect(prisma.application.findMany).not.toHaveBeenCalled()
    })

    it('lets the coordinator list applications of any offer', async () => {
      await expect(service.listByOffer(1, COORDINATOR, 'COORDINATOR' as never)).resolves.toHaveLength(2)
      expect(prisma.offer.findUnique).not.toHaveBeenCalled()
    })
  })
})
