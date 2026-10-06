// Delad helper för att skicka ett kvitto via e-post efter en betalning.
// Används av både sendReceiptEmail (klient-anropad) och stripeWebhook
// (server-side) så att kvittologiken inte dupliceras.
// Tar en initierad service-role-klient (base44.asServiceRole) och ett payment-id.
const methodLabels: Record<string, string> = {
  card: "Kort",
  swish: "Swish",
  cash: "Kontant",
  invoice: "Faktura",
};

const fmtDateTime = (d: string) =>
  d
    ? new Date(d).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";

const fmtSEK = (n: number) => new Intl.NumberFormat("sv-SE").format(n || 0);

export async function sendReceiptForPayment(svc: any, paymentId: string) {
  const payment = await svc.entities.Payment.get(paymentId);
  if (!payment) throw new Error("Payment not found");

  let email = "";
  let customerName = payment.customer_name || "";
  if (payment.customer_id) {
    const customer = await svc.entities.Customer.get(payment.customer_id).catch(() => null);
    if (customer) {
      email = customer.email || "";
      customerName = customer.name || customerName;
    }
  }
  if (!email) throw new Error("Customer has no email");

  let clinicName = "Klinik";
  let clinicAddress = "";
  let clinicOrgNumber = "";
  let clinicPhone = "";
  let clinicEmail = "";
  if (payment.clinic_id) {
    const clinic = await svc.entities.Clinic.get(payment.clinic_id).catch(() => null);
    if (clinic) {
      clinicName = clinic.name || clinicName;
      clinicAddress = clinic.address || "";
      clinicOrgNumber = clinic.org_number || "";
      clinicPhone = clinic.phone || "";
      clinicEmail = clinic.email || "";
    }
  }

  await svc.integrations.Core.SendEmail({
    to: email,
    template_name: "Receipt",
    variables: {
      customer_name: customerName,
      treatment_name: payment.treatment_name || "",
      receipt_number: payment.receipt_number || "",
      amount: fmtSEK(payment.amount),
      vat: fmtSEK(payment.vat),
      method: methodLabels[payment.method] || payment.method || "",
      paid_at: fmtDateTime(payment.paid_at),
      clinic_name: clinicName,
      clinic_address: clinicAddress,
      clinic_org_number: clinicOrgNumber,
      clinic_phone: clinicPhone,
      clinic_email: clinicEmail,
    },
  });

  return { sent: true, to: email };
}