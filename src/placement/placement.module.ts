import { Module } from '@nestjs/common'
import { AccreditationService } from './accreditation.service'
import { PlacementController } from './placement.controller'
import { PlacementService } from './placement.service'

@Module({
  controllers: [PlacementController],
  providers: [PlacementService, AccreditationService],
  exports: [PlacementService],
})
export class PlacementModule {}
