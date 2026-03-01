from __future__ import annotations
from typing import Dict, Any, List, Tuple

def compute_dimension_scores(questionnaire_content: Dict[str, Any], answers_list: List[Dict[str, Any]]) -> Dict[str, float]:
    # content expected:
    # questions: [{"id":"q1","dimension":"workload","weight":1,"scale_min":1,"scale_max":5}, ...]
    questions = questionnaire_content.get("questions", [])
    # Build question map
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
            # normalize to 0..1
            if smax <= smin:
                nv = 0.0
            else:
                nv = (v - smin) / (smax - smin)
                nv = max(0.0, min(1.0, nv))
            dim_sum[dim] = dim_sum.get(dim, 0.0) + nv * w
            dim_w[dim] = dim_w.get(dim, 0.0) + w

    dim_scores: Dict[str, float] = {}
    for dim, s in dim_sum.items():
        w = dim_w.get(dim, 1.0)
        dim_scores[dim] = round(s / w, 4)
    return dim_scores

def apply_criterion(criterion_content: Dict[str, Any], dim_scores: Dict[str, float]) -> Tuple[float, str]:
    weights = criterion_content.get("weights") or {}
    thresholds = criterion_content.get("thresholds") or {"low": 0.45, "high": 0.70}

    # weighted average across dimensions
    total_w = 0.0
    total = 0.0
    for dim, score in dim_scores.items():
        w = float(weights.get(dim, 1.0))
        total += float(score) * w
        total_w += w
    score = (total / total_w) if total_w > 0 else 0.0
    score = round(score, 4)

    low = float(thresholds.get("low", 0.45))
    high = float(thresholds.get("high", 0.70))

    if score >= high:
        level = "high"
    elif score >= low:
        level = "medium"
    else:
        level = "low"
    return score, level
