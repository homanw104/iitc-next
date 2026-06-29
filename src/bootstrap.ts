/**
 * Userscript bootstrap.
 *
 * Install the vanilla Intel blocker before loading the rest of IITC Next.
 * Keeping this promise boundary here avoids racing Intel's dashboard scripts
 * while keeping app.ts as normal application code.
 */

// Run the blocker at the very start
import "./procedures/disableVanillaLoadHandlers.ts";

// Dynamically load the rest of the application
import("./app.ts").then();
