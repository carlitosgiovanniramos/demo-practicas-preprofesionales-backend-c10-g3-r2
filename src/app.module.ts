import { Module } from '@nestjs/common'
import { AiModule } from './ai/ai.module'
import { ApplicationModule } from './application/application.module'
import { AuthModule } from './auth/auth.module'
import { CompanyModule } from './company/company.module'
import { EvaluationModule } from './evaluation/evaluation.module'
import { HourLogModule } from './hour-log/hour-log.module'
import { OfferModule } from './offer/offer.module'
import { PlacementModule } from './placement/placement.module'
import { PrismaModule } from './prisma/prisma.module'
import { SyncModule } from './sync/sync.module'

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CompanyModule,
    OfferModule,
    ApplicationModule,
    PlacementModule,
    HourLogModule,
    EvaluationModule,
    SyncModule,
    AiModule,
  ],
})
export class AppModule {}
