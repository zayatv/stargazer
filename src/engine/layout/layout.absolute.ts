import type { LayoutNode, Constraints } from './layout.types.ts';
import { LayoutKind } from './layout.types.ts';
import { solveNode } from './layout.solver.ts';

export function solveAbsolute(node: LayoutNode, constraints: Constraints): { width: number; height: number } {
  const pad = node.padding;
  const padH = pad.left + pad.right;
  const padV = pad.top + pad.bottom;

  let width = resolveSize(node.widthMode, node.widthValue, constraints.maxWidth);
  let height = resolveSize(node.heightMode, node.heightValue, constraints.maxHeight);

  if (node.absLeft !== null && node.absRight !== null) {
    width = constraints.maxWidth - node.absLeft - node.absRight;
  }

  if (node.absTop !== null && node.absBottom !== null) {
    height = constraints.maxHeight - node.absTop - node.absBottom;
  }

  width = clamp(width, constraints.minWidth, constraints.maxWidth);
  height = clamp(height, constraints.minHeight, constraints.maxHeight);

  const x = node.absLeft ?? (node.absRight !== null ? constraints.maxWidth - width - node.absRight : 0);
  const y = node.absTop ?? (node.absBottom !== null ? constraints.maxHeight - height - node.absBottom : 0);

  node.computed.x = x;
  node.computed.y = y;
  node.computed.width = width;
  node.computed.height = height;

  const contentW = width - padH;
  const contentH = height - padV;
  const childConstraints: Constraints = {
    minWidth: 0,
    maxWidth: Math.max(0, contentW),
    minHeight: 0,
    maxHeight: Math.max(0, contentH),
  };

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];

    if (!child.visible) continue;

    solveNode(child, childConstraints);

    if (child.layoutKind !== LayoutKind.Absolute) {
      applyAbsoluteHints(child, width, height, pad.left, pad.top);
    }
  }

  return { width, height };
}

function applyAbsoluteHints(
  child: LayoutNode,
  parentWidth: number,
  parentHeight: number,
  padLeft: number,
  padTop: number,
): void {
  const childW = child.computed.width;
  const childH = child.computed.height;
  let positionedX = false;
  let positionedY = false;

  if (child.absLeft != null) {
    child.computed.x = child.absLeft;
    positionedX = true;
  } else if (child.absRight != null) {
    child.computed.x = parentWidth - childW - child.absRight;
    positionedX = true;
  }

  if (child.absTop != null) {
    child.computed.y = child.absTop;
    positionedY = true;
  } else if (child.absBottom != null) {
    child.computed.y = parentHeight - childH - child.absBottom;
    positionedY = true;
  }

  if (!positionedX) child.computed.x = padLeft;
  if (!positionedY) child.computed.y = padTop;
}

function resolveSize(mode: number, value: number, maxAvailable: number): number {
  switch (mode) {
    case 0: return value;
    case 1: return maxAvailable * value;
    case 3: return maxAvailable;
    default: return 0;
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
