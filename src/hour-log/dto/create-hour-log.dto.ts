import { Type } from 'class-transformer'
import { IsDate, IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator'
import { HOUR_LOG_HOURS_MESSAGE, HOUR_LOG_LIMITS } from '../hour-log.rules'

export class CreateHourLogDto {
  @IsInt() placementId!: number

  @Type(() => Date) @IsDate() date!: Date

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string

  @Min(HOUR_LOG_LIMITS.minHours, { message: HOUR_LOG_HOURS_MESSAGE })
  @Max(HOUR_LOG_LIMITS.maxHours, { message: HOUR_LOG_HOURS_MESSAGE })
  hours!: number

  @IsString() @MaxLength(500) activity!: string
}
