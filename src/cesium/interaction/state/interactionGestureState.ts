/**
 * Shared mutable gesture state used across touch, pinch, and portal interactions.
 */

export interface InteractionGestureState {
  pendingSingleTapTime: number | null;
  isDuringTheTap: boolean;
  hasJustMoved: boolean;
  hasJustDoubleTapped: boolean;
  isPinching: boolean;
  hasJustPinched: boolean;
  portalSelectionCancellationVersion: number;
  momentumRequestId: number | null;
}

export function createInteractionGestureState(): InteractionGestureState {
  return {
    pendingSingleTapTime: null,
    hasJustMoved: false,
    isDuringTheTap: false,
    hasJustDoubleTapped: false,
    isPinching: false,
    hasJustPinched: false,
    portalSelectionCancellationVersion: 0,
    momentumRequestId: null,
  };
}
