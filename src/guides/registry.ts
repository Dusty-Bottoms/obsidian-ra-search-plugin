import { Notice, requestUrl } from "obsidian";
import type RaSearchPlugin from "../main";

export interface GuideIndexEntry {
	title: string;
	console: string;
	md: string;
	plan: string;
	set_updated: string;
	published: string;
}

export interface GuideIndex {
	version: number;
	guides: Record<string, GuideIndexEntry>;
}

export const EMPTY_INDEX: GuideIndex = { version: 1, guides: {} };

const trimTrailingSlash = (url: string) => url.endsWith("/") ? url.slice(0, -1) : url;

const guideRegistryPath = (plugin: RaSearchPlugin, path: string) =>
	`${trimTrailingSlash(plugin.settings.guideRegistryUrl)}/${path}`;

/**
 * Fetches the guide registry's index for the duration of a single import or
 * command run. Callers hold onto the returned value themselves; this
 * function does not cache across calls, so a stale index never survives
 * past the run that fetched it.
 */
export async function fetchIndex(plugin: RaSearchPlugin): Promise<GuideIndex> {
	try {
		const response = await requestUrl({ url: guideRegistryPath(plugin, "index.json") });
		return response.json as GuideIndex;
	} catch (error) {
		console.error(`${plugin.manifest.name}: failed to fetch the guide registry index`, error);
		new Notice(`${plugin.manifest.name}: couldn't reach the guide registry. Mastery guides won't be installed this run.`)
			.containerEl.addClass("ra-search-error-text");
		return EMPTY_INDEX;
	}
}

/**
 * Fetches the guide registry index only when the feature is enabled,
 * so the plugin makes no network request to the registry while the
 * user has "Fetch mastery guides" turned off.
 */
export async function fetchIndexIfEnabled(plugin: RaSearchPlugin): Promise<GuideIndex> {
	if (!plugin.settings.fetchGuides) {
		return EMPTY_INDEX;
	}
	return fetchIndex(plugin);
}

export async function fetchGuide(plugin: RaSearchPlugin, entry: GuideIndexEntry): Promise<string> {
	const response = await requestUrl({ url: guideRegistryPath(plugin, entry.md) });
	return response.text;
}
