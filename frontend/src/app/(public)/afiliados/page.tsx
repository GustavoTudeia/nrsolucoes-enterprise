"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { resolveAffiliate } from "@/lib/api/public";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section, Container, SectionHeader } from "@/components/marketing/section";

export default function AfiliadosPage() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ discount: number } | null>(null);

  async function handleValidate() {
    try {
      const r = await resolveAffiliate(code.trim());
      localStorage.setItem("nr_affiliate_code", r.affiliate_code);
      setResult({ discount: r.discount_percent });
      toast.success(`Código válido: ${r.discount_percent}% de desconto aplicado ao indicado`);
    } catch (e: any) {
      toast.error(e?.message || "Código inválido");
      setResult(null);
    }
  }

  return (
    <div>
      <Section className="pt-10 md:pt-16">
        <Container>
          <SectionHeader
            eyebrow="Programa de parceiros"
            title="Afiliados: consultores, SSTs e contadores"
            lead="Indique empresas, ajude a elevar o padrão de governança e receba comissão recorrente (conforme política do programa). O indicado recebe desconto."
          />

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <Card className="p-6">
              <div className="text-base font-semibold">Validar código</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Se você recebeu um código de um afiliado, valide aqui para ativar o desconto.
              </p>

              <div className="mt-4 space-y-3">
                <Input placeholder="Ex.: JOAO123" value={code} onChange={(e) => setCode(e.target.value)} />
                <Button onClick={handleValidate}>Validar</Button>
                {result ? (
                  <div className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
                    Desconto do indicado: <span className="font-medium text-foreground">{result.discount}%</span>. Ele
                    será aplicado no checkout/assinatura.
                  </div>
                ) : null}
              </div>
            </Card>

            <Card className="p-6">
              <div className="text-base font-semibold">Quero me tornar afiliado</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Modelo ideal para consultorias com carteira de empresas e operação recorrente.
              </p>

              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>• Código/link único por afiliado</li>
                <li>• Desconto para indicado</li>
                <li>• Comissão recorrente para o parceiro</li>
              </ul>

              <div className="mt-6 flex gap-3">
                <Button asChild>
                  <Link href="/contato" className="no-underline">
                    Falar com o time
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/planos" className="no-underline">
                    Ver planos
                  </Link>
                </Button>
              </div>

              <p className="mt-4 text-xs text-muted-foreground">
                Observação: regras comerciais e elegibilidade são definidas em contrato.
              </p>
            </Card>
          </div>
        </Container>
      </Section>
    </div>
  );
}
