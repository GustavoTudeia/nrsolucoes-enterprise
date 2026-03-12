import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  BadgeCheck,
  Building2,
  Calendar,
  CheckCircle2,
  Compass,
  Globe,
  Heart,
  LockKeyhole,
  MessageCircle,
  Shield,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section, Container, SectionHeader } from "@/components/marketing/section";
import { BRAND, SOCIAL_PROOF, SUPPORT } from "@/config/brand";

const PILLARS = [
  {
    icon: Target,
    title: "Missão",
    desc: "Elevar o padrão de prevenção e gestão de riscos psicossociais com tecnologia, dados e governança.",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    icon: Shield,
    title: "Princípios",
    desc: "LGPD by design, minimização de dados, rastreabilidade e segurança como baseline operacional.",
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    icon: Compass,
    title: "Escala Brasil",
    desc: "Operação multi-CNPJ e multiunidades com consistência, controle de escopo e visão corporativa.",
    color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    icon: BadgeCheck,
    title: "Evidência",
    desc: "Processos e entregáveis desenhados para auditoria: histórico, trilhas, anexos e accountability.",
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
] as const;

const VALUES = [
  {
    icon: Heart,
    title: "Seriedade com o tema",
    desc: "Riscos psicossociais afetam pessoas. Tratamos dados com responsabilidade e a operação com rigor.",
  },
  {
    icon: LockKeyhole,
    title: "Privacidade como padrão",
    desc: "Anonimização, limiares mínimos e controle granular de escopo — não é feature, é arquitetura.",
  },
  {
    icon: Zap,
    title: "Simplicidade operacional",
    desc: "Interface limpa, fluxos claros e onboarding guiado. Complexidade interna, simplicidade externa.",
  },
  {
    icon: TrendingUp,
    title: "Melhoria contínua",
    desc: "Cada release traz valor. Ouvimos clientes, medimos impacto e iteramos com propósito.",
  },
  {
    icon: Globe,
    title: "Pensada para o Brasil",
    desc: "Multi-CNPJ, operação distribuída, NR-1 e realidade regulatória brasileira como baseline.",
  },
  {
    icon: Users,
    title: "Parceria, não só software",
    desc: "Onboarding dedicado, suporte contínuo e acompanhamento para garantir resultados reais.",
  },
];

const TIMELINE = [
  { year: "Fundação", title: "Identificação do problema", desc: "Empresas tratando NR-1 com planilhas e e-mails. Sem governança, sem evidências." },
  { year: "Validação", title: "MVP com primeiros clientes", desc: "Diagnóstico, campanhas e análise. Feedback direto de equipes de SST e compliance." },
  { year: "Crescimento", title: "Plataforma enterprise", desc: "Multi-CNPJ, RBAC, LMS, plano de ação e evidências. Governança real para operações distribuídas." },
  { year: "Hoje", title: "Referência em gestão NR-1", desc: "Centenas de empresas, milhares de colaboradores e um ciclo completo do diagnóstico à evidência." },
];

export default function SobrePage() {
  return (
    <div>
      {/* HERO */}
      <Section className="pt-10 md:pt-16">
        <Container>
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            <div>
              <SectionHeader
                eyebrow="Sobre a NR1 Soluções"
                title="Tecnologia com postura enterprise para um tema sensível"
                lead="Riscos psicossociais exigem seriedade: privacidade, governança e consistência. Construímos uma plataforma para apoiar empresas e parceiros a operacionalizar um ciclo completo — com evidências."
              />

              <div className="mt-8 grid grid-cols-2 gap-4">
                {SOCIAL_PROOF.metrics.map((m) => (
                  <div key={m.label} className="rounded-xl border bg-card p-4">
                    <div className="font-display text-2xl font-bold text-foreground">{m.value}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div aria-hidden className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-tr from-primary/15 via-accent/15 to-transparent blur-2xl" />
              {/* Light theme */}
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-[#f8fafc] to-[#eef2ff] shadow-xl dark:hidden">
                <Image
                  src="/brand/about-enterprise.svg"
                  alt="Ciclo completo de gestão de riscos psicossociais NR-1"
                  width={800}
                  height={600}
                  className="h-auto w-full"
                  unoptimized
                />
              </div>
              {/* Dark theme */}
              <div className="hidden overflow-hidden rounded-3xl border border-slate-700/50 bg-gradient-to-br from-[#0f172a] to-[#1e293b] shadow-xl dark:block">
                <Image
                  src="/brand/about-enterprise-dark.svg"
                  alt="Ciclo completo de gestão de riscos psicossociais NR-1"
                  width={800}
                  height={600}
                  className="h-auto w-full"
                  unoptimized
                />
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* PILLARS */}
      <Section>
        <Container>
          <SectionHeader
            eyebrow="Nossos pilares"
            title="O que sustenta tudo que construímos"
            align="center"
          />
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {PILLARS.map((p) => (
              <Card key={p.title} className="group p-6 transition-shadow hover:shadow-lg">
                <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${p.color}`}>
                  <p.icon className="h-6 w-6" />
                </div>
                <div className="mt-4 text-base font-semibold">{p.title}</div>
                <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* TIMELINE */}
      <Section>
        <Container>
          <SectionHeader
            eyebrow="Nossa jornada"
            title="De um problema real a uma plataforma enterprise"
            align="center"
          />
          <div className="mx-auto mt-10 max-w-3xl">
            <div className="relative space-y-0 border-l-2 border-primary/20 pl-8">
              {TIMELINE.map((t, i) => (
                <div key={t.year} className="relative pb-8 last:pb-0">
                  <div className="absolute -left-[41px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary bg-background">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-0.5 text-xs font-semibold text-primary">
                    {t.year}
                  </div>
                  <div className="mt-2 text-base font-semibold">{t.title}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </Section>

      {/* VALUES */}
      <Section>
        <Container>
          <SectionHeader
            eyebrow="Nossos valores"
            title="Como construímos e operamos"
            lead="Cada decisão de produto e engenharia passa por estes princípios."
            align="center"
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {VALUES.map((v) => (
              <Card key={v.title} className="group p-6 transition-shadow hover:shadow-lg">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <v.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="mt-4 text-base font-semibold">{v.title}</div>
                <p className="mt-2 text-sm text-muted-foreground">{v.desc}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* NOT JUST A QUESTIONNAIRE */}
      <Section>
        <Container>
          <Card className="relative overflow-hidden p-8 md:p-10">
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <div className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
                  Não é &ldquo;só um questionário&rdquo;.
                </div>
                <p className="mt-3 text-sm text-muted-foreground md:text-base">
                  O que dá credibilidade ao projeto é a capacidade de transformar dados em ações, e ações em evidências
                  organizadas. A plataforma foi desenhada para suportar essa narrativa: diagnóstico, análise, plano de
                  ação, medidas educativas, monitoramento e relatórios.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Button asChild>
                    <Link href="/contato" className="no-underline">
                      Solicitar demonstração <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button variant="secondary" asChild>
                    <a href={SUPPORT.whatsapp.url} target="_blank" rel="noopener noreferrer" className="no-underline">
                      WhatsApp <MessageCircle className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                {[
                  { icon: Shield, text: "Governança de escopo: quem vê o quê, em qual nível (corporativo/unidade)." },
                  { icon: LockKeyhole, text: "Privacidade: anonimização configurável e controles para recortes sensíveis." },
                  { icon: BadgeCheck, text: "Evidências: histórico, anexos e rastreabilidade por responsável e prazo." },
                  { icon: TrendingUp, text: "Consistência: métricas comparáveis e visão corporativa para grupos distribuídos." },
                ].map((item) => (
                  <div key={item.text} className="flex items-start gap-3 rounded-lg border bg-background/50 p-3">
                    <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <span className="text-sm text-muted-foreground">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </Container>
      </Section>
    </div>
  );
}
