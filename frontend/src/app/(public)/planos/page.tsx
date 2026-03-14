"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Star, Zap } from "lucide-react";

import { listPlans } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Section, Container, SectionHeader } from "@/components/marketing/section";

type Plan = {
  id: string;
  key: string;
  name: string;
  features: Record<string, boolean>;
  limits: Record<string, number>;
  price_monthly?: number | null;
  price_annual?: number | null;
  is_custom_price?: boolean;
};

const FEATURE_LABELS: Record<string, string> = {
  // Módulos
  CAMPAIGNS: "Campanhas de avaliação",
  QUESTIONNAIRES: "Questionários de diagnóstico",
  LMS: "Treinamentos (LMS)",
  RISK_MAP: "Mapa de Risco",
  ACTION_PLANS: "Plano de Ação",
  REPORTS: "Relatórios gerenciais",
  // Conformidade
  ANONYMIZATION: "Anonimização configurável (LGPD)",
  NR17: "NR-17 (Ergonomia)",
  ESOCIAL_EXPORT: "eSocial SST (S-2210/2220/2240)",
  AUDIT: "Auditoria de ações",
  AUDIT_EXPORT: "Exportação de auditoria",
  // Infraestrutura
  MULTI_CNPJ: "Multi-CNPJ",
  WHITE_LABEL: "White label",
  SSO_OIDC: "SSO (OIDC)",
  API_ACCESS: "Acesso via API",
  MULTI_TENANT_MANAGER: "Gestão multi-cliente (parceiro)",
};

