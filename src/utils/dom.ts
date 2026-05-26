/**
 * A simple JSX factory that creates DOM elements.
 */

declare global {
  namespace JSX {
    interface Element extends globalThis.Element {}
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

/**
 * Creates a JSX element or invokes a function component.
 *
 * @param {string | Function} tag - The HTML tag name or a function component.
 * @param {any} props - An object containing the properties for the element.
 * @param {...any[]} children - Child elements to be added as children of the created element.
 * @return {JSX.Element | any} A JSX element or the result of the invoked function component.
 */
export function h(tag: string | Function, props: any, ...children: any[]): JSX.Element | any {
  if (typeof tag === "function") {
    return tag({ ...props, children: children.flat() });
  }

  const isSvg = [
    "svg", "path", "circle", "rect", "line", "polyline", "polygon", "ellipse", "text", "g", "defs", "marker", "mask", "pattern", "symbol", "use", "image", "linearGradient", "radialGradient", "stop"
  ].includes(tag);

  const el = isSvg
    ? document.createElementNS("http://www.w3.org/2000/svg", tag)
    : document.createElement(tag);

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (key === "style" && typeof value === "object") {
        Object.assign((el as HTMLElement | SVGElement).style, value);
      } else if (key.startsWith("on") && typeof value === "function") {
        const eventName = key.toLowerCase().substring(2);
        el.addEventListener(eventName, value as EventListener);
      } else if (key === "className") {
        if (isSvg) {
          el.setAttribute("class", value as string);
        } else {
          (el as HTMLElement).className = value as string;
        }
      } else if (key === "ref" && typeof value === "function") {
        value(el);
      } else if (key === "indeterminate" && el instanceof HTMLInputElement) {
        el.indeterminate = !!value;
      } else if (key === "checked" && el instanceof HTMLInputElement) {
        el.checked = !!value;
      } else {
        el.setAttribute(key, value as string);
      }
    }
  }

  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    if (child instanceof Node) {
      el.appendChild(child);
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  }

  return el;
}

/**
 * A simple Fragment component for JSX.
 * Usage: return <Fragment>{...}</Fragment> or return <>{...}</>.
 */
export function Fragment(_props: any, ...children: any[]): any[] {
  return children.flat();
}
