import { Notice, normalizePath } from "obsidian";
import RaSearchPlugin from "../main";
import { addGame } from "./addGame";
import { getSpecificGame } from "../ra";
import { fetchIndexIfEnabled, installGuide } from "../guides";
import { abortableSleep, isAbortError, requireCredentials } from "../utils";

const GAME_ID_PATTERN = /(\d+)\s*$/;

// Minimal RFC 4180 row split: titles and file lists in ra-catalog.csv are quoted.
const parseCsvLine = (line: string) => {
	const cells: string[] = [];
	let cell = "";
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (quoted) {
			if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
			else if (ch === '"') { quoted = false; }
			else { cell += ch; }
		} else if (ch === '"') {
			quoted = true;
		} else if (ch === ",") {
			cells.push(cell);
			cell = "";
		} else {
			cell += ch;
		}
	}
	cells.push(cell);
	return cells;
}

/**
 * Game IDs from an ra-manager `ra-catalog.csv` (rows with status `have`; subsets only
 * when the setting allows), or from a plain list with one game ID per line.
 */
export const parseRomScan = (text: string, includeSubsets: boolean) => {
	const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
	const header = parseCsvLine(lines[0] ?? "");
	const idCol = header.indexOf("game_id");
	const statusCol = header.indexOf("status");
	const kindCol = header.indexOf("kind");

	if (idCol < 0) {
		return lines.map(l => Number(l.trim())).filter(n => Number.isInteger(n) && n > 0);
	}
	const ids: number[] = [];
	for (const line of lines.slice(1)) {
		const row = parseCsvLine(line);
		if (statusCol >= 0 && row[statusCol] !== "have") continue;
		if (!includeSubsets && kindCol >= 0 && row[kindCol] === "subset") continue;
		const id = Number(row[idCol]);
		if (Number.isInteger(id) && id > 0) ids.push(id);
	}
	return ids;
}

const importedGameIds = (plugin: RaSearchPlugin) => {
	const ids = new Set<number>();
	for (const file of plugin.app.vault.getMarkdownFiles()) {
		const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		if (fm?.category !== "RetroAchievements" || typeof fm.setUrl !== "string") continue;
		const match = GAME_ID_PATTERN.exec(fm.setUrl);
		if (match) ids.add(Number(match[1]));
	}
	return ids;
}

export const runImportRomScan = async (plugin: RaSearchPlugin) => {
	if (!requireCredentials(plugin)) {
		return;
	}
	const path = normalizePath(plugin.settings.romScanPath);
	if (!(await plugin.app.vault.adapter.exists(path))) {
		new Notice(`${plugin.manifest.name}: No ROM scan file at "${path}".`).containerEl.addClass("ra-search-error-text");
		return;
	}
	const abortController = plugin.startAutoImport();
	if (!abortController) {
		new Notice(`${plugin.manifest.name}: An import is already running.`);
		return;
	}
	const signal = abortController.signal;

	try {
		const scanned = [...new Set(parseRomScan(await plugin.app.vault.adapter.read(path), plugin.settings.includeSubsets))];
		const existing = importedGameIds(plugin);
		const todo = scanned.filter(id => !existing.has(id));
		if (todo.length === 0) {
			new Notice(`${plugin.manifest.name}: Nothing to import!`);
			return;
		}
		new Notice(`${plugin.manifest.name}: Importing ${todo.length} of ${scanned.length} games from your ROM scan`);

		const guideIndex = await fetchIndexIfEnabled(plugin);
		let imported = 0;
		for (const [i, gameId] of todo.entries()) {
			signal.throwIfAborted();
			const game = await getSpecificGame(plugin, gameId);
			signal.throwIfAborted();
			if (game) {
				const gameNote = await addGame(plugin, game);
				if (gameNote != null) {
					imported++;
					await installGuide(plugin, game, guideIndex, gameNote);
				}
			}
			if ((i + 1) % 50 === 0) {
				new Notice(`${plugin.manifest.name}: ROM scan import ${i + 1}/${todo.length}`);
			}
			if (i + 1 != todo.length) {
				await abortableSleep(5000, signal);
			}
		}
		new Notice(`${plugin.manifest.name}: ROM scan import completed (${imported} added).`);
	} catch (error) {
		if (isAbortError(error)) {
			new Notice(`${plugin.manifest.name}: ROM scan import cancelled.`);
			return;
		}
		console.error(error);
		new Notice(`${plugin.manifest.name}: ${String(error)}`).containerEl.addClass("ra-search-error-text");
	} finally {
		plugin.finishAutoImport(abortController);
	}
}
