import { Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { AccreditationQueryDto } from '../placement/dto/accreditation-query.dto'
import { AccreditationExplanationService } from './accreditation-explanation.service'

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccreditationAiController {
  constructor(private readonly explanations: AccreditationExplanationService) {}

  @Get('placements/:id/accreditation-explanation')
  @Roles(Role.COORDINATOR)
  explain(@Param('id', ParseIntPipe) id: number, @Query() query: AccreditationQueryDto) {
    return this.explanations.explainPlacement(id, query.period)
  }

  // Lote SIMULADO sobre datos de ejemplo para la demo: no representa tráfico real de usuarios.
  @Post('ai/simulated-batch')
  @Roles(Role.COORDINATOR)
  simulatedBatch(@Query() query: AccreditationQueryDto) {
    return this.explanations.simulatedBatch(query.period)
  }
}
