import { HourLogStatus } from '@prisma/client'
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

export class ReviewHourLogDto {
  @IsIn([HourLogStatus.APPROVED, HourLogStatus.REJECTED])
  status!: HourLogStatus

  @IsOptional() @IsString() @MaxLength(300) note?: string
}
