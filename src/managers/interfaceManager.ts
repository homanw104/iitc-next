/**
 * Manage and handle various interface elements.
 */

import PluginButtonsContainer from "../components/atoms/PluginButtonsContainer/PluginButtonsContainer.tsx";

export class InterfaceManager {
  private readonly container: HTMLElement;
  private readonly pluginButtonContainer: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.pluginButtonContainer = this.container.appendChild(PluginButtonsContainer());
  }

  public getContainer(): HTMLElement {
    return this.container;
  }

  public mountSidebarButton(button: HTMLElement): void {
    button.style.flex = "0 0 auto";   // Fix buttons shrinking
    this.pluginButtonContainer.appendChild(button);
  }

  public unmountSidebarButton(button: HTMLElement): void {
    this.pluginButtonContainer.removeChild(button);
  }
}
