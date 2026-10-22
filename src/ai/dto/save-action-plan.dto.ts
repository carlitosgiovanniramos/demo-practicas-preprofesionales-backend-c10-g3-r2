import { IsString, MaxLength, MinLength } from 'class-validator'

export class SaveActionPlanDto {
  @IsString()
  @MinLength(1, { message: 'el plan no puede estar vacío' })
  @MaxLength(4000, { message: 'el plan no puede superar 4000 caracteres' })
  content!: string
}
