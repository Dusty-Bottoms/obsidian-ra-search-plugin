import { Notice, TFile, normalizePath } from "obsidian";
import { getGameInfoAndUserProgress } from "@retroachievements/api";
import type RaSearchPlugin from "../main";
import { consoleNameSanitizer, ensureFolderStructure, noteExists } from "../utils";
import type { GuideIndex } from "./registry";
import { fetchGuide } from "./registry";
import { collectHardcoreIds, tickUnlocked } from "./personalize";

export interface GuideTarget {
	gameId: number;
	title: string;
	console: string;
}

const sanitizeGuideTitle = (title: string) => title.replaceAll(/:|\?|\\|\/|\|/g, " -");

/** The fixed path the skill and the plugin both write mastery guides to. */
export const guideFileName = (title: string, consoleName: string) =>
	normalizePath(`RetroAchievements/${sanitizeGuideTitle(title)} (${consoleNameSanitizer(consoleName)}).md`);

/**
 * Installs a game's mastery guide, personalized to the reader's hardcore
 * unlocks, and links it from the library note's frontmatter.
 *
 * Returns true only when a new guide file was written this call, so
 * callers can report an install count without recounting frontmatter-only
 * updates as installs.
 */
export async function installGuide(
	plugin: RaSearchPlugin,
	game: GuideTarget,
	index: GuideIndex,
	libraryNote: TFile,
): Promise<boolean> {
	if (!plugin.settings.fetchGuides) {
		return false;
	}
	const entry = index.guides[String(game.gameId)];
	if (!entry) {
		return false;
	}

	const path = guideFileName(game.title, game.console);
	let guideFile = await noteExists(plugin.app, path);
	let installed = false;

	if (!guideFile) {
		try {
			const [md, progress] = await Promise.all([
				fetchGuide(plugin, entry),
				getGameInfoAndUserProgress(plugin.raAuth, {
					gameId: game.gameId,
					username: plugin.settings.raUsername,
				}),
			]);
			const personalized = tickUnlocked(md, collectHardcoreIds(progress));
			await ensureFolderStructure(plugin.app, path);
			guideFile = await plugin.app.vault.create(path, personalized);
			installed = true;
		} catch (error) {
			console.error(`${plugin.manifest.name}: failed to install the mastery guide for "${game.title}"`, error);
			new Notice(`${plugin.manifest.name}: couldn't install the mastery guide for "${game.title}".`)
				.containerEl.addClass("ra-search-error-text");
			return false;
		}
	}

	const guidePath = guideFile.path.endsWith(".md") ? guideFile.path.slice(0, -3) : guideFile.path;
	await plugin.app.fileManager.processFrontMatter(libraryNote, (fm) => {
		Object.assign(fm, { guide: `[[${guidePath}]]` });
	});

	return installed;
}
