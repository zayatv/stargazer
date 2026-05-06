import type { LayoutNode, Constraints } from './layout.types.ts';
import { Direction, SizeMode, Justify, Align, LayoutKind } from './layout.types.ts';
import { solveNode } from './layout.solver.ts';

function solveAbsoluteChildren(children: LayoutNode[], contentMaxW: number, contentMaxH: number): void {
  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (!child.visible || child.layoutKind !== LayoutKind.Absolute) continue;

    solveNode(child, {
      minWidth: 0,
      maxWidth: contentMaxW,
      minHeight: 0,
      maxHeight: contentMaxH,
    });
  }
}

export function solveFlex(node: LayoutNode, constraints: Constraints): { width: number; height: number } {
  const pad = node.padding;
  const padH = pad.left + pad.right;
  const padV = pad.top + pad.bottom;
  const isRow = node.direction === Direction.Row;
  const isFitW = node.widthMode === SizeMode.FitContent;
  const isFitH = node.heightMode === SizeMode.FitContent;

  let ownW = resolveSize(node.widthMode, node.widthValue, constraints.maxWidth);
  let ownH = resolveSize(node.heightMode, node.heightValue, constraints.maxHeight);

  const contentMaxW = isFitW ? constraints.maxWidth - padH : Math.max(0, ownW - padH);
  const contentMaxH = isFitH ? constraints.maxHeight - padV : Math.max(0, ownH - padV);

  const kids: LayoutNode[] = [];

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (!child.visible) continue;
    if (child.layoutKind === LayoutKind.Absolute) continue;
    kids.push(child);
  }

  if (kids.length === 0) {
    if (isFitW) ownW = padH;
    if (isFitH) ownH = padV;

    ownW = clamp(ownW, constraints.minWidth, constraints.maxWidth);
    ownH = clamp(ownH, constraints.minHeight, constraints.maxHeight);

    node.computed.width = ownW;
    node.computed.height = ownH;

    solveAbsoluteChildren(node.children, Math.max(0, ownW - padH), Math.max(0, ownH - padV));

    return { width: ownW, height: ownH };
  }

  const mainMax = isRow ? contentMaxW : contentMaxH;
  const crossMax = isRow ? contentMaxH : contentMaxW;
  const totalGap = node.gap * (kids.length - 1);
  const baseSizes: number[] = [];
  const crossSizes: number[] = [];
  const marginMains: number[] = [];
  const marginCrosses: number[] = [];

  let totalBase = 0;
  let totalGrow = 0;
  let totalShrink = 0;

  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    const mainMode = isRow ? child.widthMode : child.heightMode;
    const mainValue = isRow ? child.widthValue : child.heightValue;
    const crossMode = isRow ? child.heightMode : child.widthMode;
    const crossValue = isRow ? child.heightValue : child.widthValue;
    const marginMain = isRow ? child.margin.left + child.margin.right : child.margin.top + child.margin.bottom;
    const marginCross = isRow ? child.margin.top + child.margin.bottom : child.margin.left + child.margin.right;

    marginMains.push(marginMain);
    marginCrosses.push(marginCross);

    let baseMain: number;

    if (mainMode === SizeMode.Fill) {
      baseMain = 0;

      if (child.flexGrow === 0) child.flexGrow = 1;
    } else if (mainMode === SizeMode.Fixed) {
      baseMain = mainValue;
    } else if (mainMode === SizeMode.Percent) {
      baseMain = mainMax * mainValue;
    } else {
      const looseConstraints = makeChildConstraints(isRow, mainMax, crossMax, crossMode, crossValue, marginMain, marginCross,);
      const measured = solveNode(child, looseConstraints);

      baseMain = isRow ? measured.width : measured.height;

      crossSizes.push(isRow ? measured.height : measured.width);
      baseSizes.push(baseMain);

      totalBase += baseMain + marginMain;
      totalGrow += child.flexGrow;
      totalShrink += child.flexShrink;

      continue;
    }

    baseSizes.push(baseMain);
    crossSizes.push(0);

    totalBase += baseMain + marginMain;
    totalGrow += child.flexGrow;
    totalShrink += child.flexShrink;
  }

  const remaining = mainMax - totalBase - totalGap;
  const finalMains: number[] = [];

  for (let i = 0; i < kids.length; i++) {
    let size = baseSizes[i];

    if (remaining > 0 && totalGrow > 0 && kids[i].flexGrow > 0) {
      const parentFitOnMain = isRow ? isFitW : isFitH;

      if (!parentFitOnMain) {
        size += (kids[i].flexGrow / totalGrow) * remaining;
      }
    } else if (remaining < 0 && totalShrink > 0 && kids[i].flexShrink > 0) {
      size += (kids[i].flexShrink / totalShrink) * remaining;
    }

    size = Math.max(0, size);

    finalMains.push(size);
  }

  let maxCross = 0;

  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    const mainSize = finalMains[i];
    const crossMode = isRow ? child.heightMode : child.widthMode;
    const crossValue = isRow ? child.heightValue : child.widthValue;
    const mc = marginCrosses[i];

    let crossConstraintMax = Math.max(0, crossMax - mc);

    if (crossMode === SizeMode.Fixed) {
      crossConstraintMax = crossValue;
    } else if (crossMode === SizeMode.Percent) {
      crossConstraintMax = crossMax * crossValue;
    }

    const align = child.alignSelf !== -1 ? child.alignSelf : node.alignItems;

    if (align === Align.Stretch && crossMode === SizeMode.FitContent) {
      crossConstraintMax = Math.max(0, crossMax - mc);
    }

    const childConstraints: Constraints = isRow
      ? { minWidth: mainSize, maxWidth: mainSize, minHeight: 0, maxHeight: crossConstraintMax }
      : { minWidth: 0, maxWidth: crossConstraintMax, minHeight: mainSize, maxHeight: mainSize };
    const measured = solveNode(child, childConstraints);
    const childCross = (isRow ? measured.height : measured.width) + mc;

    crossSizes[i] = isRow ? measured.height : measured.width;

    if (childCross > maxCross) maxCross = childCross;
  }

  const totalMainUsed = sum(finalMains) + sum(marginMains) + totalGap;

  if (isRow) {
    if (isFitW) ownW = totalMainUsed + padH;
    if (isFitH) ownH = maxCross + padV;
  } else {
    if (isFitH) ownH = totalMainUsed + padV;
    if (isFitW) ownW = maxCross + padH;
  }

  ownW = clamp(ownW, constraints.minWidth, constraints.maxWidth);
  ownH = clamp(ownH, constraints.minHeight, constraints.maxHeight);

  const contentW = Math.max(0, ownW - padH);
  const contentH = Math.max(0, ownH - padV);
  const mainSize = isRow ? contentW : contentH;
  const crossSize = isRow ? contentH : contentW;

  const totalFinalMain = sum(finalMains) + sum(marginMains) + totalGap;
  const freeSpace = Math.max(0, mainSize - totalFinalMain);
  let mainPos = getJustifyStart(node.justify, freeSpace, kids.length);
  const spacing = getJustifySpacing(node.justify, freeSpace, kids.length);

  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    const mc = marginCrosses[i];
    const childMain = finalMains[i];
    const childCross = crossSizes[i];
    const marginMainStart = isRow ? child.margin.left : child.margin.top;
    const marginCrossStart = isRow ? child.margin.top : child.margin.left;
    const align = child.alignSelf !== -1 ? child.alignSelf : node.alignItems;
    const crossPos = marginCrossStart + alignCross(align, crossSize - mc, childCross);
    const mainOffset = mainPos + marginMainStart;

    if (isRow) {
      child.computed.x = pad.left + mainOffset;
      child.computed.y = pad.top + crossPos;
    } else {
      child.computed.x = pad.left + crossPos;
      child.computed.y = pad.top + mainOffset;
    }

    mainPos += marginMainStart + childMain + (isRow ? child.margin.right : child.margin.bottom) + node.gap + spacing;
  }

  node.computed.width = ownW;
  node.computed.height = ownH;

  solveAbsoluteChildren(node.children, contentW, contentH);

  return { width: ownW, height: ownH };
}

