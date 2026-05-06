import { registerFlexSolver, registerStackSolver, registerAbsoluteSolver } from './layout.solver.ts';
import { solveFlex } from './layout.flex.ts';
import { solveStack } from './layout.stack.ts';
import { solveAbsolute } from './layout.absolute.ts';

export {
  type LayoutNode,
  type LayoutRoot,
  type Constraints,
  type Edges,
  type ComputedLayout,
  type Orientation,
  Direction,
  Justify,
  Align,
  SizeMode,
  LayoutKind,
} from './layout.types.ts';

export {
  createLayoutRoot,
  createNode,
  appendChild,
  insertChild,
  removeChild,
  removeSubtree,
  markDirty,
  markDirtySubtree,
  configureNode,
  bindEntity,
  setNodeVisible,
} from './layout.tree.ts';

export { solveLayout, solveNode } from './layout.solver.ts';

export { renderLayoutTree, computeAbsolutePositions, collectRenderableNodes, renderNode } from './layout.render.ts';

registerFlexSolver(solveFlex);
registerStackSolver(solveStack);
registerAbsoluteSolver(solveAbsolute);
