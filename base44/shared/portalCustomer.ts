// Matchar en inloggad kund mot sin Customer-post via e-post (skiftlägesokänsligt).
// Kundportalens funktioner använder ALLTID denna — en kund kan därmed bara nå sina
// egna poster, aldrig någon annans. Service role krävs eftersom kunder saknar RLS-åtkomst.
export function normalizeEmail(user: any): string {
  return (user?.email || '').toLowerCase().trim();
}

export async function findCustomerForUser(svc: any, user: any): Promise<any | null> {
  const email = normalizeEmail(user);
  if (!email) return null;
  const esc = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const page = await svc.entities.Customer.filter(
    { email: { $regex: `^${esc}$`, $options: 'i' } },
    { limit: 1 }
  );
  return (page.items || [])[0] || null;
}