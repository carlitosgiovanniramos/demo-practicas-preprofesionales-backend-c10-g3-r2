import { Injectable } from '@nestjs/common'
import { DocumentKind, DocumentStatus, HourLogStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { type AccreditationResult, calculateAccreditationStatus } from './accreditation'

@Injectable()
export class AccreditationService {
  constructor(private readonly prisma: PrismaService) {}

  async reportForPeriod(period: string): Promise<AccreditationResult[]> {
    const [year, term] = period.split('-')
    const from = new Date(Number(year), term === '1' ? 0 : 6, 1)
    const to = new Date(Number(year), term === '1' ? 6 : 12, 1)

    const placements = await this.prisma.placement.findMany({
      where: { startDate: { gte: from, lt: to }, deletedAt: null },
      include: { student: true, documents: true, evaluations: true },
    })

    const results: AccreditationResult[] = []
    for (const placement of placements) {
      const approved = await this.prisma.hourLog.aggregate({
        where: { placementId: placement.id, status: HourLogStatus.APPROVED, deletedAt: null },
        _sum: { hours: true },
      })
      const pending = await this.prisma.hourLog.aggregate({
        where: { placementId: placement.id, status: HourLogStatus.SUBMITTED, deletedAt: null },
        _sum: { hours: true },
      })

      const validated = (kind: DocumentKind) =>
        placement.documents.some((d) => d.kind === kind && d.status === DocumentStatus.VALIDATED)

      const scoreOf = (kind: 'TUTOR' | 'COMPANY'): number | null => {
        const evaluation = placement.evaluations.find((e) => e.kind === kind)
        if (!evaluation) return null
        const scores = evaluation.scores as { technical: number; communication: number; punctuality: number }
        return (scores.technical + scores.communication + scores.punctuality) / 3
      }

      results.push(
        calculateAccreditationStatus({
          placementId: placement.id,
          studentName: placement.student.fullName,
          requiredHours: placement.requiredHours,
          approvedHours: approved._sum.hours ?? 0,
          pendingHours: pending._sum.hours ?? 0,
          hasAgreement: validated(DocumentKind.AGREEMENT),
          hasInsurance: validated(DocumentKind.INSURANCE),
          hasFinalReport: validated(DocumentKind.REPORT),
          tutorEvaluationScore: scoreOf('TUTOR'),
          companyEvaluationScore: scoreOf('COMPANY'),
          placementStatus: placement.status,
        }),
      )
    }
    return results
  }
}
