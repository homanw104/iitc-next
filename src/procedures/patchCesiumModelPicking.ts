/**
 * Runtime patch for Cesium model picking performance.
 *
 * Cesium 1.142 still uses the slow pickModel path discussed in:
 * https://github.com/CesiumGS/cesium/issues/11814
 *
 * The patch keeps model vertices in model space and transforms the pick ray once
 * per instance, instead of transforming every triangle vertex for every pick.
 */

import { safeWindow } from "../utils/window.ts";

type CesiumType = typeof import("cesium");
type BoundingSphereInstance = InstanceType<CesiumType["BoundingSphere"]>;
type Cartesian3Instance = InstanceType<CesiumType["Cartesian3"]>;
type EllipsoidInstance = InstanceType<CesiumType["Ellipsoid"]>;
type Matrix4Instance = InstanceType<CesiumType["Matrix4"]>;
type RayInstance = InstanceType<CesiumType["Ray"]>;
type NumberArray = ArrayLike<number>;

interface CesiumModelPickingRuntime {
  AttributeType: {
    getNumberOfComponents(type: unknown): number;
  };
  BoundingSphere: CesiumType["BoundingSphere"];
  Cartesian3: CesiumType["Cartesian3"];
  Matrix4: CesiumType["Matrix4"];
  Model: CesiumType["Model"];
  Ray: CesiumType["Ray"];
  SceneMode: CesiumType["SceneMode"];
  IntersectionTests: {
    raySphere(ray: RayInstance, sphere: BoundingSphereInstance, result?: object): object | undefined;
    rayTriangleParametric(
      ray: RayInstance,
      p0: Cartesian3Instance,
      p1: Cartesian3Instance,
      p2: Cartesian3Instance,
      cullBackFaces?: boolean,
    ): number | undefined;
  };
  ModelReader: {
    forEachPrimitive(
      model: CesiumModel,
      options: object,
      callback: (
        runtimePrimitive: RuntimePrimitive,
        primitive: ModelPrimitive,
        instances: ModelInstance[],
        computedModelMatrix: Matrix4Instance,
      ) => void,
    ): void;
    readAttributeAsTypedArray(attribute: ModelAttribute): NumberArray;
    readIndicesAsTypedArray(indices: ModelIndices): NumberArray;
  };
  ModelUtility: {
    getAttributeBySemantic(primitive: ModelPrimitive, semantic: unknown): ModelAttribute | undefined;
  };
  VertexAttributeSemantic: {
    POSITION: unknown;
  };
}

interface CesiumModel {
  _ready?: boolean;
  backFaceCulling?: boolean;
  sceneGraph?: unknown;
}

interface RuntimePrimitive {
  boundingSphere?: BoundingSphereInstance;
}

interface ModelPrimitive {
  indices?: ModelIndices;
}

interface ModelAttribute {
  type: unknown;
}

type ModelIndices = object;

interface ModelInstance {
  transform: Matrix4Instance;
}

interface TransformedRay {
  ray: RayInstance;
  transform: Matrix4Instance;
}

interface PickScratch {
  boundingSphere: BoundingSphereInstance;
  inverseTransforms: Matrix4Instance[];
  localHit: Cartesian3Instance;
  positions: [Cartesian3Instance, Cartesian3Instance, Cartesian3Instance];
  rayToHit: Cartesian3Instance;
  sphereIntersection: object;
  transformedRays: TransformedRay[];
  worldHit: Cartesian3Instance;
}

type ModelPickFunction = (
  this: CesiumModel,
  ray: RayInstance,
  frameState: FrameState,
  verticalExaggeration?: number,
  relativeHeight?: number,
  ellipsoidOrResult?: EllipsoidInstance | Cartesian3Instance,
  result?: Cartesian3Instance,
) => Cartesian3Instance | undefined;

interface FrameState {
  mode: unknown;
}

type WindowWithCesium = Window & typeof globalThis & {
  Cesium?: CesiumType;
};

// Master switch: true uses the patched model picker; false uses Cesium's original picker.
const ENABLE_MODEL_PICKING_FAST_PATH = true;

