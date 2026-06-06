/**
 * Manage and handle various interface elements.
 */

import PluginButtonContainer from "../components/PluginButtonContainer/PluginButtonContainer";

export class InterfaceManager {
  private readonly container: HTMLElement;
  private readonly pluginButtonContainer: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.pluginButtonContainer = this.container.appendChild(PluginButtonContainer());
  }

  public getContainer(): HTMLElement {
    return this.container;
  }

  public mountSidebarButton(button: HTMLElement): void {
    this.pluginButtonContainer.appendChild(button);
    this.pluginButtonContainer.appendChild(button);
  }

  public unmountSidebarButton(buttonId: string): void {
    const button = document.getElementById(buttonId);
    if (button) this.pluginButtonContainer.removeChild(button);
  }
}
