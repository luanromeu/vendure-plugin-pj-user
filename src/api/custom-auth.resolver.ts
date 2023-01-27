
import { Args, Mutation, Resolver, Context } from '@nestjs/graphql';
import { AdministratorService, Allow, AuthService, ConfigService, Ctx, CustomerService, HistoryService, InvalidCredentialsError, isGraphQlErrorResult, Logger, NATIVE_AUTH_STRATEGY_NAME, Permission, RequestContext, Transaction, User, UserService } from '@vendure/core';
import { Request, Response } from 'express';
import { AuthenticationResult, CurrentUser, CurrentUserChannel, MutationAuthenticateArgs, MutationLoginArgs, NativeAuthenticationResult } from '../generated-admin-types';
import { AuthenticationResult as ShopAuthenticationResult, NotVerifiedError } from '@vendure/common/lib/generated-shop-types';
import { AuthenticationResult as AdminAuthenticationResult } from '@vendure/common/lib/generated-types';
import { NativeAuthStrategyError as AdminNativeAuthStrategyError } from '@vendure/core/dist/common/error/generated-graphql-admin-errors';
import { NativeAuthStrategyError as  ShopNativeAuthStrategyError } from '@vendure/core/dist/common/error/generated-graphql-shop-errors';
import { setSessionToken } from '@vendure/core/dist/api/common/set-session-token';
import { getUserChannelsPermissions } from '@vendure/core/dist/service/helpers/utils/get-user-channels-permissions';
import { CustomAuthService } from '../service/custom-auth.service';

export class BaseAuthResolver {
  protected readonly nativeAuthStrategyIsConfigured: boolean;

    constructor(
        protected authService: CustomAuthService,
        protected userService: UserService,
        protected administratorService: AdministratorService,
        protected configService: ConfigService,
    ) {
        this.nativeAuthStrategyIsConfigured =
            !!this.configService.authOptions.shopAuthenticationStrategy.find(
                strategy => strategy.name === NATIVE_AUTH_STRATEGY_NAME,
            );
    }

    /**
     * Attempts a login given the username and password of a user. If successful, returns
     * the user data and returns the token either in a cookie or in the response body.
     */
    async baseLogin(
        args: MutationLoginArgs,
        ctx: RequestContext,
        req: Request,
        res: Response,
    ): Promise<AdminAuthenticationResult | ShopAuthenticationResult | NotVerifiedError> {
        return await this.authenticateAndCreateSession(
            ctx,
            {
                input: { [NATIVE_AUTH_STRATEGY_NAME]: args },
                rememberMe: args.rememberMe,
            },
            req,
            res,
        );
    }

     /**
     * Creates an authenticated session and sets the session token.
     */
     protected async authenticateAndCreateSession(
      ctx: RequestContext,
      args: MutationAuthenticateArgs,
      req: Request,
      res: Response,
  ): Promise<AdminAuthenticationResult | ShopAuthenticationResult | NotVerifiedError> {
      const [method, data] = Object.entries(args.input)[0];
      const { apiType } = ctx;
      const session = await this.authService.authenticate(ctx, apiType, method, data);
      if (isGraphQlErrorResult(session)) {
          return session;
      }
      if (apiType && apiType === 'admin') {
          const administrator = await this.administratorService.findOneByUserId(ctx, session.user.id);
          if (!administrator) {
              return new InvalidCredentialsError('');
          }
      }
      setSessionToken({
          req,
          res,
          authOptions: this.configService.authOptions,
          rememberMe: args.rememberMe || false,
          sessionToken: session.token,
      });
      return this.publiclyAccessibleUser(session.user);
  }

   /**
     * Exposes a subset of the User properties which we want to expose to the public API.
     */
   protected publiclyAccessibleUser(user: User): CurrentUser {
    return {
        id: user.id as unknown as string,
        identifier: user.identifier,
        channels: getUserChannelsPermissions(user) as CurrentUserChannel[],
    };
}
protected requireNativeAuthStrategy():
        | AdminNativeAuthStrategyError
        | ShopNativeAuthStrategyError
        | undefined {
        if (!this.nativeAuthStrategyIsConfigured) {
            const authStrategyNames = this.configService.authOptions.shopAuthenticationStrategy
                .map(s => s.name)
                .join(', ');
            const errorMessage =
                'This GraphQL operation requires that the NativeAuthenticationStrategy be configured for the Shop API.\n' +
                `Currently the following AuthenticationStrategies are enabled: ${authStrategyNames}`;
            Logger.error(errorMessage);
            return new AdminNativeAuthStrategyError();
        }
    }

}

@Resolver()
export class ShopAuthResolver extends BaseAuthResolver {
    
    constructor(
        authService: CustomAuthService,
        userService: UserService,
        administratorService: AdministratorService,
        configService: ConfigService,
        protected customerService: CustomerService,
        protected historyService: HistoryService,
    ) {
        super(authService, userService, administratorService, configService);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.Public)
    async login(
        @Args() args: MutationLoginArgs,
        @Ctx() ctx: RequestContext,
        @Context('req') req: Request,
        @Context('res') res: Response,
    ): Promise<NativeAuthenticationResult | void> {
            const nativeAuthStrategyError = this.requireNativeAuthStrategy();
            if (nativeAuthStrategyError) {
                return nativeAuthStrategyError;
            }
            return (await super.baseLogin(args, ctx, req, res)) as AuthenticationResult;
    }
}

