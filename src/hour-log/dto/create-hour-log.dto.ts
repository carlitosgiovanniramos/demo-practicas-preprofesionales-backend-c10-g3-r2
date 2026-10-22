import { IsInt, IsString, Matches, Max, MaxLength, Min, ValidateBy } from 'class-validator'
import { HOUR_LOG_HOURS_MESSAGE, HOUR_LOG_LIMITS, HOUR_LOG_TIME_PATTERN } from '../hour-log.rules'
import { CALENDAR_DATE_MESSAGE, parseCalendarDate } from '../hour-log.date'

export class CreateHourLogDto {
  @IsInt() placementId!: number

  @ValidateBy({
    name: 'isCalendarDate',
    validator: { validate: (value: unknown) => parseCalendarDate(value) !== null, defaultMessage: () => CALENDAR_DATE_MESSAGE },
  })
  date!: string

  @Matches(HOUR_LOG_TIME_PATTERN) startTime!: string

  @Matches(HOUR_LOG_TIME_PATTERN) endTime!: string

  @Min(HOUR_LOG_LIMITS.minHours, { message: HOUR_LOG_HOURS_MESSAGE })
  @Max(HOUR_LOG_LIMITS.maxHours, { message: HOUR_LOG_HOURS_MESSAGE })
  hours!: number

  @IsString() @MaxLength(500) activity!: string
}
