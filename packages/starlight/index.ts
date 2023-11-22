import mdx from '@astrojs/mdx';
import type { AstroIntegration, AstroUserConfig } from 'astro';
import { spawn } from 'node:child_process';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { starlightAsides } from './integrations/asides';
import { starlightExpressiveCode } from './integrations/expressive-code';
import { starlightSitemap } from './integrations/sitemap';
import { vitePluginStarlightUserConfig } from './integrations/virtual-user-config';
import { rehypeRtlCodeSupport } from './integrations/code-rtl-support';
import { createTranslationSystemFromFs } from './utils/translations-fs';
import { runPlugins, type StarlightUserConfigWithPlugins } from './utils/plugins';

export default function StarlightIntegration({
	plugins,
	...opts
}: StarlightUserConfigWithPlugins): AstroIntegration {
	return {
		name: '@astrojs/starlight',
		hooks: {
			'astro:config:setup': async ({
				command,
				config,
				injectRoute,
				isRestart,
				logger,
				updateConfig,
			}) => {
				// Run plugins to get the final configuration and any extra Astro integrations to load.
				const { integrations, starlightConfig } = await runPlugins(opts, plugins, {
					command,
					config,
					isRestart,
					logger,
				});

				const useTranslations = createTranslationSystemFromFs(starlightConfig, config);

				injectRoute({
					pattern: '404',
					entryPoint: '@astrojs/starlight/404.astro',
				});
				injectRoute({
					pattern: '[...slug]',
					entryPoint: '@astrojs/starlight/index.astro',
				});
				if (!config.integrations.find(({ name }) => name === 'astro-expressive-code')) {
					integrations.push(
						...starlightExpressiveCode({ starlightConfig, astroConfig: config, useTranslations })
					);
				}
				if (!config.integrations.find(({ name }) => name === '@astrojs/sitemap')) {
					integrations.push(starlightSitemap(starlightConfig));
				}
				if (!config.integrations.find(({ name }) => name === '@astrojs/mdx')) {
					integrations.push(mdx());
				}
				const newConfig: AstroUserConfig = {
					integrations,
					vite: {
						plugins: [vitePluginStarlightUserConfig(starlightConfig, config)],
					},
					markdown: {
						remarkPlugins: [
							...starlightAsides({ starlightConfig, astroConfig: config, useTranslations }),
						],
						rehypePlugins: [rehypeRtlCodeSupport()],
						shikiConfig:
							// Configure Shiki theme if the user is using the default github-dark theme.
							config.markdown.shikiConfig.theme !== 'github-dark' ? {} : { theme: 'css-variables' },
					},
					scopedStyleStrategy: 'where',
				};
				updateConfig(newConfig);
			},

			'astro:build:done': ({ dir }) => {
				const targetDir = fileURLToPath(dir);
				const cwd = dirname(fileURLToPath(import.meta.url));
				const relativeDir = relative(cwd, targetDir);
				return new Promise<void>((resolve) => {
					spawn('npx', ['-y', 'pagefind', '--site', relativeDir], {
						stdio: 'inherit',
						shell: true,
						cwd,
					}).on('close', () => resolve());
				});
			},
		},
	};
}
