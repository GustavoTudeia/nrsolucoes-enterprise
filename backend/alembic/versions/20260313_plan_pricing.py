"""add_plan_pricing_columns

Revision ID: 20260313_plan_pricing
Revises: 20260306_training
Create Date: 2026-03-13

Adiciona campos de preço ao plano:
- price_monthly (int, centavos BRL)
- price_annual (int, centavos BRL)
- is_custom_price (bool, "Sob consulta")
"""

from alembic import op
import sqlalchemy as sa


revision = "20260313_plan_pricing"
down_revision = "20260306_training"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("plan", sa.Column("price_monthly", sa.Integer(), nullable=True))
    op.add_column("plan", sa.Column("price_annual", sa.Integer(), nullable=True))
    op.add_column("plan", sa.Column("is_custom_price", sa.Boolean(), nullable=False, server_default="false"))

    # Atualizar planos existentes com preços padrão
    plan = sa.table("plan",
        sa.column("key", sa.String),
        sa.column("price_monthly", sa.Integer),
        sa.column("price_annual", sa.Integer),
        sa.column("is_custom_price", sa.Boolean),
    )
    # START = grátis (trial), não precisa atualizar
    op.execute(plan.update().where(plan.c.key == "PRO").values(
        price_monthly=29900, price_annual=299000, is_custom_price=False,
    ))
    op.execute(plan.update().where(plan.c.key == "ENTERPRISE").values(
        is_custom_price=True,
    ))
    op.execute(plan.update().where(plan.c.key == "SST").values(
        is_custom_price=True,
    ))


def downgrade() -> None:
    op.drop_column("plan", "is_custom_price")
    op.drop_column("plan", "price_annual")
    op.drop_column("plan", "price_monthly")
