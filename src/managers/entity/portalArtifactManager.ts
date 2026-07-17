/**
 * Manages target halos and fragment pyramid primitives for artifact portals.
 */

import * as Cesium from "cesium";
import type { Team } from "../../types/common/common";
import type { PortalData } from "../../types/iitc/portal";
import { getTeamColor } from "../../utils/color";
import type { LayerManager } from "../layer/layerManager";
import type { OverlayLayer } from "../layer/overlayLayer";
import type { PrimitivesLayer } from "../layer/primitivesLayer";
import type { EntityPosition, EntityPositionCallback, EntityPositionManager } from "./entityPositionManager";
import type { EntityTranslucencyManager, TranslucencyByDistanceCallback } from "./entityTranslucencyManager";
import {
  PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
  PORTAL_OCCLUDED_ALPHA,
  createPortalNearFarScalar,
  createPortalPrimitiveId,
  getPortalDisableDepthTestDistance,
  type PortalPrimitiveId,
} from "./portalManager";

const ARTIFACT_LAYER_ID = "artifacts";
const ARTIFACT_OVERLAY_Z_INDEX = 1100;

const TARGET_INNER_PIXEL_SIZE = 44;
const TARGET_INNER_OUTLINE_WIDTH = 4;
const TARGET_OUTER_PIXEL_SIZE = 66;
const TARGET_OUTER_OUTLINE_WIDTH = 8;
const TARGET_ALPHA = 0.8;

const FRAGMENT_RADIUS_METERS = 6;
const FRAGMENT_LENGTH_METERS = 8.4867;
const FRAGMENT_TIP_HEIGHT_METERS = 50;
const FRAGMENT_CENTER_HEIGHT_METERS = FRAGMENT_TIP_HEIGHT_METERS + FRAGMENT_LENGTH_METERS / 2;
const FRAGMENT_COLOR_WITH_ALPHA = Cesium.Color.fromCssColorString("#7c8294").withAlpha(0.6);

interface TargetPrimitives {
  inner: Cesium.PointPrimitive;
  innerOcclusion: Cesium.PointPrimitive;
  outer: Cesium.PointPrimitive;
  outerOcclusion: Cesium.PointPrimitive;
}

interface PortalArtifact {
  data: PortalData;
  primitiveId: PortalPrimitiveId;
  targets: TargetPrimitives | undefined;
  fragment: Cesium.Primitive | undefined;
  positionCallback: EntityPositionCallback;
}

