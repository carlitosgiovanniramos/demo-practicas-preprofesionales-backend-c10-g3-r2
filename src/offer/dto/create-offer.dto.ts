import { Type } from 'class-transformer'
import { IsDate, IsInt, IsString, Min } from 'class-validator'

export class CreateOfferDto {
  @IsInt() companyId!: number
  @IsString() title!: string
  @IsString() description!: string
  @IsString() modality!: string
  @IsInt() @Min(1) seats!: number
  @IsInt() @Min(1) requiredHours!: number
  @Type(() => Date) @IsDate() periodStart!: Date
  @Type(() => Date) @IsDate() periodEnd!: Date
}
