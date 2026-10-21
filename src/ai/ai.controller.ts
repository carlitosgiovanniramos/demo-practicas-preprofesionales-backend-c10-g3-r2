import { Controller, Get, Param, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { WeeklySummaryQueryDto } from './dto/weekly-summary-query.dto'
import { WeeklySummaryService } from './weekly-summary.service'

@Controller('placements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(private readonly weeklySummary: WeeklySummaryService) {}

  // Prototipo: el borrador lo redacta Gemini; el estudiante lo revisa antes de enviarlo.
  @Get(':id/weekly-summary')
  @Roles(Role.STUDENT, Role.TUTOR, Role.COORDINATOR)
  draft(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: WeeklySummaryQueryDto,
    @Req() req: { user: { sub: number; role: Role } },
  ) {
    return this.weeklySummary.draft(id, query.weekStart, req.user.sub, req.user.role)
  }
}
