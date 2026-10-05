import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sendReceiptForPayment } from '../../shared/receipt.ts';

// Skickar det genererade kvittot till kundens e-post efter att en betalning
// registrerats i kassan. Anropas med payment_id; den delade receipt-modulen
// hämtar betalningen, kundens e-post och kliniken server-side och skickar
// Receipt-mallen.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const paymentId = body.payment_id;
    if (!paymentId) return Response.json({ error: 'payment_id required' }, { status: 400 });

    const result = await sendReceiptForPayment(base44.asServiceRole, paymentId);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}