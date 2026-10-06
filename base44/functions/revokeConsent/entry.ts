import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { recordAudit } from "../../shared/audit.ts";

// Återkallar ett samtycke server-side med audit-loggning.
// Signerade/återkallade samtycken bevaras i historiken (raderas ej).
// Endast personal med åtkomst till kundens klinik kan återkalla.
//
// Body: { consent_id, reason }
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { consent_id, reason } = body;
    if (!consent_id) {
      return Response.json({ error: "consent_id krävs" }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const consent = await svc.entities.Consent.get(consent_id).catch(() => null);
    if (!consent) return Response.json({ error: "Samtycke saknas" }, { status: 404 });

    // Klinikisolering
    const userClinicId = user?.clinic_id ?? user?.data?.clinic_id ?? null;
    if (consent.clinic_id && userClinicId && consent.clinic_id !== userClinicId) {
      return Response.json({ error: "Åtkomst nekad" }, { status: 403 });
    }

    // Idempotent: redan återkallat
    if (consent.revoked_at) {
      return Response.json({ consent, message: "Samtycke redan återkallat" });
    }

    const updated = await svc.entities.Consent.update(consent_id, {
      revoked_at: new Date().toISOString(),
    });

    await recordAudit(base44, {
      event_type: "consent_revoked",
      entity_type: "Consent",
      entity_id: consent_id,
      description: `Samtycke (${consent.type}) återkallat för ${consent.customer_name} av ${user.full_name || user.email}`,
      metadata: {
        customer_id: consent.customer_id,
        consent_type: consent.type,
        reason: reason || "",
        revoked_by: user.id,
      },
    });

    return Response.json({ consent: updated });
  } catch (error) {
    console.error("revokeConsent:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}