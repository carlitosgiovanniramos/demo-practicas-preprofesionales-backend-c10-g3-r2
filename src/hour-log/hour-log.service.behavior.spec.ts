import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { HourLogStatus, PlacementStatus, Role } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HourLogService } from './hour-log.service'

const prisma = {
  placement: { findUnique: vi.fn() },
  hourLog: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
}

describe('HourLogService behavior', () => {
  let service: HourLogService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new HourLogService(prisma as never)
  })

  const validDto = () => ({
    placementId: 1,
    date: new Date('2026-04-01'),
    startTime: '08:00',
    endTime: '12:00',
    hours: 4,
    activity: 'Soporte',
  })

  it('rejects creation when the placement does not exist', async () => {
    prisma.placement.findUnique.mockResolvedValue(null)

    await expect(service.create(validDto(), 5)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('rejects creation by a student who does not own the placement', async () => {
    prisma.placement.findUnique.mockResolvedValue({ studentId: 6, status: PlacementStatus.ACTIVE })

    await expect(service.create(validDto(), 5)).rejects.toThrow('el placement no es tuyo')
  })

  it('rejects creation when the placement is inactive', async () => {
    prisma.placement.findUnique.mockResolvedValue({ studentId: 5, status: PlacementStatus.PENDING_DOCS })

    await expect(service.create(validDto(), 5)).rejects.toThrow('el placement no está activo')
  })

  it('rejects a time range that does not end after it starts', async () => {
    prisma.placement.findUnique.mockResolvedValue({ studentId: 5, status: PlacementStatus.ACTIVE })

    await expect(service.create({ ...validDto(), endTime: '08:00' }, 5)).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.hourLog.create).not.toHaveBeenCalled()
  })

  it('allows the placement student, assigned tutor and coordinator to access the placement', async () => {
    prisma.placement.findUnique.mockResolvedValue({ studentId: 5, tutorId: 7 })

    await expect(service.assertPlacementAccess(3, 5, Role.STUDENT)).resolves.toBeUndefined()
    await expect(service.assertPlacementAccess(3, 7, Role.TUTOR)).resolves.toBeUndefined()
    await expect(service.assertPlacementAccess(3, 9, Role.COORDINATOR)).resolves.toBeUndefined()
  })

  it('rejects access to a missing placement', async () => {
    prisma.placement.findUnique.mockResolvedValue(null)

    await expect(service.assertPlacementAccess(3, 5, Role.STUDENT)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('rejects access by an unrelated user', async () => {
    prisma.placement.findUnique.mockResolvedValue({ studentId: 5, tutorId: 7 })

    await expect(service.assertPlacementAccess(3, 8, Role.STUDENT)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('lists non-deleted records for a placement ordered by date descending', async () => {
    prisma.hourLog.findMany.mockResolvedValue([])

    await expect(service.listForPlacement(3)).resolves.toEqual([])
    expect(prisma.hourLog.findMany).toHaveBeenCalledWith({
      where: { placementId: 3, deletedAt: null },
      orderBy: { date: 'desc' },
    })
  })

  it('rejects review when the hour log does not exist', async () => {
    prisma.hourLog.findUnique.mockResolvedValue(null)

    await expect(service.review(99, HourLogStatus.APPROVED, 7)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('rejects review when the placement does not exist', async () => {
    prisma.hourLog.findUnique.mockResolvedValue({ id: 99, placementId: 1 })
    prisma.placement.findUnique.mockResolvedValue(null)

    await expect(service.review(99, HourLogStatus.APPROVED, 7)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('rejects a second review after the log has left SUBMITTED', async () => {
    prisma.hourLog.findUnique.mockResolvedValue({ id: 99, placementId: 1, status: HourLogStatus.APPROVED })
    prisma.placement.findUnique.mockResolvedValue({ tutorId: 7 })

    await expect(service.review(99, HourLogStatus.REJECTED, 7)).rejects.toThrow('solo se revisan registros en SUBMITTED')
    expect(prisma.hourLog.update).not.toHaveBeenCalled()
  })
})
