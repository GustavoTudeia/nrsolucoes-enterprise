"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, ShieldX, Search, Award, Building2,
  Calendar, Clock, User, FileText, Loader2,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface CertificateResult {
  valid: boolean;
  message: string;
  certificate_number?: string;
  employee_name?: string;
  training_title?: string;
  training_description?: string;
  issued_at?: string;
  valid_until?: string;
  issuer_name?: string;
  issuer_cnpj?: string;
  training_completed_at?: string;
  training_duration_minutes?: number;
  risk_dimension?: string;
}

const DIMENSION_LABELS: Record<string, string> = {
  governance: "Governança",
  hazards: "Identificação de Perigos",
  controls: "Controles",
  training: "Capacitação",
};

function formatDate(iso: string | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDuration(minutes: number | undefined): string {
  if (!minutes) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h${m > 0 ? ` ${m}min` : ""}`;
  return `${m} minutos`;
}

export default function ValidarCertificadoPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CertificateResult | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleValidate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;

    setLoading(true);
    setResult(null);
    setSearched(true);

    try {
      const res = await fetch(
        `${API_URL}/api/v1/public/certificates/validate/${encodeURIComponent(trimmed)}`
      );
      if (!res.ok) throw new Error("Erro ao validar");
      const data: CertificateResult = await res.json();
      setResult(data);
    } catch {
      setResult({
        valid: false,
        message: "Erro ao consultar. Verifique o código e tente novamente.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container max-w-2xl py-12 md:py-20">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <ShieldCheck className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          Validar Certificado
        </h1>
        <p className="mt-2 text-muted-foreground">
          Insira o código de validação presente no certificado para verificar sua autenticidade.
        </p>
      </div>

      {/* Search form */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleValidate} className="flex gap-2">
            <Input
              placeholder="Ex: 089EC378D5F58AEE"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="font-mono text-lg tracking-wider"
              maxLength={32}
              autoFocus
            />
            <Button type="submit" disabled={loading || !code.trim()}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              <span className="ml-2 hidden sm:inline">Validar</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Result */}
      {searched && result && (
        <Card className={`mt-6 border-2 ${
          result.valid
            ? "border-green-200 dark:border-green-800"
            : "border-red-200 dark:border-red-800"
        }`}>
          {/* Status banner */}
          <div className={`px-6 py-4 ${
            result.valid
              ? "bg-green-50 dark:bg-green-950/30"
              : "bg-red-50 dark:bg-red-950/30"
          }`}>
            <div className="flex items-center gap-3">
              {result.valid ? (
                <ShieldCheck className="h-8 w-8 text-green-600 dark:text-green-400" />
              ) : (
                <ShieldX className="h-8 w-8 text-red-600 dark:text-red-400" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h2 className={`text-lg font-bold ${
                    result.valid
                      ? "text-green-700 dark:text-green-300"
                      : "text-red-700 dark:text-red-300"
                  }`}>
                    {result.valid ? "Certificado Válido" : "Certificado Inválido"}
                  </h2>
                  <Badge variant={result.valid ? "default" : "outline"}>
                    {result.valid ? "Autenticado" : "Não validado"}
                  </Badge>
                </div>
                <p className={`text-sm ${
                  result.valid
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                }`}>
                  {result.message}
                </p>
              </div>
            </div>
          </div>

          {/* Certificate details */}
          {result.certificate_number && (
            <CardContent className="pt-6">
              <div className="space-y-4">
                {/* Certificate number */}
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                  <Award className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-xs text-muted-foreground">Certificado N&ordm;</div>
                    <div className="font-mono font-semibold">{result.certificate_number}</div>
                  </div>
                </div>

                {/* Details grid */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {result.employee_name && (
                    <div className="flex items-start gap-3">
                      <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Colaborador</div>
                        <div className="font-medium">{result.employee_name}</div>
                      </div>
                    </div>
                  )}

                  {result.training_title && (
                    <div className="flex items-start gap-3">
                      <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Treinamento</div>
                        <div className="font-medium">{result.training_title}</div>
                      </div>
                    </div>
                  )}

                  {result.training_completed_at && (
                    <div className="flex items-start gap-3">
                      <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Concluído em</div>
                        <div className="font-medium">{formatDate(result.training_completed_at)}</div>
                      </div>
                    </div>
                  )}

                  {result.issued_at && (
                    <div className="flex items-start gap-3">
                      <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Emitido em</div>
                        <div className="font-medium">{formatDate(result.issued_at)}</div>
                      </div>
                    </div>
                  )}

                  {result.training_duration_minutes && (
                    <div className="flex items-start gap-3">
                      <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Carga horária</div>
                        <div className="font-medium">{formatDuration(result.training_duration_minutes)}</div>
                      </div>
                    </div>
                  )}

                  {result.issuer_name && (
                    <div className="flex items-start gap-3">
                      <Building2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Emitido por</div>
                        <div className="font-medium">{result.issuer_name}</div>
                        {result.issuer_cnpj && (
                          <div className="text-xs text-muted-foreground">
                            CNPJ: {result.issuer_cnpj}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {result.valid_until && (
                    <div className="flex items-start gap-3">
                      <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Válido até</div>
                        <div className="font-medium">{formatDate(result.valid_until)}</div>
                      </div>
                    </div>
                  )}

                  {result.risk_dimension && (
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Dimensão NR-1</div>
                        <div className="font-medium">
                          {DIMENSION_LABELS[result.risk_dimension] || result.risk_dimension}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {result.training_description && (
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground mb-1">Descrição do treinamento</div>
                    <p className="text-sm">{result.training_description}</p>
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Info */}
      <div className="mt-8 rounded-lg border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
        <p>
          O código de validação pode ser encontrado no rodapé do certificado em PDF.
        </p>
        <p className="mt-1">
          Em caso de dúvidas, entre em contato com a empresa emissora do certificado.
        </p>
      </div>
    </div>
  );
}
