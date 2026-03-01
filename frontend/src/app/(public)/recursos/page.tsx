import Link from "next/link";
import { ArrowRight, BarChart3, ClipboardCheck, FileText, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section, Container, SectionHeader } from "@/components/marketing/section";

const FEATURES = [
  {
    icon: ClipboardCheck,
    title: "Campanhas e diagnóstico",
    desc: "Crie campanhas, acompanhe adesão e qualidade de dados por CNPJ e unidade.",
  },
  {
    icon: BarChart3,
    title: "Insights e painéis",
    desc: "Indicadores acionáveis com recortes e visão corporativa, preservando privacidade.",
  },
  {
    icon: FileText,
    title: "Relatórios executivos",
    desc: "Consolidação de resultados para diretoria e comitês, com rastreabilidade.",
  },
  {
    icon: ShieldCheck,
    title: "Evidências e auditoria",
    desc: "Histórico, trilhas e anexos para suportar governança e auditorias internas.",
  },
  {
    icon: LockKeyhole,
    title: "Privacidade (LGPD by design)",
    desc: "Anonimização configurável, limiares mínimos e controle de escopo por perfil.",
  },
  {
    icon: Users,
    title: "Multiunidades e perfis",
    desc: "Estrutura organizacional com permissões e escopos para operação distribuída.",
  },
] as const;

export default function RecursosPage() {
  return (
    <div>
      <Section className="pt-10 md:pt-16">
        <Container>
          <SectionHeader
            eyebrow="O que você entrega no final"
            title="Uma plataforma que sustenta decisão e conformidade"
            lead="Recursos desenhados para reduzir fricção operacional e aumentar confiança na informação — da ponta ao corporativo."
          />

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} className="p-6">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-background shadow-sm">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="mt-4 text-base font-semibold">{f.title}</div>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeader
            eyebrow="Enterprise não é só visual"
            title="Governança, consistência e escala"
            lead="O diferencial está na operação: dados confiáveis, escopos corretos e evidências sempre organizadas."
          />

          <div className="mt-10 grid gap-4 md:grid-cols-12">
            <Card className="p-6 md:col-span-7">
              <div className="text-sm font-semibold">Escopos e permissões por CNPJ / unidade</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Estruture acesso por perfil e limite visibilidade ao necessário. Reduz ruído e aumenta accountability.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>• Admin, RH, SST, liderança e consultoria</li>
                <li>• Escopo corporativo vs. operacional</li>
                <li>• Trilhas de mudanças e ações</li>
              </ul>
            </Card>

            <Card className="p-6 md:col-span-5">
              <div className="text-sm font-semibold">Privacidade e anonimização</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Políticas de anonimização configuráveis e limiares mínimos para publicação de recortes.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>• Limiar mínimo por grupo</li>
                <li>• Ocultação de recortes sensíveis</li>
                <li>• Exports controlados</li>
              </ul>
            </Card>

            <Card className="p-6 md:col-span-5">
              <div className="text-sm font-semibold">Relatórios com narrativa</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Não é só gráfico: é contexto, histórico e evidência para tomada de decisão.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>• Sumário executivo</li>
                <li>• Evolução por período</li>
                <li>• Comparativos entre unidades</li>
              </ul>
            </Card>

            <Card className="p-6 md:col-span-7">
              <div className="text-sm font-semibold">Plano de ação e evidências</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Conecte insights a ações com responsáveis e prazos, mantendo evidências anexadas e histórico.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>• Responsáveis, prazos e acompanhamento</li>
                <li>• Evidências anexadas e versionamento</li>
                <li>• Trilhas para auditoria e governança</li>
              </ul>
            </Card>
          </div>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/contato" className="no-underline">
                Solicitar demonstração <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/planos" className="no-underline">
                Ver planos
              </Link>
            </Button>
          </div>
        </Container>
      </Section>
    </div>
  );
}
