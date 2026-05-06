import type { LayoutRoot, LayoutNode } from './layout.types.ts';

export function computeAbsolutePositions(root: LayoutRoot): void {
  computeAbs(root.root, 0, 0);
}

function computeAbs(node: LayoutNode, parentAbsX: number, parentAbsY: number): void {
  if (!node.visible) return;

  node.computed.absX = parentAbsX + node.computed.x;
  node.computed.absY = parentAbsY + node.computed.y;

  const baseX = node.computed.absX;
  const baseY = node.computed.absY;

  for (let i = 0; i < node.children.length; i++) {
    computeAbs(node.children[i], baseX, baseY);
  }
}

export function collectRenderableNodes(root: LayoutRoot, out: LayoutNode[]): void {
  collectNodes(root.root, out);
}

function collectNodes(node: LayoutNode, out: LayoutNode[]): void {
  if (!node.visible) return;

  if (node.onRender !== null) {
    out.push(node);
  }

  for (let i = 0; i < node.children.length; i++) {
    collectNodes(node.children[i], out);
  }
}

export function renderNode(ctx: CanvasRenderingContext2D, node: LayoutNode): void {
  ctx.save();
  node.onRender!(ctx, node);
  ctx.restore();
}

export function renderLayoutTree(ctx: CanvasRenderingContext2D, root: LayoutRoot): void {
  computeAbsolutePositions(root);
  renderTreeNode(ctx, root.root);
}

function renderTreeNode(ctx: CanvasRenderingContext2D, node: LayoutNode): void {
  if (!node.visible) return;

  if (node.onRender !== null) {
    ctx.save();
    node.onRender(ctx, node);
    ctx.restore();
  }

  for (let i = 0; i < node.children.length; i++) {
    renderTreeNode(ctx, node.children[i]);
  }
}
