import { Type } from 'class-transformer'
import { EvaluationKind } from '@prisma/client'
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator'

export class ScoresDto {
  @IsInt() @Min(1) @Max(5) technical!: number
  @IsInt() @Min(1) @Max(5) communication!: number
  @IsInt() @Min(1) @Max(5) punctuality!: number
}

export class CreateEvaluationDto {
  @IsInt() placementId!: number
  @IsEnum(EvaluationKind) kind!: EvaluationKind
  @IsString() period!: string
  @ValidateNested() @Type(() => ScoresDto) scores!: ScoresDto
  @IsOptional() @IsString() @MaxLength(1000) comment?: string
}
