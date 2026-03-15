import type {
  GraphNodeSetting,
  GraphNodeSettingInput,
  Technology,
  TechnologySetting,
} from '../graphql';

export const buildSettingsMap = (
  settingDefinitions: TechnologySetting[] | undefined,
  nodeSettings?: GraphNodeSetting[] | null
): Record<string, string> => {
  const values = new Map<string, string>();
  (nodeSettings ?? []).forEach((setting) => {
    const key = setting.key?.trim();
    if (!key) return;
    values.set(key, String(setting.value ?? '').trim());
  });

  if (!settingDefinitions || settingDefinitions.length === 0) {
    const result: Record<string, string> = {};
    values.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  const result: Record<string, string> = {};
  settingDefinitions.forEach((setting) => {
    const value = values.get(setting.key);
    if (value !== undefined) {
      result[setting.key] = value;
    }
  });
  return result;
};

export const settingsMapToInput = (
  technology: Technology | null,
  settings: Record<string, string> | undefined
): GraphNodeSettingInput[] | undefined => {
  const values = settings ?? {};
  if (!technology || technology.settings.length === 0) {
    const entries = Object.entries(values).filter(
      ([key, value]) => key.trim() && String(value ?? '').trim() !== ''
    );
    if (entries.length === 0) return undefined;
    return entries.map(([key, value]) => ({ key, value: String(value).trim() }));
  }

  const allowedKeys = new Set(technology.settings.map((setting) => setting.key));
  const input = Object.entries(values)
    .map(([key, value]) => ({ key: key.trim(), value: String(value ?? '').trim() }))
    .filter((entry) => entry.key && entry.value !== '' && allowedKeys.has(entry.key));

  return input.length > 0 ? input : undefined;
};

export const settingsRecordToList = (
  settings: Record<string, string> | undefined
): GraphNodeSetting[] => {
  if (!settings) return [];
  return Object.entries(settings).map(([key, value]) => ({
    key,
    value,
  }));
};
