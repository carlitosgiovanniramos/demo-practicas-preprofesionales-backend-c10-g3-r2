import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OfferService } from './offer.service'

const prisma = {
  offer: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  application: { count: vi.fn() },
  user: { findUnique: vi.fn() },
}

describe('OfferService', () => {
  let service: OfferService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new OfferService(prisma as never)
  })

  // La oferta 1 es de la empresa 100; el usuario 20 es de ella y el 21 de la 200.
  describe('publish and close', () => {
    beforeEach(() => {
      prisma.offer.update.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }))
      prisma.user.findUnique.mockImplementation(({ where }) =>
        Promise.resolve({ companyId: where.id === 20 ? 100 : 200 }),
      )
    })

    it('publishes a DRAFT offer of its own company and stamps publishedAt', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 100, status: 'DRAFT' })

      const result = await service.publish(1, 20, 'COMPANY' as never)

      expect(result.status).toBe('PUBLISHED')
      expect(result.publishedAt).toBeInstanceOf(Date)
    })

    it('rejects publishing an offer that is not DRAFT', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 100, status: 'CLOSED' })

      await expect(service.publish(1, 20, 'COMPANY' as never)).rejects.toThrow(BadRequestException)
    })

    it('forbids a company from publishing another company offer', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 100, status: 'DRAFT' })

      await expect(service.publish(1, 21, 'COMPANY' as never)).rejects.toThrow(ForbiddenException)
      expect(prisma.offer.update).not.toHaveBeenCalled()
    })

    it('lets the coordinator publish any offer', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 100, status: 'DRAFT' })

      await expect(service.publish(1, 1, 'COORDINATOR' as never)).resolves.toMatchObject({ status: 'PUBLISHED' })
    })

    it('closes a PUBLISHED offer of its own company', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 100, status: 'PUBLISHED' })

      await expect(service.close(1, 20, 'COMPANY' as never)).resolves.toMatchObject({ status: 'CLOSED' })
    })

    it('rejects closing an offer that is not PUBLISHED', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 100, status: 'DRAFT' })

      await expect(service.close(1, 20, 'COMPANY' as never)).rejects.toThrow(BadRequestException)
    })

    it('forbids a company from closing another company offer', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 100, status: 'PUBLISHED' })

      await expect(service.close(1, 21, 'COMPANY' as never)).rejects.toThrow(ForbiddenException)
      expect(prisma.offer.update).not.toHaveBeenCalled()
    })

    it('lets the coordinator close any offer', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 100, status: 'PUBLISHED' })

      await expect(service.close(1, 1, 'COORDINATOR' as never)).resolves.toMatchObject({ status: 'CLOSED' })
    })
  })

  it('counts accepted applications for an offer', async () => {
    prisma.application.count.mockResolvedValue(3)

    await expect(service.acceptedCount(1)).resolves.toBe(3)
    expect(prisma.application.count).toHaveBeenCalledWith({
      where: { offerId: 1, status: 'ACCEPTED' },
    })
  })

  it('lists all offers of the company tied to the authenticated user, any status', async () => {
    prisma.user.findUnique.mockResolvedValue({ companyId: 7 })
    prisma.offer.findMany.mockResolvedValue([{ id: 1, companyId: 7, status: 'DRAFT' }])

    const result = await service.findAllForCompanyUser(42)

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 42 }, select: { companyId: true } })
    expect(prisma.offer.findMany).toHaveBeenCalledWith({
      where: { companyId: 7 },
      orderBy: { createdAt: 'desc' },
      include: { company: true, applications: { select: { status: true } } },
    })
    expect(result).toEqual([{ id: 1, companyId: 7, status: 'DRAFT' }])
  })

  it('rejects listing offers for a user with no company', async () => {
    prisma.user.findUnique.mockResolvedValue({ companyId: null })

    await expect(service.findAllForCompanyUser(42)).rejects.toThrow('el usuario no tiene una empresa asociada')
  })

  describe('create', () => {
    const dto = { title: 'Backend', description: 'API', modality: 'remoto', seats: 2, requiredHours: 240 }

    beforeEach(() => {
      prisma.offer.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }))
    })

    it('creates the offer as DRAFT for the company of a company user, even without companyId', async () => {
      prisma.user.findUnique.mockResolvedValue({ companyId: 100 })

      const result = await service.create(dto as never, 20, 'COMPANY' as never)

      expect(result).toMatchObject({ companyId: 100, status: 'DRAFT' })
    })

    it('accepts a company user that sends its own companyId', async () => {
      prisma.user.findUnique.mockResolvedValue({ companyId: 100 })

      await expect(service.create({ ...dto, companyId: 100 } as never, 20, 'COMPANY' as never)).resolves.toMatchObject({
        companyId: 100,
      })
    })

    it('forbids a company user from creating an offer for another company', async () => {
      prisma.user.findUnique.mockResolvedValue({ companyId: 100 })

      await expect(service.create({ ...dto, companyId: 200 } as never, 20, 'COMPANY' as never)).rejects.toThrow(
        ForbiddenException,
      )
      expect(prisma.offer.create).not.toHaveBeenCalled()
    })

    it('forbids a company user with no company associated', async () => {
      prisma.user.findUnique.mockResolvedValue({ companyId: null })

      await expect(service.create(dto as never, 22, 'COMPANY' as never)).rejects.toThrow(ForbiddenException)
      expect(prisma.offer.create).not.toHaveBeenCalled()
    })

    it('lets the coordinator create an offer for any company', async () => {
      await expect(service.create({ ...dto, companyId: 200 } as never, 1, 'COORDINATOR' as never)).resolves.toMatchObject(
        { companyId: 200, status: 'DRAFT' },
      )
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })

    it('requires companyId when the coordinator creates an offer', async () => {
      await expect(service.create(dto as never, 1, 'COORDINATOR' as never)).rejects.toThrow(BadRequestException)
    })
  })

  // La oferta 1 es de la empresa 100.
  describe('assertOfferOwnership', () => {
    const offer = { id: 1, companyId: 100, status: 'DRAFT' }

    beforeEach(() => {
      prisma.offer.findUnique.mockResolvedValue(offer)
    })

    it('returns the offer to a company user of the owner company', async () => {
      prisma.user.findUnique.mockResolvedValue({ companyId: 100 })

      await expect(service.assertOfferOwnership(1, 20, 'COMPANY' as never)).resolves.toBe(offer)
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 20 }, select: { companyId: true } })
    })

    it('forbids a company user of another company', async () => {
      prisma.user.findUnique.mockResolvedValue({ companyId: 200 })

      await expect(service.assertOfferOwnership(1, 21, 'COMPANY' as never)).rejects.toThrow(ForbiddenException)
    })

    it('forbids a company user with no company associated', async () => {
      prisma.user.findUnique.mockResolvedValue({ companyId: null })

      await expect(service.assertOfferOwnership(1, 22, 'COMPANY' as never)).rejects.toThrow(ForbiddenException)
    })

    it('forbids roles that do not administer offers', async () => {
      await expect(service.assertOfferOwnership(1, 30, 'STUDENT' as never)).rejects.toThrow(ForbiddenException)
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })

    it('lets the coordinator administer any offer', async () => {
      await expect(service.assertOfferOwnership(1, 1, 'COORDINATOR' as never)).resolves.toBe(offer)
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })

    it('fails with 404 when the offer does not exist, before checking ownership', async () => {
      prisma.offer.findUnique.mockResolvedValue(null)

      await expect(service.assertOfferOwnership(99, 20, 'COMPANY' as never)).rejects.toThrow(NotFoundException)
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })
  })
})
