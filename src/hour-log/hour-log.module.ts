import { Module } from '@nestjs/common'
import { HourLogController } from './hour-log.controller'
import { HourLogService } from './hour-log.service'

@Module({
  controllers: [HourLogController],
  providers: [HourLogService],
  exports: [HourLogService],
})
export class HourLogModule {}
