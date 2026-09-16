import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsObject, IsOptional, IsUUID, ValidateNested } from 'class-validator'

export type SyncEntity = 'hourLog' | 'placement' | 'document' | 'evaluation'
export type SyncOp = 'create' | 'update' | 'delete'

export class SyncOperationDto {
  @IsUUID('4') clientOpId!: string
  @IsIn(['hourLog', 'placement', 'document', 'evaluation']) entity!: SyncEntity
  @IsIn(['create', 'update', 'delete']) op!: SyncOp
  @IsOptional() @IsInt() baseVersion!: number | null
  @IsObject() payload!: Record<string, unknown>
}

export class PushDto {
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => SyncOperationDto)
  ops!: SyncOperationDto[]
}

export interface SyncOperationInput {
  clientOpId: string
  entity: SyncEntity
  op: SyncOp
  baseVersion: number | null
  payload: Record<string, unknown>
}

export interface SyncOperationResult {
  clientOpId: string
  status: 'applied' | 'conflict' | 'rejected'
  server: Record<string, unknown> | null
  reason: string | null
}
