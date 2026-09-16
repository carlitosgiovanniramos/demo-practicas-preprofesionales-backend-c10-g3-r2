import { Matches } from 'class-validator'

export class AccreditationQueryDto {
  @Matches(/^\d{4}-[12]$/, { message: 'period debe tener el formato AAAA-1 o AAAA-2' })
  period!: string
}
