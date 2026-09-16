import { ApplicationStatus } from '@prisma/client'
import { IsIn } from 'class-validator'

export class DecideApplicationDto {
  @IsIn([ApplicationStatus.INTERVIEW, ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED])
  status!: ApplicationStatus
}
