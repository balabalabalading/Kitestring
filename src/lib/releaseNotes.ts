import releaseNotesData from "../../release-notes.json";
import type { Locale } from "../i18n/types";

export type ReleaseNoteSectionType = "added" | "changed" | "fixed" | "known";

export interface ReleaseNoteSection {
  type: ReleaseNoteSectionType;
  items: Record<Locale, string[]>;
}

export interface ReleaseNote {
  version: string;
  date: string;
  title: Record<Locale, string>;
  summary: Record<Locale, string>;
  sections: ReleaseNoteSection[];
}

const releases = releaseNotesData.releases as ReleaseNote[];

export function getReleaseNote(version: string): ReleaseNote | null {
  return releases.find((release) => release.version === version) ?? null;
}

export function getLatestReleaseNote(): ReleaseNote {
  return releases[0];
}
