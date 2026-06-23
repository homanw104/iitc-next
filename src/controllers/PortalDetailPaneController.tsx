import { PortalData } from "../types/ingress";
import PortalDetailPane from "../components/panes/PortalDetailPane/PortalDetailPane";

export class PortalDetailPaneController {
  private readonly container: HTMLElement;
  private detailPane: HTMLElement | null = null;
  private detailBarTitleEl: HTMLElement | null = null;
  private detailBarLevelEl: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public toggleDetailPane = (data?: PortalData): void => {
    if (this.detailPane) {
      this.removeDetailPane();
    } else if (data) {
      this.detailPane = this.container.appendChild(PortalDetailPane({ data, onCopy: this.copyIntelLink }));
    }
  };

  public removeDetailPane = () => {
    if (this.detailPane) {
      this.detailPane.remove();
      this.detailPane = null;
    }
  };

  public updateDetailPane = (data: PortalData): void => {
    if (this.detailPane) {
      this.removeDetailPane();
      this.detailPane = this.container.appendChild(PortalDetailPane({ data, onCopy: this.copyIntelLink }));
    }
  };

  public setDetailBarTitleElement = (titleEl: HTMLElement): void => {
    this.detailBarTitleEl = titleEl;
  };

  public setDetailBarLevelElement = (levelEl: HTMLElement): void => {
    this.detailBarLevelEl = levelEl;
  };

  public getDetailBarTitleText(portalData?: PortalData, msg?: string): string {
    return (portalData && portalData.title) || msg || "Loading...";
  }

  public getDetailBarLevelText(portalData?: PortalData): string {
    return portalData && portalData.level && "L" + portalData.level || "";
  }

  public updateDetailBarText = (portalData?: PortalData, msg?: string): void => {
    if (this.detailBarTitleEl?.isConnected) {
      this.detailBarTitleEl.textContent = this.getDetailBarTitleText(portalData, msg);
    }
    if (this.detailBarLevelEl?.isConnected) {
      this.detailBarLevelEl.textContent = this.getDetailBarLevelText(portalData);
    }
  };

  private copyIntelLink = async (link: string) => {
    const linkButton = document.getElementById("intel-link");
    if (linkButton) {
      await navigator.clipboard.writeText(link);
      linkButton.innerText = "Copied intel map link";
      linkButton.style.color = "white";
      setTimeout(() => {
        linkButton.innerText = "Copy intel map link";
        linkButton.style.color = "#5091ff";
      }, 2000);
    }
  };
}