export class PortalArtifactManager {
  private readonly artifacts = new Map<string, PortalArtifact>();
  private readonly artifactsPendingCreation = new Set<string>();
  private readonly currentTranslucencyByDistance = new Cesium.NearFarScalar();
  private readonly translucencyByDistanceCallback: TranslucencyByDistanceCallback;

  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly layerManager: LayerManager,
    private readonly entityPositionManager: EntityPositionManager,
    entityTranslucencyManager: EntityTranslucencyManager,
  ) {
    this.translucencyByDistanceCallback = (translucencyByDistance) => {
      Cesium.NearFarScalar.clone(translucencyByDistance, this.currentTranslucencyByDistance);
      this.artifacts.forEach(({ targets }) => {
        if (!targets) return;
        targets.innerOcclusion.translucencyByDistance = this.currentTranslucencyByDistance;
        targets.outerOcclusion.translucencyByDistance = this.currentTranslucencyByDistance;
      });
      if (this.artifacts.size > 0) this.viewer.scene.requestRender();
    };
    entityTranslucencyManager.addTranslucencyByDistanceChangedCallback(this.translucencyByDistanceCallback);
  }

  public async addOrUpdateArtifacts(portals: PortalData[]): Promise<void> {
    await Promise.all(portals.map((portal) => this.addOrUpdateArtifact(portal)));
    this.viewer.scene.requestRender();
  }

  public async addOrUpdateArtifact(data: PortalData): Promise<void> {
    if (!hasTarget(data) && !hasFragments(data)) {
      this.removeArtifactPrimitive(data.guid);
      this.viewer.scene.requestRender();
      return;
    }

    const existing = this.artifacts.get(data.guid);
    if (existing) {
      await this.updateArtifactPrimitives(existing, data);
      this.updateArtifactPositionSubscription(existing, data);
      existing.data = data;
    } else {
      await this.createAndStoreArtifact(data);
    }
    this.viewer.scene.requestRender();
  }

  public removeArtifact(guid: string): void {
    if (this.removeArtifactPrimitive(guid)) this.viewer.scene.requestRender();
  }

  public removeArtifactsInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.artifacts.forEach(({ data }, guid) => {
      const position = Cesium.Cartographic.fromDegrees(data.lngE6 / 1e6, data.latE6 / 1e6);
      if (Cesium.Rectangle.contains(viewRect, position)) toRemove.push(guid);
    });

    toRemove.forEach((guid) => this.removeArtifactPrimitive(guid));
    if (toRemove.length > 0) this.viewer.scene.requestRender();
  }

  private async createAndStoreArtifact(data: PortalData): Promise<void> {
    if (this.artifactsPendingCreation.has(data.guid)) return;

    this.artifactsPendingCreation.add(data.guid);
    try {
      const primitiveId = createPortalPrimitiveId(data.guid);
      const entityPosition = await this.entityPositionManager.getEntityPosition(data);
      const { targets, fragment } = this.createArtifactPrimitives(data, primitiveId, entityPosition);
      const artifact: PortalArtifact = {
        data,
        primitiveId,
        targets,
        fragment,
        positionCallback: (updatedPosition) => applyArtifactPosition(artifact, updatedPosition),
      };
      this.entityPositionManager.addPositionChangedCallback(data, artifact.positionCallback);
      this.artifacts.set(data.guid, artifact);
    } finally {
      this.artifactsPendingCreation.delete(data.guid);
    }
  }

  private createArtifactPrimitives(
    data: PortalData,
    primitiveId: PortalPrimitiveId,
    entityPosition: EntityPosition,
  ): Pick<PortalArtifact, "targets" | "fragment"> {
    const targetTeam = getTargetTeam(data);
    const targets = targetTeam
      ? createTargetPrimitives(
        this.getArtifactTargetLayer().pointPrimitives,
        primitiveId,
        entityPosition,
        targetTeam,
        this.currentTranslucencyByDistance,
      )
      : undefined;
    const fragment = hasFragments(data)
      ? this.getArtifactFragmentLayer().collection.add(createFragmentPrimitive(entityPosition))
      : undefined;
    return { targets, fragment };
  }

  private async updateArtifactPrimitives(artifact: PortalArtifact, data: PortalData): Promise<void> {
    this.removeArtifactPrimitiveGroup(artifact);
    const entityPosition = await this.entityPositionManager.getEntityPosition(data);
    const { targets, fragment } = this.createArtifactPrimitives(data, artifact.primitiveId, entityPosition);
    artifact.targets = targets;
    artifact.fragment = fragment;
  }

  private updateArtifactPositionSubscription(artifact: PortalArtifact, data: PortalData): void {
    if (artifact.data.latE6 === data.latE6 && artifact.data.lngE6 === data.lngE6) return;

    this.entityPositionManager.removePositionChangedCallback(artifact.data, artifact.positionCallback);
    this.entityPositionManager.addPositionChangedCallback(data, artifact.positionCallback);
  }

  private removeArtifactPrimitive(guid: string): boolean {
    const artifact = this.artifacts.get(guid);
    if (!artifact) {
      this.artifactsPendingCreation.delete(guid);
      return false;
    }

    this.removeArtifactPrimitiveGroup(artifact);
    this.entityPositionManager.removePositionChangedCallback(artifact.data, artifact.positionCallback);
    this.artifacts.delete(guid);
    this.artifactsPendingCreation.delete(guid);
    return true;
  }

  private removeArtifactPrimitiveGroup(artifact: PortalArtifact): void {
    if (artifact.targets) {
      const pointPrimitives = this.getArtifactTargetLayer().pointPrimitives;
      pointPrimitives.remove(artifact.targets.inner);
      pointPrimitives.remove(artifact.targets.innerOcclusion);
      pointPrimitives.remove(artifact.targets.outer);
      pointPrimitives.remove(artifact.targets.outerOcclusion);
      artifact.targets = undefined;
    }
    if (artifact.fragment) {
      this.getArtifactFragmentLayer().collection.remove(artifact.fragment);
      artifact.fragment = undefined;
    }
  }

  private getArtifactTargetLayer(): PrimitivesLayer {
    return this.layerManager.getOrCreatePrimitiveLayer(ARTIFACT_LAYER_ID);
  }

  private getArtifactFragmentLayer(): OverlayLayer {
    return this.layerManager.getOrCreateOverlayLayer(ARTIFACT_LAYER_ID, ARTIFACT_OVERLAY_Z_INDEX);
  }
}

function createTargetPrimitives(
  pointPrimitives: Cesium.PointPrimitiveCollection,
  primitiveId: PortalPrimitiveId,
  entityPosition: EntityPosition,
  team: Team,
  translucencyByDistance: Cesium.NearFarScalar,
): TargetPrimitives {
  const color = getTeamColor(team).withAlpha(TARGET_ALPHA);
  return {
    outer: addTargetPointPrimitive(
      pointPrimitives,
      primitiveId,
      entityPosition,
      color,
      TARGET_OUTER_PIXEL_SIZE,
      TARGET_OUTER_OUTLINE_WIDTH,
    ),
    outerOcclusion: addTargetOcclusionPointPrimitive(
      pointPrimitives,
      primitiveId,
      entityPosition,
      color,
      TARGET_OUTER_PIXEL_SIZE,
      TARGET_OUTER_OUTLINE_WIDTH,
      translucencyByDistance,
    ),
    inner: addTargetPointPrimitive(
      pointPrimitives,
      primitiveId,
      entityPosition,
      color,
      TARGET_INNER_PIXEL_SIZE,
      TARGET_INNER_OUTLINE_WIDTH,
    ),
    innerOcclusion: addTargetOcclusionPointPrimitive(
      pointPrimitives,
      primitiveId,
      entityPosition,
      color,
      TARGET_INNER_PIXEL_SIZE,
      TARGET_INNER_OUTLINE_WIDTH,
      translucencyByDistance,
    ),
  };
}

