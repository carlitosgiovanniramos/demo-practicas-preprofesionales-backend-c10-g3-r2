import { IsInt, IsString, MinLength } from 'class-validator'

export class CreateApplicationDto {
  @IsInt() offerId!: number
  @IsString() @MinLength(20) motivation!: string
}
