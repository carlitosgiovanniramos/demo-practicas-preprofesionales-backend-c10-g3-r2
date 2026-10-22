import { Module } from '@nestjs/common'
import { HourLogController } from './hour-log.controller'
import { HourLogExportService } from './hour-log-export.service'
import { HourLogReportService } from './hour-log-report.service'
import { HourLogService } from './hour-log.service'

@Module({
  controllers: [HourLogController],
  providers: [HourLogService, HourLogReportService, HourLogExportService],
  exports: [HourLogService],
})
export class HourLogModule {}
