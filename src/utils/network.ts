/**
 * Modern network utilities for interacting with the Ingress API.
 */

import { getCookie } from "./browser";

let apiVersion: string | undefined;

export function setApiVersion(version: string): void {
  apiVersion = version;
}

export function getApiVersion(): string | undefined {
  return apiVersion;
}

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
