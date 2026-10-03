import type { GameInfoAndUserProgress } from "@retroachievements/api";

const UNCHECKED_TASK = /^(\s*)- \[ \] (.*) \^ra-(\d+)\s*$/;

/**
 * Ticks the checklist lines of a progress-neutral guide for the achievements
 * the reader has unlocked in hardcore. Pure and one-directional: a line only
 * ever moves from unticked to ticked, never the other way, so re-running it
 * over a guide the reader has already been marking up by hand never loses
 * their softcore-safe unticked state.
 */
export function tickUnlocked(md: string, hardcoreIds: Set<number>): string {
	return md
		.split("\n")
		.map((line) => {
			const match = UNCHECKED_TASK.exec(line);
			if (!match) {
				return line;
			}
			const [, indent, body, idStr] = match;
			if (!hardcoreIds.has(Number(idStr))) {
				return line;
			}
			return `${indent}- [x] ${body} ^ra-${idStr}`;
		})
		.join("\n");
}

/**
 * Collects the achievement ids a user has earned in hardcore mode from a
 * `getGameInfoAndUserProgress` response (see src/ra/specificGame.ts).
 */
export function collectHardcoreIds(progress: GameInfoAndUserProgress): Set<number> {
	const ids = new Set<number>();
	for (const achievement of Object.values(progress.achievements)) {
		if (achievement.dateEarnedHardcore) {
			ids.add(achievement.id);
		}
	}
	return ids;
}
