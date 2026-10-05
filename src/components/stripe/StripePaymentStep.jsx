import React, { useEffect, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Loader2 } from "lucide-react";
import { getStripeConfig } from "@/functions/getStripeConfig";
import { createPaymentIntent } from "@/functions/createPaymentIntent";
import StripeCheckout from "./StripeCheckout";

// Hämtar publishable key + skapar PaymentIntent, sedan inbäddad Stripe Elements.
export default function StripePaymentStep({ booking, amountLabel, onPaid, onError, onSkip }) {
  const [stripePromise, setStripePromise] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const cfg = await getStripeConfig({});
        const stripe = await loadStripe(cfg.data.publishable_key);
        if (!active) return;
        setStripePromise(stripe);
        const res = await createPaymentIntent({ booking_id: booking.id });
        if (!active) return;
        setClientSecret(res.data.client_secret);
      } catch (e) {
        if (active) setErr(e?.response?.data?.error || e.message || "Kunde inte starta betalning");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [booking?.id]);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }
  if (err) return <p className="text-sm text-rose-600">{err}</p>;
  if (!stripePromise || !clientSecret) return null;

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#000000",
            colorBackground: "#ffffff",
            colorText: "#0a0a0a",
            colorDanger: "#e11d48",
            borderRadius: "8px",
          },
        },
      }}
    >
      <StripeCheckout
        amountLabel={amountLabel}
        onSuccess={onPaid}
        onError={onError}
        onSkip={onSkip}
      />
    </Elements>
  );
}