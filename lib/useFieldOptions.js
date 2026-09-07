"use client";
import { useState, useCallback, useEffect } from 'react';
import { FIELD_OPTION_GROUPS } from './fieldOptions';
import { getAuthHeaders } from './apiFetchers';

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

export const readPresetConfigs = () => {
  if (typeof window === 'undefined') return {};
  try {
    const saved = localStorage.getItem(PRESET_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
};

const writeLocalPresets = (presets) => {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets)); } catch {}
};

const writeCloudPresets = async (presets) => {
  try {
    const response = await fetch('/api/presets', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ presets })
    });
    if (!response.ok) throw new Error('Không thể lưu preset');
    return true;
  } catch {
    return false;
  }
};

const readCloudPresets = async () => {
  try {
    const response = await fetch('/api/presets', { headers: await getAuthHeaders() });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.presets || {};
  } catch { return null; }
};

export const writePresetConfigs = async (presets) => {
  writeLocalPresets(presets);
  return writeCloudPresets(presets);
};

export const usePresetConfigs = () => {
  const [presets, setPresets] = useState(() => readPresetConfigs());

  useEffect(() => {
    if (typeof window === 'undefined' || window.location.pathname === '/login') return;
    readCloudPresets().then(cloudPresets => {
      if (cloudPresets && Object.keys(cloudPresets).length > 0) {
        setPresets(cloudPresets);
        writeLocalPresets(cloudPresets);
      }
    });
  }, []);

  const addPreset = useCallback(async (key, value) => {
    const previous = presets;
    const next = { ...previous, [key]: value };
    setPresets(next);
    const saved = await writePresetConfigs(next);
    if (!saved) {
      setPresets(previous);
      writeLocalPresets(previous);
    }
    return saved;
  }, [presets]);

  const removePreset = useCallback(async (key) => {
    const previous = presets;
    const next = { ...previous };
    delete next[key];
    setPresets(next);
    const saved = await writePresetConfigs(next);
    if (!saved) {
      setPresets(previous);
      writeLocalPresets(previous);
    }
    return saved;
  }, [presets]);

  return { presets, addPreset, removePreset };
};