function addTargetPointPrimitive(
  pointPrimitives: Cesium.PointPrimitiveCollection,
  primitiveId: PortalPrimitiveId,
  entityPosition: EntityPosition,
  color: Cesium.Color,
  pixelSize: number,
  outlineWidth: number,
): Cesium.PointPrimitive {
  return pointPrimitives.add({
    id: primitiveId,
    position: entityPosition.position,
    show: !entityPosition.isFallbackPosition,
    pixelSize,
    color: Cesium.Color.TRANSPARENT,
    outlineColor: color,
    outlineWidth,
    scaleByDistance: createPortalNearFarScalar(),
    disableDepthTestDistance: getPortalDisableDepthTestDistance(),
  });
}

function addTargetOcclusionPointPrimitive(
  pointPrimitives: Cesium.PointPrimitiveCollection,
  primitiveId: PortalPrimitiveId,
  entityPosition: EntityPosition,
  color: Cesium.Color,
  pixelSize: number,
  outlineWidth: number,
  translucencyByDistance: Cesium.NearFarScalar,
): Cesium.PointPrimitive {
  return pointPrimitives.add({
    id: primitiveId,
    position: entityPosition.position,
    show: !entityPosition.isFallbackPosition,
    pixelSize,
    color: Cesium.Color.TRANSPARENT,
    outlineColor: color.withAlpha(PORTAL_OCCLUDED_ALPHA),
    outlineWidth,
    scaleByDistance: createPortalNearFarScalar(),
    translucencyByDistance,
    disableDepthTestDistance: PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
  });
}

function createFragmentPrimitive(entityPosition: EntityPosition): Cesium.Primitive {
  return new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.CylinderGeometry({
        length: FRAGMENT_LENGTH_METERS,
        topRadius: FRAGMENT_RADIUS_METERS,
        bottomRadius: 0,
        slices: 3,
        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(FRAGMENT_COLOR_WITH_ALPHA),
      },
    }),
    appearance: new Cesium.PerInstanceColorAppearance({
      closed: true,
      translucent: true,
      flat: false,
    }),
    modelMatrix: createFragmentModelMatrix(entityPosition.position),
    show: !entityPosition.isFallbackPosition,
    allowPicking: false,
    asynchronous: true,
    shadows: Cesium.ShadowMode.DISABLED,
  });
}

function createFragmentModelMatrix(position: Cesium.Cartesian3): Cesium.Matrix4 {
  const localFrame = Cesium.Transforms.eastNorthUpToFixedFrame(position);
  return Cesium.Matrix4.multiplyByTranslation(
    localFrame,
    new Cesium.Cartesian3(0, 0, FRAGMENT_CENTER_HEIGHT_METERS),
    new Cesium.Matrix4(),
  );
}

function applyArtifactPosition(artifact: PortalArtifact, entityPosition: EntityPosition): void {
  const show = !entityPosition.isFallbackPosition;
  if (artifact.targets) {
    artifact.targets.inner.position = entityPosition.position;
    artifact.targets.inner.show = show;
    artifact.targets.innerOcclusion.position = entityPosition.position;
    artifact.targets.innerOcclusion.show = show;
    artifact.targets.outer.position = entityPosition.position;
    artifact.targets.outer.show = show;
    artifact.targets.outerOcclusion.position = entityPosition.position;
    artifact.targets.outerOcclusion.show = show;
  }
  if (artifact.fragment) {
    artifact.fragment.modelMatrix = createFragmentModelMatrix(entityPosition.position);
    artifact.fragment.show = show;
  }
}

function getTargetTeam(data: PortalData): Team | undefined {
  const targets = Object.keys(data.artifactBrief?.target ?? {}).map((target) => target.toLowerCase());
  if (targets.includes("targetres")) return "RESISTANCE";
  if (targets.includes("targetenl")) return "ENLIGHTENED";
  return undefined;
}

function hasTarget(data: PortalData): boolean {
  return getTargetTeam(data) !== undefined;
}

function hasFragments(data: PortalData): boolean {
  return Object.keys(data.artifactBrief?.fragment ?? {}).length > 0
    || (data.artifactDetail?.fragments.length ?? 0) > 0;
}
