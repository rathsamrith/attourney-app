import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import type { BlockedBody, RuleCode } from './blocked.exception.js';

/**
 * Database backstops (triggers in prisma/migrations) raise messages shaped
 * "R4: <reason>" for numbered rules or "ATTEST: <reason>" for other invariants.
 * This turns them, and common Prisma errors, into HTTP responses so services
 * never need try/catch around writes.
 */
const BACKSTOP = /\b(R[1-8]|ATTEST): ([^"\n]+)/;

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(err: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    const backstop = BACKSTOP.exec(`${err.message} ${JSON.stringify(err.meta ?? {})}`);
    if (backstop) {
      const body: BlockedBody = {
        statusCode: 409,
        error: 'Blocked',
        reason: backstop[2].trim(),
        ...(backstop[1] !== 'ATTEST' && { rule: backstop[1] as RuleCode }),
      };
      return res.status(HttpStatus.CONFLICT).json(body);
    }

    switch (err.code) {
      case 'P2002':
        return res.status(HttpStatus.CONFLICT).json({ statusCode: 409, error: 'Conflict', reason: 'This record already exists.' });
      case 'P2025':
        return res.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, error: 'Not Found', reason: 'The record was not found.' });
      default:
        this.logger.error(err);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: 500, error: 'Internal Server Error' });
    }
  }
}
