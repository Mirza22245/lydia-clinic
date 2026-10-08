// Shim för base44:runtime-secrets. Läser från process.env (portabel drift).
export const secrets = {
  get(name) {
    return process.env[name] || undefined;
  },
};