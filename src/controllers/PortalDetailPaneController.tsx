import { PortalData } from "../types/ingress";
import PortalDetailPane from "../components/panes/PortalDetailPane/PortalDetailPane";

export class PortalDetailPaneController {
  private readonly container: HTMLElement;
  private detailPane: HTMLElement | null = null;

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
