import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { InvalidTimezoneError } from '../time/timezone';
import { InvalidWorkDateError } from '../time/work-date';

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
}

/**
 * Resposta de erro padronizada.
 *
 * Erros do domínio e do Prisma são traduzidos para status HTTP adequados, e o
 * detalhe técnico fica no log do servidor em vez de vazar para o cliente.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error } = this.describe(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorBody = {
      statusCode: status,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }

  private describe(exception: unknown): {
    status: number;
    message: string | string[];
    error: string;
  } {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);

      return { status: exception.getStatus(), message, error: exception.name };
    }

    if (exception instanceof InvalidTimezoneError || exception instanceof InvalidWorkDateError) {
      return { status: HttpStatus.BAD_REQUEST, message: exception.message, error: exception.name };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return {
            status: HttpStatus.CONFLICT,
            message: 'Já existe um registro com esse valor único.',
            error: 'ConflictError',
          };
        case 'P2025':
          return {
            status: HttpStatus.NOT_FOUND,
            message: 'Registro não encontrado.',
            error: 'NotFoundError',
          };
        case 'P2003':
          return {
            status: HttpStatus.BAD_REQUEST,
            message: 'Referência inválida para outro registro.',
            error: 'BadRequestError',
          };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno inesperado.',
      error: 'InternalServerError',
    };
  }
}
