import { ingameSettingsSchema, type IngameSettings } from '@svoice/shared';

export function parseSettings(input: unknown): IngameSettings | null {
  const parsed = ingameSettingsSchema.safeParse(input);
  if (!parsed.success) return null;
  for (const category of Object.values(parsed.data)) {
    for (const setting of Object.values(category.value)) {
      if (setting.value < setting.min || setting.value > setting.max) return null;
    }
  }
  return parsed.data;
}
