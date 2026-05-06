export { type SceneDef, type SceneTransition, type SceneManagerState } from './scene.types.ts';
export {
  createSceneManager,
  registerScene,
  loadScene,
  loadAdditiveScene,
  unloadAdditiveScene,
  sceneSystem,
} from './scene.ts';
