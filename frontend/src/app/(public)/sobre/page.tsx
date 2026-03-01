import Image from "next/image";
import { BadgeCheck, Compass, Shield, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Section, Container, SectionHeader } from "@/components/marketing/section";

const PILLARS = [
  {
    icon: Target,
    title: "Missão",
    desc: "Elevar o padrão de prevenção e gestão de riscos psicossociais com tecnologia, dados e governança.",
  },
  {
    icon: Shield,
    title: "Princípios",
    desc: "LGPD by design, minimização de dados, rastreabilidade e segurança como baseline operacional.",
  },
  {
    icon: Compass,
    title: "Escala Brasil",
    desc: "Operação multi-CNPJ e multiunidades com consistência, controle de escopo e visão corporativa.",
  },
  {
    icon: BadgeCheck,
    title: "Evidência",
    desc: "Processos e entregáveis desenhados para auditoria: histórico, trilhas, anexos e accountability.",
  },
] as const;

export default function SobrePage() {
  return (
    <div>
      <Section className="pt-10 md:pt-16">
        <Container>
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            <div>
              <SectionHeader
                eyebrow="Sobre a NR1 Soluções"
                title="Tecnologia com postura enterprise para um tema sensível"
                lead="Riscos psicossociais exigem seriedade: privacidade, governança e consistência. Construímos uma plataforma para apoiar empresas e parceiros a operacionalizar um ciclo completo — com evidências."
              />
            </div>
            <div className="relative">
              <div aria-hidden className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-tr from-primary/15 via-accent/15 to-transparent blur-2xl" />
              <div className="overflow-hidden rounded-3xl border bg-card shadow-xl">
                <Image
                  src="/brand/about-enterprise.svg"
                  alt="Ciclo completo de gestão de riscos psicossociais NR-1"
                  width={800}
                  height={600}
                  className="h-auto w-full"
                />
              </div>
            </div>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {PILLARS.map((p) => (
              <Card key={p.title} className="p-6">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-background shadow-sm">
                  <p.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="mt-4 text-base font-semibold">{p.title}</div>
                <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="pt-0">
        <Container>
          <Card className="p-8 md:p-10">
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <div className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
                  Não é “só um questionário”.
                </div>
                <p className="mt-3 text-sm text-muted-foreground md:text-base">
                  O que dá credibilidade ao projeto é a capacidade de transformar dados em ações, e ações em evidências
                  organizadas. A plataforma foi desenhada para suportar essa narrativa: diagnóstico, análise, plano de
                  ação, medidas educativas, monitoramento e relatórios.
                </p>
              </div>
              <div className="space-y-3 text-sm text-muted-foreground md:text-base">
                <p>• Governança de escopo: quem vê o quê, em qual nível (corporativo/unidade).</p>
                <p>• Privacidade: anonimização configurável e controles para recortes sensíveis.</p>
                <p>• Evidências: histórico, anexos e rastreabilidade por responsável e prazo.</p>
                <p>• Consistência: métricas comparáveis e visão corporativa para grupos distribuídos.</p>
              </div>
            </div>
          </Card>
        </Container>
      </Section>
    </div>
  );
}
