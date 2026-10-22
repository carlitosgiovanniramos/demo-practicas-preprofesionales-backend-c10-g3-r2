import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { RecommendationQueryDto } from './dto/recommendation-query.dto'
import { RecommendationService } from './recommendation.service'

@Controller('recommendations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecommendationController {
  constructor(private readonly service: RecommendationService) {}

  /** Ofertas publicadas que el estudiante no ha postulado, ordenadas por similitud con sus postulaciones. */
  @Get('offers')
  @Roles(Role.STUDENT)
  offers(@Query() query: RecommendationQueryDto, @Req() req: { user: { sub: number } }) {
    return this.service.forStudent(req.user.sub, query.limit, query.explain === 'true')
  }
}
