// Ersätter app-params.js i det portabla bygget (inget beroende av Base44-SDK).
// Sessionen är en HttpOnly-cookie; servern sätter även den läsbara markören
// lydia_logged_in=1 (ingen hemlighet) så AuthContext vet om /auth/me ska anropas.
const hasSession = typeof document !== 'undefined'
  && document.cookie.split('; ').some((c) => c === 'lydia_logged_in=1');

export const appParams = {
  appId: 'lydia',
  token: hasSession ? 'session-cookie' : null,
  functionsVersion: '',
  appBaseUrl: '',
};