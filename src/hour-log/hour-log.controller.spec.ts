import { HourLogStatus, Role } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { HourLogController } from './hour-log.controller'

describe('HourLogController', () => {
  const setup = () => {
    const service = {
      create: vi.fn(),
      assertPlacementAccess: vi.fn(),
      listForPlacement: vi.fn(),
      review: vi.fn(),
    }
    const reports = { progressReport: vi.fn() }
    return { controller: new HourLogController(service as never, reports as never), service, reports }
  }

  it('creates a log for the authenticated student', () => {
    const { controller, service } = setup()
    const dto = { placementId: 1 } as never
    service.create.mockReturnValue({ id: 9 })

    expect(controller.create(dto, { user: { sub: 5 } })).toEqual({ id: 9 })
    expect(service.create).toHaveBeenCalledWith(dto, 5)
  })

  it('checks placement access before listing its hour logs', async () => {
    const { controller, service } = setup()
    const user = { sub: 5, role: Role.STUDENT }
    service.listForPlacement.mockResolvedValue([{ id: 9 }])

    await expect(controller.listForPlacement(3, { user })).resolves.toEqual([{ id: 9 }])
    expect(service.assertPlacementAccess).toHaveBeenCalledWith(3, 5, Role.STUDENT)
    expect(service.listForPlacement).toHaveBeenCalledWith(3)
  })

  it('checks access before returning the progress report', async () => {
    const { controller, service, reports } = setup()
    const user = { sub: 7, role: Role.TUTOR }
    reports.progressReport.mockResolvedValue({ placementId: 3 })

    await expect(controller.progress(3, { user })).resolves.toEqual({ placementId: 3 })
    expect(service.assertPlacementAccess).toHaveBeenCalledWith(3, 7, Role.TUTOR)
    expect(reports.progressReport).toHaveBeenCalledWith(3)
  })

  it('does not list records when placement access is denied', async () => {
    const { controller, service } = setup()
    service.assertPlacementAccess.mockRejectedValue(new Error('forbidden'))

    await expect(controller.listForPlacement(3, { user: { sub: 8, role: Role.STUDENT } })).rejects.toThrow('forbidden')
    expect(service.listForPlacement).not.toHaveBeenCalled()
  })

  it('does not return a report when placement access is denied', async () => {
    const { controller, service, reports } = setup()
    service.assertPlacementAccess.mockRejectedValue(new Error('forbidden'))

    await expect(controller.progress(3, { user: { sub: 8, role: Role.STUDENT } })).rejects.toThrow('forbidden')
    expect(reports.progressReport).not.toHaveBeenCalled()
  })

  it('reviews a log using the authenticated tutor and request values', () => {
    const { controller, service } = setup()
    const dto = { status: HourLogStatus.APPROVED, note: 'correcto' }
    service.review.mockReturnValue({ id: 9 })

    expect(controller.review(9, dto, { user: { sub: 7 } })).toEqual({ id: 9 })
    expect(service.review).toHaveBeenCalledWith(9, HourLogStatus.APPROVED, 7, 'correcto')
  })
})
