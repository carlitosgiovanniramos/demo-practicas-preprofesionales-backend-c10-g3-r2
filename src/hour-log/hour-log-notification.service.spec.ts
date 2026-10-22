import { afterEach, describe, expect, it, vi } from 'vitest'
import { HourLogNotificationService } from './hour-log-notification.service'

describe('HourLogNotificationService', () => {
  afterEach(() => vi.restoreAllMocks())

  it('notifies the tutor with the created record identifier', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    new HourLogNotificationService().notifyTutor(7, 99)

    expect(log).toHaveBeenCalledWith('[notificación] tutor 7: nueva hora registrada #99')
  })
})
