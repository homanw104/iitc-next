/**
 * Prevents Ingress Intel's vanilla runtime from running.
 *
 * Intel still inserts the old Google Maps, Ark, and dashboard bundle. IITC
 * Next replaces that runtime, so stop the bootstrap and neuter the scripts
 * that continue to run after the dashboard has parsed.
 */

import { safeWindow } from "../utils/window";

type WindowWithVanillaScriptState = Window & typeof globalThis & {
  iitcNextVanillaScriptBlockerInstalled?: boolean;

  // Intel's page defines these globals from inline
  // load handlers and the gen_dashboard script.
  configureIFrame?: () => void;
  initialize?: () => void;
};

type InsertionDecision = "insert" | "skip";

const blockedScriptType = "javascript/blocked";
const noop = () => undefined;

function disableVanillaLoadHandlers(): void {
  const targetWindow = safeWindow as WindowWithVanillaScriptState;
  if (targetWindow.iitcNextVanillaScriptBlockerInstalled) return;

  targetWindow.iitcNextVanillaScriptBlockerInstalled = true;
  safeWindow.addEventListener("load", stopVanillaLoad, true);
  blockVanillaGlobal("configureIFrame");
  blockVanillaGlobal("initialize");
  blockVanillaScriptInsertion();
  prepareVanillaScripts(document);
  watchVanillaScripts();
}

function stopVanillaLoad(event: Event): void {
  event.stopImmediatePropagation();
}

function blockVanillaGlobal(name: "configureIFrame" | "initialize"): void {
  try {
    Object.defineProperty(safeWindow, name, {
      configurable: true,
      get: () => noop,
      set: noop,
    });
  } catch {
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
        prepareVanillaScript(this);
      },
    });
  }

  nodePrototype.appendChild = function<T extends Node>(this: Node, node: T): T {
    if (prepareVanillaNode(node) === "skip") return node;
    return appendChild.call(this, node) as T;
  };

  nodePrototype.insertBefore = function<T extends Node>(this: Node, node: T, child: Node | null): T {
    if (prepareVanillaNode(node) === "skip") return node;
    return insertBefore.call(this, node, child) as T;
  };
}

function watchVanillaScripts(): void {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach(prepareVanillaNode);
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

function prepareVanillaNode(node: Node): InsertionDecision {
  if (node.nodeType !== Node.ELEMENT_NODE) return "insert";

  const element = node as Element;
  if (element.tagName.toLowerCase() === "script") {
    return prepareVanillaScript(element as HTMLScriptElement);
  }

  prepareVanillaScripts(element);
  return "insert";
}

function prepareVanillaScripts(root: ParentNode): void {
  root.querySelectorAll<HTMLScriptElement>("script[src]").forEach(prepareVanillaScript);
}

function prepareVanillaScript(script: HTMLScriptElement): InsertionDecision {
  if (isDashboardScript(script.src)) {
    script.type = blockedScriptType;
    return "insert";
  } else if (isArkScript(script.src)) {
    script.type = blockedScriptType;
    script.removeAttribute("src");
    return "skip";
  } else {
    return "insert";
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

function isArkScript(src: string): boolean {
  try {
    const url = new URL(src, location.href);
    return (url.hostname === "storage.googleapis.com" && url.pathname.startsWith("/spatialweb-ark/ark/"))
      || (url.hostname === location.hostname && /^\/p-[a-f0-9]+\.system(?:\.entry)?\.js$/.test(url.pathname));
  } catch {
    return false;
  }
}

if (location.pathname !== "/signinhandler") {
  disableVanillaLoadHandlers();
}
