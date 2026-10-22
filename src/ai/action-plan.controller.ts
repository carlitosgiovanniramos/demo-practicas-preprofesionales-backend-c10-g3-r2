import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { AccreditationQueryDto } from '../placement/dto/accreditation-query.dto'
import { SaveActionPlanDto } from './dto/save-action-plan.dto'
import { ActionPlanService } from './action-plan.service'

type AuthRequest = { user: { sub: number; role: Role } }

@Controller('placements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActionPlanController {
  constructor(private readonly plans: ActionPlanService) {}

  @Get(':id/action-plan')
  @Roles(Role.STUDENT, Role.TUTOR, Role.COORDINATOR)
  get(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.plans.get(id, req.user.sub, req.user.role)
  }

  @Put(':id/action-plan')
  @Roles(Role.COORDINATOR)
  save(@Param('id', ParseIntPipe) id: number, @Body() dto: SaveActionPlanDto, @Req() req: AuthRequest) {
    return this.plans.save(id, dto.content, req.user.sub, req.user.role)
  }

  @Post(':id/action-plan/draft')
  @Roles(Role.COORDINATOR)
  draft(@Param('id', ParseIntPipe) id: number, @Query() query: AccreditationQueryDto) {
    return this.plans.draft(id, query.period)
  }
}