const MODEL_PICKING_PATCHED = Symbol.for("iitc-next.cesium.model-picking-patched");
const EMPTY_OBJECT = {};
const attributeTypedArrayCache = new WeakMap<object, NumberArray>();
const indexTypedArrayCache = new WeakMap<object, NumberArray>();

export default function patchCesiumModelPicking(): void {
  const targetWindow = safeWindow as WindowWithCesium;
  const Cesium = targetWindow.Cesium as CesiumModelPickingRuntime | undefined;
  if (!Cesium?.Model?.prototype) return;

  const modelPrototype = Cesium.Model.prototype as unknown as {
    [MODEL_PICKING_PATCHED]?: boolean;
    pick: ModelPickFunction;
  };
  if (modelPrototype[MODEL_PICKING_PATCHED]) return;
  if (typeof modelPrototype.pick !== "function") return;

  const originalPick = modelPrototype.pick;
  const scratch = createPickScratch(Cesium);

  modelPrototype.pick = function patchedModelPick(
    this: CesiumModel,
    ray,
    frameState,
    verticalExaggeration,
    relativeHeight,
    ellipsoidOrResult,
    result,
  ) {
    if (!ENABLE_MODEL_PICKING_FAST_PATH) {
      return originalPick.call(this, ray, frameState, verticalExaggeration, relativeHeight, ellipsoidOrResult, result);
    }

    if ((verticalExaggeration ?? 1.0) !== 1.0 || frameState.mode !== Cesium.SceneMode.SCENE3D) {
      return originalPick.call(this, ray, frameState, verticalExaggeration, relativeHeight, ellipsoidOrResult, result);
    }

    try {
      return pickModelWithTransformedRays(
        Cesium,
        scratch,
        this,
        ray,
        getPickResult(ellipsoidOrResult, result),
      ) ?? undefined;
    } catch {
      return originalPick.call(this, ray, frameState, verticalExaggeration, relativeHeight, ellipsoidOrResult, result);
    }
  };

  modelPrototype[MODEL_PICKING_PATCHED] = true;
}

function pickModelWithTransformedRays(
  Cesium: CesiumModelPickingRuntime,
  scratch: PickScratch,
  model: CesiumModel,
  ray: RayInstance,
  result?: Cartesian3Instance,
): Cartesian3Instance | undefined {
  if (!model._ready || !model.sceneGraph) return undefined;

  let minT = Number.MAX_VALUE;
  const positionScratch = scratch.positions;

  Cesium.ModelReader.forEachPrimitive(
    model,
    EMPTY_OBJECT,
    (runtimePrimitive, primitive, instances, computedModelMatrix) => {
      if (runtimePrimitive.boundingSphere && instances.length === 1) {
        const boundingSphere = Cesium.BoundingSphere.transform(
          runtimePrimitive.boundingSphere,
          computedModelMatrix,
          scratch.boundingSphere,
        );
        const boundsIntersection = Cesium.IntersectionTests.raySphere(
          ray,
          boundingSphere,
          scratch.sphereIntersection,
        );
        if (!boundsIntersection) {
          return;
        }
      }

      if (!primitive.indices) return;

      const positionAttribute = Cesium.ModelUtility.getAttributeBySemantic(
        primitive,
        Cesium.VertexAttributeSemantic.POSITION,
      );
      if (!positionAttribute) return;

      const vertices = getCachedAttributeTypedArray(Cesium, positionAttribute);
      const indices = getCachedIndexTypedArray(Cesium, primitive.indices);
      const positionComponents = Cesium.AttributeType.getNumberOfComponents(positionAttribute.type);
      const transformedRays = updateTransformedRays(Cesium, scratch, ray, instances);

      for (let i = 0; i < indices.length; i += 3) {
        readPosition(vertices, indices[i], positionComponents, positionScratch[0]);
        readPosition(vertices, indices[i + 1], positionComponents, positionScratch[1]);
        readPosition(vertices, indices[i + 2], positionComponents, positionScratch[2]);

        for (const transformedRay of transformedRays) {
          const localT = Cesium.IntersectionTests.rayTriangleParametric(
            transformedRay.ray,
            positionScratch[0],
            positionScratch[1],
            positionScratch[2],
            model.backFaceCulling ?? true,
          );
          if (localT === undefined || localT < 0.0) continue;

          Cesium.Ray.getPoint(transformedRay.ray, localT, scratch.localHit);
          Cesium.Matrix4.multiplyByPoint(transformedRay.transform, scratch.localHit, scratch.worldHit);
          Cesium.Cartesian3.subtract(scratch.worldHit, ray.origin, scratch.rayToHit);

          const worldT = Cesium.Cartesian3.dot(scratch.rayToHit, ray.direction);
          if (worldT >= 0.0 && worldT < minT) minT = worldT;
        }
      }
    },
  );

  if (minT === Number.MAX_VALUE) return undefined;
  return Cesium.Ray.getPoint(ray, minT, result);
}

