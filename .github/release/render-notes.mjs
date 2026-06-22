#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const notesPath = resolve(root, "release-notes.json");
const packagePath = resolve(root, "package.json");
const changelogPath = resolve(root, "CHANGELOG.md");
const tauriConfigPath = resolve(root, "src-tauri/tauri.conf.json");
const cargoManifestPath = resolve(root, "src-tauri/Cargo.toml");
const data = JSON.parse(readFileSync(notesPath, "utf8"));
const packageVersion = JSON.parse(readFileSync(packagePath, "utf8")).version;
const tauriVersion = JSON.parse(readFileSync(tauriConfigPath, "utf8")).version;
const cargoManifest = readFileSync(cargoManifestPath, "utf8");
const cargoVersion = cargoManifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const args = new Map();

for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1] ?? "");
}

const format = args.get("--format") ?? "release";
const version = (args.get("--version") ?? packageVersion).replace(/^v/, "");

const sectionLabels = {
  added: { "zh-CN": "新增", "en-US": "Added" },
  changed: { "zh-CN": "改进", "en-US": "Changed" },
  fixed: { "zh-CN": "修复", "en-US": "Fixed" },
  known: { "zh-CN": "已知限制", "en-US": "Known limitations" },
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function validate() {
  if (data.schemaVersion !== 1 || !Array.isArray(data.releases)) fail("release-notes.json schema is invalid");
  if (packageVersion !== tauriVersion || packageVersion !== cargoVersion) {
    fail(`Version mismatch: package=${packageVersion}, tauri=${tauriVersion}, cargo=${cargoVersion ?? "missing"}`);
  }
  const seen = new Set();
  for (const release of data.releases) {
    if (!/^\d+\.\d+\.\d+$/.test(release.version)) fail(`Invalid version: ${release.version}`);
    if (seen.has(release.version)) fail(`Duplicate version: ${release.version}`);
    seen.add(release.version);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(release.date)) fail(`Invalid date for ${release.version}`);
    const parsedDate = new Date(`${release.date}T00:00:00Z`);
    if (Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== release.date) {
      fail(`Invalid calendar date for ${release.version}`);
    }
    if (!Array.isArray(release.sections) || release.sections.length === 0) fail(`Missing sections for ${release.version}`);
    const sectionTypes = new Set();
    for (const locale of ["zh-CN", "en-US"]) {
      if (!release.title?.[locale] || !release.summary?.[locale]) fail(`Missing ${locale} metadata for ${release.version}`);
      for (const section of release.sections) {
        if (!sectionLabels[section.type]) fail(`Unknown section type ${section.type} in ${release.version}`);
        if (locale === "zh-CN" && sectionTypes.has(section.type)) fail(`Duplicate section ${section.type} in ${release.version}`);
        if (locale === "zh-CN") sectionTypes.add(section.type);
        if (!Array.isArray(section.items?.[locale]) || section.items[locale].length === 0) {
          fail(`Missing ${locale} items for ${release.version}/${section.type}`);
        }
      }
    }
  }
  if (!seen.has(packageVersion)) fail(`Current package version ${packageVersion} has no release notes`);
}

function renderLocale(release, locale, headingLevel = 2) {
  const lines = [
    `${"#".repeat(headingLevel)} ${release.title[locale]}`,
    "",
    release.summary[locale],
    "",
  ];
  for (const section of release.sections) {
    lines.push(`${"#".repeat(headingLevel + 1)} ${sectionLabels[section.type][locale]}`, "");
    for (const item of section.items[locale]) lines.push(`- ${item}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function renderRelease(release) {
  return [
    `# Kitestring v${release.version} Early Preview`,
    "",
    renderLocale(release, "zh-CN"),
    "",
    "---",
    "",
    renderLocale(release, "en-US"),
    "",
  ].join("\n");
}

function renderChangelog() {
  const lines = ["# Changelog", "", "所有重要变更均由 `release-notes.json` 生成。", ""];
  for (const release of data.releases) {
    lines.push(`## v${release.version} - ${release.date}`, "", release.summary["zh-CN"], "");
    for (const section of release.sections) {
      lines.push(`### ${sectionLabels[section.type]["zh-CN"]}`, "");
      for (const item of section.items["zh-CN"]) lines.push(`- ${item}`);
      lines.push("");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

validate();
const release = data.releases.find((item) => item.version === version);
if (!release) fail(`Release notes not found for ${version}`);

if (format === "validate") {
  console.log(`release notes valid for ${data.releases.length} versions`);
} else if (format === "release") {
  process.stdout.write(renderRelease(release));
} else if (format === "changelog") {
  process.stdout.write(renderChangelog());
} else if (format === "check-changelog") {
  if (readFileSync(changelogPath, "utf8") !== renderChangelog()) fail("CHANGELOG.md is out of date");
  console.log("CHANGELOG.md is up to date");
} else {
  fail(`Unknown format: ${format}`);
}
