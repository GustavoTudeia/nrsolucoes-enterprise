import { Card } from "@/components/ui/card";
import { Section, Container, SectionHeader } from "@/components/marketing/section";

export default function PrivacidadePage() {
  return (
    <div>
      <Section className="pt-10 md:pt-16">
        <Container>
          <SectionHeader
            eyebrow="Privacidade"
            title="Política de Privacidade (resumo)"
            lead="Este conteúdo é um placeholder. Em produção, substitua por um texto jurídico revisado e aderente à LGPD, com transparência e base legal."
          />

          <div className="mt-10 grid gap-4">
            <Card className="p-6">
              <div className="text-base font-semibold">Princípios (LGPD by design)</div>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>• Minimização: coletar somente o necessário para o objetivo declarado.</li>
                <li>• Finalidade e transparência: informar como e por que os dados são tratados.</li>
                <li>• Segurança: controles técnicos e organizacionais para reduzir risco.</li>
                <li>• Governança: perfis, escopos e trilhas para auditoria interna.</li>
              </ul>
            </Card>

            <Card className="p-6">
              <div className="text-base font-semibold">Categorias de dados (exemplos)</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Dependendo do módulo, podem ser tratados dados cadastrais (administradores), dados organizacionais
                (unidades, áreas) e respostas agregadas/anônimas em campanhas.
              </p>
            </Card>

            <Card className="p-6">
              <div className="text-base font-semibold">Direitos do titular</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Em produção, descreva o canal de contato e procedimentos para solicitações (acesso, correção, exclusão,
                portabilidade, informação sobre compartilhamento etc.).
              </p>
            </Card>

            <p className="text-xs text-muted-foreground">
              Observação: este resumo não substitui um documento jurídico. Recomenda-se revisão por profissional
              especializado antes de publicar.
            </p>
          </div>
        </Container>
      </Section>
    </div>
  );
}
