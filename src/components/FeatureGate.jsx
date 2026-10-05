import React from 'react';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import DisabledModuleNotice from '@/components/DisabledModuleNotice';

// Villkorlig rendering baserat på feature flag. När flaggan är disabled
// visas fallback (eller DisabledModuleNotice). När den är enabled eller
// test visas children.
export default function FeatureGate({ feature, fallback, children, moduleName, instructions, requiresExternal }) {
  const { isDisabled, loading } = useFeatureFlags();

  if (loading) return null;

  if (isDisabled(feature)) {
    return fallback || (
      <DisabledModuleNotice
        moduleName={moduleName}
        instructions={instructions}
        requiresExternal={requiresExternal}
      />
    );
  }

  return children;
}