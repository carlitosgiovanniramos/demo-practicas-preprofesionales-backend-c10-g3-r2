import { Matches } from 'class-validator'

export class WeeklySummaryQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'weekStart debe tener el formato AAAA-MM-DD' })
  weekStart!: string
}
