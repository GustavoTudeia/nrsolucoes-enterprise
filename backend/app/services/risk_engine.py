from __future__ import annotations
from typing import Dict, Any, List, Tuple


def compute_dimension_scores(questionnaire_content: Dict[str, Any], answers_list: List[Dict[str, Any]]) -> Dict[str, float]:
    questions = questionnaire_content.get("questions", [])
    qmap = {q.get("id"): q for q in questions if q.get("id")}
    dim_sum: Dict[str, float] = {}
    dim_w: Dict[str, float] = {}

    for answers in answers_list:
        for qid, val in (answers or {}).items():
            q = qmap.get(qid)
            if not q:
                continue
            dim = q.get("dimension") or "general"
            w = float(q.get("weight") or 1.0)
            smin = float(q.get("scale_min") or 1.0)
            smax = float(q.get("scale_max") or 5.0)
            try:
                v = float(val)
            except Exception:
                continue
            if smax <= smin:
                nv = 0.0
            else:
                nv = (v - smin) / (smax - smin)
                nv = max(0.0, min(1.0, nv))
            dim_sum[dim] = dim_sum.get(dim, 0.0) + nv * w
            dim_w[dim] = dim_w.get(dim, 0.0) + w

    return {dim: round(s / max(dim_w.get(dim, 1.0), 1e-9), 4) for dim, s in dim_sum.items()}


def apply_criterion(criterion_content: Dict[str, Any], dim_scores: Dict[str, float]) -> Tuple[float, str]:
    """Aplica critério de classificação.

    Semântica adotada: score maior = controles/maturidade melhores = risco menor.
    Para compatibilidade com seeds legados, aceitamos:
    - thresholds.low = limite mínimo para risco baixo
    - thresholds.high = limite mínimo para risco médio
    Ex.: low=0.7 e high=0.4  => >=0.7 low, >=0.4 medium, <0.4 high.
    Caso venham invertidos, normalizamos.
    """
    weights = criterion_content.get("weights") or {}
    thresholds = criterion_content.get("thresholds") or {"low": 0.70, "high": 0.40}

    total_w = 0.0
    total = 0.0
    for dim, score in dim_scores.items():
        w = float(weights.get(dim, 1.0))
        total += float(score) * w
        total_w += w
    score = round((total / total_w) if total_w > 0 else 0.0, 4)

    low_risk_min = float(thresholds.get("low", 0.70))
    medium_risk_min = float(thresholds.get("high", 0.40))
    if low_risk_min < medium_risk_min:
        low_risk_min, medium_risk_min = medium_risk_min, low_risk_min

    if score >= low_risk_min:
        level = "low"
    elif score >= medium_risk_min:
        level = "medium"
    else:
        level = "high"
    return score, level
