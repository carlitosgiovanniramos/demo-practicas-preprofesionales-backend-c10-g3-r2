import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ApplicationStatus, Prisma, Role } from '@prisma/client'
import { PUBLIC_USER } from '../common/public-user'
import { PUBLIC_COMPANY } from '../company/public-company'
import { OfferService } from '../offer/offer.service'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Marca con la que el trigger `applications_enforce_offer_seats` avisa de que
 * la oferta se llenó. Ver D-08 en `KNOWN_ISSUES.md`.
 */
const SEATS_EXHAUSTED = 'offer_seats_exhausted'

/**
 * El error del trigger llega envuelto por Prisma, y la clase y el código varían
 * entre versiones del motor. Lo estable es la marca del mensaje, que además es
 * nuestra: ningún otro fallo puede mencionarla por casualidad.
 */
function isSeatsExhausted(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const meta = 'meta' in error ? JSON.stringify(error.meta) : ''
  return `${error.message} ${meta}`.includes(SEATS_EXHAUSTED)
}

@Injectable()
export class ApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offers: OfferService,
  ) {}

  /**
   * Una postulación por estudiante y oferta. Solo se puede volver a postular después de un
   * rechazo, y entonces se reactiva la misma fila (la unicidad de offerId+studentId se conserva).
   * Una postulación activa o aceptada bloquea cualquier nuevo intento.
   */
  async apply(offerId: number, studentId: number, motivation: string) {
    const previous = await this.prisma.application.findUnique({
      where: { offerId_studentId: { offerId, studentId } },
    })
    if (previous && previous.status !== ApplicationStatus.REJECTED) {
      throw new ConflictException('ya postulaste a esta oferta')
    }
    if (previous) {
      return this.prisma.application.update({
        where: { id: previous.id },
        data: { status: ApplicationStatus.SUBMITTED, motivation, submittedAt: new Date(), decidedAt: null },
      })
    }
    try {
      return await this.prisma.application.create({
        data: { offerId, studentId, motivation, status: ApplicationStatus.SUBMITTED },
      })
    } catch (error) {
      // Dos envíos simultáneos: el que pierde la carrera choca con la unicidad y recibe el mismo conflicto.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('ya postulaste a esta oferta')
      }
      throw error
    }
  }

  // Postulaciones del propio estudiante, con la oferta y la empresa incluidas
  // para que la pantalla no tenga que resolverlas con llamadas aparte. De la
  // empresa solo la parte pública (H-04).
  listForStudent(studentId: number) {
    return this.prisma.application.findMany({
      where: { studentId },
      orderBy: { submittedAt: 'desc' },
      include: { offer: { include: { company: PUBLIC_COMPANY } } },
    })
  }

  /**
   * Verifica que quien gestiona las postulaciones de una oferta sea la
   * coordinación o la empresa dueña de la oferta. El rol solo dice qué tipo
   * de usuario es; la pertenencia se mira acá (mismo patrón que
   * `assertPlacementAccess` en horas).
   */
  private async assertOfferAccess(offerId: number, userId: number, role: Role): Promise<void> {
    if (role === Role.COORDINATOR) return
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId }, select: { companyId: true } })
    if (!offer) throw new NotFoundException('oferta no encontrada')
    const user =
      role === Role.COMPANY
        ? await this.prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } })
        : null
    const allowed = user?.companyId != null && user.companyId === offer.companyId
    if (!allowed) throw new ForbiddenException('la oferta no pertenece a tu empresa')
  }

  /**
   * Postulaciones de una oferta, cada una con su candidato.
   *
   * D-04 (resuelto): antes se pedía la lista y después una consulta por cada
   * candidato, así que una oferta con 200 postulaciones costaba 200 viajes a
   * la base. Ahora el estudiante viaja en la misma consulta y la cantidad de
   * consultas deja de depender de cuántos postulantes haya. De la persona
   * sigue viajando solo `PUBLIC_USER`, igual que antes.
   */
  async listByOffer(offerId: number, userId: number, role: Role) {
    await this.assertOfferAccess(offerId, userId, role)
    return this.prisma.application.findMany({
      where: { offerId },
      include: { student: PUBLIC_USER },
    })
  }

  async decide(id: number, status: ApplicationStatus, userId: number, role: Role) {
    const application = await this.prisma.application.findUnique({ where: { id } })
    if (!application) throw new NotFoundException('postulación no encontrada')
    // Antes que cualquier otra regla: una empresa ajena no debe ni saber en qué estado está.
    await this.assertOfferAccess(application.offerId, userId, role)
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

    // El conteo de arriba no basta: entre leerlo y escribir cabe otra
    // aceptación, y las dos ven la misma plaza libre (D-08). Lo que lo impide
    // es el trigger `applications_enforce_offer_seats`, que vuelve a contar
    // dentro de este mismo UPDATE y con la oferta bloqueada. Aquí solo queda
    // traducir su negativa a algo que la empresa pueda entender.
    try {
      return await this.prisma.application.update({
        where: { id },
        data: { status, decidedAt: new Date() },
      })
    } catch (error) {
      if (isSeatsExhausted(error)) throw new BadRequestException('la oferta ya no tiene cupos')
      throw error
    }
  }
}
