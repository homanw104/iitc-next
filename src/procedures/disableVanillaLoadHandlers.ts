/**
 * Prevents Ingress Intel's vanilla runtime from running.
 *
 * Intel still inserts the old Google Maps, Ark, and dashboard bundle. IITC
 * Next replaces that runtime, so stop the bootstrap and neuter those scripts
 * before they can execute delayed callbacks.
 */

import { safeWindow } from "../utils/window";

type WindowWithVanillaScriptState = Window & typeof globalThis & {
  iitcNextVanillaScriptBlockerInstalled?: boolean;
  configureIFrame?: () => void;
  initialize?: () => void;
};

const blockedScriptType = "javascript/blocked";
const noop = () => undefined;

if (location.pathname !== "/signinhandler") {
  disableVanillaLoadHandlers();
}

function disableVanillaLoadHandlers(): void {
  const targetWindow = safeWindow as WindowWithVanillaScriptState;
  if (targetWindow.iitcNextVanillaScriptBlockerInstalled) return;

  targetWindow.iitcNextVanillaScriptBlockerInstalled = true;
  safeWindow.addEventListener("load", stopVanillaLoad, true);
  blockVanillaGlobal("configureIFrame");
  blockVanillaGlobal("initialize");
  blockVanillaScriptInsertion();
  blockVanillaScripts(document);
  watchVanillaScripts();
}

function stopVanillaLoad(event: Event): void {
  event.stopImmediatePropagation();
}

function blockVanillaGlobal(name: "configureIFrame" | "initialize"): void {
  try {
    Object.defineProperty(safeWindow, name, {
      configurable: true,
      // Keep returning a callable no-op even if Intel assigns its real
      // bootstrap later. Inline onload="initialize()" then stays harmless.
      get: () => noop,
      // Swallow assignments from the vanilla bundle without replacing the
      // no-op getter above.
      set: noop,
    });
  } catch {
    // Some script managers may not allow redefining unsafeWindow properties.
    // Direct assignment still prevents the inline load handler from throwing.
    (safeWindow as WindowWithVanillaScriptState)[name] = noop;
  }
}

function blockVanillaScriptInsertion(): void {
  const targetWindow = safeWindow as WindowWithVanillaScriptState;
  const nodePrototype = targetWindow.Node.prototype;
  const scriptPrototype = targetWindow.HTMLScriptElement.prototype;
  const appendChild = nodePrototype.appendChild;
  const insertBefore = nodePrototype.insertBefore;
  const srcDescriptor = Object.getOwnPropertyDescriptor(scriptPrototype, "src");

  if (srcDescriptor?.get && srcDescriptor.set) {
    Object.defineProperty(scriptPrototype, "src", {
      configurable: true,
      get: srcDescriptor.get,
      set(this: HTMLScriptElement, value: string) {
        srcDescriptor.set!.call(this, value);
        blockVanillaScript(this);
      },
    });
  }

  nodePrototype.appendChild = function<T extends Node>(this: Node, node: T): T {
    blockVanillaNode(node);
    return appendChild.call(this, node) as T;
  };

  nodePrototype.insertBefore = function<T extends Node>(this: Node, node: T, child: Node | null): T {
    blockVanillaNode(node);
    return insertBefore.call(this, node, child) as T;
  };
}

function watchVanillaScripts(): void {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach(blockVanillaNode);
    });
  });

  observeScriptContainer(observer, document.head);
  observeScriptContainer(observer, document.body);
  observeScriptContainer(observer, document.documentElement);
}

function observeScriptContainer(observer: MutationObserver, element: Element | null): void {
  if (!element) return;

  observer.observe(element, { childList: true });
}

function blockVanillaNode(node: Node): void {
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const element = node as Element;
  if (element.tagName.toLowerCase() === "script") {
    blockVanillaScript(element as HTMLScriptElement);
  } else {
    blockVanillaScripts(element);
  }
}

function blockVanillaScripts(root: ParentNode): void {
  root
    .querySelectorAll<HTMLScriptElement>("script[src]")
    .forEach(blockVanillaScript);
}

function blockVanillaScript(script: HTMLScriptElement): void {
  if (isDashboardScript(script.src)) {
    script.type = blockedScriptType;
  } else if (isRemovableVanillaScript(script.src)) {
    script.type = blockedScriptType;
    script.removeAttribute("src");
  }
}

function isDashboardScript(src: string): boolean {
  try {
    const url = new URL(src, location.href);
    return url.hostname === location.hostname && /^\/jsc\/gen_dashboard_[a-f0-9]{40}\.js$/.test(url.pathname);
  } catch {
    return false;
  }
}

function isRemovableVanillaScript(src: string): boolean {
  try {
    const url = new URL(src, location.href);
    return isGoogleMapsScript(url) || isArkScript(url);
  } catch {
    return false;
  }
}

function isGoogleMapsScript(url: URL): boolean {
  return url.hostname === "maps.googleapis.com"
    && (url.pathname.startsWith("/maps/api/js") || url.pathname.startsWith("/maps-api-v3/"));
}

function isArkScript(url: URL): boolean {
  return (url.hostname === "storage.googleapis.com" && url.pathname.startsWith("/spatialweb-ark/ark/"))
    || (url.hostname === location.hostname && /^\/p-[a-f0-9]+\.system(?:\.entry)?\.js$/.test(url.pathname));
}
