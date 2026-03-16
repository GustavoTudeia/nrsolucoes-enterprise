import Link from "next/link";
import {
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LockKeyhole,
  Layers,
  Shield,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section, Container, SectionHeader } from "@/components/marketing/section";

const FEATURES = [
  {
    icon: ClipboardCheck,
    title: "Campanhas e diagnóstico",
    desc: "Crie campanhas segmentadas por CNPJ e unidade, acompanhe adesão em tempo real e garanta qualidade de dados com controles automáticos.",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    icon: BarChart3,
    title: "Insights e painéis",
    desc: "Indicadores acionáveis com recortes por dimensão, unidade e período. Visão executiva e operacional com consistência estatística.",
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    icon: FileText,
    title: "Relatórios executivos",
    desc: "Consolidação de resultados para diretoria e comitês. Sumário executivo, evolução histórica e comparativos entre unidades.",
    color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    icon: ShieldCheck,
    title: "Evidências e auditoria",
    desc: "Histórico completo, trilhas de ação e anexos organizados para suportar governança interna e auditorias externas.",
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    icon: LockKeyhole,
    title: "Privacidade (LGPD by design)",
    desc: "Anonimização configurável, limiares mínimos para publicação de recortes e controle granular de escopo por perfil.",
    color: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
  {
    icon: Users,
    title: "Multiunidades e perfis",
    desc: "Estrutura organizacional completa com RBAC, escopos por CNPJ/unidade e visão corporativa unificada.",
    color: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  {
    icon: GraduationCap,
    title: "Treinamentos (LMS)",
    desc: "Biblioteca de conteúdos, trilhas de aprendizagem por dimensão NR-1, atribuição por setor e certificados com QR Code.",
    color: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  },
  {
    icon: Award,
    title: "Certificados rastreáveis",
    desc: "Certificados digitais com código de validação público. Qualquer pessoa pode verificar autenticidade em tempo real.",
    color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  },
] as const;

const CAPABILITIES = [
  { label: "Multi-CNPJ nativo", included: true },
  { label: "Isolamento multi-tenant", included: true },
  { label: "RBAC granular", included: true },
  { label: "Trilha de auditoria", included: true },
  { label: "Anonimização configurável", included: true },
  { label: "Plano de ação com evidências", included: true },
  { label: "LMS com certificados", included: true },
  { label: "Relatórios executivos", included: true },
  { label: "API documentada", included: true },
  { label: "Backup automático", included: true },
  { label: "Criptografia AES-256", included: true },
  { label: "SLA Enterprise", included: true },
];

export default function RecursosPage() {
  return (
    <div>
      <Section className="pt-10 md:pt-16">
        <Container>
          <SectionHeader
            eyebrow="Recursos da plataforma"
            title="Tudo que você precisa para gestão de governança e evidências NR-1 — em uma só plataforma"
            lead="Do diagnóstico à evidência auditável, cada módulo foi desenhado para reduzir fricção operacional e aumentar confiança na informação."
            align="center"
          />

          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <Card key={f.title} className="group p-6 transition-shadow hover:shadow-lg">
                <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${f.color}`}>
                  <f.icon className="h-6 w-6" />
                </div>
                <div className="mt-4 text-base font-semibold">{f.title}</div>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* CAPABILITIES CHECKLIST */}
      <Section>
        <Container>
          <SectionHeader
            eyebrow="Capacidades enterprise"
            title="Construída para ambientes corporativos reais"
            lead="Cada item abaixo é arquitetura, não promessa. Isolamento, governança e rastreabilidade como baseline."
            align="center"
          />

          <div className="mx-auto mt-10 max-w-3xl">
            <Card className="p-6 md:p-8">
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {CAPABILITIES.map((cap) => (
                  <div key={cap.label} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                    <span>{cap.label}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </Container>
      </Section>

      {/* GOVERNANCE DEEP DIVE */}
      <Section>
        <Container>
          <SectionHeader
            eyebrow="Enterprise não é só visual"
            title="Governança, consistência e escala"
            lead="O diferencial está na operação: dados confiáveis, escopos corretos e evidências sempre organizadas."
          />

          <div className="mt-10 grid gap-4 md:grid-cols-12">
            <Card className="group p-6 transition-shadow hover:shadow-lg md:col-span-7">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Shield className="h-4 w-4 text-primary" /> Escopos e permissões por CNPJ / unidade
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Estruture acesso por perfil e limite visibilidade ao necessário. Reduz ruído e aumenta accountability.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Admin, RH, SST, liderança e consultoria</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Escopo corporativo vs. operacional</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Trilhas de mudanças e ações</li>
              </ul>
            </Card>

            <Card className="group p-6 transition-shadow hover:shadow-lg md:col-span-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <LockKeyhole className="h-4 w-4 text-primary" /> Privacidade e anonimização
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Políticas de anonimização configuráveis e limiares mínimos para publicação de recortes.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Limiar mínimo por grupo</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Ocultação de recortes sensíveis</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Exports controlados</li>
              </ul>
            </Card>

            <Card className="group p-6 transition-shadow hover:shadow-lg md:col-span-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <TrendingUp className="h-4 w-4 text-primary" /> Relatórios com narrativa
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Não é só gráfico: é contexto, histórico e evidência para tomada de decisão.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Sumário executivo</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Evolução por período</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Comparativos entre unidades</li>
              </ul>
            </Card>

            <Card className="group p-6 transition-shadow hover:shadow-lg md:col-span-7">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Layers className="h-4 w-4 text-primary" /> Plano de ação e evidências
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Conecte insights a ações com responsáveis e prazos, mantendo evidências anexadas e histórico.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Responsáveis, prazos e acompanhamento</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Evidências anexadas e versionamento</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Trilhas para auditoria e governança</li>
              </ul>
            </Card>
          </div>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/contato" className="no-underline">
                Solicitar demonstração <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/planos" className="no-underline">
                Ver planos e preços
              </Link>
            </Button>
          </div>
        </Container>
      </Section>
    </div>
  );
}
