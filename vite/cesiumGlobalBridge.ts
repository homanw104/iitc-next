/**
 * Adds the installed Cesium package's named exports to the runtime global bridge.
 *
 * TypeScript resolves `cesium` against the package as usual, while Vite aliases
 * runtime imports to the bridge. Generating the runtime bindings here keeps the
 * bridge in sync with Cesium without maintaining a second export list by hand.
 */

import * as CesiumModule from "cesium";
import { normalizePath, type Plugin } from "vite";

const exportNames = Object.keys(CesiumModule).filter(name => name !== "default");
const invalidExportName = exportNames.find(name => !/^[$A-Z_a-z][$\w]*$/.test(name));

if (invalidExportName) {
  throw new Error(`Cannot generate Cesium global export for ${JSON.stringify(invalidExportName)}`);
}

export default function cesiumGlobalBridge(bridgePath: string): Plugin {
  const normalizedBridgePath = normalizePath(bridgePath);

  return {
    name: "iitc-next-cesium-global-bridge",
    transform(code, id) {
      const [modulePath] = id.split("?", 1);
      if (normalizePath(modulePath) !== normalizedBridgePath) return;

      const generatedExports = exportNames
        .map(name => `export const ${name} = /* @__PURE__ */ getCesiumExport(${JSON.stringify(name)});`)
        .join("\n");

      return {
        code: `${code}\n\n// Generated from the installed Cesium package.\nconst getCesiumExport = name => Cesium[name];\n${generatedExports}\n`,
        map: null,
      };
    },
  };
}
