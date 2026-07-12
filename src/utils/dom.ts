/**
 * A simple JSX factory that creates DOM elements.
 */

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set([
  "circle",
  "defs",
  "ellipse",
  "g",
  "image",
  "line",
  "linearGradient",
  "marker",
  "mask",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "radialGradient",
  "rect",
  "stop",
  "svg",
  "symbol",
  "text",
  "use",
]);

declare global {
  namespace JSX {
    export type Element = globalThis.Element | Child[];
    export type IntrinsicElements = {
      [Tag in keyof HTMLElementTagNameMap]: DOMProps<HTMLElementTagNameMap[Tag]>;
    } & {
      [Tag in Exclude<keyof SVGElementTagNameMap, keyof HTMLElementTagNameMap>]: DOMProps<SVGElementTagNameMap[Tag]>;
    } & Record<string, DOMProps>;
    export type IntrinsicAttributes = { key?: string | number };
  }
}

type Child = JSX.Element | string | number | boolean | null | undefined | Child[];

type Props = Record<string, unknown>;

type DOMProps<TElement extends Element = Element> = {
  [attribute: string]: unknown;
  children?: Child | Child[];
  className?: string;
  disabled?: boolean;
  ref?: (el: TElement) => void;
  style?: Record<string, string | number | null | undefined>;
};

type Component<P = Props> = (
  props: P & { children?: Child[] }
) => JSX.Element | Child[] | null | undefined;

export function h(
  tag: string | Component,
  props: Props | null,
  ...children: Child[]
): JSX.Element {
  if (typeof tag === "function") {
    return tag({ ...props, children: children.flat() }) as JSX.Element;
  }

  const element = createElement(tag);

  applyProps(element, props);
  appendChildren(element, children);

  return element;
}

export function Fragment(props: { children?: Child[] }): Child[] {
  return props.children?.flat() ?? [];
}

function createElement(tag: string): HTMLElement | SVGElement {
  return isSvgTag(tag)
    ? document.createElementNS(SVG_NAMESPACE, tag)
    : document.createElement(tag);
}

function isSvgTag(tag: string): boolean {
  return SVG_TAGS.has(tag);
}

function applyProps(element: HTMLElement | SVGElement, props: Props | null): void {
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      applyProp(element, key, value);
    }
  }
}

function applyProp(element: HTMLElement | SVGElement, key: string, value: unknown): void {
  if (key === "style" && isRecord(value)) {
    Object.assign(element.style, value);
  } else if (key.startsWith("on") && typeof value === "function") {
    element.addEventListener(toEventName(key), value as EventListener);
  } else if (key === "className") {
    applyClassName(element, value);
  } else if (key === "ref" && typeof value === "function") {
    (value as (el: Element) => void)(element);
  } else if (key === "indeterminate" && element instanceof HTMLInputElement) {
    element.indeterminate = !!value;
  } else if (key === "checked" && element instanceof HTMLInputElement) {
    element.checked = !!value;
  } else if (key === "unselectable" && value) {
    applyUnselectable(element);
  } else if (key === "no-scroll-bar" && value) {
    applyNoScrollBar(element);
  } else if (key === "disabled" && isDisableable(element)) {
    element.disabled = !!value;
  } else {
    element.setAttribute(key, value as string);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toEventName(key: string): string {
  return key.toLowerCase().substring(2);
}

function applyClassName(element: HTMLElement | SVGElement, value: unknown): void {
  if (element instanceof SVGElement) {
    element.setAttribute("class", value as string);
  } else {
    element.className = value as string;
  }
}

function applyUnselectable(element: HTMLElement | SVGElement): void {
  Object.assign(element.style, {
    MozUserSelect: "none",
    WebkitUserSelect: "none",
    msUserSelect: "none",
    userSelect: "none",
  });
}

function applyNoScrollBar(element: HTMLElement | SVGElement): void {
  Object.assign(element.style, {
    msOverflowStyle: "none",
    scrollbarWidth: "none",
  });

  const style = document.createElement("style");
  style.textContent = `
    #${element.id || (element.id = createDomId())}::-webkit-scrollbar {
      display: none !important;
    }
  `;
  element.appendChild(style);
}

function createDomId(): string {
  return "id" + Math.random().toString(36).substring(2, 9);
}

function isDisableable(
  element: HTMLElement | SVGElement,
): element is HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return element instanceof HTMLButtonElement
    || element instanceof HTMLInputElement
    || element instanceof HTMLSelectElement
    || element instanceof HTMLTextAreaElement;
}

function appendChildren(parent: Node, children: Child[]): void {
  for (const child of children) {
    appendChild(parent, child);
  }
}

function appendChild(parent: Node, child: Child): void {
  if (child === null || child === undefined || child === false) return;

  if (Array.isArray(child)) {
    appendChildren(parent, child);
  } else if (child instanceof Node) {
    parent.appendChild(child);
  } else {
    parent.appendChild(document.createTextNode(String(child)));
  }
}
