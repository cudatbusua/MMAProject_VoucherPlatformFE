import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
  PipeTransform,
} from '@nestjs/common';
import { Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { map } from 'rxjs';

@Injectable()
export class Envelope implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map((data) => ({ data, error: null, meta: null })));
  }
}
@Catch()
export class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let message: string | string[] = 'Internal server error';
    if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse();
      message = typeof body === 'string' ? body : (body as { message: string | string[] }).message;
    } else if ((error as { code?: number })?.code === 11000) {
      status = 409;
      message = 'Dữ liệu đã tồn tại hoặc yêu cầu đang được xử lý. Vui lòng thử lại.';
    } else if (
      (error as { name?: string })?.name === 'ValidationError' ||
      (error as { name?: string })?.name === 'CastError'
    ) {
      status = 400;
      message = 'Dữ liệu không hợp lệ.';
    }
    if (status === 500) console.error(error);
    res.status(status).json({ data: null, error: { statusCode: status, message }, meta: null });
  }
}
@Injectable()
export class ObjectIdPipe implements PipeTransform<string> {
  transform(value: string) {
    if (!isValidObjectId(value) || !/^[a-f\d]{24}$/i.test(value))
      throw new BadRequestException('ID MongoDB không hợp lệ.');
    return value;
  }
}
@Injectable()
export class RejectNull implements PipeTransform {
  transform(value: unknown): unknown {
    const scan = (item: unknown) => {
      if (item === null) throw new BadRequestException('Không gửi null; bỏ qua trường không cần cập nhật.');
      if (Array.isArray(item)) item.forEach(scan);
      else if (item && typeof item === 'object') Object.values(item).forEach(scan);
    };
    scan(value);
    return value;
  }
}
