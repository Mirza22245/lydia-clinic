import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Skickar det genererade kvittot till kundens e-post efter att en betalning
// registrerats i kassan. Anropas med payment_id; funktionen hämtar betalningen,
// kundens e-post och kliniken server-side och skickar Receipt-mallen.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const paymentId = body.payment_id;
    if (!paymentId) return Response.json({ error: 'payment_id required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const payment = await svc.entities.Payment.get(paymentId);
    if (!payment) return Response.json({ error: 'Payment not found' }, { status: 404 });

    let email = '';
    let customerName = payment.customer_name || '';
    if (payment.customer_id) {
      const customer = await svc.entities.Customer.get(payment.customer_id).catch(() => null);
      if (customer) {
        email = customer.email || '';
        customerName = customer.name || customerName;
      }
    }
    if (!email) return Response.json({ error: 'Customer has no email' }, { status: 400 });

    let clinicName = 'Klinik';
    if (payment.clinic_id) {
      const clinic = await svc.entities.Clinic.get(payment.clinic_id).catch(() => null);
      if (clinic) clinicName = clinic.name || clinicName;
    }

    const methodLabels = { card: 'Kort', swish: 'Swish', cash: 'Kontant', invoice: 'Faktura' };
    const fmtDateTime = (d) => d
      ? new Date(d).toLocaleString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    const fmtSEK = (n) => new Intl.NumberFormat('sv-SE').format(n || 0);

    await svc.integrations.Core.SendEmail({
      to: email,
      template_name: 'Receipt',
      variables: {
        customer_name: customerName,
        treatment_name: payment.treatment_name || '',
        receipt_number: payment.receipt_number || '',
        amount: fmtSEK(payment.amount),
        vat: fmtSEK(payment.vat),
        method: methodLabels[payment.method] || payment.method || '',
        paid_at: fmtDateTime(payment.paid_at),
        clinic_name: clinicName,
      },
    });

    return Response.json({ sent: true, to: email });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}