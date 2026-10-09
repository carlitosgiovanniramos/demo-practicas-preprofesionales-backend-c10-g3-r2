import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ApplicationStatus, type Offer, OfferStatus, Role } from '@prisma/client'
import { PUBLIC_COMPANY } from '../company/public-company'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateOfferDto } from './dto/create-offer.dto'

@Injectable()
export class OfferService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOfferDto, userId: number, role: Role) {
    const companyId = await this.resolveOwnerCompany(dto.companyId, userId, role)
    return this.prisma.offer.create({ data: { ...dto, companyId, status: OfferStatus.DRAFT } })
  }

  /**
   * Empresa a cuyo nombre se crea una oferta. La coordinación la elige en el
   * DTO; una empresa siempre crea a nombre propio. No se confía en la
   * `companyId` del cliente: si una empresa la manda, tiene que ser la suya.
   */
  private async resolveOwnerCompany(requested: number | undefined, userId: number, role: Role): Promise<number> {
    if (role === Role.COORDINATOR) {
      if (requested === undefined) throw new BadRequestException('companyId es obligatorio para la coordinación')
      return requested
    }
    const own = await this.actingCompanyId(userId, role)
    if (own === null) throw new ForbiddenException('el usuario no tiene una empresa asociada')
    if (requested !== undefined && requested !== own) {
      throw new ForbiddenException('no puedes crear ofertas para otra empresa')
    }
    return own
  }

  findAll() {
    return this.prisma.offer.findMany({
      where: { status: OfferStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
      include: { company: PUBLIC_COMPANY },
    })
  }

  async findOne(id: number, userId: number, role: Role) {
    const offer = await this.prisma.offer.findUnique({ where: { id }, include: { company: PUBLIC_COMPANY } })
    if (!offer || !(await this.canView(offer, userId, role))) throw new NotFoundException('oferta no encontrada')
    return offer
  }

  /**
   * Una oferta publicada es catálogo y la ve cualquiera. Fuera de PUBLISHED
   * solo la ven la coordinación, la empresa dueña y el estudiante que se
   * postuló (su postulación sigue enlazando al detalle). Al resto se le
   * responde 404 para no revelar que la oferta existe.
   */
  private async canView(offer: Offer, userId: number, role: Role): Promise<boolean> {
    if (offer.status === OfferStatus.PUBLISHED || role === Role.COORDINATOR) return true
    if (role === Role.STUDENT) {
      return (await this.prisma.application.count({ where: { offerId: offer.id, studentId: userId } })) > 0
    }
    return (await this.actingCompanyId(userId, role)) === offer.companyId
  }

  // Ofertas de la empresa del usuario autenticado, en cualquier estado —
  // a diferencia de findAll() (solo PUBLISHED, para el catálogo del estudiante).
  // Incluye el estado de las postulaciones para que la empresa vea cupos
  // ocupados sin que el front tenga que pedir una lista aparte por oferta.
  async findAllForCompanyUser(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } })
    if (!user?.companyId) throw new NotFoundException('el usuario no tiene una empresa asociada')
    return this.prisma.offer.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: 'desc' },
      include: { company: true, applications: { select: { status: true } } },
    })
  }

  // Empresa a cuyo nombre actúa el usuario: la suya si es COMPANY; null para
  // cualquier otro rol o para una COMPANY sin empresa asociada.
  private async actingCompanyId(userId: number, role: Role): Promise<number | null> {
    if (role !== Role.COMPANY) return null
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } })
    return user?.companyId ?? null
  }

  /**
   * Verifica que quien administra una oferta pueda hacerlo: la coordinación
   * siempre; una empresa solo si la oferta pertenece a su `companyId`. El
   * guard filtra por rol; la pertenencia se comprueba acá, así que llamar al
   * servicio directo con una empresa ajena también falla.
   *
   * Devuelve la oferta para que quien llama no tenga que volver a leerla.
   */
  async assertOfferOwnership(offerId: number, userId: number, role: Role): Promise<Offer> {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } })
    if (!offer) throw new NotFoundException('oferta no encontrada')
    if (role === Role.COORDINATOR) return offer
    const companyId = await this.actingCompanyId(userId, role)
    if (companyId === null || companyId !== offer.companyId) {
      throw new ForbiddenException('la oferta no pertenece a tu empresa')
    }
    return offer
  }

  async publish(id: number, userId: number, role: Role) {
    const offer = await this.assertOfferOwnership(id, userId, role)
    if (offer.status !== OfferStatus.DRAFT) {
      throw new BadRequestException('solo se publican ofertas en DRAFT')
    }
    return this.prisma.offer.update({
      where: { id },
      data: { status: OfferStatus.PUBLISHED, publishedAt: new Date() },
    })
  }

  async close(id: number, userId: number, role: Role) {
    const offer = await this.assertOfferOwnership(id, userId, role)
    if (offer.status !== OfferStatus.PUBLISHED) {
      throw new BadRequestException('solo se cierran ofertas publicadas')
    }
    return this.prisma.offer.update({ where: { id }, data: { status: OfferStatus.CLOSED } })
  }

  // Cuenta las postulaciones ya aceptadas para una oferta.
  acceptedCount(offerId: number): Promise<number> {
    return this.prisma.application.count({
      where: { offerId, status: ApplicationStatus.ACCEPTED },
    })
  }
}
