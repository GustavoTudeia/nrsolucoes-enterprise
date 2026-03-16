import { Card } from "@/components/ui/card";
import { Section, Container, SectionHeader } from "@/components/marketing/section";

export default function PrivacidadePage() {
  return (
    <div>
      <Section className="pt-10 md:pt-16">
        <Container>
          <SectionHeader
            eyebrow="Privacidade"
            title="Política de Privacidade"
            lead="Versão base para operação enterprise com transparência, governança e controles alinhados à LGPD. Ajuste contatos, bases legais, compartilhamentos e prazos conforme sua operação e revisão jurídica."
          />

          <div className="mt-10 grid gap-4">
            <Card className="p-6">
              <div className="text-base font-semibold">1) Princípios de tratamento</div>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>• Finalidade específica e limitação ao necessário para os fluxos contratados.</li>
                <li>• Segurança, rastreabilidade e segregação por tenant/escopo.</li>
                <li>• Transparência sobre categorias de dados, operadores e integrações.</li>
                <li>• Governança para revisão, retenção, descarte e resposta a incidentes.</li>
              </ul>
            </Card>

            <Card className="p-6">
              <div className="text-base font-semibold">2) Categorias de dados</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Dependendo do módulo contratado, podem ser tratados dados cadastrais de administradores e gestores, dados organizacionais
                (CNPJ, unidades, cargos, estruturas), dados de colaboradores necessários à operação, conteúdos/evidências anexadas e respostas
                de campanhas sujeitas a anonimização e limiares mínimos quando aplicável.
              </p>
            </Card>

            <Card className="p-6">
              <div className="text-base font-semibold">3) Compartilhamento e operadores</div>
              <p className="mt-2 text-sm text-muted-foreground">
                O compartilhamento pode ocorrer com provedores de infraestrutura, autenticação, comunicação, faturamento, armazenamento,
                analytics e integrações expressamente habilitadas pelo cliente, sempre dentro dos limites contratuais e da legislação aplicável.
              </p>
            </Card>

            <Card className="p-6">
              <div className="text-base font-semibold">4) Retenção e direitos dos titulares</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Os prazos de retenção devem observar a finalidade do tratamento, obrigações legais e requisitos de auditoria. O titular pode
                exercer direitos previstos em lei pelos canais indicados pelo controlador, observadas as hipóteses legais e contratuais.
              </p>
            </Card>

            <Card className="p-6">
              <div className="text-base font-semibold">5) Medidas de segurança</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Entre as medidas adotadas podem estar autenticação, segregação de escopos, trilha de auditoria, proteção de transporte,
                restrição de acesso, governança de uploads e políticas de revisão operacional. A eficácia dessas medidas depende também da
                correta administração do ambiente e dos acessos pelo cliente.
              </p>
            </Card>

            <p className="text-xs text-muted-foreground">
              Documento-base. Recomenda-se validação jurídica final antes do uso em ambiente produtivo.
            </p>
          </div>
        </Container>
      </Section>
    </div>
  );
}
