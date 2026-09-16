import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ApplicationStatus } from '@prisma/client'
import { OfferService } from '../offer/offer.service'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offers: OfferService,
  ) {}

  apply(offerId: number, studentId: number, motivation: string) {
    return this.prisma.application.create({
      data: { offerId, studentId, motivation, status: ApplicationStatus.SUBMITTED },
    })
  }

  // Postulaciones del propio estudiante, con la oferta y la empresa incluidas
  // para que la pantalla no tenga que resolverlas con llamadas aparte.
  listForStudent(studentId: number) {
    return this.prisma.application.findMany({
      where: { studentId },
      orderBy: { submittedAt: 'desc' },
      include: { offer: { include: { company: true } } },
    })
  }

  // D-04: N+1. Una consulta por la lista y otra por cada estudiante.
  async listByOffer(offerId: number) {
    const applications = await this.prisma.application.findMany({ where: { offerId } })
    const rows = []
    for (const application of applications) {
      const student = await this.prisma.user.findUnique({
        where: { id: application.studentId },
        select: { id: true, email: true, fullName: true },
      })
      rows.push({ ...application, student })
    }
    return rows
  }

  async decide(id: number, status: ApplicationStatus) {
    const application = await this.prisma.application.findUnique({ where: { id } })
    if (!application) throw new NotFoundException('postulación no encontrada')
    if (application.status !== ApplicationStatus.SUBMITTED && application.status !== ApplicationStatus.INTERVIEW) {
      throw new BadRequestException('la postulación ya fue decidida')
    }

    if (status === ApplicationStatus.ACCEPTED) {
      const offer = await this.prisma.offer.findUnique({ where: { id: application.offerId } })
      if (!offer) throw new NotFoundException('oferta no encontrada')
      // Verifica que la oferta todavía tenga cupos antes de aceptar la postulación.
      const accepted = await this.offers.acceptedCount(application.offerId)
      if (accepted >= offer.seats) throw new BadRequestException('la oferta ya no tiene cupos')
    }

    return this.prisma.application.update({
      where: { id },
      data: { status, decidedAt: new Date() },
    })
  }
}
