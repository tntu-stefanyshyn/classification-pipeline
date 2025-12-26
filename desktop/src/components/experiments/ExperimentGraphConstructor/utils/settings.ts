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
    const fallback = setting.defaultValue ?? '';
    result[setting.key] = values.get(setting.key) ?? fallback;
  });
  return result;
};

export const settingsMapToInput = (
  technology: Technology | null,
  settings: Record<string, string> | undefined
): GraphNodeSettingInput[] | undefined => {
  const values = settings ?? {};
  if (!technology || technology.settings.length === 0) {
    const entries = Object.entries(values);
    if (entries.length === 0) return undefined;
    return entries.map(([key, value]) => ({ key, value }));
  }

  return technology.settings.map((setting) => ({
    key: setting.key,
    value: values[setting.key] ?? setting.defaultValue ?? '',
  }));
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
