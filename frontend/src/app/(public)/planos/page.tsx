"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Star } from "lucide-react";

import { listPlans } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section, Container, SectionHeader } from "@/components/marketing/section";

type Plan = {
  id: string;
  key: string;
  name: string;
  features: Record<string, boolean>;
  limits: Record<string, number>;
};

const FEATURE_LABELS: Record<string, string> = {
  LMS: "Treinamentos (LMS)",
  MULTI_CNPJ: "Multi-CNPJ",
  MULTI_TENANT_MANAGER: "Gestão multi-cliente (parceiro)",
  ANONYMIZATION: "Anonimização configurável",
  WHITE_LABEL: "White label",
  SSO_OIDC: "SSO (OIDC)",
  AUDIT_EXPORT: "Export de auditoria",
  NR17: "NR-17 (Ergonomia)",
  ESOCIAL_EXPORT: "eSocial SST (S-2210/2220/2240)",
};

function formatLimit(key: string, value: number) {
  switch (key) {
    case "cnpj_max":
      return value >= 9999 ? "CNPJs ilimitados*" : `${value} CNPJ(s)`;
    case "employees_max":
      return value >= 999999 ? "Colaboradores ilimitados*" : `Até ${value} colaboradores`;
    case "history_months":
      return `${value} meses de histórico`;
    case "storage_gb":
      return value >= 2000 ? "Armazenamento elevado*" : `${value} GB de armazenamento`;
    case "client_max":
      return value >= 9999 ? "Clientes ilimitados*" : `${value} cliente(s)`;
    default:
      return `${key}: ${value}`;
  }
}

