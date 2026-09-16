import { IsInt } from 'class-validator'

export class CreatePlacementDto {
  @IsInt() applicationId!: number
  @IsInt() tutorId!: number
}
