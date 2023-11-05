import type { AstroIntegration } from 'astro';
import { expect, test } from 'vitest';
import { runPlugins } from '../../utils/plugins';
import { createTestPluginContext } from '../test-config';

test('returns all integrations added by plugins without deduping them', async () => {
	const integration1: AstroIntegration = {
		name: 'test-integration-1',
		hooks: {},
	};

	const integration2: AstroIntegration = {
		name: 'test-integration-2',
		hooks: {},
	};

	const { integrations } = await runPlugins(
		{ title: 'Test Docs' },
		[
			{
				name: 'test-plugin-1',
				hooks: {
					setup({ addIntegration, updateConfig }) {
						updateConfig({ description: 'test' });
						addIntegration(integration1);
					},
				},
			},
			{
				name: 'test-plugin-2',
				hooks: {
					setup({ addIntegration }) {
						addIntegration(integration1);
						addIntegration(integration2);
					},
				},
			},
		],
		createTestPluginContext()
	);

	expect(integrations).toMatchObject([
		{ name: 'test-integration-1' },
		{ name: 'test-integration-1' },
		{ name: 'test-integration-2' },
	]);
});
