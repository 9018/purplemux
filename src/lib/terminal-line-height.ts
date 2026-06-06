export type TLineHeightPreset = 'tight' | 'normal' | 'relaxed' | 'custom';

export const LINE_HEIGHT_PRESETS: Record<Exclude<TLineHeightPreset, 'custom'>, number> = {
  tight: 1.0,
  normal: 1.1,
  relaxed: 1.3,
};

export const DEFAULT_LINE_HEIGHT = LINE_HEIGHT_PRESETS.normal;

export const LINE_HEIGHT_CUSTOM_MIN = 1.0;
export const LINE_HEIGHT_CUSTOM_MAX = 2.0;
export const LINE_HEIGHT_CUSTOM_STEP = 0.05;

export const clampCustomLineHeight = (value: number): number =>
  Math.min(LINE_HEIGHT_CUSTOM_MAX, Math.max(LINE_HEIGHT_CUSTOM_MIN, value));

export const resolveLineHeight = (preset: string, custom: number): number => {
  if (preset === 'custom') {
    return Number.isFinite(custom) ? clampCustomLineHeight(custom) : DEFAULT_LINE_HEIGHT;
  }
  return LINE_HEIGHT_PRESETS[preset as Exclude<TLineHeightPreset, 'custom'>] ?? DEFAULT_LINE_HEIGHT;
};
