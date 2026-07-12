import LayerChooserPane from "../components/panes/LayerChooserPane/LayerChooserPane";
import type { RegisterActivePaneCloseCallback } from "../cesium/setup/mountCoreControllersAndUI.ts";
import type { LayerManager } from "../managers/layer/layerManager";

export class LayerChooserPaneController {
  private layerChooserPane: HTMLElement | null = null;
  private lastScrollTop: number = 0;
  private unregisterActivePaneCloseCallback: (() => void) | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly layerManager: LayerManager,
    private readonly registerActivePaneCloseCallback: RegisterActivePaneCloseCallback,
  ) {}

  public togglePane(): void {
    if (this.layerChooserPane) {
      this.closePane();
    } else {
      this.showPane();
    }
  }

  private closePane(): void {
    this.unregisterActivePaneCloseCallback?.();
    this.unregisterActivePaneCloseCallback = null;
    if (this.layerChooserPane) {
      this.lastScrollTop = this.layerChooserPane.scrollTop;
      this.layerChooserPane.remove();
      this.layerChooserPane = null;
    }
  }

  private showPane(): void {
    this.closePane();
    this.layerChooserPane = this.container.appendChild(LayerChooserPane({
      layerManager: this.layerManager,
      onToggle: this.onToggleCheckbox,
    }));
    this.unregisterActivePaneCloseCallback = this.registerActivePaneCloseCallback(() => this.closePane());
    this.layerChooserPane.scrollTop = this.lastScrollTop;
  }

  private onToggleCheckbox = (id: string, checked: boolean) => {
    this.layerManager.setFilter(id, checked);
    this.lastScrollTop = this.layerChooserPane?.scrollTop || 0;
    this.showPane();
  };
}
