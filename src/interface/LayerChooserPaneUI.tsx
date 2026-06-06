import { h } from "../utils/dom";
import { LayerManager } from "../managers/layerManager";
import LayerChooserPane from "../components/LayerChooserPane/LayerChooserPane";

export class LayerChooserPaneUI {
  private readonly layerManager: LayerManager;
  private pane: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;

  constructor(layerManager: LayerManager) {
    this.layerManager = layerManager;
  }

  public togglePane(): void {
    if (this.pane) {
      this.closePane();
    } else {
      this.showPane();
    }
  }

  private closePane(): void {
    if (this.pane) {
      this.pane.remove();
      this.pane = null;
    }
  }

  private showPane(): void {
    this.renderPane();
  }

  private renderPane(): void {
    const newPane = (
      <LayerChooserPane
        layerManager={this.layerManager}
        onToggle={this.handleToggle}
      />
    ) as HTMLElement;

    if (this.pane) {
      this.pane.replaceWith(newPane);
    } else {
      if (this.wrapper) {
        this.wrapper.appendChild(newPane);
      }
    }
    this.pane = newPane;
  }

  private handleToggle = (id: string, checked: boolean) => {
    this.layerManager.setFilter(id, checked);
    this.renderPane();
  };

  public setWrapper(el: HTMLElement) {
    this.wrapper = el;
  }
}
