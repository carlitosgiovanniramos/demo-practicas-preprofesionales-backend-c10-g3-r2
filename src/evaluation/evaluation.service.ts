import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { Placement } from '@prisma/client'
import { EvaluationKind, Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateEvaluationDto } from './dto/create-evaluation.dto'

@Injectable()
export class EvaluationService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(dto: CreateEvaluationDto, evaluatorId: number, evaluatorRole: Role) {
    const placement = await this.prisma.placement.findUnique({ where: { id: dto.placementId } })
    if (!placement) throw new NotFoundException('placement no encontrado')

    await this.assertCanSubmit(dto, placement, evaluatorId, evaluatorRole)

    return this.prisma.evaluation.create({
      data: {
        placementId: dto.placementId,
        evaluatorId,
        kind: dto.kind,
        period: dto.period,
        scores: dto.scores as unknown as object,
        comment: dto.comment,
        submittedAt: new Date(),
      },
    })
  }

  /** Deriva del rol de quien llama qué `kind` de evaluación puede enviar y sobre qué placement. */
  private async assertCanSubmit(
    dto: CreateEvaluationDto,
    placement: Placement,
    evaluatorId: number,
    evaluatorRole: Role,
  ): Promise<void> {
    if (evaluatorRole === Role.TUTOR) return this.assertTutorEvaluation(dto, placement, evaluatorId)
    if (evaluatorRole === Role.COMPANY) return this.assertCompanyEvaluation(dto, placement, evaluatorId)
    if (evaluatorRole === Role.STUDENT) return this.assertStudentEvaluation(dto, placement, evaluatorId)
    throw new ForbiddenException('rol no autorizado para enviar evaluaciones')
  }

  private assertTutorEvaluation(dto: CreateEvaluationDto, placement: Placement, evaluatorId: number): void {
    if (dto.kind !== EvaluationKind.TUTOR || placement.tutorId !== evaluatorId) {
      throw new ForbiddenException('el tutor solo puede enviar su propia evaluación de tipo TUTOR')
    }
  }

  private async assertCompanyEvaluation(
    dto: CreateEvaluationDto,
    placement: Placement,
    evaluatorId: number,
  ): Promise<void> {
    const evaluator = await this.prisma.user.findUnique({ where: { id: evaluatorId } })
    if (dto.kind !== EvaluationKind.COMPANY || evaluator?.companyId !== placement.companyId) {
      throw new ForbiddenException('la empresa solo puede enviar su propia evaluación de tipo COMPANY')
    }
  }

  private assertStudentEvaluation(dto: CreateEvaluationDto, placement: Placement, evaluatorId: number): void {
    if (dto.kind !== EvaluationKind.SELF || placement.studentId !== evaluatorId) {
      throw new ForbiddenException('el estudiante solo puede enviar su propia autoevaluación')
    }
  }

  async listForPlacement(placementId: number, userId: number, role: Role) {
    const placement = await this.prisma.placement.findUnique({ where: { id: placementId } })
    if (!placement) throw new NotFoundException('placement no encontrado')

    const allowed = role === Role.COORDINATOR || placement.studentId === userId || placement.tutorId === userId
    if (!allowed) throw new ForbiddenException('no tienes acceso a las evaluaciones de este placement')

    return this.prisma.evaluation.findMany({
      where: { placementId, deletedAt: null },
      orderBy: { submittedAt: 'desc' },
    })
  }
}
