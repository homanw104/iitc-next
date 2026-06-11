/**
 * Shared mutable gesture state used across touch, pinch, and portal interactions.
 */

export interface InteractionGestureState {
  lastTapTime: number;
  isDuringTheTap: boolean;
  hasJustDoubleTapped: boolean;
  isPinching: boolean;
  hasJustPinched: boolean;
  momentumRequestId: number | null;
}

export function createInteractionGestureState(): InteractionGestureState {
  return {
    lastTapTime: 0,
    isDuringTheTap: false,
    hasJustDoubleTapped: false,
    isPinching: false,
    hasJustPinched: false,
    momentumRequestId: null,
  };
}
