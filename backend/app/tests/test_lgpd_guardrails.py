from sqlalchemy import inspect
from app.models.campaign import SurveyResponse

def test_survey_response_has_no_user_or_employee_fk():
    cols = {c.name for c in inspect(SurveyResponse).columns}
    assert "user_id" not in cols
    assert "employee_id" not in cols
