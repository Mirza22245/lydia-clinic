import React from 'react';
import { Lock, AlertCircle } from 'lucide-react';

// Visas när en modul är avstängd eller en integration inte är konfigurerad.
// Fejkar aldrig funktionalitet — talar om för användaren att modulen är av.
export default function DisabledModuleNotice({ moduleName, instructions, requiresExternal }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
      {requiresExternal ? (
        <AlertCircle className="mx-auto mb-2 w-6 h-6 text-amber-500" />
      ) : (
        <Lock className="mx-auto mb-2 w-6 h-6 text-muted-foreground" />
      )}
      <p className="font-medium">{moduleName || 'Modul'}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {requiresExternal
          ? 'Integrationen är inte konfigurerad.'
          : 'Denna modul är avstängd.'}
        {' '}Aktivera den under Inställningar → Moduler.
      </p>
      {instructions && (
        <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">{instructions}</p>
      )}
    </div>
  );
}