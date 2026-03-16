import { Card } from "@/components/ui/card";
import { Section, Container, SectionHeader } from "@/components/marketing/section";

export default function TermosPage() {
  return (
    <div>
      <Section className="pt-10 md:pt-16">
        <Container>
          <SectionHeader
            eyebrow="Termos"
            title="Termos de Uso"
            lead="Versão base para operação SaaS enterprise. Ajuste cláusulas comerciais, SLA, suporte, faturamento e anexos contratuais conforme sua política interna e revisão jurídica."
          />

          <div className="mt-10 grid gap-4">
            <Card className="p-6">
              <div className="text-base font-semibold">1) Objeto e escopo</div>
              <p className="mt-2 text-sm text-muted-foreground">
                A plataforma provê recursos de governança, evidências, inventário, campanhas, planos de ação, trilhas de auditoria,
                aprendizagem e integrações assistidas para gestão NR-1 e módulos correlatos. O cliente permanece responsável pelo uso,
                parametrização, veracidade das informações inseridas e observância das normas aplicáveis ao seu contexto operacional.
              </p>
            </Card>

            <Card className="p-6">
              <div className="text-base font-semibold">2) Perfis, acesso e segurança</div>
              <p className="mt-2 text-sm text-muted-foreground">
                O cliente é responsável por manter perfis autorizados, revisar permissões, preservar credenciais, definir responsáveis por
                aprovações formais e reportar incidentes de segurança. O provedor mantém controles técnicos razoáveis de proteção de acesso,
                rastreabilidade e registro de auditoria.
              </p>
            </Card>

            <Card className="p-6">
              <div className="text-base font-semibold">3) Disponibilidade, manutenção e suporte</div>
              <p className="mt-2 text-sm text-muted-foreground">
                O serviço poderá ter janelas programadas de manutenção, correções emergenciais e evolução contínua. Os níveis de serviço,
                canais de suporte, horários de atendimento e tempos de resposta devem ser definidos em proposta comercial, SLA ou contrato.
              </p>
            </Card>

            <Card className="p-6">
              <div className="text-base font-semibold">4) Faturamento e inadimplência</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Cobranças, renovações, reajustes, cancelamentos, períodos contratados, suspensão por inadimplência, emissão fiscal e envio de
                comprovantes/documentos devem seguir o plano contratado e a política comercial vigente.
              </p>
            </Card>

            <Card className="p-6">
              <div className="text-base font-semibold">5) Limitações e responsabilidade</div>
              <p className="mt-2 text-sm text-muted-foreground">
                A plataforma apoia processos de gestão e rastreabilidade, mas não substitui, por si só, a responsabilidade técnica, legal,
                médica, ergonômica, trabalhista ou fiscal do cliente e de seus prestadores. Integrações assistidas e exportações dependem de
                parametrização correta, rotinas operacionais e validação do cliente.
              </p>
            </Card>

            <Card className="p-6">
              <div className="text-base font-semibold">6) Dados, confidencialidade e encerramento</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Os dados do cliente permanecem protegidos por dever de confidencialidade. Em caso de encerramento, devem ser observadas as
                regras de retenção, exportação, transição, descarte seguro e continuidade definidas contratualmente e pela legislação aplicável.
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
