"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getPublicCampaign, submitSurveyResponse, type PublicCampaignOut } from "@/lib/api/public";
import { validateSurveyToken, submitSurveyWithToken } from "@/lib/api/invitations";
import { AlertTriangle, CheckCircle2, Clock, Lock, XCircle } from "lucide-react";

type AnswerValue = number | string;

export default function PesquisaPage() {
  const params = useParams<{ campaignId: string }>();
  const searchParams = useSearchParams();
  const campaignId = params?.campaignId as string;
  const token = searchParams?.get("token") || "";

  const [data, setData] = useState<PublicCampaignOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [orgUnitId, setOrgUnitId] = useState<string>("");
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitted, setSubmitted] = useState(false);

  // Token validation state
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenInfo, setTokenInfo] = useState<{
    campaign_name?: string;
    questionnaire_title?: string;
    expires_at?: string;
  } | null>(null);

  const questions = useMemo(() => (data?.questionnaire?.questions as any[]) ?? [], [data]);

  // Validate token if present
  async function validateToken() {
    if (!token || !campaignId) {
      setTokenValid(null);
      return;
    }

    setLoading(true);
    try {
      const result = await validateSurveyToken(campaignId, token);
      setTokenValid(result.valid);
      if (result.valid) {
        setTokenInfo({
          campaign_name: result.campaign_name,
          questionnaire_title: result.questionnaire_title,
          expires_at: result.expires_at,
        });
        setTokenError(null);
      } else {
        setTokenError(result.error || "Token inválido");
        setTokenInfo(null);
      }
    } catch (e: any) {
      setTokenValid(false);
      setTokenError(e?.message || "Falha ao validar token");
      setTokenInfo(null);
    } finally {
      setLoading(false);
    }
  }

  // Load campaign data
  async function load() {
    if (!campaignId) return;
    setLoading(true);
    try {
      const r = await getPublicCampaign(campaignId);
      setData(r);
      setOrgUnitId("");
      setAnswers({});
      setSubmitted(false);
    } catch (e: any) {
      toast.error(e?.message || "Campanha inválida ou não está aberta");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      validateToken();
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, token]);

  function setAnswer(qid: string, v: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [qid]: v }));
  }

  function allAnswered(): boolean {
    if (!questions.length) return false;
    return questions.every((q) => answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== "");
  }

  async function onSubmit() {
    try {
      if (!data) throw new Error("Campanha não carregada");
      if (!questions.length) throw new Error("Questionário inválido");
      if (!allAnswered()) throw new Error("Responda todas as perguntas antes de enviar");

      // Se tem token, usar endpoint com token
      if (token && tokenValid) {
        await submitSurveyWithToken(campaignId, {
          token,
          org_unit_id: orgUnitId || undefined,
          answers,
        });
      } else if (!token) {
        // Sem token - usar endpoint legado (se campanha permitir)
        await submitSurveyResponse(campaignId, {
          org_unit_id: orgUnitId || undefined,
          answers,
        });
      } else {
        throw new Error("Token inválido. Solicite um novo convite.");
      }

      setSubmitted(true);
      toast.success("Resposta enviada com sucesso. Obrigado!");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao enviar");
    }
  }

  // Loading state
  if (loading && !data) {
    return (
      <div className="container py-10">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-5 w-5 animate-pulse" />
          Carregando...
        </div>
      </div>
    );
  }

  // Token validation error
  if (token && tokenValid === false) {
    return (
      <div className="container py-10 max-w-lg mx-auto">
        <Card className="border-red-200">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle className="text-red-700">Convite Inválido</CardTitle>
            <CardDescription className="text-red-600">
              {tokenError === "used" && "Este convite já foi utilizado. Cada colaborador pode responder apenas uma vez."}
              {tokenError === "expired" && "Este convite expirou. Solicite um novo convite ao RH."}
              {tokenError === "revoked" && "Este convite foi cancelado. Entre em contato com o RH."}
              {tokenError === "campaign_closed" && "Esta pesquisa já foi encerrada."}
              {tokenError === "not_found" && "Token inválido ou não encontrado."}
              {!["used", "expired", "revoked", "campaign_closed", "not_found"].includes(tokenError || "") && tokenError}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-sm text-muted-foreground">
              Se você acredita que isso é um erro, entre em contato com o departamento de RH ou o responsável pela pesquisa.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Campaign not found
  if (!data) {
    return (
      <div className="container py-10 space-y-4">
        <h1 className="text-2xl font-semibold">Pesquisa</h1>
        <p className="text-muted-foreground">Campanha não encontrada ou não está aberta para respostas.</p>
        <Button onClick={load} variant="secondary">
          Tentar novamente
        </Button>
      </div>
    );
  }

  // Submitted successfully
  if (submitted) {
    return (
      <div className="container py-10 max-w-lg mx-auto">
        <Card className="border-emerald-200">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <CardTitle className="text-emerald-700">Resposta Registrada!</CardTitle>
            <CardDescription>
              Obrigado pela sua participação. Sua resposta foi registrada de forma anônima.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="text-sm text-muted-foreground">
              Você já pode fechar esta página.
            </div>
            <div className="rounded-lg bg-muted/50 p-4 text-xs text-muted-foreground">
              <Lock className="h-4 w-4 inline mr-1" />
              Sua identidade não está vinculada às respostas. Os resultados serão apresentados 
              apenas de forma agregada, respeitando a LGPD.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-10 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{tokenInfo?.campaign_name || data.campaign.name}</h1>
        <p className="text-sm text-muted-foreground">
          Pesquisa anônima. Não coletamos nome, e-mail ou identificadores pessoais. 
          Resultados só são liberados em forma agregada.
        </p>
        
        {/* Token info */}
        {token && tokenValid && tokenInfo?.expires_at && (
          <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 rounded-lg p-2">
            <Clock className="h-4 w-4" />
            Convite válido até: {new Date(tokenInfo.expires_at).toLocaleDateString("pt-BR")}
          </div>
        )}
      </div>

      {/* Privacy notice */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <Lock className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <strong>Garantia de Anonimato:</strong> Esta pesquisa segue as diretrizes da NR-1 e LGPD. 
              Suas respostas não são vinculadas à sua identidade. Os resultados são apresentados 
              apenas quando há um número mínimo de respostas ({data.min_anon_threshold}+ por grupo).
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Questionnaire */}
      <Card>
        <CardHeader>
          <CardTitle>Questionário</CardTitle>
          {tokenInfo?.questionnaire_title && (
            <CardDescription>{tokenInfo.questionnaire_title}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Org unit selection */}
          {data.allow_org_unit_selection && (
            <div className="grid gap-2">
              <Label>Seu setor/unidade (opcional)</Label>
              <select 
                className="h-10 rounded-md border bg-background px-3 text-sm" 
                value={orgUnitId} 
                onChange={(e) => setOrgUnitId(e.target.value)}
              >
                <option value="">Prefiro não informar</option>
                {data.org_units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <div className="text-xs text-muted-foreground">
                Informar o setor ajuda na análise segmentada, mas não identifica você individualmente.
              </div>
            </div>
          )}

          {/* Questions */}
          <div className="space-y-4">
            {questions.map((q, idx) => {
              const scale = (q.scale as any[]) ?? [1, 2, 3, 4, 5];
              const scaleLabels: Record<number, string> = {
                1: "Discordo totalmente",
                2: "Discordo",
                3: "Neutro",
                4: "Concordo",
                5: "Concordo totalmente",
              };
              
              return (
                <div key={q.id} className="rounded-lg border p-4 space-y-3">
                  <div className="space-y-1">
                    <div className="font-medium">
                      {idx + 1}. {q.text}
                    </div>
                    {q.dimension && (
                      <div className="text-xs text-muted-foreground">
                        Dimensão: {q.dimension}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {scale.map((v) => {
                      const isSelected = String(answers[q.id] ?? "") === String(v);
                      return (
                        <button
                          key={String(v)}
                          type="button"
                          onClick={() => setAnswer(q.id, Number(v))}
                          className={`
                            px-4 py-2 rounded-md border text-sm transition-colors
                            ${isSelected 
                              ? "bg-primary text-primary-foreground border-primary" 
                              : "bg-background hover:bg-muted border-input"
                            }
                          `}
                          title={scaleLabels[Number(v)] || String(v)}
                        >
                          {String(v)}
                        </button>
                      );
                    })}
                  </div>
                  
                  {/* Scale labels */}
                  <div className="flex justify-between text-xs text-muted-foreground px-1">
                    <span>{scaleLabels[1]}</span>
                    <span>{scaleLabels[5]}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progress */}
          <div className="text-sm text-muted-foreground text-center">
            {Object.keys(answers).length} de {questions.length} questões respondidas
          </div>

          {/* Submit */}
          <Button 
            onClick={onSubmit} 
            disabled={!allAnswered()} 
            className="w-full"
            size="lg"
          >
            {allAnswered() ? "Enviar Respostas" : "Responda todas as questões"}
          </Button>

          {/* Footer notice */}
          <div className="text-xs text-muted-foreground text-center">
            Limiar mínimo de anonimato: {data.min_anon_threshold} respostas por grupo.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
