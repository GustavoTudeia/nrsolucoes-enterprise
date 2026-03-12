import Link from "next/link";
import { ArrowRight, Building2, Clock, Mail, MessageCircle, MessageSquareText, Phone, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Section, Container, SectionHeader } from "@/components/marketing/section";
import { SUPPORT } from "@/config/brand";

export default function ContatoPage() {
  return (
    <div>
      <Section className="pt-10 md:pt-16">
        <Container>
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <SectionHeader
                eyebrow="Vamos conversar"
                title="Agende uma demonstração orientada ao seu contexto"
                lead="Mostramos o fluxo completo (campanhas → insights → plano de ação → evidências) e discutimos governança, privacidade e operação multi-CNPJ."
              />

              <div className="mt-8 grid gap-4">
                {[
                  {
                    icon: MessageSquareText,
                    title: "Demonstração guiada",
                    desc: "Entenda como a plataforma se encaixa no seu modelo de operação e governança.",
                  },
                  {
                    icon: ShieldCheck,
                    title: "Privacidade e segurança",
                    desc: "Falamos sobre LGPD by design, anonimização e controles de acesso.",
                  },
                  {
                    icon: Mail,
                    title: "Proposta e implantação",
                    desc: "Opções de onboarding, limites e adequação de plano por contrato.",
                  },
                ].map((i) => (
                  <Card key={i.title} className="group p-6 transition-shadow hover:shadow-lg">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-background shadow-sm">
                        <i.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="text-base font-semibold">{i.title}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{i.desc}</div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <Card className="mt-6 border-primary/20 p-6">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Clock className="h-4 w-4 text-primary" /> Tempo de resposta
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Retornamos em até 24h úteis com uma agenda sugerida e próximos passos personalizados.
                </p>
              </Card>

              <p className="mt-6 text-xs text-muted-foreground">
                Observação: a plataforma apoia gestão e governança; a adequação à NR-1 depende de processos, políticas e
                decisões da organização.
              </p>
            </div>

            <Card className="p-6 md:p-8">
              <div className="font-display text-xl font-semibold tracking-tight">Solicitar contato</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Preencha abaixo e retornaremos com uma agenda sugerida e próximos passos.
              </p>

              <form className="mt-6 space-y-4">
                <div>
                  <label className="text-sm font-medium" htmlFor="nome">Nome</label>
                  <Input id="nome" placeholder="Seu nome completo" className="mt-1" />
                </div>

                <div>
                  <label className="text-sm font-medium" htmlFor="empresa">Empresa</label>
                  <Input id="empresa" placeholder="Nome da empresa" className="mt-1" />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium" htmlFor="email">Email corporativo</label>
                    <Input id="email" type="email" placeholder="voce@empresa.com.br" className="mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium" htmlFor="telefone">Telefone</label>
                    <Input id="telefone" type="tel" placeholder="(11) 99999-9999" className="mt-1" />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium" htmlFor="porte">Porte da empresa</label>
                  <Input id="porte" placeholder="Ex: 3 CNPJs, 15 unidades, ~2.000 colaboradores" className="mt-1" />
                </div>

                <div>
                  <label className="text-sm font-medium" htmlFor="msg">Mensagem</label>
                  <Textarea
                    id="msg"
                    placeholder="Conte rapidamente o contexto: quantidade de CNPJs/unidades, público e objetivos."
                    className="mt-1 min-h-[100px]"
                  />
                </div>

                <Button type="button" className="w-full" size="lg">
                  Enviar solicitação <ArrowRight className="ml-2 h-4 w-4" />
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
                  <div className="relative flex justify-center"><span className="bg-card px-3 text-xs text-muted-foreground">ou</span></div>
                </div>

                <Button type="button" variant="secondary" asChild className="w-full" size="lg">
                  <a href={SUPPORT.whatsapp.url} target="_blank" rel="noopener noreferrer">
                    Falar via WhatsApp <MessageCircle className="ml-2 h-4 w-4" />
                  </a>
                </Button>

                <div className="text-center text-xs text-muted-foreground">
                  Ao enviar, você concorda com nossos{" "}
                  <Link href="/termos" className="underline underline-offset-4">Termos</Link>{" "}e{" "}
                  <Link href="/privacidade" className="underline underline-offset-4">Privacidade</Link>.
                </div>
              </form>
            </Card>
          </div>
        </Container>
      </Section>
    </div>
  );
}
