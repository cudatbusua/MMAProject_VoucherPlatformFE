import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Database } from '../database/database.module';
import { Role } from '../database/schemas';

export interface Principal {
  userId: string;
  role: Role;
  sessionId: string;
  activeStoreId?: string;
}
export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => context.switchToHttp().getRequest().user,
);

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly db: Database,
  ) {}
  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride('public', targets)) return true;
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization as string | undefined;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Vui lòng đăng nhập.');
    let payload: { sub: string; sid: string };
    try {
      payload = await this.jwt.verifyAsync(header.slice(7));
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập hết hạn.');
    }
    if (!/^[a-f\d]{24}$/i.test(payload.sub || '') || !/^[a-f\d]{24}$/i.test(payload.sid || ''))
      throw new UnauthorizedException();
    const session = await this.db.sessions.findOne({
      _id: payload.sid,
      userId: payload.sub,
      expiresAt: { $gt: new Date() },
    });
    const user = session && (await this.db.users.findOne({ _id: payload.sub, active: true }));
    if (!session || !user) throw new UnauthorizedException('Phiên đăng nhập không còn hiệu lực.');
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', targets);
    if (roles && !roles.includes(user.role))
      throw new ForbiddenException('Tài khoản không có quyền thực hiện.');
    request.user = {
      userId: String(user._id),
      sessionId: String(session._id),
      role: user.role,
      activeStoreId: session.activeStoreId?.toString(),
    } satisfies Principal;
    return true;
  }
}
