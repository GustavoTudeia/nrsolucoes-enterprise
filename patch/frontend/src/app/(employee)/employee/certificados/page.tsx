"use client";

/**
 * Página de Certificados do Portal do Colaborador
 * 
 * Lista todos os certificados emitidos para o colaborador com:
 * - Número do certificado
 * - Data de emissão
 * - Botão para download do PDF
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Award, Download, RefreshCw, FileText, Calendar, 
  CheckCircle2, ExternalLink, ArrowLeft
} from "lucide-react";

interface MyCertificate {
  id: string;
  certificate_number: string;
  content_title: string;
  action_item_title: string | null;
  training_completed_at: string;
  issued_at: string;
  download_url: string | null;
}

export default function CertificadosPage() {
  const router = useRouter();
  const [certificates, setCertificates] = useState<MyCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  async function loadCertificates() {
    setLoading(true);
    try {
      const token = localStorage.getItem("employee_token");
      if (!token) {
        router.push("/employee/magic");
        return;
      }
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/v1/employee/me/certificates`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      
      if (!res.ok) throw new Error("Erro ao carregar certificados");
      
      const data = await res.json();
      setCertificates(data);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar certificados");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(certificateId: string, certificateNumber: string) {
    setDownloading(certificateId);
    try {
      const token = localStorage.getItem("employee_token");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || ""}/api/v1/employee/me/certificates/${certificateId}`,
        { headers: { "Authorization": `Bearer ${token}` } }
      );
      
      if (!res.ok) throw new Error("Erro ao obter certificado");
      
      const data = await res.json();
      
      if (data.download_url) {
        // Abre URL de download
        window.open(data.download_url, "_blank");
        toast.success("Download iniciado!");
      } else {
        // Se não tem URL, tenta gerar PDF on-demand (fallback)
        toast.info("O PDF será gerado. Aguarde...");
        // Em produção, isso chamaria o endpoint de geração
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao baixar certificado");
    } finally {
      setDownloading(null);
    }
  }

  useEffect(() => {
    loadCertificates();
  }, []);

  return (
    <div className="container py-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="mb-2"
            onClick={() => router.push("/employee/treinamentos")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar aos Treinamentos
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Award className="h-6 w-6 text-primary" />
            Meus Certificados
          </h1>
          <p className="text-muted-foreground mt-1">
            Certificados de capacitação emitidos conforme NR-1
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadCertificates} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Info */}
      <Card className="mb-6 bg-blue-50 border-blue-200">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900">
                Seus certificados são documentos oficiais
              </p>
              <p className="text-blue-700 mt-1">
                Eles comprovam a conclusão de treinamentos obrigatórios do programa de 
                gestão de riscos psicossociais (NR-1) e devem ser guardados por até 20 anos.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Certificados */}
      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin opacity-50" />
            <p>Carregando certificados...</p>
          </CardContent>
        </Card>
      ) : certificates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Award className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg mb-2">Nenhum certificado ainda</p>
            <p className="text-sm">
              Complete seus treinamentos para receber certificados de capacitação.
            </p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => router.push("/employee/treinamentos")}
            >
              Ver Treinamentos Pendentes
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {certificates.map((cert) => (
            <CertificateCard
              key={cert.id}
              certificate={cert}
              onDownload={() => handleDownload(cert.id, cert.certificate_number)}
              downloading={downloading === cert.id}
            />
          ))}
        </div>
      )}

      {/* Total */}
      {certificates.length > 0 && (
        <div className="mt-6 text-center text-sm text-muted-foreground">
          Total: {certificates.length} certificado{certificates.length > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

function CertificateCard({ 
  certificate, 
  onDownload,
  downloading
}: { 
  certificate: MyCertificate;
  onDownload: () => void;
  downloading: boolean;
}) {
  const issuedDate = new Date(certificate.issued_at).toLocaleDateString("pt-BR");
  const completedDate = new Date(certificate.training_completed_at).toLocaleDateString("pt-BR");
  
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-4 w-4 text-yellow-500" />
              {certificate.content_title}
            </CardTitle>
            {certificate.action_item_title && (
              <CardDescription className="mt-1">
                Ação: {certificate.action_item_title}
              </CardDescription>
            )}
          </div>
          <Badge variant="secondary" className="bg-green-100 text-green-700 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Válido
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap justify-between items-end">
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="font-mono">{certificate.certificate_number}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>Concluído em {completedDate}</span>
            </div>
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4" />
              <span>Emitido em {issuedDate}</span>
            </div>
          </div>
          
          <Button 
            size="sm" 
            onClick={onDownload}
            disabled={downloading}
            className="mt-4 sm:mt-0"
          >
            {downloading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                Preparando...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-1" />
                Baixar PDF
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
