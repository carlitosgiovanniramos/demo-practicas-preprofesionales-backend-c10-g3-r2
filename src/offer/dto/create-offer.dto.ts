import { Type } from 'class-transformer'
import { IsDate, IsInt, IsOptional, IsString, Min } from 'class-validator'

export class CreateOfferDto {
  // Obligatoria para la coordinación. Una empresa puede omitirla: el servicio
  // usa siempre la suya y rechaza (403) cualquier otra.
  @IsOptional() @IsInt() companyId?: number
  @IsString() title!: string
  @IsString() description!: string
  @IsString() modality!: string
  @IsInt() @Min(1) seats!: number
  @IsInt() @Min(1) requiredHours!: number
  @Type(() => Date) @IsDate() periodStart!: Date
  @Type(() => Date) @IsDate() periodEnd!: Date
}
