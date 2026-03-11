# PATCH: Atualizar tipos em frontend/src/lib/api/actionPlans.ts
#
# Adicionar campos de enrollment ao ActionItemOut
#
# INSTRUÇÕES:
# Localize a interface ActionItemOut e adicione os seguintes campos após evidence_count:

# Campos a adicionar:

  // Público-alvo (para itens educativos)
  target_type?: string | null;          // all_employees | org_unit | cnpj | selected
  target_org_unit_id?: string | null;
  target_cnpj_id?: string | null;
  auto_enroll?: boolean;
  enrollment_due_days?: number;
  require_all_completions?: boolean;
  auto_complete_on_all_done?: boolean;

  // Estatísticas de enrollment (cache)
  enrollment_total?: number;
  enrollment_completed?: number;
  enrollment_in_progress?: number;
  enrollment_pending?: number;

# A interface completa ficará assim:

export interface ActionItemOut {
  id: string;
  action_plan_id: string;
  item_type: "educational" | "organizational" | "administrative" | "support";
  title: string;
  description?: string | null;
  responsible?: string | null;
  responsible_user_id?: string | null;
  responsible_user?: ResponsibleUserInfo | null;
  due_date?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  status: string;
  priority: string;
  related_dimension?: string | null;
  education_ref_type?: string | null;
  education_ref_id?: string | null;
  created_by_user_id?: string | null;
  created_at: string;
  is_overdue: boolean;
  days_until_due?: number | null;
  evidences?: ActionEvidenceOut[] | null;
  comments?: ActionItemCommentOut[] | null;
  history?: ActionItemHistoryOut[] | null;
  evidence_count: number;
  comment_count: number;
  
  // Público-alvo (para itens educativos)
  target_type?: string | null;
  target_org_unit_id?: string | null;
  target_cnpj_id?: string | null;
  auto_enroll?: boolean;
  enrollment_due_days?: number;
  require_all_completions?: boolean;
  auto_complete_on_all_done?: boolean;

  // Estatísticas de enrollment
  enrollment_total?: number;
  enrollment_completed?: number;
  enrollment_in_progress?: number;
  enrollment_pending?: number;
}