function formatLimit(key: string, value: number) {
  switch (key) {
    case "cnpj_max":
      return value >= 9999 ? "CNPJs ilimitados*" : `${value} CNPJ(s)`;
    case "employees_max":
      return value >= 999999 ? "Colaboradores ilimitados*" : `Até ${value.toLocaleString("pt-BR")} colaboradores`;
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

function formatBRL(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export default function PlanosPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

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
    const order: Record<string, number> = { START: 1, PRO: 2, ENTERPRISE: 3, SST: 4 };
    return [...plans].sort((a, b) => (order[a.key] ?? 99) - (order[b.key] ?? 99));
  }, [plans]);

  const hasAnyPrice = plans.some(p => (p.price_monthly && p.price_monthly > 0) || (p.price_annual && p.price_annual > 0));
  const hasAnnual = plans.some(p => p.price_annual != null && p.price_annual > 0);

  return (
    <div>
      <Section className="pt-10 md:pt-16">
        <Container>
          <SectionHeader
            eyebrow="Planos pensados para operação real"
            title="Escolha o nível de governança que sua empresa precisa"
            lead="Do básico ao enterprise: multi-CNPJ, privacidade, evidências e trilhas de auditoria."
          />

          {/* Billing toggle — sempre visível quando há preços */}
          {hasAnyPrice && (
            <div className="mt-8 flex items-center justify-center">
              <div className="inline-flex items-center rounded-full border bg-muted p-1">
                <button
                  onClick={() => setBilling("monthly")}
                  className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
                    billing === "monthly"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Mensal
                </button>
                <button
                  onClick={() => setBilling("annual")}
                  className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
                    billing === "annual"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Anual
                  {hasAnnual && (
                    <Badge className="ml-2 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200 text-[10px]">
                      Economize
                    </Badge>
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="mt-10 grid gap-6 lg:grid-cols-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="h-[520px] animate-pulse p-6">
                  <div className="h-4 w-24 rounded bg-muted" />
                  <div className="mt-4 h-8 w-32 rounded bg-muted" />
                  <div className="mt-4 h-10 w-40 rounded bg-muted" />
                  <div className="mt-6 h-36 w-full rounded bg-muted" />
                  <div className="mt-4 h-24 w-full rounded bg-muted" />
                </Card>
              ))
            ) : ordered.length === 0 ? (
              <Card className="p-6 lg:col-span-4">
                <div className="text-base font-semibold">Nenhum plano disponível</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Não foi possível carregar os planos agora. Tente novamente em instantes.
                </p>
              </Card>
            ) : (
              ordered.map((plan) => {
                const highlight = plan.key === "PRO";
                const isEnterprise = plan.key === "ENTERPRISE" || plan.key === "SST";
                const enabledFeatures = Object.entries(plan.features || {})
                  .filter(([, v]) => v)
                  .map(([k]) => FEATURE_LABELS[k] ?? k);
                const limits = Object.entries(plan.limits || {}).map(([k, v]) => formatLimit(k, v));

                // Price calculation
                const monthlyPrice = plan.price_monthly || 0;
                const annualPrice = plan.price_annual || 0;
                const showPrice = billing === "annual" && annualPrice > 0
                  ? annualPrice
                  : monthlyPrice;
                const period = billing === "annual" && annualPrice > 0 ? "/ano" : "/mês";

                // Monthly equivalent when showing annual
                const monthlyEquivalent = billing === "annual" && annualPrice > 0
                  ? Math.round(annualPrice / 12)
                  : 0;

                // Savings
                const annualSavings = monthlyPrice > 0 && annualPrice > 0
                  ? (monthlyPrice * 12) - annualPrice
                  : 0;

                return (
                  <Card
                    key={plan.id}
                    className={[
                      "relative flex h-full flex-col p-6",
                      highlight ? "border-primary shadow-lg ring-1 ring-primary/20" : "",
                    ].join(" ")}
                  >
                    {highlight && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <div className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm">
                          <Star className="h-3 w-3" />
                          Mais popular
                        </div>
                      </div>
                    )}

                    {/* Header */}
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{plan.key}</div>
                      <div className="mt-1 text-xl font-bold tracking-tight">{plan.name}</div>
                    </div>

                    {/* Price block */}
                    <div className="mt-4 min-h-[80px]">
                      {plan.is_custom_price ? (
                        <>
                          <div className="text-2xl font-bold tracking-tight">Sob consulta</div>
                          <p className="text-xs text-muted-foreground mt-1">Preço personalizado para sua operação</p>
                        </>
                      ) : showPrice > 0 ? (
                        <>
                          <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-bold tracking-tight">{formatBRL(showPrice)}</span>
                            <span className="text-sm text-muted-foreground">{period}</span>
                          </div>
                          {billing === "annual" && monthlyEquivalent > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              equivale a {formatBRL(monthlyEquivalent)}/mês
                            </p>
                          )}
                          {billing === "annual" && annualSavings > 0 && (
                            <p className="text-xs font-medium text-green-600 mt-1">
                              Economia de {formatBRL(annualSavings)}/ano
                            </p>
                          )}
                          {billing === "monthly" && annualPrice > 0 && annualSavings > 0 && (
                            <button
                              onClick={() => setBilling("annual")}
                              className="text-xs text-primary hover:underline mt-1 cursor-pointer"
                            >
                              Economize {formatBRL(annualSavings)} no plano anual
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="text-3xl font-bold tracking-tight">Grátis</div>
                          <p className="text-xs text-muted-foreground mt-1">14 dias para conhecer a plataforma</p>
                        </>
                      )}
                    </div>

                    {/* CTA principal */}
                    <div className="mt-4">
                      {plan.is_custom_price || isEnterprise ? (
                        <Button className="w-full" variant={highlight ? "default" : "outline"} asChild>
                          <Link href="/contato" className="no-underline">
                            Falar com vendas <ArrowRight className="ml-2 h-4 w-4" />
                          </Link>
                        </Button>
                      ) : showPrice > 0 ? (
                        <Button className="w-full" variant={highlight ? "default" : "outline"} asChild>
                          <Link href={`/cadastre-se?plan=${encodeURIComponent(plan.key)}`} className="no-underline">
                            <Zap className="mr-2 h-4 w-4" />
                            Assinar {plan.name}
                          </Link>
                        </Button>
                      ) : (
                        <Button className="w-full" variant="outline" asChild>
                          <Link href={`/cadastre-se?plan=${encodeURIComponent(plan.key)}`} className="no-underline">
                            Começar grátis
                          </Link>
                        </Button>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="my-4 border-t" />

                    {/* Features */}
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-3">O que está incluso:</div>
                      <ul className="space-y-2 text-sm">
                        {enabledFeatures.map((f) => (
                          <li key={f} className="flex items-start gap-2">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Limits */}
                    <div className="mt-auto pt-4">
                      <div className="text-xs font-semibold text-muted-foreground mb-2">Limites</div>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {limits.slice(0, 4).map((l) => (
                          <li key={l}>• {l}</li>
                        ))}
                      </ul>
                    </div>
                  </Card>
                );
              })
            )}
          </div>

          {/* Nota sobre ajustes */}
          <p className="mt-6 text-center text-xs text-muted-foreground">
            * Limites ajustáveis por contrato. Todos os planos incluem suporte por email.
          </p>
        </Container>
      </Section>

      {/* CTA implantação */}
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
                a: "Sim. O plano Start oferece 14 dias grátis para você conhecer a plataforma. Nenhum cartão de crédito necessário.",
              },
              {
                q: "Qual a diferença entre mensal e anual?",
                a: "No plano anual, você paga menos por mês e garante o preço por 12 meses. Cancele a qualquer momento, sem multa.",
              },
              {
                q: "Como funciona o checkout?",
                a: "Após criar sua conta, você escolhe o plano e é redirecionado para o pagamento seguro via Stripe. Aceitamos cartão de crédito e boleto.",
              },
              {
                q: "Os dados são protegidos pela LGPD?",
                a: "A plataforma foi construída com LGPD by design: anonimização configurável, limiares mínimos, isolamento multi-tenant e criptografia AES-256.",
              },
              {
                q: "Posso usar com múltiplos CNPJs e unidades?",
                a: "Sim a partir do plano Pro. Multi-CNPJ é nativo na arquitetura. Cada CNPJ/unidade tem isolamento, escopos e permissões independentes.",
              },
              {
                q: "Posso trocar de plano depois?",
                a: "Sim. Faça upgrade ou downgrade a qualquer momento pelo painel de cobrança. A diferença é calculada proporcionalmente.",
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
