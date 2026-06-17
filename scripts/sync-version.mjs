/**
 * Sync static files: package-lock.json root package version
 * and iOS MARKETING_VERSION / CURRENT_PROJECT_VERSION.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJsonPath = join(root, "package.json");
const packageLockPath = join(root, "package-lock.json");
const xcodeProjectPath = join(root, "ios/App/App.xcodeproj/project.pbxproj");

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const version = packageJson.version;
const versionCode = version
  .split(".")
  .map((part) => Number(part))
  .reduce((code, part, index) => code + part * [10000, 100, 1][index], 0);

const packageLock = JSON.parse(readFileSync(packageLockPath, "utf8"));
packageLock.version = version;
if (packageLock.packages?.[""]) {
  packageLock.packages[""].version = version;
}
writeFileSync(packageLockPath, JSON.stringify(packageLock, null, 2) + "\n");

const xcodeProject = readFileSync(xcodeProjectPath, "utf8")
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${versionCode};`);
writeFileSync(xcodeProjectPath, xcodeProject);
