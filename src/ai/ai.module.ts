import { Module } from '@nestjs/common'
import { HourLogModule } from '../hour-log/hour-log.module'
import { PlacementModule } from '../placement/placement.module'
import { AI_CLASSIFICATION_PROVIDER, AI_GENERATION_PROVIDER } from './ai-provider'
import { AiController } from './ai.controller'
import {
  DEFAULT_CLASSIFICATION_ORDER,
  DEFAULT_GENERATION_ORDER,
  buildTextProvider,
} from './provider-factory'
import { WeeklySummaryService } from './weekly-summary.service'

// Cada tarea se configura aparte: AI_GENERATION_PROVIDERS y AI_CLASSIFICATION_PROVIDERS.
@Module({
  imports: [HourLogModule, PlacementModule],
  controllers: [AiController],
  providers: [
    {
      provide: AI_GENERATION_PROVIDER,
      useFactory: () => buildTextProvider(process.env.AI_GENERATION_PROVIDERS || DEFAULT_GENERATION_ORDER),
    },
    {
      provide: AI_CLASSIFICATION_PROVIDER,
      useFactory: () => buildTextProvider(process.env.AI_CLASSIFICATION_PROVIDERS || DEFAULT_CLASSIFICATION_ORDER),
    },
    WeeklySummaryService,
  ],
  exports: [AI_GENERATION_PROVIDER, AI_CLASSIFICATION_PROVIDER],
})
export class AiModule {}
