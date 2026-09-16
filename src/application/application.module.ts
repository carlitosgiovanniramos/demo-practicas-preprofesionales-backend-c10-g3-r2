import { Module } from '@nestjs/common'
import { OfferModule } from '../offer/offer.module'
import { ApplicationController } from './application.controller'
import { ApplicationService } from './application.service'

@Module({
  imports: [OfferModule],
  controllers: [ApplicationController],
  providers: [ApplicationService],
  exports: [ApplicationService],
})
export class ApplicationModule {}
