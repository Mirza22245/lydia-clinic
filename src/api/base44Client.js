import { appParams } from '@/lib/app-params';

// Villkorlig klient: Base44 SDK i builder/preview, portabel klient i Hostinger-build.
// VITE_USE_BASE44=false (satt i Dockerfile.frontend) byter till portabel klient.
const useBase44 = import.meta.env.VITE_USE_BASE44 !== 'false';

let base44;

if (useBase44) {
  // Base44-läge: använd plattformens SDK.
  const { createClient } = await import('@base44/sdk');
  const { appId, token, functionsVersion, appBaseUrl } = appParams;
  base44 = createClient({ appId, token, functionsVersion, serverUrl: '', appBaseUrl });
} else {
  // Portabelt läge: använd Lydias egen backend-klient.
  const m = await import('@/lib/api');
  base44 = m.base44;
}

export { base44 };