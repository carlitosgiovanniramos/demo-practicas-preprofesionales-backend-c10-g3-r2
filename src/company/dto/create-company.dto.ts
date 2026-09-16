import { IsEmail, IsString } from 'class-validator'

export class CreateCompanyDto {
  @IsString() taxId!: string
  @IsString() name!: string
  @IsString() sector!: string
  @IsEmail() contactEmail!: string
}
