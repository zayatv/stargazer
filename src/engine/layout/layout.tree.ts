import type { LayoutNode, LayoutRoot } from './layout.types.ts';
import { Direction, Justify, Align, SizeMode, LayoutKind } from './layout.types.ts';

function makeEdges(): { top: number; right: number; bottom: number; left: number } {
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

function makeComputed(): { x: number; y: number; width: number; height: number; absX: number; absY: number } {
  return { x: 0, y: 0, width: 0, height: 0, absX: 0, absY: 0 };
}

function makeNode(id: number, debugName: string): LayoutNode {
  return {
    id,
    entityId: -1,
    debugName,
    parent: null,
    children: [],
    depth: 0,
    layoutKind: LayoutKind.Flex,
    direction: Direction.Column,
    justify: Justify.Start,
    alignItems: Align.Start,
    alignSelf: -1,
    gap: 0,
    flexGrow: 0,
    flexShrink: 1,
    widthMode: SizeMode.FitContent,
    heightMode: SizeMode.FitContent,
    widthValue: 0,
    heightValue: 0,
    padding: makeEdges(),
    margin: makeEdges(),
    absLeft: null,
    absTop: null,
    absRight: null,
    absBottom: null,
    layer: null,
    order: null,
    dirty: true,
    computed: makeComputed(),
    onRender: null,
    measure: null,
    visible: true,
  };
}

export function createLayoutRoot(width: number, height: number): LayoutRoot {
  const root = makeNode(0, 'root');

  root.widthMode = SizeMode.Fixed;
  root.heightMode = SizeMode.Fixed;
  root.widthValue = width;
  root.heightValue = height;
  root.layer = 0;
  root.order = 0;

  const orientation = width < height ? 'portrait' : 'landscape';
  return { root, dirty: true, orientation, orientationChanged: false, _nextId: 1, _ctx: null };
}

export function createNode(root: LayoutRoot, debugName = ''): LayoutNode {
  return makeNode(root._nextId++, debugName);
}

export function markDirty(root: LayoutRoot, node: LayoutNode): void {
  let current: LayoutNode | null = node;

  while (current !== null) {
    if (current.dirty) break;

    current.dirty = true;
    current = current.parent;
  }

  root.dirty = true;
}

export function markDirtySubtree(node: LayoutNode): void {
  node.dirty = true;

  for (let i = 0; i < node.children.length; i++) {
    markDirtySubtree(node.children[i]);
  }
}

function updateDepth(node: LayoutNode, depth: number): void {
  node.depth = depth;

  for (let i = 0; i < node.children.length; i++) {
    updateDepth(node.children[i], depth + 1);
  }
}

export function appendChild(root: LayoutRoot, parent: LayoutNode, child: LayoutNode): void {
  if (child.parent !== null) {
    removeChild(root, child);
  }

  child.parent = parent;
  parent.children.push(child);

  updateDepth(child, parent.depth + 1);
  markDirty(root, parent);
}

export function insertChild(root: LayoutRoot, parent: LayoutNode, child: LayoutNode, index: number): void {
  if (child.parent !== null) {
    removeChild(root, child);
  }

  child.parent = parent;

  parent.children.splice(index, 0, child);

  updateDepth(child, parent.depth + 1);
  markDirty(root, parent);
}

export function removeChild(root: LayoutRoot, child: LayoutNode): void {
  const parent = child.parent;

  if (parent === null) return;

  const idx = parent.children.indexOf(child);

  if (idx !== -1) {
    parent.children.splice(idx, 1);
  }

  child.parent = null;

  updateDepth(child, 0);
  markDirty(root, parent);
}

export function removeSubtree(root: LayoutRoot, node: LayoutNode): void {
  removeChild(root, node);
}

export function bindEntity(node: LayoutNode, entityId: number): void {
  node.entityId = entityId;
}

export function setNodeVisible(root: LayoutRoot, node: LayoutNode, visible: boolean): void {
  if (node.visible === visible) return;
  node.visible = visible;
  markDirty(root, node);
  markDirtySubtree(node);
}

type NodeConfig = Partial<Pick<LayoutNode,
  'layoutKind' | 'direction' | 'justify' | 'alignItems' | 'alignSelf' |
  'gap' | 'flexGrow' | 'flexShrink' |
  'widthMode' | 'heightMode' | 'widthValue' | 'heightValue' |
  'padding' | 'margin' | 'visible' | 'onRender' | 'measure' |
  'absLeft' | 'absTop' | 'absRight' | 'absBottom' |
  'layer' | 'order'
>>;

export function configureNode(root: LayoutRoot, node: LayoutNode, config: NodeConfig): void {
  Object.assign(node, config);
  markDirty(root, node);
}
