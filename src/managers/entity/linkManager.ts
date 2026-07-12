/**
 * Manages link primitives.
 */

import * as Cesium from "cesium";
import { TEAMS } from "../../types/common/common";
import type { LinkData } from "../../types/iitc/link";
import type { PortalData } from "../../types/iitc/portal";
import { getTeamColor } from "../../utils/color";
import type { LayerManager } from "../layer/layerManager";
import type { PortalManager } from "./portalManager";

const LINK_ALPHA = 0.7;
const LINK_WIDTH = 2;
const LINK_PRIMITIVE_Z_INDEX = 10;
const LINK_PRIMITIVE_KEY = "links";

interface Link {
  data: LinkData;
  positions: [Cesium.Cartesian3, Cesium.Cartesian3];
}

export type LinksChangedCallback = () => void;

export class LinkManager {
  private readonly links: Map<string, Link> = new Map();
  private readonly linksChangedCallbacks: Set<LinksChangedCallback> = new Set();

  constructor(
    private readonly layerManager: LayerManager,
    private readonly portalManager: PortalManager,
  ) {}

  public async addOrUpdateLinks(links: LinkData[]): Promise<void> {
    if (links.length === 0) return;

    const placeholders = new Map<string, PortalData>();
    links.forEach((link) => {
      this.addOrUpdatePlaceholders(placeholders, link);
      this.addOrUpdateLink(link);
    },);

    if (placeholders.size > 0) {
      await this.portalManager.addOrUpdatePortals(Array.from(placeholders.values()));
    }

    this.rebuildLayers();
    this.notifyLinksChanged();
  }

  public removeLinksInView(viewRect: Cesium.Rectangle): void {
    this.removeLinkPrimitivesInView(viewRect);
  }

  public getLinkData(guid: string): LinkData | undefined {
    return this.links.get(guid)?.data;
  }

  public forEachLinkData(callback: (data: LinkData) => void): void {
    this.links.forEach((link) => callback(link.data));
  }

  public addLinksChangedCallback(callback: LinksChangedCallback): void {
    this.linksChangedCallbacks.add(callback);
  }

  public removeLinksChangedCallback(callback: LinksChangedCallback): void {
    this.linksChangedCallbacks.delete(callback);
  }

  private addOrUpdatePlaceholders(placeholders: Map<string, PortalData>, link: LinkData): void {
    if (this.portalManager.getPortalData(link.oGuid)) {
      this.portalManager.addPortalLink(link.oGuid, link);
    } else {
      collectLinkEndpointPlaceholder(placeholders, link, link.oGuid, link.oLatE6, link.oLngE6);
    }

    if (this.portalManager.getPortalData(link.dGuid)) {
      this.portalManager.addPortalLink(link.dGuid, link);
    } else {
      collectLinkEndpointPlaceholder(placeholders, link, link.dGuid, link.dLatE6, link.dLngE6);
    }
  }

  private addOrUpdateLink(data: LinkData): void {
    const existing = this.links.get(data.guid);
    if (existing && data.timestamp <= existing.data.timestamp) return;

    const positions = createLinkPositions(data);
    if (existing) {
      existing.data = data;
      existing.positions = positions;
      return;
    }

    this.links.set(data.guid, { data, positions });
  }

  private removeLinkPrimitivesInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.links.forEach((link, guid) => {
      if (isLinkInView(link, viewRect)) toRemove.push(guid);
    },);

    if (toRemove.length > 0) {
      toRemove.forEach((guid) => this.links.delete(guid));
      this.rebuildLayers();
      this.notifyLinksChanged();
    }
  }

  private rebuildLayers(): void {
    TEAMS.forEach((team) => {
      this.rebuildLayer(`links-${team.toLowerCase()}`);
    },);
  }

  private rebuildLayer(layerId: string): void {
    const layer = this.layerManager.getOrCreateGroundPrimitiveLayer(layerId, LINK_PRIMITIVE_Z_INDEX);

    const geometryInstances = Array.from(this.links.values())
      .filter((link) => getLinkLayerId(link.data) === layerId,)
      .map((link) => createLinkGeometryInstance(link),);

    if (geometryInstances.length === 0) {
      layer.removeManagedPrimitive(LINK_PRIMITIVE_KEY);
    } else {
      layer.replacePrimitiveWhenReady(LINK_PRIMITIVE_KEY, new Cesium.GroundPolylinePrimitive({
        geometryInstances,
        appearance: new Cesium.PolylineColorAppearance({ translucent: true }),
        allowPicking: false,
        asynchronous: true,
        classificationType: Cesium.ClassificationType.BOTH,
      },),);
    }
  }

  private notifyLinksChanged(): void {
    this.linksChangedCallbacks.forEach((callback) => callback());
  }
}

function createLinkGeometryInstance(link: Link): Cesium.GeometryInstance {
  return new Cesium.GeometryInstance({
    geometry: new Cesium.GroundPolylineGeometry({
      positions: link.positions,
      width: LINK_WIDTH,
      arcType: Cesium.ArcType.GEODESIC,
    },),
    attributes: {
      color: Cesium.ColorGeometryInstanceAttribute.fromColor(getTeamColor(link.data.team).withAlpha(LINK_ALPHA)),
    },
  },);
}

function createLinkPositions(data: LinkData): [Cesium.Cartesian3, Cesium.Cartesian3] {
  return [
    Cesium.Cartesian3.fromDegrees(data.oLngE6 / 1e6, data.oLatE6 / 1e6),
    Cesium.Cartesian3.fromDegrees(data.dLngE6 / 1e6, data.dLatE6 / 1e6),
  ];
}

function isLinkInView(link: Link, viewRect: Cesium.Rectangle): boolean {
  const carto1 = Cesium.Cartographic.fromCartesian(link.positions[0]);
  const carto2 = Cesium.Cartographic.fromCartesian(link.positions[1]);
  const linkRect = Cesium.Rectangle.fromCartographicArray([carto1, carto2]);
  return Cesium.Rectangle.intersection(viewRect, linkRect) !== undefined;
}

function getLinkLayerId(data: LinkData): string {
  const team = data.team.toLowerCase();
  return `links-${team}`;
}

function collectLinkEndpointPlaceholder(
  placeholders: Map<string, PortalData>,
  link: LinkData,
  guid: string,
  latE6: number,
  lngE6: number,
): void {
  const existing = placeholders.get(guid);
  if (existing) {
    addPortalLink(existing, link);
  } else {
    placeholders.set(guid, {
      guid,
      team: link.team,
      latE6,
      lngE6,
      isPlaceholder: true,
      links: [link],
    },);
  }
}

function addPortalLink(portal: PortalData, link: LinkData): void {
  if (!portal.links?.some((existingLink) => existingLink.guid === link.guid)) {
    (portal.links ??= []).push(link);
  }
}
