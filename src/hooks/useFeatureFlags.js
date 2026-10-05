import { useEffect, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

// Feature flag hook med singleton-caching. Laddar alla flaggor en gång
// och delar cachet mellan alla komponenter. refreshFlags() tvingar omladdning
// efter att admin ändrat en flagga.

let _flagsPromise = null;
let _flags = null;

function loadFlags() {
  if (_flagsPromise) return _flagsPromise;
  _flagsPromise = base44.entities.FeatureFlag.filter({}, { limit: 100 })
    .then((page) => {
      const map = {};
      for (const f of page.items || []) map[f.key] = f;
      _flags = map;
      return map;
    })
    .catch(() => {
      _flags = {};
      return {};
    });
  return _flagsPromise;
}

export function refreshFlags() {
  _flagsPromise = null;
  _flags = null;
  return loadFlags();
}

export function useFeatureFlags() {
  const [flags, setFlags] = useState(_flags);
  const [loading, setLoading] = useState(!_flags);

  useEffect(() => {
    if (_flags) return;
    let active = true;
    loadFlags().then((map) => {
      if (active) {
        setFlags(map);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  const isEnabled = useCallback((key) => flags?.[key]?.status === 'enabled', [flags]);
  const isTest = useCallback((key) => flags?.[key]?.status === 'test', [flags]);
  const isActive = useCallback((key) => isEnabled(key) || isTest(key), [isEnabled, isTest]);
  const isDisabled = useCallback((key) => !flags?.[key] || flags?.[key]?.status === 'disabled', [flags]);
  const getFlag = useCallback((key) => flags?.[key], [flags]);

  return { flags, loading, isEnabled, isTest, isActive, isDisabled, getFlag };
}