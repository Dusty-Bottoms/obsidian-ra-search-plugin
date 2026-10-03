import { Notice, TFile, normalizePath } from "obsidian";
import RaSearchPlugin from "../main";
import { abortableSleep, requireCredentials } from "../utils";
import { fetchIndexIfEnabled, installGuide, type GuideTarget } from "../guides";

const GAME_ID_PATTERN = /(\d+)\s*$/;
const WIKILINK = /^\[\[|\]\]$/g;

const libraryTargets = (plugin: RaSearchPlugin): { file: TFile; target: GuideTarget }[] => {
	const raGamesPath = normalizePath(plugin.settings.raGamesPath);
	const targets: { file: TFile; target: GuideTarget }[] = [];

	for (const file of plugin.app.vault.getMarkdownFiles()) {
		if (!(file.path === raGamesPath || file.path.startsWith(`${raGamesPath}/`))) {
			continue;
		}
		const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter || frontmatter.category !== "RetroAchievements") {
			continue;
		}
		const setUrl: unknown = frontmatter.setUrl;
		const title: unknown = frontmatter.title;
		const consoleName: unknown = frontmatter.console;
		if (typeof setUrl !== "string" || typeof title !== "string" || typeof consoleName !== "string") {
			continue;
		}
		const idMatch = GAME_ID_PATTERN.exec(setUrl);
		if (!idMatch) {
			continue;
		}
		targets.push({
			file,
			target: {
				gameId: Number(idMatch[1]),
				title,
				console: consoleName.replace(WIKILINK, ""),
			},
		});
	}
	return targets;
}

export const runFetchGuides = async (plugin: RaSearchPlugin) => {
	if (!requireCredentials(plugin)) {
		return;
	}

	const guideIndex = await fetchIndexIfEnabled(plugin);
	const targets = libraryTargets(plugin).filter(({ target }) => guideIndex.guides[String(target.gameId)]);

	let installedCount = 0;
	for (const { file, target } of targets) {
		const installed = await installGuide(plugin, target, guideIndex, file);
		if (installed) {
			installedCount++;
			await abortableSleep(2000, new AbortController().signal);
		}
	}
	new Notice(`${plugin.manifest.name}: Installed ${installedCount} guide(s) for ${targets.length} library note(s).`);
}
