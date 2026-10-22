import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'

export class RecommendationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero' })
  @Min(1, { message: 'limit debe ser al menos 1' })
  @Max(50, { message: 'limit no puede pasar de 50' })
  limit: number = 10

  /** Texto a propósito: el parámetro llega como cadena en la URL. */
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'explain debe ser true o false' })
  explain: 'true' | 'false' = 'false'
}