export default function PlanosPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await listPlans();
        if (mounted) setPlans((r as any) || []);
      } catch {
        if (mounted) setPlans([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const ordered = useMemo(() => {
    const p = (k: string) => (k === "ENTERPRISE" ? 0 : k === "PRO" ? 1 : k === "START" ? 2 : 3);
    return [...plans].sort((a, b) => p(a.key) - p(b.key));
  }, [plans]);

  return (
    <div>
      <Section className="pt-10 md:pt-16">
        <Container>
          <SectionHeader
            eyebrow="Planos pensados para operação real"
            title="Escolha o nível de governança que sua empresa precisa"
            lead="Do básico ao enterprise: multi-CNPJ, privacidade, evidências e trilhas de auditoria. Valores e condições sob proposta."
          />

          <div className="mt-10 grid gap-4 lg:grid-cols-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="h-[420px] animate-pulse p-6">
                  <div className="h-4 w-24 rounded bg-muted" />
                  <div className="mt-4 h-6 w-40 rounded bg-muted" />
                  <div className="mt-6 h-36 w-full rounded bg-muted" />
                  <div className="mt-4 h-24 w-full rounded bg-muted" />
                </Card>
              ))
            ) : ordered.length === 0 ? (
              <Card className="p-6">
                <div className="text-base font-semibold">Nenhum plano disponível</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Não foi possível carregar os planos agora. Tente novamente em instantes.
                </p>
              </Card>
            ) : (
              ordered.map((plan) => {
                const highlight = plan.key === "ENTERPRISE";
                const enabledFeatures = Object.entries(plan.features || {})
                  .filter(([, v]) => v)
                  .map(([k]) => FEATURE_LABELS[k] ?? k);

                const limits = Object.entries(plan.limits || {}).map(([k, v]) => formatLimit(k, v));

                return (
                  <Card
                    key={plan.id}
                    className={[
                      "relative flex h-full flex-col p-6",
                      highlight ? "border-primary/40 shadow-lg" : "",
                    ].join(" ")}
                  >
                    {highlight ? (
                      <div className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs font-semibold text-primary shadow-sm">
                        <Star className="h-3.5 w-3.5" />
                        Recomendado
                      </div>
                    ) : null}

                    <div className="text-sm font-semibold text-muted-foreground">{plan.key}</div>
                    <div className="mt-1 font-display text-xl font-semibold tracking-tight">{plan.name}</div>

                    <div className="mt-4 rounded-xl border bg-background/60 p-4">
                      <div className="text-xs font-semibold text-muted-foreground">Inclui</div>
                      <ul className="mt-3 space-y-2 text-sm">
                        {enabledFeatures.slice(0, 6).map((f) => (
                          <li key={f} className="flex items-start gap-2">
                            <Check className="mt-0.5 h-4 w-4 text-primary" />
                            <span>{f}</span>
                          </li>
                        ))}
                        {enabledFeatures.length > 6 ? (
                          <li className="text-xs text-muted-foreground">+ {enabledFeatures.length - 6} itens</li>
                        ) : null}
                      </ul>
                    </div>

                    <div className="mt-4">
                      <div className="text-xs font-semibold text-muted-foreground">Limites principais</div>
                      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        {limits.slice(0, 4).map((l) => (
                          <li key={l}>• {l}</li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-muted-foreground">* Ajustável por contrato.</p>
                    </div>

                    <div className="mt-6 flex flex-col gap-2">
                      {highlight ? (
                        <Button asChild>
                          <Link href="/contato" className="no-underline">
                            Falar com vendas <ArrowRight className="ml-2 h-4 w-4" />
                          </Link>
                        </Button>
                      ) : (
                        <Button variant="outline" asChild>
                          <Link href={`/cadastre-se?plan=${encodeURIComponent(plan.key)}`} className="no-underline">
                            Começar com {plan.key.toLowerCase()}
                          </Link>
                        </Button>
                      )}
                      <Button variant="ghost" asChild>
                        <Link href="/contato" className="no-underline">
                          Tirar dúvidas
                        </Link>
                      </Button>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </Container>
      </Section>

      <Section className="pt-0">
        <Container>
          <Card className="p-8 md:p-10">
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <div className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
                  Precisa de implantação guiada?
                </div>
                <p className="mt-2 text-sm text-muted-foreground md:text-base">
                  Oferecemos onboarding e apoio para desenho de escopos (CNPJ/unidade), políticas de anonimização e boas
                  práticas de operação.
                </p>
              </div>
              <div className="flex flex-col justify-center gap-3">
                <Button asChild>
                  <Link href="/contato" className="no-underline">
                    Solicitar proposta <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <p className="text-xs text-muted-foreground">
                  Observação: a plataforma apoia gestão e governança; a adequação à NR-1 depende de processos e decisões
                  da organização.
                </p>
              </div>
            </div>
          </Card>
        </Container>
      </Section>

      {/* FAQ */}
      <Section>
        <Container>
          <SectionHeader
            eyebrow="Perguntas frequentes"
            title="Dúvidas sobre planos e implantação"
            align="center"
          />
          <div className="mx-auto mt-10 max-w-3xl space-y-4">
            {[
              {
                q: "Posso testar a plataforma antes de contratar?",
                a: "Sim. Oferecemos demonstrações guiadas orientadas ao seu contexto, sem compromisso. Entre em contato para agendar.",
              },
              {
                q: "Como funciona a implantação?",
                a: "Oferecemos onboarding dedicado com configuração de CNPJs, unidades, perfis e políticas de anonimização. O setup inicial leva dias, não meses.",
              },
              {
                q: "Os dados são protegidos pela LGPD?",
                a: "A plataforma foi construída com LGPD by design: anonimização configurável, limiares mínimos, isolamento multi-tenant e criptografia AES-256.",
              },
              {
                q: "Posso usar com múltiplos CNPJs e unidades?",
                a: "Sim. Multi-CNPJ é nativo na arquitetura. Cada CNPJ/unidade tem isolamento, escopos e permissões independentes.",
              },
              {
                q: "Existe limite de colaboradores?",
                a: "Os limites variam por plano e podem ser ajustados por contrato. O plano Enterprise oferece limites elevados e personalizáveis.",
              },
              {
                q: "Vocês oferecem suporte técnico?",
                a: "Sim. Todos os planos incluem suporte por email e WhatsApp. Planos Enterprise contam com SLA dedicado e acompanhamento contínuo.",
              },
            ].map((faq) => (
              <Card key={faq.q} className="p-6">
                <div className="text-sm font-semibold">{faq.q}</div>
                <p className="mt-2 text-sm text-muted-foreground">{faq.a}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>
    </div>
  );
}
