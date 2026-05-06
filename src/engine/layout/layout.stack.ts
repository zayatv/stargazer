import type { LayoutNode, Constraints } from './layout.types.ts';
import { SizeMode, Align, Justify, LayoutKind } from './layout.types.ts';
import { solveNode } from './layout.solver.ts';

export function solveStack(node: LayoutNode, constraints: Constraints): { width: number; height: number } {
  const pad = node.padding;
  const padH = pad.left + pad.right;
  const padV = pad.top + pad.bottom;

  const isFitW = node.widthMode === SizeMode.FitContent;
  const isFitH = node.heightMode === SizeMode.FitContent;

  let ownW = resolveSize(node.widthMode, node.widthValue, constraints.maxWidth);
  let ownH = resolveSize(node.heightMode, node.heightValue, constraints.maxHeight);

  const contentMaxW = isFitW ? constraints.maxWidth - padH : Math.max(0, ownW - padH);
  const contentMaxH = isFitH ? constraints.maxHeight - padV : Math.max(0, ownH - padV);

  const childConstraints: Constraints = {
    minWidth: 0,
    maxWidth: Math.max(0, contentMaxW),
    minHeight: 0,
    maxHeight: Math.max(0, contentMaxH),
  };

  let maxChildW = 0;
  let maxChildH = 0;

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];

    if (!child.visible) continue;
    if (child.layoutKind === LayoutKind.Absolute) continue;

    const childMarginH = child.margin.left + child.margin.right;
    const childMarginV = child.margin.top + child.margin.bottom;

    const marginConstraints: Constraints = {
      minWidth: 0,
      maxWidth: Math.max(0, childConstraints.maxWidth - childMarginH),
      minHeight: 0,
      maxHeight: Math.max(0, childConstraints.maxHeight - childMarginV),
    };

    const size = solveNode(child, marginConstraints);
    const totalW = size.width + childMarginH;
    const totalH = size.height + childMarginV;

    if (totalW > maxChildW) maxChildW = totalW;
    if (totalH > maxChildH) maxChildH = totalH;
  }

  if (isFitW) ownW = maxChildW + padH;
  if (isFitH) ownH = maxChildH + padV;

  ownW = clamp(ownW, constraints.minWidth, constraints.maxWidth);
  ownH = clamp(ownH, constraints.minHeight, constraints.maxHeight);

  const contentW = Math.max(0, ownW - padH);
  const contentH = Math.max(0, ownH - padV);

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];

    if (!child.visible) continue;
    if (child.layoutKind === LayoutKind.Absolute) continue;

    const cw = child.computed.width;
    const ch = child.computed.height;

    child.computed.x = pad.left + child.margin.left + alignOnAxis(node.justify, contentW, cw + child.margin.left + child.margin.right);

    const align = child.alignSelf !== -1 ? child.alignSelf : node.alignItems;

    child.computed.y = pad.top + child.margin.top + alignCross(align, contentH, ch + child.margin.top + child.margin.bottom);
  }

  node.computed.width = ownW;
  node.computed.height = ownH;

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];

    if (!child.visible || child.layoutKind !== LayoutKind.Absolute) continue;

    solveNode(child, {
      minWidth: 0,
      maxWidth: contentW,
      minHeight: 0,
      maxHeight: contentH,
    });
  }

  return { width: ownW, height: ownH };
}

function alignOnAxis(justify: number, containerSize: number, childSize: number): number {
  switch (justify) {
    case Justify.Center: return (containerSize - childSize) / 2;
    case Justify.End: return containerSize - childSize;
    default: return 0;
  }
}

function alignCross(align: number, containerSize: number, childSize: number): number {
  switch (align) {
    case Align.Center: return (containerSize - childSize) / 2;
    case Align.End: return containerSize - childSize;
    default: return 0;
  }
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
