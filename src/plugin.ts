import { PluginCommonModule,Type, VendurePlugin } from '@vendure/core';
import { AdminUiExtension } from '@vendure/ui-devkit/compiler';
import path from 'path';
import { PLUGIN_INIT_OPTIONS } from './constants';
import { CustomAuthService } from './service/custom-auth.service';
import { ShopAuthResolver } from './api/custom-auth.resolver';
import { PluginInitOptions } from './types';
import { ServerConfigService } from '@vendure/admin-ui/core';


/**
 * An example Vendure plugin.
 *
 * @example
 * ```TypeScript
 * export const config: VendureConfig = {
 *   //...
 *   plugins: [
 *     ExamplePlugin.init({
 *       // options
 *     }),
 *   ]
 * }
 * ```
 */


@VendurePlugin({
    // Importing the PluginCommonModule gives all of our plugin's injectables (services, resolvers)
    // access to the Vendure core providers. See https://www.vendure.io/docs/typescript-api/plugin/plugin-common-module/
    imports: [PluginCommonModule],
    shopApiExtensions: {
        resolvers: [ShopAuthResolver],
    },
    providers: [
        CustomAuthService,
        // By definiting the `PLUGIN_INIT_OPTIONS` symbol as a provider, we can then inject the
        // user-defined options into other classes, such as the {@link ExampleService}.
        { provide: PLUGIN_INIT_OPTIONS, useFactory: () => CustomAuthPlugin.options },
    ],
    configuration: config => {
        config.customFields.Customer.push(
        {
            type: 'string',
            name: 'cnpj',
        },
        {
            type: 'boolean',
            name: 'approved'
        }
        )
        return config
    },

})
export class CustomAuthPlugin {
    static options: PluginInitOptions;

    /**
     * The static `init()` method is a convention used by Vendure plugins which allows options
     * to be configured by the user.
     */
    static init(options: PluginInitOptions): Type<CustomAuthPlugin> {
        this.options = options;
        return CustomAuthPlugin;
    }

}




