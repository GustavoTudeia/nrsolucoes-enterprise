import { Card } from "@/components/ui/card";
import { Section, Container, SectionHeader } from "@/components/marketing/section";

export default function TermosPage() {
  return (
    <div>
      <Section className="pt-10 md:pt-16">
        <Container>
          <SectionHeader
            eyebrow="Termos"
            title="Termos de Uso (placeholder)"
            lead="Este conteúdo é um placeholder. Em produção, inclua SLA, responsabilidades, limitações, conformidade, regras de segurança e (se aplicável) programa de afiliados."
          />

          <div className="mt-10 grid gap-4">
            <Card className="p-6">
              <div className="text-base font-semibold">1) Uso do serviço</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Defina escopo do serviço, usuários autorizados, regras de acesso e obrigações do cliente.
              </p>
            </Card>

            <Card className="p-6">
              <div className="text-base font-semibold">2) Disponibilidade e suporte</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Detalhe SLA, janela de manutenção, canais de suporte e tempos de resposta.
              </p>
            </Card>

            <Card className="p-6">
              <div className="text-base font-semibold">3) Segurança e privacidade</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Descreva controles, deveres do cliente e regras de confidencialidade, além de DPA quando aplicável.
              </p>
            </Card>

            <Card className="p-6">
              <div className="text-base font-semibold">4) Limitações e responsabilidades</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Inclua limitações de responsabilidade, uso aceitável e regras para conteúdo/anexos enviados.
              </p>
            </Card>

            <p className="text-xs text-muted-foreground">
              Recomenda-se revisão jurídica antes de publicar estes termos em ambiente produtivo.
            </p>
          </div>
        </Container>
      </Section>
    </div>
  );
}
