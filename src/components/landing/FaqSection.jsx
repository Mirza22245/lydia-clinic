import React from "react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

export default function FaqSection({ faq }) {
  if (!faq?.length) return null;
  return (
    <section id="faq" className="border-t border-black/10 bg-white">
      <div className="mx-auto max-w-3xl px-5 py-20 sm:px-8 md:py-28">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#65735d]">Bra att veta</p>
          <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-[#171714] sm:text-4xl">Vanliga frågor</h2>
        </div>
        <Accordion type="single" collapsible className="mt-10 border-t border-black/10">
          {faq.map((f, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-black/10">
              <AccordionTrigger className="py-5 text-left font-heading text-base font-semibold text-[#171714] hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-6 text-black/55">
                <p className="whitespace-pre-line">{f.a}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}