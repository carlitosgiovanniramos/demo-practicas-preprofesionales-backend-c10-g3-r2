import { Type } from 'class-transformer'
import { IsDate, IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator'

export class CreateHourLogDto {
  @IsInt() placementId!: number

  @Type(() => Date) @IsDate() date!: Date

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string

  // D-06 (copia 1): tope 12.
  @Min(0.5) @Max(12) hours!: number

  @IsString() @MaxLength(500) activity!: string
}
