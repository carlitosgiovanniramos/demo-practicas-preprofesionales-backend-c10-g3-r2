import { Module } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { OfferModule } from '../offer/offer.module'
import { RecommendationController } from './recommendation.controller'
import { RecommendationService } from './recommendation.service'

@Module({
  imports: [AiModule, OfferModule],
  controllers: [RecommendationController],
  providers: [RecommendationService],
})
export class RecommendationModule {}