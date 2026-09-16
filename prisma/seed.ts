import 'dotenv/config'
import { PrismaClient, Role, OfferStatus, ApplicationStatus, PlacementStatus, HourLogStatus } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// LCG determinista: mismo seed -> mismos datos en todos los entornos.
let seedState = 42
function nextInt(max: number): number {
  seedState = (seedState * 1103515245 + 12345) % 2147483648
  return seedState % max
}

const COMPANIES = 12
const OFFERS_PER_COMPANY = 3
const PLACEMENTS = 200
const HOURLOGS_PER_PLACEMENT = 20

async function main() {
  const password = await bcrypt.hash('yura1234', 10)

  const coordinator = await prisma.user.create({
    data: { email: 'coordinador@miyura.com', password, fullName: 'Coordinación de Vinculación', role: Role.COORDINATOR },
  })

  const tutors = []
  for (let i = 0; i < 8; i++) {
    tutors.push(await prisma.user.create({
      data: { email: `tutor${i}@miyura.com`, password, fullName: `Tutor Académico ${i}`, role: Role.TUTOR },
    }))
  }

  const companies = []
  for (let i = 0; i < COMPANIES; i++) {
    companies.push(await prisma.company.create({
      data: {
        taxId: `179${String(i).padStart(7, '0')}001`,
        name: `Empresa ${i}`,
        sector: ['Software', 'Manufactura', 'Salud', 'Agro'][i % 4],
        contactEmail: `rrhh@empresa${i}.com`,
        verified: i % 3 !== 0,
      },
    }))
  }

  for (let i = 0; i < COMPANIES; i++) {
    await prisma.user.create({
      data: {
        email: `empresa${i}@miyura.com`,
        password,
        fullName: `Contacto Empresa ${i}`,
        role: Role.COMPANY,
        companyId: companies[i].id,
      },
    })
  }

  const offers = []
  for (const company of companies) {
    for (let j = 0; j < OFFERS_PER_COMPANY; j++) {
      offers.push(await prisma.offer.create({
        data: {
          companyId: company.id,
          title: `Practicante ${['Backend', 'QA', 'Datos'][j]} — ${company.name}`,
          description: 'Prácticas preprofesionales de 240 horas en modalidad presencial.',
          modality: j % 2 === 0 ? 'PRESENCIAL' : 'HIBRIDA',
          seats: 2 + nextInt(4),
          requiredHours: 240,
          periodStart: new Date('2026-03-01'),
          periodEnd: new Date('2026-07-31'),
          status: OfferStatus.PUBLISHED,
          publishedAt: new Date('2026-02-15'),
        },
      }))
    }
  }

  for (let i = 0; i < PLACEMENTS; i++) {
    const student = await prisma.user.create({
      data: { email: `estudiante${i}@miyura.com`, password, fullName: `Estudiante ${i}`, role: Role.STUDENT },
    })
    const offer = offers[i % offers.length]
    const application = await prisma.application.create({
      data: {
        offerId: offer.id,
        studentId: student.id,
        status: ApplicationStatus.ACCEPTED,
        motivation: 'Quiero aplicar lo aprendido en un entorno real.',
        decidedAt: new Date('2026-02-25'),
      },
    })
    const placement = await prisma.placement.create({
      data: {
        applicationId: application.id,
        studentId: student.id,
        tutorId: tutors[i % tutors.length].id,
        companyId: offer.companyId,
        startDate: new Date('2026-03-01'),
        endDate: new Date('2026-07-31'),
        requiredHours: 240,
        status: PlacementStatus.ACTIVE,
      },
    })

    const rows = []
    for (let h = 0; h < HOURLOGS_PER_PLACEMENT; h++) {
      const day = new Date('2026-03-02')
      day.setDate(day.getDate() + h * 3)
      rows.push({
        placementId: placement.id,
        date: day,
        startTime: '08:00',
        endTime: '12:00',
        hours: 4,
        activity: `Actividad ${h}: soporte y desarrollo`,
        status: h < 15 ? HourLogStatus.APPROVED : HourLogStatus.SUBMITTED,
        reviewedById: h < 15 ? placement.tutorId : null,
        reviewedAt: h < 15 ? new Date('2026-04-01') : null,
      })
    }
    await prisma.hourLog.createMany({ data: rows })
  }

  console.log(`seed listo — coordinador: ${coordinator.email} / yura1234`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
