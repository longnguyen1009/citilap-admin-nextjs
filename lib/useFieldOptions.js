"use client";
import { useState, useCallback, useEffect } from 'react';
import { FIELD_OPTION_GROUPS } from './fieldOptions';
import { getSupabaseClient } from './supabaseClient';

// Helper to convert DB rows to options
export const buildOptions = (groupKey, dbOptions = []) => {
  const groupRows = dbOptions.filter(o => o.group_key === groupKey && o.is_active !== false);
  
  if (groupRows.length > 0) {
    // Nếu DB rows tồn tại, ưu tiên dùng DB. CHÚ Ý: Dùng o.option_key thay vì o.id
    return groupRows.sort((a, b) => a.sort_order - b.sort_order).map(o => ({ key: o.option_key, label: o.label }));
  }

  // Fallback to hardcoded if no DB rows exist for this group yet
  const group = FIELD_OPTION_GROUPS[groupKey];
  if (!group) return [];
  return group.options.map(o => ({ key: o.key, label: o.defaultLabel }));
};

export const getLabel = (groupKey, optionKey, dbOptions = []) => {
  const options = buildOptions(groupKey, dbOptions);
  const found = options.find(o => o.key === String(optionKey));
  return found ? found.label : optionKey;
};

export const getOptions = (groupKey, dbOptions = []) => buildOptions(groupKey, dbOptions);

export const getOptionLabels = (groupKey, dbOptions = []) => getOptions(groupKey, dbOptions).map(o => o.label);

export const labelToKey = (groupKey, labelValue, dbOptions = []) => {
  if (labelValue === null || labelValue === undefined || labelValue === '') return null;
  const options = getOptions(groupKey, dbOptions);

  const direct = options.find(o => o.key === String(labelValue));
  if (direct) return direct.key;

  const byLabel = options.find(o => String(o.label).toLowerCase() === String(labelValue).toLowerCase());
  if (byLabel) return byLabel.key;

  return null;
};

export const resolveLabel = (groupKey, value, dbOptions = []) => {
  if (value === null || value === undefined || value === '') return '';
  const byKey = getLabel(groupKey, value, dbOptions);
  if (byKey !== value) return byKey; 

  const key = labelToKey(groupKey, value, dbOptions);
  if (key) return getLabel(groupKey, key, dbOptions);

  return value;
};

// PRESET CONFIGS (for Laptop names)
const PRESET_STORAGE_KEY = 'citilap_preset_configs_v1';
const PRESET_SETTINGS_KEY = 'preset_configs';

export const readPresetConfigs = () => {
  try {
    const saved = localStorage.getItem(PRESET_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
};

const writeLocalPresets = (presets) => {
  try { localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets)); } catch {}
};

const writeCloudPresets = async (presets) => {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return;
    await client.from('app_settings').upsert(
      { key: PRESET_SETTINGS_KEY, value: presets },
      { onConflict: 'key' }
    );
  } catch {}
};

const readCloudPresets = async () => {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return null;
    const { data, error } = await client.from('app_settings').select('value').eq('key', PRESET_SETTINGS_KEY).maybeSingle();
    if (error || !data) return null;
    return data.value || {};
  } catch { return null; }
};

export const writePresetConfigs = (presets) => {
  writeLocalPresets(presets);
  writeCloudPresets(presets);
};

export const usePresetConfigs = () => {
  const [presets, setPresets] = useState(() => readPresetConfigs());

  useEffect(() => {
    if (window.location.pathname === '/login') return;
    readCloudPresets().then(cloudPresets => {
      if (cloudPresets && Object.keys(cloudPresets).length > 0) {
        setPresets(cloudPresets);
        writeLocalPresets(cloudPresets);
      }
    });
  }, []);

  const addPreset = useCallback((key, value) => {
    setPresets(prev => {
      const next = { ...prev, [key]: value };
      writePresetConfigs(next);
      return next;
    });
  }, []);

  const removePreset = useCallback((key) => {
    setPresets(prev => {
      const next = { ...prev };
      delete next[key];
      writePresetConfigs(next);
      return next;
    });
  }, []);

  return { presets, addPreset, removePreset };
};
