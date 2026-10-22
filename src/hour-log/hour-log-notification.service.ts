import { Injectable } from '@nestjs/common'

export const HOUR_LOG_NOTIFIER = Symbol('HOUR_LOG_NOTIFIER')

export interface HourLogNotifier {
  notifyTutor(tutorId: number, hourLogId: number): void
}

@Injectable()
export class HourLogNotificationService implements HourLogNotifier {
  notifyTutor(tutorId: number, hourLogId: number): void {
    console.log(`[notificación] tutor ${tutorId}: nueva hora registrada #${hourLogId}`)
  }
}
