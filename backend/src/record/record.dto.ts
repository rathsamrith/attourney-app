import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class FileErratumDto {
  @ApiProperty() @IsUUID() transcriptLineId: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(10_000) corrected: string;
  @ApiProperty({ enum: ['transcription', 'substantive'] }) @IsIn(['transcription', 'substantive']) kind: 'transcription' | 'substantive';
}

export class DecideErratumDto {
  @ApiProperty({ enum: ['accepted', 'rejected'] }) @IsIn(['accepted', 'rejected']) status: 'accepted' | 'rejected';
}

export class ErratumDto {
  @ApiProperty() id: string;
  @ApiProperty() lineSeq: number;
  @ApiProperty() original: string;
  @ApiProperty() corrected: string;
  @ApiProperty({ enum: ['transcription', 'substantive'] }) kind: string;
  @ApiProperty({ enum: ['pending', 'accepted', 'rejected'] }) status: string;
  @ApiProperty() filedByName: string;
  @ApiProperty({ nullable: true, type: String }) decidedByName: string | null;
}

export class SealDto {
  @ApiProperty() errataDeadline: string;
  @ApiProperty({ nullable: true, type: String }) errataClosedAt: string | null;
  @ApiProperty() errataWindowOpen: boolean;
  @ApiProperty({ nullable: true, type: String }) digestSha256: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Base64' }) signature: string | null;
  @ApiProperty({ nullable: true, type: String }) lockedAt: string | null;
  @ApiProperty({ nullable: true, type: String }) lockedByName: string | null;
}

export class ExportDto {
  @ApiProperty() id: string;
  @ApiProperty() manifestSha256: string;
  @ApiProperty() exportedByName: string;
  @ApiProperty() exportedAt: string;
}

export class RecordStatusDto {
  @ApiProperty() sessionClosed: boolean;
  @ApiProperty({ type: SealDto, nullable: true }) seal: SealDto | null;
  @ApiProperty({ type: [ErratumDto] }) errata: ErratumDto[];
  @ApiProperty({ type: [ExportDto] }) exports: ExportDto[];
}