function makeChildConstraints(isRow: boolean, mainMax: number, crossMax: number, crossMode: number, crossValue: number, marginMain: number, marginCross: number): Constraints {
  let crossConstraint = Math.max(0, crossMax - marginCross);

  if (crossMode === SizeMode.Fixed) crossConstraint = crossValue;
  else if (crossMode === SizeMode.Percent) crossConstraint = crossMax * crossValue;

  return isRow
    ? { minWidth: 0, maxWidth: Math.max(0, mainMax - marginMain), minHeight: 0, maxHeight: crossConstraint }
    : { minWidth: 0, maxWidth: crossConstraint, minHeight: 0, maxHeight: Math.max(0, mainMax - marginMain) };
}

function getJustifyStart(justify: number, freeSpace: number, count: number): number {
  switch (justify) {
    case Justify.Center: return freeSpace / 2;
    case Justify.End: return freeSpace;
    case Justify.SpaceAround: return count > 0 ? freeSpace / count / 2 : 0;
    case Justify.SpaceEvenly: return count > 0 ? freeSpace / (count + 1) : 0;
    default: return 0;
  }
}

function getJustifySpacing(justify: number, freeSpace: number, count: number): number {
  if (count <= 1) return 0;

  switch (justify) {
    case Justify.SpaceBetween: return freeSpace / (count - 1);
    case Justify.SpaceAround: return freeSpace / count;
    case Justify.SpaceEvenly: return freeSpace / (count + 1);
    default: return 0;
  }
}

function alignCross(align: number, containerSize: number, childSize: number): number {
  switch (align) {
    case Align.Center: return (containerSize - childSize) / 2;
    case Align.End: return containerSize - childSize;
    case Align.Stretch: return 0;
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

function sum(arr: number[]): number {
  let s = 0;

  for (let i = 0; i < arr.length; i++) s += arr[i];

  return s;
}
