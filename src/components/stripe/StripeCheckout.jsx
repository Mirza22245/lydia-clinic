import React, { useState } from "react";
import { useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Loader2, Lock } from "lucide-react";

// Inbäddat kortbetalningsformulär (Stripe Elements). Visar kort, Apple Pay/
// Google Pay och Klarna automatiskt via automatic_payment_methods.
export default function StripeCheckout({ amountLabel, onSuccess, onError, onSkip }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState(null);

  const pay = async () => {
    if (!stripe || !elements) return;
    setProcessing(true);
    setMessage(null);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    if (error) {
      setMessage(error.message || "Betalningen kunde inte genomföras");
      setProcessing(false);
      onError?.(error.message);
    } else if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) {
      onSuccess?.(paymentIntent);
    } else {
      setMessage(`Betalningsstatus: ${paymentIntent?.status || "okänd"}`);
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {message && <p className="text-sm text-rose-600">{message}</p>}
      <Button className="w-full" disabled={!stripe || processing} onClick={pay}>
        {processing ? (
          <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Bearbetar betalning...</>
        ) : (
          <>Betala {amountLabel}</>
        )}
      </Button>
      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="w-3 h-3" />
        Säker betalning via Stripe
      </div>
      {onSkip && (
        <button type="button" onClick={onSkip} className="w-full text-sm text-muted-foreground underline hover:text-foreground">
          Betala på plats istället
        </button>
      )}
    </div>
  );
}