function getCachedAttributeTypedArray(
  Cesium: CesiumModelPickingRuntime,
  attribute: ModelAttribute,
): NumberArray {
  const cached = attributeTypedArrayCache.get(attribute);
  if (cached) return cached;

  const typedArray = Cesium.ModelReader.readAttributeAsTypedArray(attribute);
  attributeTypedArrayCache.set(attribute, typedArray);
  return typedArray;
}

function getCachedIndexTypedArray(
  Cesium: CesiumModelPickingRuntime,
  indices: ModelIndices,
): NumberArray {
  const cached = indexTypedArrayCache.get(indices);
  if (cached) return cached;

  const typedArray = Cesium.ModelReader.readIndicesAsTypedArray(indices);
  indexTypedArrayCache.set(indices, typedArray);
  return typedArray;
}

function createPickScratch(Cesium: CesiumModelPickingRuntime): PickScratch {
  return {
    boundingSphere: new Cesium.BoundingSphere(),
    inverseTransforms: [],
    localHit: new Cesium.Cartesian3(),
    positions: [
      new Cesium.Cartesian3(),
      new Cesium.Cartesian3(),
      new Cesium.Cartesian3(),
    ],
    rayToHit: new Cesium.Cartesian3(),
    sphereIntersection: {},
    transformedRays: [],
    worldHit: new Cesium.Cartesian3(),
  };
}

function updateTransformedRays(
  Cesium: CesiumModelPickingRuntime,
  scratch: PickScratch,
  ray: RayInstance,
  instances: ModelInstance[],
): TransformedRay[] {
  const transformedRays = scratch.transformedRays;
  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    const inverseTransform = scratch.inverseTransforms[i] ?? new Cesium.Matrix4();
    scratch.inverseTransforms[i] = inverseTransform;

    let transformedRay = transformedRays[i];
    if (!transformedRay) {
      transformedRay = {
        ray: new Cesium.Ray(),
        transform: instance.transform,
      };
      transformedRays[i] = transformedRay;
    }

    Cesium.Matrix4.inverse(instance.transform, inverseTransform);
    Cesium.Matrix4.multiplyByPoint(inverseTransform, ray.origin, transformedRay.ray.origin);
    Cesium.Matrix4.multiplyByPointAsVector(inverseTransform, ray.direction, transformedRay.ray.direction);
    Cesium.Cartesian3.normalize(transformedRay.ray.direction, transformedRay.ray.direction);
    transformedRay.transform = instance.transform;
  }

  transformedRays.length = instances.length;
  return transformedRays;
}

function readPosition(
  vertices: NumberArray,
  index: number,
  componentCount: number,
  result: Cartesian3Instance,
): Cartesian3Instance {
  const offset = index * componentCount;
  result.x = vertices[offset];
  result.y = vertices[offset + 1];
  result.z = vertices[offset + 2];
  return result;
}

function getPickResult(
  ellipsoidOrResult?: EllipsoidInstance | Cartesian3Instance,
  result?: Cartesian3Instance,
): Cartesian3Instance | undefined {
  if (isEllipsoid(ellipsoidOrResult)) return result;
  return ellipsoidOrResult;
}

function isEllipsoid(value: unknown): value is EllipsoidInstance {
  return !!value &&
    typeof value === "object" &&
    "maximumRadius" in value &&
    "cartographicToCartesian" in value;
}
