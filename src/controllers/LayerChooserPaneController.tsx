import LayerChooserPane from "../components/panes/LayerChooserPane/LayerChooserPane";
import type { LayerManager } from "../managers/layer/layerManager";

export class LayerChooserPaneController {
  private readonly container: HTMLElement;
  private readonly layerManager: LayerManager;
  private layerChooserPane: HTMLElement | null = null;
  private lastScrollTop: number = 0;

  constructor(container: HTMLElement, layerManager: LayerManager) {
    this.container = container;
    this.layerManager = layerManager;
  }

  public togglePane(): void {
    if (this.layerChooserPane) {
      this.closePane();
    } else {
      this.showPane();
    }
  }

  private closePane(): void {
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
    this.layerChooserPane.scrollTop = this.lastScrollTop;
  }

  private onToggleCheckbox = (id: string, checked: boolean) => {
    this.layerManager.setFilter(id, checked);
    this.lastScrollTop = this.layerChooserPane?.scrollTop || 0;
    this.showPane();
  };
}
