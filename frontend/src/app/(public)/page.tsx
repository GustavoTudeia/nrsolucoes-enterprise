import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Globe,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section, Container, SectionHeader } from "@/components/marketing/section";
import { BRAND, SUPPORT } from "@/config/brand";

export default function PublicHome() {
  return (
    <div>
      {/* HERO */}
      <Section className="pb-8 pt-10 md:pt-16">
        <Container>
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
                <Sparkles className="h-4 w-4 text-primary" />
                Enterprise-ready • Multi-CNPJ • Governança & evidências
              </div>

              <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight md:text-6xl">
                {BRAND.product} que passa{" "}
                <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
                  confiança
                </span>{" "}
                — do diagnóstico à evidência auditável.
              </h1>

              <p className="mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
                {BRAND.tagline} Projete campanhas com anonimização, acompanhe indicadores, transforme insights em plano de
                ação e consolide evidências organizadas para auditorias internas e conformidade.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button size="lg" asChild>
                  <Link href="/contato" className="no-underline">
                    Solicitar demonstração <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/login" className="no-underline">
                    Acessar console
                  </Link>
                </Button>
                <Button size="lg" variant="secondary" asChild>
                  <a
                    href={SUPPORT.whatsapp.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="no-underline"
                  >
                    Suporte no WhatsApp <MessageCircle className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {[
                  { icon: ShieldCheck, label: "Governança", desc: "Trilhas e evidências" },
                  { icon: LockKeyhole, label: "LGPD by design", desc: "Privacidade e controles" },
                  { icon: Globe, label: "Escala Brasil", desc: "Multiunidades e CNPJs" },
                ].map((item) => (
                  <div key={item.label} className="flex items-start gap-3">
                    <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-background shadow-sm">
                      <item.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{item.label}</div>
                      <div className="text-xs text-muted-foreground">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-10 flex items-center gap-3 text-sm text-muted-foreground">
                <BrandLogo linked={false} markOnly className="opacity-80" />
                <span>
                  Construída para ambientes corporativos: perfis, escopos, limites e consistência operacional.
                </span>
              </div>
            </div>

            <div className="relative">
              <div aria-hidden className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-tr from-primary/15 via-accent/15 to-transparent blur-2xl" />
              <div className="overflow-hidden rounded-3xl border bg-card shadow-xl">
                <Image
                  src="/brand/hero-enterprise.webp"
                  alt="Visual do produto: dashboard e módulos de conformidade NR-1"
                  width={1400}
                  height={980}
                  priority
                  className="h-auto w-full"
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border bg-background/70 px-3 py-1">Anonimização configurável</span>
                <span className="rounded-full border bg-background/70 px-3 py-1">Plano de ação & evidências</span>
                <span className="rounded-full border bg-background/70 px-3 py-1">Multi-CNPJ</span>
                <span className="rounded-full border bg-background/70 px-3 py-1">Relatórios executivos</span>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* TRUST / VALUE */}
      <Section className="py-10 md:py-14">
        <Container>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                title: "GRO/PGR com rastreabilidade",
                desc: "Estruture campanhas, consolide resultados e mantenha histórico de decisões, evidências e responsáveis.",
              },
              {
                title: "Controles para privacidade",
                desc: "Anonimização e limiares mínimos configuráveis, além de perfis e escopos por CNPJ/unidade.",
              },
              {
                title: "Pronta para operação distribuída",
                desc: "Organize CNPJs, unidades e estruturas organizacionais com governança e visão corporativa.",
              },
            ].map((item) => (
              <Card key={item.title} className="p-6">
                <div className="text-base font-semibold">{item.title}</div>
                <p className="mt-2 text-sm text-muted-foreground">{item.desc}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* MODULES */}
      <Section>
        <Container>
          <SectionHeader
            eyebrow="Do dado ao plano — sem ruído"
            title="Módulos que sustentam conformidade e decisão"
            lead="Uma experiência consistente do onboarding ao relatório executivo, com governança, privacidade e evidências."
          />

          <div className="mt-10 grid gap-4 md:grid-cols-12">
            <Card className="p-6 md:col-span-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Diagnóstico e campanhas
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Dispare campanhas por público e unidade, acompanhe adesão, qualidade e estabilidade de dados.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>• Segmentação por CNPJ/unidade</li>
                <li>• Limiares para anonimização</li>
                <li>• Acompanhamento de campo e progresso</li>
              </ul>
            </Card>

            <Card className="p-6 md:col-span-7">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Insights e matriz de risco
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Transforme respostas em indicadores acionáveis, com recortes e visão corporativa.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  { t: "Heatmaps por dimensão", d: "Leitura rápida e comparável." },
                  { t: "Séries históricas", d: "Evolução e tendências." },
                  { t: "Visão por unidade", d: "Consistência entre operações." },
                  { t: "Indicadores executivos", d: "Painéis para diretoria." },
                ].map((x) => (
                  <div key={x.t} className="rounded-xl border bg-background/60 p-4">
                    <div className="text-sm font-semibold">{x.t}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{x.d}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6 md:col-span-7">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Plano de ação & evidências
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Conecte insights a ações, responsáveis e prazos — com evidências anexadas e histórico.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border bg-background/70 px-3 py-1">Responsáveis e SLAs internos</span>
                <span className="rounded-full border bg-background/70 px-3 py-1">Evidências e anexos</span>
                <span className="rounded-full border bg-background/70 px-3 py-1">Auditoria e histórico</span>
              </div>
            </Card>

            <Card className="p-6 md:col-span-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Operação enterprise
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Recursos pensados para a realidade Brasil: multi-CNPJ, unidades e governança central.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>• Perfis e permissões</li>
                <li>• Escopos por CNPJ / unidade</li>
                <li>• Limites e assinatura</li>
              </ul>
            </Card>
          </div>
        </Container>
      </Section>

      {/* HOW IT WORKS */}
      <Section>
        <Container>
          <SectionHeader
            eyebrow="Operação simples, resultado robusto"
            title="Como funciona"
            lead="Um fluxo claro e auditável, desenhado para reduzir fricção e aumentar confiança na informação."
          />

          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {[
              { n: "01", t: "Configurar", d: "CNPJs, unidades, perfis e políticas de anonimização." },
              { n: "02", t: "Executar", d: "Campanhas e coleta com acompanhamento em tempo real." },
              { n: "03", t: "Analisar", d: "Painéis, recortes e insights com consistência estatística." },
              { n: "04", t: "Evidenciar", d: "Plano de ação, anexos e histórico para governança e auditoria." },
            ].map((s) => (
              <Card key={s.n} className="p-6">
                <div className="text-xs font-semibold text-primary">{s.n}</div>
                <div className="mt-2 text-base font-semibold">{s.t}</div>
                <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* CTA */}
      <Section className="pb-16">
        <Container>
          <Card className="relative overflow-hidden p-8 md:p-10">
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-tr from-primary/15 via-accent/15 to-transparent" />
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
                  Pronto para apresentar um projeto sólido?
                </div>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
                  Monte a narrativa de conformidade com dados, evidências e governança. Agende uma demonstração e veja a
                  plataforma em ação.
                </p>
              </div>
              <div className="flex gap-3">
                <Button size="lg" asChild>
                  <Link href="/contato" className="no-underline">
                    Solicitar demonstração <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/recursos" className="no-underline">
                    Ver recursos
                  </Link>
                </Button>
              </div>
            </div>
          </Card>
        </Container>
      </Section>
    </div>
  );
}
