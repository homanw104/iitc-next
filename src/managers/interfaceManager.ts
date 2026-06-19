/**
 * Manage and handle various interface elements.
 */

import PluginButtonContainer from "../components/atoms/PluginButtonContainer/PluginButtonContainer";

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
    button.style.flex = "0 0 auto";   // Fix buttons shrinking
    this.pluginButtonContainer.appendChild(button);
  }

  public unmountSidebarButton(button: HTMLElement): void {
    this.pluginButtonContainer.removeChild(button);
  }
}
