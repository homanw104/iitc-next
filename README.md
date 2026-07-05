# IITC Next

This project is a Total Conversion for Ingress Intel that adds a 3D globe view using CesiumJS.

![Cover](./assets/cover.png)

## Features

* A 3D Globe view of the Earth.
* Integration with Google Earth's 3D tiles.
* Lightweight userscript powered by Vite and Cesium CDN.
* Custom user plugins for various features of IITC Next.

## Installation

### For browsers

1. Install a userscript manager like [Tampermonkey](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   in your browser.
2. Download and install the script from [GitHub Releases](https://github.com/homanw104/iitc-next/releases)
   or click [here](https://github.com/homanw104/iitc-next/releases/latest/download/iitc-next.user.js)
   to download and install the latest version directly.
3. Goto <https://intel.ingress.com/>
4. Enjoy.

Note: You need to disable the IITC Button extension and disable
all IITC-CE related scripts in your userscript manager to avoid
conflicts. IITC Next is NOT a plugin of IITC-CE.

### For Android

Download the app from [Google Play](https://play.google.com/store/apps/details?id=world.homans.iitcnext)
or from [GitHub Releases](https://github.com/homanw104/iitc-next/releases).

Note: If you decide to switch between Google Play and
GitHub Release, you need to uninstall the existing version first
as they use different signature keys. 

## Development

1. `npm install`: Installs all necessary dependencies.
2. `npm run dev`: Starts the live-update server.

## Build Userscript

1. `npm run build`: Generates the final .user.js file in the `dist/` folder.
2. `npm run build:plugin`: Generates plugin .js files in the `dist/plugins` folder,
   though official plugins are alreadly bundled in `initPlugins.ts`.

## Build for Android

1. `npm run cap:sync`: Syncs the dist folder to the Android project.
2. `npm run cap:open:android`: Opens the project in Android Studio.
3. Build the project in Android Studio.
   1. Once Android Studio loads, wait for Gradle to finish syncing.
   2. Go to Build > Build Bundle(s) / APK(s) > Build APK(s).
   3. The generated APK will be located at: `android/app/build/outputs/apk/debug/app-debug.apk`
4. Alternatively, you can build directly from the terminal if you have the `ANDROID_HOME` environment variable set.
   1. Run `./gradlew assembleDebug` from the `android` directory.
   2. The generated APK will be located at: `android/app/build/outputs/apk/debug/app-debug.apk`
