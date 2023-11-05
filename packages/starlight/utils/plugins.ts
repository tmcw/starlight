import type { AstroIntegration, AstroIntegrationLogger } from 'astro';
import { z } from 'astro/zod';
import { StarlightConfigSchema, type StarlightUserConfig } from '../utils/user-config';
import { errorMap } from '../utils/error-map';

/**
 * Runs Starlight plugins in the order that they are configured after validating the user-provided
 * configuration and returns the final validated user config that may have been updated by the
 * plugins and a list of any integrations added by the plugins.
 */
export async function runPlugins(
	starlightUserConfig: StarlightUserConfig,
	pluginsUserConfig: StarlightPluginsUserConfig,
	logger: AstroIntegrationLogger
) {
	// Validate the user-provided configuration.
	let userConfig = starlightUserConfig;
	let starlightConfig = StarlightConfigSchema.safeParse(userConfig, { errorMap });

	if (!starlightConfig.success) {
		throwValidationError(starlightConfig.error, 'Invalid config passed to starlight integration');
	}

	// Validate the user-provided plugins configuration.
	const pluginsConfig = starlightPluginsConfigSchema.safeParse(pluginsUserConfig, {
		errorMap,
	});

	if (!pluginsConfig.success) {
		throwValidationError(
			pluginsConfig.error,
			'Invalid plugins config passed to starlight integration'
		);
	}

	// A list of Astro integrations added by the various plugins.
	const integrations: AstroIntegration[] = [];

	for (const {
		name,
		hooks: { setup },
	} of pluginsConfig.data) {
		await setup({
			config: userConfig,
			logger: logger.fork(name),
			updateConfig(newConfig) {
				// Ensure that plugins do not update the `plugins` config key.
				if ('plugins' in newConfig) {
					throw new Error(
						`The '${name}' plugin tried to update the 'plugins' config key which is not supported.`
					);
				}

				// If the plugin is updating the user config, re-validate it.
				const mergedUserConfig = { ...userConfig, ...newConfig };
				const mergedConfig = StarlightConfigSchema.safeParse(mergedUserConfig, { errorMap });

				if (!mergedConfig.success) {
					throwValidationError(
						mergedConfig.error,
						`Invalid config update provided by the '${name}' plugin`
					);
				}

				// If the updated config is valid, keep track of both the user config and parsed config.
				userConfig = mergedUserConfig;
				starlightConfig = mergedConfig;
			},
			addIntegration(integration) {
				// Collect any Astro integrations added by the plugin.
				integrations.push(integration);
			},
		});
	}

	return { integrations, starlightConfig: starlightConfig.data };
}

function throwValidationError(error: z.ZodError, message: string): never {
	throw new Error(`${message}\n${error.issues.map((i) => i.message).join('\n')}`);
}

// https://github.com/withastro/astro/blob/910eb00fe0b70ca80bd09520ae100e8c78b675b5/packages/astro/src/core/config/schema.ts#L113
const astroIntegrationSchema = z.object({
	name: z.string(),
	hooks: z.object({}).passthrough().default({}),
}) as z.Schema<AstroIntegration>;

/**
 * A plugin `config` and `updateConfig` argument are purposely not validated using the Starlight
 * user config schema but properly typed for user convenience because we do not want to run any of
 * the Zod `transform`s used in the user config schema when running plugins.
 * The final user config should be validated by the caller after running all the plugins.
 */
const starlightPluginSchema = z.object({
	/** Name of the Starlight plugin. */
	name: z.string(),
	/** The different hooks available to the plugin. */
	hooks: z.object({
		/**
		 * Plugin setup function called with an object containing various values that can be used by
		 * the plugin to interact with Starlight.
		 */
		setup: z.function(
			z.tuple([
				z.object({
					/**
					 * A read-only copy of the user-supplied Starlight configuration.
					 *
					 * Note that this configuration may have been updated by other plugins configured
					 * before this one.
					 */
					config: z.any() as z.Schema<StarlightUserConfig>,
					/**
					 * A callback function to update the user-supplied Starlight configuration.
					 *
					 * You only need to provide the configuration values that you want to update but no deep
					 * merge is performed.
					 *
					 * @example
					 * {
					 * 	name: 'My Starlight Plugin',
					 *	hooks: {
					 * 		setup({ updateConfig }) {
					 * 			updateConfig({
					 * 				description: 'Custom description',
					 * 			});
					 * 		}
					 *	}
					 * }
					 */
					updateConfig: z.function(
						z.tuple([z.record(z.any()) as z.Schema<Partial<StarlightUserConfig>>]),
						z.void()
					),
					/**
					 * An instance of the Astro integration logger with all logged messages prefixed with the
					 * plugin name.
					 *
					 * @see https://docs.astro.build/en/reference/integrations-reference/#astrointegrationlogger
					 */
					logger: z.any() as z.Schema<AstroIntegrationLogger>,
					/**
					 * A callback function to add an Astro integration required by this plugin.
					 *
					 * @see https://docs.astro.build/en/reference/integrations-reference/
					 *
					 * @example
					 * {
					 * 	name: 'My Starlight Plugin',
					 * 	hooks: {
					 * 		setup({ addIntegration }) {
					 * 			addIntegration({
					 * 				name: 'My Plugin Astro Integration',
					 * 				hooks: {
					 * 					'astro:config:setup': () => {
					 * 						// …
					 * 					},
					 * 				},
					 * 			});
					 * 		}
					 * 	}
					 * }
					 */
					addIntegration: z.function(z.tuple([astroIntegrationSchema]), z.void()),
				}),
			]),
			z.union([z.void(), z.promise(z.void())])
		),
	}),
});

const starlightPluginsConfigSchema = z.array(starlightPluginSchema).default([]);

type StarlightPluginsUserConfig = z.input<typeof starlightPluginsConfigSchema>;

export type StarlightPlugin = z.input<typeof starlightPluginSchema>;

export type StarlightUserConfigWithPlugins = StarlightUserConfig & {
	/**
	 * A list of plugins to extend Starlight with.
	 *
	 * @example
	 * // Add Starlight Algolia plugin.
	 * starlight({
	 * 	plugins: [starlightAlgolia({ … })],
	 * })
	 */
	plugins?: StarlightPluginsUserConfig;
};
