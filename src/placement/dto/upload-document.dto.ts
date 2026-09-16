import { DocumentKind } from '@prisma/client'
import { IsEnum, IsInt, IsString, Min } from 'class-validator'

export class UploadDocumentDto {
  @IsEnum(DocumentKind) kind!: DocumentKind
  @IsString() filename!: string
  @IsString() mimeType!: string
  @IsInt() @Min(1) size!: number
  @IsString() storageKey!: string
}
