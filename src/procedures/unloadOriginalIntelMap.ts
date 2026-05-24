/**
 * Contain functions for unloading the original intel map.
 */

export default function unloadOriginalIntelMap() {
  // Kill all interaction events
  // We use capturing listeners to intercept events before they reach the original scripts
  const killEvent = (e: Event) => {
    e.stopImmediatePropagation();
  };
  const eventsToKill = ["mouseup", "mousedown", "click", "dblclick", "mousemove", "mouseover", "mouseout", "mouseenter", "mouseleave", "contextmenu"];
  eventsToKill.forEach(eventName => {
    window.addEventListener(eventName, killEvent, true);
    document.addEventListener(eventName, killEvent, true);
  });

  // Prepare the old and new body elements
  const oldBody = document.body;
  const newBody = document.createElement("body");

  // Transfer essential attributes if any
  newBody.id = "iitc-next-body";

  // Replace the body
  document.documentElement.replaceChild(newBody, oldBody);
}
