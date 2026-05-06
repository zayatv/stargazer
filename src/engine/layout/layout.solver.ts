import type { LayoutNode, LayoutRoot, Constraints } from './layout.types.ts';
import { LayoutKind, SizeMode } from './layout.types.ts';

let _solveFlex: typeof import('./layout.flex.ts').solveFlex;
let _solveStack: typeof import('./layout.stack.ts').solveStack;
let _solveAbsolute: typeof import('./layout.absolute.ts').solveAbsolute;

export function registerFlexSolver(fn: typeof _solveFlex): void { _solveFlex = fn; }
export function registerStackSolver(fn: typeof _solveStack): void { _solveStack = fn; }
export function registerAbsoluteSolver(fn: typeof _solveAbsolute): void { _solveAbsolute = fn; }

export function solveNode(
  node: LayoutNode,
  constraints: Constraints,
): { width: number; height: number } {
  if (!node.visible) {
    return { width: 0, height: 0 };
  }

  if (!node.dirty) {
    return { width: node.computed.width, height: node.computed.height };
  }

  if (node.measure !== null && node.children.length === 0) {
    return solveMeasured(node, constraints);
  }

  let result: { width: number; height: number };

  switch (node.layoutKind) {
    case LayoutKind.Stack:
      result = _solveStack(node, constraints);
      break;
    case LayoutKind.Absolute:
      result = _solveAbsolute(node, constraints);
      break;
    case LayoutKind.Flex:
    default:
      result = _solveFlex(node, constraints);
      break;
  }

  return result;
}

function solveMeasured(node: LayoutNode, constraints: Constraints): { width: number; height: number } {
  const pad = node.padding;
  const padH = pad.left + pad.right;
  const padV = pad.top + pad.bottom;

  let width: number;
  let height: number;

  if (node.widthMode === SizeMode.FitContent || node.heightMode === SizeMode.FitContent) {
    const intrinsic = node.measure!(_currentCtx!);

    width = node.widthMode === SizeMode.FitContent ? intrinsic.width + padH : resolveSize(node.widthMode, node.widthValue, constraints.maxWidth);
    height = node.heightMode === SizeMode.FitContent ? intrinsic.height + padV : resolveSize(node.heightMode, node.heightValue, constraints.maxHeight);
  } else {
    width = resolveSize(node.widthMode, node.widthValue, constraints.maxWidth);
    height = resolveSize(node.heightMode, node.heightValue, constraints.maxHeight);
  }

  width = clamp(width, constraints.minWidth, constraints.maxWidth);
  height = clamp(height, constraints.minHeight, constraints.maxHeight);

  node.computed.width = width;
  node.computed.height = height;

  return { width, height };
}

let _currentCtx: CanvasRenderingContext2D | null = null;

export function solveLayout(root: LayoutRoot): void {
  if (!root.dirty) return;

  _currentCtx = root._ctx;

  const rootNode = root.root;
  const constraints: Constraints = {
    minWidth: rootNode.widthValue,
    maxWidth: rootNode.widthValue,
    minHeight: rootNode.heightValue,
    maxHeight: rootNode.heightValue,
  };

  solveNode(rootNode, constraints);
  clearDirty(rootNode);

  root.dirty = false;
}

function clearDirty(node: LayoutNode): void {
  node.dirty = false;

  for (let i = 0; i < node.children.length; i++) {
    clearDirty(node.children[i]);
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
