import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ApplicationStatus, type Offer, OfferStatus, Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateOfferDto } from './dto/create-offer.dto'

@Injectable()
export class OfferService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateOfferDto) {
    return this.prisma.offer.create({ data: { ...dto, status: OfferStatus.DRAFT } })
  }

  findAll() {
    return this.prisma.offer.findMany({
      where: { status: OfferStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
      include: { company: true },
    })
  }

  async findOne(id: number) {
    const offer = await this.prisma.offer.findUnique({ where: { id }, include: { company: true } })
    if (!offer) throw new NotFoundException('oferta no encontrada')
    return offer
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

  async publish(id: number) {
    const offer = await this.prisma.offer.findUnique({ where: { id } })
    if (!offer) throw new NotFoundException('oferta no encontrada')
    if (offer.status !== OfferStatus.DRAFT) {
      throw new BadRequestException('solo se publican ofertas en DRAFT')
    }
    return this.prisma.offer.update({
      where: { id },
      data: { status: OfferStatus.PUBLISHED, publishedAt: new Date() },
    })
  }

  async close(id: number) {
    const offer = await this.prisma.offer.findUnique({ where: { id } })
    if (!offer) throw new NotFoundException('oferta no encontrada')
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
