/**
 * Modern network utilities for interacting with the Ingress API.
 */

import { getCookie } from "./browser";

let apiVersion: string | undefined;

/**
 * Sets the API version to be used in subsequent requests.
 * @param version The Niantic version string.
 */
export function setApiVersion(version: string): void {
  apiVersion = version;
}

/**
 * Sends a POST request to the Ingress API.
 * 
 * @param action The API action (e.g., 'getEntities').
 * @param data The JSON data to send.
 * @returns A promise that resolves with the response JSON.
 */
export async function apiRequest(action: string, data: object): Promise<unknown> {
  const url = `/r/${action}`;
  const csrfToken = getCookie("csrftoken");

  if (!apiVersion) {
    console.warn("API version not set, requests might fail.");
  }

  const payload = {
    ...data,
    v: apiVersion,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-CSRFToken": csrfToken || "",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}
