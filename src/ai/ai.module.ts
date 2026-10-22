import { Module } from '@nestjs/common'
import { HourLogModule } from '../hour-log/hour-log.module'
import { PlacementModule } from '../placement/placement.module'
import { AI_TEXT_PROVIDER } from './ai-provider'
import { AiController } from './ai.controller'
import { buildTextProvider } from './provider-factory'
import { WeeklySummaryService } from './weekly-summary.service'

@Module({
  imports: [HourLogModule, PlacementModule],
  controllers: [AiController],
  providers: [
    { provide: AI_TEXT_PROVIDER, useFactory: () => buildTextProvider() },
    WeeklySummaryService,
  ],
  exports: [AI_TEXT_PROVIDER],
})
export class AiModule {}
