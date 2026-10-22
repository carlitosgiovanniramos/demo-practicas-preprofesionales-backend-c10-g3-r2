import { Module } from '@nestjs/common'
import { HourLogController } from './hour-log.controller'
import { HourLogExportService } from './hour-log-export.service'
import { HOUR_LOG_NOTIFIER, HourLogNotificationService } from './hour-log-notification.service'
import { HourLogReportService } from './hour-log-report.service'
import { HourLogService } from './hour-log.service'

@Module({
  controllers: [HourLogController],
  providers: [
    HourLogService,
    HourLogReportService,
    HourLogExportService,
    HourLogNotificationService,
    { provide: HOUR_LOG_NOTIFIER, useExisting: HourLogNotificationService },
  ],
  exports: [HourLogService],
})
export class HourLogModule {}
