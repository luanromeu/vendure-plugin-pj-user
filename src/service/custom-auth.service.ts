import { Inject, Injectable } from '@nestjs/common';
import { ApiType, AttemptedLoginEvent, AuthenticatedSession, InvalidCredentialsError, ConfigService, EventBus, InternalServerError, LoginEvent, NATIVE_AUTH_STRATEGY_NAME, RequestContext, SessionService, TransactionalConnection, User, NativeAuthenticationStrategy, Injector, NativeAuthenticationMethod, AuthenticationStrategy, ID } from '@vendure/core';
import { NotVerifiedError } from '@vendure/core/dist/common/error/generated-graphql-shop-errors';
import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';
import { CustomNativeAuthenticationStrategy } from '../../src/api/custom-native-authentication-strategy'
import { NativeAuthenticationData } from '@vendure/core/dist/config/auth/native-authentication-strategy';

@Injectable()
export class CustomAuthService {

  constructor(
    private connection: TransactionalConnection,
    private configService: ConfigService,
    private sessionService: SessionService,
    private eventBus: EventBus,
) {}

async authenticate(
  ctx: RequestContext,
  apiType: ApiType,
  authenticationMethod: string,
  authenticationData: any,
): Promise<AuthenticatedSession | InvalidCredentialsError | NotVerifiedError> {
  this.eventBus.publish(
      new AttemptedLoginEvent(
          ctx,
          authenticationMethod,
          authenticationMethod === NATIVE_AUTH_STRATEGY_NAME
              ? (authenticationData as NativeAuthenticationData).username
              : undefined,
      ),
  );
  const authenticationStrategy = this.getAuthenticationStrategy(apiType, authenticationMethod);
  const authenticateResult = await authenticationStrategy.authenticate(ctx, authenticationData);
  console.log("authenticateResult", authenticateResult)
  if (typeof authenticateResult === 'string') {
      return new InvalidCredentialsError(authenticateResult);
  }
  if (!authenticateResult) {
      return new InvalidCredentialsError('');
  }
  return this.createAuthenticatedSessionForUser(ctx, authenticateResult, authenticationStrategy.name);
}

    async createAuthenticatedSessionForUser(
      ctx: RequestContext,
      user: User,
      authenticationStrategyName: string,
    ): Promise<AuthenticatedSession | NotVerifiedError> {
      if (!user.roles || !user.roles[0]?.channels) {
          const userWithRoles = await this.connection
              .getRepository(ctx, User)
              .createQueryBuilder('user')
              .leftJoinAndSelect('user.roles', 'role')
              .leftJoinAndSelect('role.channels', 'channel')
              .where('user.id = :userId', { userId: user.id })
              .getOne();
          user.roles = userWithRoles?.roles || [];
      }

      if (this.configService.authOptions.requireVerification && !user.verified) {
          return new NotVerifiedError();
      }
      if (ctx.session && ctx.session.activeOrderId) {
          await this.sessionService.deleteSessionsByActiveOrderId(ctx, ctx.session.activeOrderId);
      }
      user.lastLogin = new Date();
      await this.connection.getRepository(ctx, User).save(user, { reload: false });
      const session = await this.sessionService.createNewAuthenticatedSession(
          ctx,
          user,
          authenticationStrategyName,
      );
      this.eventBus.publish(new LoginEvent(ctx, user));
      return session;
    }

    private getAuthenticationStrategy(
      apiType: ApiType,
      method: typeof NATIVE_AUTH_STRATEGY_NAME,
  ): CustomNativeAuthenticationStrategy;
  private getAuthenticationStrategy(apiType: ApiType, method: string): AuthenticationStrategy;
  private getAuthenticationStrategy(apiType: ApiType, method: string): AuthenticationStrategy {
     console.log("Auth service getAuthenticationStrategy", method)
      const { authOptions } = this.configService;
      const strategies =
          apiType === 'admin'
              ? authOptions.adminAuthenticationStrategy
              : authOptions.shopAuthenticationStrategy;
      const match = strategies.find(s => s.name === method);
      if (!match) {
          throw new InternalServerError('error.unrecognized-authentication-strategy', { name: method });
      }
      return match;
  }

 }

