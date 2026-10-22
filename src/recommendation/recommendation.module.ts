import { Module } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { RecommendationController } from './recommendation.controller'
import { RecommendationService } from './recommendation.service'

@Module({
  imports: [AiModule],
  controllers: [RecommendationController],
  providers: [RecommendationService],
})
export class RecommendationModule {}