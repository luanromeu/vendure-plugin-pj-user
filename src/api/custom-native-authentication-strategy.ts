import { TransactionalConnection } from '@vendure/core/dist/service/transaction/transactional-connection'
import { Injector } from '@vendure/core/dist/common/injector';
import gql from 'graphql-tag';
import { DocumentNode } from 'graphql';
import { RequestContext } from '@vendure/core/dist/api/common/request-context';
import { User } from '@vendure/core/dist/entity/user/user.entity'
import { AuthenticationStrategy, ID, NativeAuthenticationMethod } from '@vendure/core';

export interface NativeAuthenticationData {
  username: string;
  password: string;
}

export const NATIVE_AUTH_STRATEGY_NAME = 'native';

/**
* @description
* This strategy implements a username/password credential-based authentication, with the credentials
* being stored in the Vendure database. This is the default method of authentication, and it is advised
* to keep it configured unless there is a specific reason not to.
*
* @docsCategory auth
*/
export class CustomNativeAuthenticationStrategy implements AuthenticationStrategy<NativeAuthenticationData> {
  readonly name = NATIVE_AUTH_STRATEGY_NAME;

  private connection: TransactionalConnection;
  private passwordCipher: import('@vendure/core/dist/service/helpers/password-cipher/password-ciper').PasswordCiper;

  async init(injector: Injector) {
      this.connection = injector.get(TransactionalConnection);
      // This is lazily-loaded to avoid a circular dependency
      const { PasswordCiper } = await import('@vendure/core/dist/service/helpers/password-cipher/password-ciper');
      this.passwordCipher = injector.get(PasswordCiper);
  }

  defineInputType(): DocumentNode {
      return gql`
          input NativeAuthInput {
              username: String!
              password: String!
          }
      `;
  }

  async authenticate(ctx: RequestContext, data: NativeAuthenticationData): Promise<User | false> {
    console.log("native authenticate strategy authenticate", data)
      const user = await this.getUserFromIdentifier(ctx, data.username);
      if (!user) {
          return false;
      }
      const passwordMatch = await this.verifyUserPassword(ctx, user.id, data.password);
      if (!passwordMatch) {
          return false;
      }
      return user;
  }

 
  private getUserFromIdentifier(ctx: RequestContext, identifier: string): Promise<User | undefined> {
    console.log("native authenticate strategy getUserFromIdentifier", identifier)
      return this.connection.getRepository(ctx, User).findOne({
          relations: [],
          where: { identifier, deletedAt: null, customer: { customFields: { approved: true } } },
      });
  }

  /**
   * Verify the provided password against the one we have for the given user.
   */
  async verifyUserPassword(ctx: RequestContext, userId: ID, password: string): Promise<boolean> {
    console.log("native authenticate strategy verifyUserPassword", password)
      const user = await this.connection.getRepository(ctx, User).findOne(userId, {
          relations: ['authenticationMethods'],
      });
      if (!user) {
          return false;
      }
      const nativeAuthMethod = user.getNativeAuthenticationMethod();
      const pw =
          (
              await this.connection
                  .getRepository(ctx, NativeAuthenticationMethod)
                  .findOne(nativeAuthMethod.id, {
                      select: ['passwordHash'],
                  })
          )?.passwordHash ?? '';
      const passwordMatches = await this.passwordCipher.check(password, pw);
      if (!passwordMatches) {
          return false;
      }
      return true;
  }
}