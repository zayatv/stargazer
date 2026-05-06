export type {
  Category,
  UnlockRule,
  ItemDef,
  GameStats,
  CustomizationState,
  ListEntry,
} from './customization.types.ts';

export { CATEGORIES, defaultStats, emptyUnlocked } from './customization.types.ts';

export {
  CUSTOMIZATION_CONFIG,
  findItem,
  itemsForCategory,
  defaultItemIds,
} from './customization.config.ts';

export {
  loadCustomization,
  saveCustomization,
  isUnlocked,
  listForCategory,
  summarizeUnlock,
  evaluateUnlocks,
  recordPhotoSaved,
  type PhotoCustomizationLike,
} from './customization.manager.ts';

export {
  buildToastLayer,
  type ToastHandle,
} from './customization.toast.ts';
