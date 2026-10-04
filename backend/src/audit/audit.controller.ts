import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { CurrentUser, type AuthUser } from '../auth/current-user.js';
import { PrismaService } from '../prisma/prisma.service.js';

class AuditQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  sessionId?: string;

  @ApiPropertyOptional({ default: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  limit?: number;
}

class AuditEntryDto {
  @ApiProperty() seq: string;
  @ApiProperty() at: string;
  @ApiProperty() action: string;
  @ApiProperty() entity: string;
  @ApiProperty({ nullable: true, type: String }) entityId: string | null;
  @ApiProperty({ nullable: true, type: String }) sessionId: string | null;
  @ApiProperty({ nullable: true, type: String }) actorName: string | null;
  @ApiProperty() hash: string;
}

@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  /** Newest first. Events restricted to one side are returned only to that side (R7). */
  @Get()
  @ApiOkResponse({ type: [AuditEntryDto] })
  async list(@CurrentUser() user: AuthUser, @Query() q: AuditQuery): Promise<AuditEntryDto[]> {
    const rows = await this.prisma.auditEvent.findMany({
      where: {
        ...(q.sessionId && { sessionId: q.sessionId }),
        OR: [{ visibilitySide: null }, { visibilitySide: user.side }],
      },
      orderBy: { seq: 'desc' },
      take: q.limit ?? 100,
      include: { actor: { select: { name: true } } },
    });
    return rows.map((e) => ({
      seq: e.seq.toString(),
      at: e.at.toISOString(),
      action: e.action,
      entity: e.entity,
      entityId: e.entityId,
      sessionId: e.sessionId,
      actorName: e.actor?.name ?? null,
      hash: e.hash,
    }));
  }
}
