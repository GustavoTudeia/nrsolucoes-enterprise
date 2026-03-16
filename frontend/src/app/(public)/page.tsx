import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Globe,
  GraduationCap,
  Layers,
  LockKeyhole,
  MessageCircle,
  Shield,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section, Container, SectionHeader } from "@/components/marketing/section";
import { BRAND, SOCIAL_PROOF, SUPPORT } from "@/config/brand";

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
                Enterprise-ready &bull; Multi-CNPJ &bull; Governança &amp; evidências
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
                <span className="rounded-full border bg-background/70 px-3 py-1">Plano de ação &amp; evidências</span>
                <span className="rounded-full border bg-background/70 px-3 py-1">Multi-CNPJ</span>
                <span className="rounded-full border bg-background/70 px-3 py-1">Relatórios executivos</span>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* SOCIAL PROOF METRICS */}
      <Section className="py-6 md:py-8">
        <Container>
          <div className="relative overflow-hidden rounded-2xl border bg-card/50 backdrop-blur">
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-primary/5 via-transparent to-accent/5" />
            <div className="grid grid-cols-2 divide-x divide-border md:grid-cols-4">
              {SOCIAL_PROOF.metrics.map((m) => (
                <div key={m.label} className="px-6 py-6 text-center">
                  <div className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">{m.value}</div>
                  <div className="mt-1 text-xs font-medium text-muted-foreground">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </Section>

      {/* TRUST / VALUE */}
      <Section className="py-10 md:py-14">
        <Container>
          <SectionHeader
            eyebrow="Confiança que se comprova"
            title="Por que líderes de SST escolhem a NR1 Soluções"
            lead="A diferença entre 'ter um questionário' e 'ter um programa de gestão' está na governança, nas evidências e na rastreabilidade."
            align="center"
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: ShieldCheck,
                title: "GRO/PGR com rastreabilidade",
                desc: "Estruture campanhas, consolide resultados e mantenha histórico de decisões, evidências e responsáveis.",
                highlight: "Trilha de auditoria completa",
              },
              {
                icon: LockKeyhole,
                title: "Controles para privacidade",
                desc: "Anonimização e limiares mínimos configuráveis, além de perfis e escopos por CNPJ/unidade.",
                highlight: "LGPD by design",
              },
              {
                icon: Globe,
                title: "Pronta para operação distribuída",
                desc: "Organize CNPJs, unidades e estruturas organizacionais com governança e visão corporativa.",
                highlight: "Multi-CNPJ nativo",
              },
            ].map((item) => (
              <Card key={item.title} className="group relative overflow-hidden p-6 transition-shadow hover:shadow-lg">
                <div aria-hidden className="absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-primary/5 transition-transform group-hover:scale-150" />
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-background shadow-sm">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="mt-4 text-base font-semibold">{item.title}</div>
                <p className="mt-2 text-sm text-muted-foreground">{item.desc}</p>
                <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  <CheckCircle2 className="h-3 w-3" /> {item.highlight}
                </div>
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
            <Card className="group p-6 transition-shadow hover:shadow-lg md:col-span-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ClipboardCheck className="h-4 w-4 text-primary" /> Diagnóstico e campanhas
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Dispare campanhas por público e unidade, acompanhe adesão, qualidade e estabilidade de dados.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Segmentação por CNPJ/unidade</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Limiares para anonimização</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Acompanhamento de campo e progresso</li>
              </ul>
            </Card>

            <Card className="group p-6 transition-shadow hover:shadow-lg md:col-span-7">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="h-4 w-4 text-primary" /> Insights e matriz de risco
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
                  <div key={x.t} className="rounded-xl border bg-background/60 p-4 transition-colors hover:bg-muted/50">
                    <div className="text-sm font-semibold">{x.t}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{x.d}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="group p-6 transition-shadow hover:shadow-lg md:col-span-7">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="h-4 w-4 text-primary" /> Plano de ação &amp; evidências
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

            <Card className="group p-6 transition-shadow hover:shadow-lg md:col-span-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <GraduationCap className="h-4 w-4 text-primary" /> Treinamentos (LMS)
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Biblioteca de conteúdos, trilhas de aprendizagem e certificados com validade rastreável.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Upload de vídeos e materiais</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Trilhas por dimensão NR-1</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Certificados com QR Code</li>
              </ul>
            </Card>
          </div>
        </Container>
      </Section>

      {/* DIFFERENTIATORS */}
      <Section>
        <Container>
          <SectionHeader
            eyebrow="O que nos diferencia"
            title="Não é só um questionário — é uma plataforma de gestão"
            lead="Veja o que faz da NR1 Soluções a escolha de empresas que levam conformidade a sério."
            align="center"
          />

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {[
              {
                icon: Layers,
                title: "Ciclo completo integrado",
                desc: "Do diagnóstico ao relatório executivo em uma só plataforma. Sem planilhas, sem fragmentação.",
                items: ["Campanhas → Insights → Ação → Evidência", "Tudo rastreável e auditável"],
              },
              {
                icon: Shield,
                title: "Governança real, não cosmética",
                desc: "Perfis, escopos, trilhas de auditoria e isolamento multi-tenant. Não é checkbox — é arquitetura.",
                items: ["RBAC por CNPJ e unidade", "Logs imutáveis de todas as ações"],
              },
              {
                icon: TrendingUp,
                title: "Inteligência para decisão",
                desc: "Indicadores acionáveis com consistência estatística. Recortes comparáveis entre períodos e unidades.",
                items: ["Heatmaps, séries e comparativos", "Visão executiva e operacional"],
              },
              {
                icon: Zap,
                title: "Implantação ágil",
                desc: "Configuração guiada com onboarding dedicado. Sua operação rodando em dias, não meses.",
                items: ["Onboarding white-glove", "Suporte contínuo por WhatsApp"],
              },
            ].map((d) => (
              <Card key={d.title} className="group flex gap-4 p-6 transition-shadow hover:shadow-lg">
                <div className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                  <d.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="text-base font-semibold">{d.title}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{d.desc}</p>
                  <ul className="mt-3 space-y-1">
                    {d.items.map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <ChevronRight className="h-3 w-3 text-primary" /> {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            ))}
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
            align="center"
          />

          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {[
              { n: "01", t: "Configurar", d: "CNPJs, unidades, perfis e políticas de anonimização.", icon: Users },
              { n: "02", t: "Executar", d: "Campanhas e coleta com acompanhamento em tempo real.", icon: ClipboardCheck },
              { n: "03", t: "Analisar", d: "Painéis, recortes e insights com consistência estatística.", icon: BarChart3 },
              { n: "04", t: "Evidenciar", d: "Plano de ação, anexos e histórico para governança e auditoria.", icon: Award },
            ].map((s, i) => (
              <Card key={s.n} className="group relative overflow-hidden p-6 transition-shadow hover:shadow-lg">
                <div aria-hidden className="absolute right-3 top-3 font-display text-5xl font-bold text-muted/20">{s.n}</div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="mt-4 text-base font-semibold">{s.t}</div>
                <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* TESTIMONIAL / SOCIAL PROOF */}
      <Section>
        <Container>
          <Card className="relative overflow-hidden p-8 md:p-12">
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
            <div className="grid gap-8 md:grid-cols-2 md:items-center">
              <div>
                <SectionHeader
                  eyebrow="Resultados que falam"
                  title="Empresas que transformaram conformidade em vantagem"
                />
                <div className="mt-6 space-y-4">
                  {[
                    { metric: "73%", desc: "redução no tempo de consolidação de evidências para auditoria" },
                    { metric: "4x", desc: "mais agilidade na identificação de governança e evidências NR-1 críticos" },
                    { metric: "LGPD", desc: "controles de agregação, trilha e rastreabilidade no fluxo de campanhas" },
                  ].map((r) => (
                    <div key={r.metric} className="flex items-baseline gap-3">
                      <span className="font-display text-2xl font-bold text-primary">{r.metric}</span>
                      <span className="text-sm text-muted-foreground">{r.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <Card className="border-primary/20 p-6">
                  <p className="text-sm italic text-muted-foreground">
                    &ldquo;Saímos de planilhas espalhadas para um ciclo completo e auditável. A plataforma mudou a forma como apresentamos evidências para a diretoria.&rdquo;
                  </p>
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                      MR
                    </div>
                    <div>
                      <div className="text-sm font-semibold">Mariana R.</div>
                      <div className="text-xs text-muted-foreground">Coordenadora de SST — Indústria, 12 unidades</div>
                    </div>
                  </div>
                </Card>
                <Card className="p-6">
                  <p className="text-sm italic text-muted-foreground">
                    &ldquo;O multi-CNPJ com isolamento real e a trilha de auditoria nos deram a segurança que precisávamos para escalar a operação.&rdquo;
                  </p>
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                      CS
                    </div>
                    <div>
                      <div className="text-sm font-semibold">Carlos S.</div>
                      <div className="text-xs text-muted-foreground">Diretor de Compliance — Grupo empresarial, 8 CNPJs</div>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </Card>
        </Container>
      </Section>

      {/* TRUST BADGES */}
      <Section className="py-8">
        <Container>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {SOCIAL_PROOF.trustBadges.map((badge) => (
              <div key={badge} className="flex items-center gap-2 rounded-full border bg-card/80 px-4 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur">
                <Shield className="h-4 w-4 text-primary" />
                {badge}
              </div>
            ))}
          </div>
        </Container>
      </Section>

      {/* CTA */}
      <Section className="pb-16">
        <Container>
          <Card className="relative overflow-hidden p-8 md:p-12">
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-tr from-primary/15 via-accent/15 to-transparent" />
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="font-display text-2xl font-semibold tracking-tight md:text-4xl">
                Pronto para apresentar um projeto sólido?
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                Monte a narrativa de conformidade com dados, evidências e governança. Agende uma demonstração e veja a
                plataforma em ação — sem compromisso.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <Link href="/contato" className="no-underline">
                    Solicitar demonstração gratuita <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/recursos" className="no-underline">
                    Explorar recursos
                  </Link>
                </Button>
                <Button size="lg" variant="secondary" asChild>
                  <a href={SUPPORT.whatsapp.url} target="_blank" rel="noopener noreferrer" className="no-underline">
                    WhatsApp <MessageCircle className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Demonstração orientada ao seu contexto. Retorno em até 24h úteis.
              </p>
            </div>
          </Card>
        </Container>
      </Section>
    </div>
  );
}
