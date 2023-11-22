import type { StarlightPlugin } from '@astrojs/starlight/types';
import type { AstroUserConfig, ViteUserConfig } from 'astro';

export interface DocSearchConfig {
	appId: string;
	apiKey: string;
	indexName: string;
}

/** Starlight DocSearch plugin. */
export default function starlightDocSearch(opts: DocSearchConfig): StarlightPlugin {
	return {
		name: 'starlight-docsearch',
		hooks: {
			setup({ addIntegration, config, logger, updateConfig }) {
				// If the user has already has a custom override for the Search component, don't override it.
				if (config.components?.Search) {
					logger.warn(
						`It looks like you already have a \`Search\` component override. To render \`@astrojs/starlight-docsearch\`, you can either:
- Remove the existing override for the \`Search\` component from your configuration
- Import and render \`@astrojs/starlight-docsearch/DocSearch.astro\` in your custom override
`
					);
				} else {
					// Otherwise, add the Search component override to the user's configuration.
					updateConfig({
						components: {
							...config.components,
							Search: '@astrojs/starlight-docsearch/DocSearch.astro',
						},
					});
				}

				// Add an Astro integration that injects a Vite plugin to expose
				// the DocSearch config via a virtual module.
				addIntegration({
					name: 'starlight-docsearch',
					hooks: {
						'astro:config:setup': ({ updateConfig }) => {
							updateConfig({
								vite: {
									plugins: [vitePluginDocSearch(opts)],
								},
							} satisfies AstroUserConfig);
						},
					},
				});
			},
		},
	};
}

/** Vite plugin that exposes the DocSearch config via virtual modules. */
function vitePluginDocSearch(config: DocSearchConfig): VitePlugin {
	const moduleId = 'virtual:starlight/docsearch-config';
	const resolvedModuleId = `\0${moduleId}`;
	const moduleContent = `export default ${JSON.stringify(config)}`;

	return {
		name: 'vite-plugin-starlight-docsearch-config',
		load(id) {
			return id === resolvedModuleId ? moduleContent : undefined;
		},
		resolveId(id) {
			return id === moduleId ? resolvedModuleId : undefined;
		},
	};
}

type VitePlugin = NonNullable<ViteUserConfig['plugins']>[number];
