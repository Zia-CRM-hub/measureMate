import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

/** Domain error with a stable machine-readable code. */
export class AppError extends HttpException {
  constructor(status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super({ code, message, details }, status);
  }
}
export const notFound = (what = 'Record') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const forbidden = (msg = 'You do not have permission to do that') => new AppError(403, 'FORBIDDEN', msg);
export const badRequest = (code: string, msg: string, details?: unknown) => new AppError(400, code, msg, details);
export const conflict = (code: string, msg: string, details?: unknown) => new AppError(409, code, msg, details);
export const unprocessable = (code: string, msg: string, details?: unknown) => new AppError(422, code, msg, details);

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request & { correlationId?: string }>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong. Please try again.';
    let details: unknown;

    if (exception instanceof AppError) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code = status === 429 ? 'RATE_LIMITED' : status === 401 ? 'UNAUTHENTICATED' : status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR';
      message = typeof body === 'string' ? body : ((body as { message?: string }).message ?? exception.message);
      if (Array.isArray(message)) message = message.join('; ');
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') { status = 409; code = 'CONFLICT'; message = 'A record with these details already exists'; }
      else if (exception.code === 'P2025') { status = 404; code = 'NOT_FOUND'; message = 'Record not found'; }
      else if (exception.code === 'P2003') { status = 409; code = 'REFERENCE_CONSTRAINT'; message = 'The record is referenced by other data'; }
      else this.log.error(`Prisma ${exception.code}: ${exception.message}`);
    } else if (exception instanceof Error && /append-only/.test(exception.message)) {
      status = 409; code = 'IMMUTABLE_RECORD'; message = 'This record is part of a permanent ledger and cannot be changed. Use a reversal or correction instead.';
    } else {
      this.log.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({ error: { code, message, details, correlationId: req.correlationId } });
  }
}
