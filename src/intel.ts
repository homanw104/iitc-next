/**
 * Contain functions for unloading the original intel map.
 */

export default function unloadOriginalIntelMap() {
  const oldBody = document.body;
  const newBody = document.createElement("body");

  // Transfer essential attributes if any
  newBody.id = "iitc-next-body";

  // Replace the body
  document.documentElement.replaceChild(newBody, oldBody);
}
