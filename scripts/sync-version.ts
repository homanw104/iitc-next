/**
 * Sync static files that mirror package.json versions.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type PackageJson = {
  version: string;
  dependencies: Record<string, string>;
};

type PackageLock = {
  version?: string;
  packages?: {
    "": {
      version?: string;
    };
  };
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJsonPath = join(root, "package.json");
const packageLockPath = join(root, "package-lock.json");
const xcodeProjectPath = join(root, "ios/App/App.xcodeproj/project.pbxproj");
const iosScriptInjectorPath = join(root, "ios/App/App/ScriptInjector.swift");
const androidScriptInjectorPath = join(root, "android/app/src/main/java/world/homans/iitcnext/ScriptInjector.java");

// Get the app version from package.json
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
const appVersion = packageJson.version;
const appVersionCode = appVersion
  .split(".")
  .map((part) => Number(part))
  .reduce((code, part, index) => code + part * [10000, 100, 1][index], 0);

// Update app versions in package-lock.json
const packageLock = JSON.parse(readFileSync(packageLockPath, "utf8")) as PackageLock;
packageLock.version = appVersion;
if (packageLock.packages?.[""]) packageLock.packages[""].version = appVersion;
writeFileSync(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`);

// Update app versions in the xcode project
const xcodeProject = readFileSync(xcodeProjectPath, "utf8")
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${appVersion};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${appVersionCode};`);
writeFileSync(xcodeProjectPath, xcodeProject);

// Get the Cesium version from package.json
const cesiumVersion = packageJson.dependencies.cesium.replace(/^[~^]/, "");
const cesiumBaseUrl = `https://cdn.jsdelivr.net/npm/cesium@${cesiumVersion}/Build/Cesium/`;
const cesiumJsUrl = `${cesiumBaseUrl}Cesium.js`;
const cesiumCssUrl = `${cesiumBaseUrl}Widgets/widgets.css`;

// Update Cesium versions in the script injectors in the iOS project
const iosScriptInjector = readFileSync(iosScriptInjectorPath, "utf8")
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/cesium@[^"]+\/Build\/Cesium\/Cesium\.js/g, cesiumJsUrl)
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/cesium@[^"]+\/Build\/Cesium\/Widgets\/widgets\.css/g, cesiumCssUrl);
writeFileSync(iosScriptInjectorPath, iosScriptInjector);

// Update Cesium versions in the script injectors in the Android project
const androidScriptInjector = readFileSync(androidScriptInjectorPath, "utf8")
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/cesium@[^"]+\/Build\/Cesium\/Cesium\.js/g, cesiumJsUrl)
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/cesium@[^"]+\/Build\/Cesium\/Widgets\/widgets\.css/g, cesiumCssUrl);
writeFileSync(androidScriptInjectorPath, androidScriptInjector);
