import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { recordAudit } from '../../shared/audit.ts';

// Låter en inloggad behandlare signera (låsa) en journalanteckning server-side.
// Vid signering sparas en elektronisk stämpel (UTC-tid, behandlare från auth.me,
// SHA-256-innehållshash) och RLS blockerar därefter alla vidare ändringar och
// raderingar av posten. Signeringen registreras i audit-loggen med server-side
// identitet så att historiken över händelser blir oförfalskningsbar. Ändringar
// efter signering görs genom att skapa en ny version (amend), inte genom att
// redigera den låsta posten.
async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const journalId = body.journal_id;
    if (!journalId) return Response.json({ error: 'journal_id required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const journal = await svc.entities.JournalEntry.get(journalId);
    if (!journal) return Response.json({ error: 'Journal not found' }, { status: 404 });

    // Idempotent: redan signerad post returneras oförändrad.
    if (journal.is_signed) {
      return Response.json({ journal });
    }

    // Klinikisolering: posten måste tillhöra användarens klinik.
    const userClinicId = user?.clinic_id ?? user?.data?.clinic_id ?? null;
    if (journal.clinic_id && userClinicId && journal.clinic_id !== userClinicId) {
      return Response.json({ error: 'Journal belongs to another clinic' }, { status: 403 });
    }

    const signedBy = user?.full_name || user?.email || 'Okänd';
    const signedAt = new Date().toISOString();
    const content = [
      journal.id,
      journal.customer_id || '',
      journal.customer_name || '',
      journal.treatment_name || '',
      journal.provider || '',
      journal.entry_date || '',
      journal.notes || '',
      journal.observations || '',
      journal.assessment || '',
      journal.treatment_performed || '',
      journal.aftercare || '',
      journal.recommendations || '',
      String(journal.version || 1),
      signedAt,
    ].join('|');
    const signatureHash = await sha256(content);

    const updated = await svc.entities.JournalEntry.update(journalId, {
      is_signed: true,
      signed_at: signedAt,
      signed_by: signedBy,
      signature_hash: signatureHash,
    });

    await recordAudit(base44, {
      event_type: 'journal_sign',
      entity_type: 'JournalEntry',
      entity_id: journalId,
      description: `Journal för ${journal.customer_name} signerad och låst av ${signedBy}`,
      metadata: {
        customer_id: journal.customer_id,
        user_id: user.id,
        version: journal.version || 1,
        signature_hash: signatureHash,
        utc_timestamp: signedAt,
      },
    });

    return Response.json({ journal: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}