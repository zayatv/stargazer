export {
  type RendererState,
  type EntityRenderFn,
  type EntityBoundsFn,
  type EntityRenderer,
  type DrawFn,
  type Rect,
  type TextStyle,
  type ShapeStyle,
  type LineStyle,
  type ImageOptions,
} from './renderer.types.ts';

export {
  createRenderer,
  registerEntityRenderer,
  unregisterEntityRenderer,
  setEntityLayer,
  submit,
  submitText,
  submitRect,
  submitCircle,
  submitLine,
  submitImage,
  flush,
} from './renderer.ts';
