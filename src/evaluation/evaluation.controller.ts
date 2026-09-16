import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { CreateEvaluationDto } from './dto/create-evaluation.dto'
import { EvaluationService } from './evaluation.service'

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class EvaluationController {
  constructor(private readonly service: EvaluationService) {}

  @Post('evaluations')
  @Roles(Role.TUTOR, Role.COMPANY, Role.STUDENT)
  submit(@Body() dto: CreateEvaluationDto, @Req() req: { user: { sub: number; role: Role } }) {
    return this.service.submit(dto, req.user.sub, req.user.role)
  }

  @Get('placements/:id/evaluations')
  listForPlacement(@Param('id', ParseIntPipe) id: number, @Req() req: { user: { sub: number; role: Role } }) {
    return this.service.listForPlacement(id, req.user.sub, req.user.role)
  }
}
