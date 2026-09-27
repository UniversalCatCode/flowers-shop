"""add_product_id_to_movements

Revision ID: e3ea32964555
Revises: 4c10c2fcb9ba
Create Date: 2026-09-20 22:03:46.382931

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3ea32964555'
down_revision: Union[str, Sequence[str], None] = '4c10c2fcb9ba'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(conn, schema, table, column):
    """Проверяет существование колонки в таблице"""
    insp = sa.inspect(conn)
    columns = [col['name'] for col in insp.get_columns(table, schema=schema)]
    return column in columns


def foreign_key_exists(conn, schema, table, fk_name):
    """Проверяет существование внешнего ключа"""
    insp = sa.inspect(conn)
    fks = [fk['name'] for fk in insp.get_foreign_keys(table, schema=schema)]
    return fk_name in fks


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()

    # 1. Добавляем product_id, если его нет
    if not column_exists(conn, 'inventory', 'movements', 'product_id'):
        op.add_column(
            'movements',
            sa.Column('product_id', sa.Integer(), nullable=True),
            schema='inventory'
        )

    # 2. Создаем FK для product_id, если его нет
    if not foreign_key_exists(conn, 'inventory', 'movements', 'fk_movements_product'):
        op.create_foreign_key(
            'fk_movements_product',
            'movements',
            'products',
            ['product_id'],
            ['id'],
            source_schema='inventory',
            referent_schema='catalog',
            ondelete='SET NULL'
        )

    # 3. Удаляем лишние колонки, если они есть
    if column_exists(conn, 'inventory', 'movements', 'notes'):
        op.drop_column('movements', 'notes', schema='inventory')

    if column_exists(conn, 'inventory', 'movements', 'write_off_id'):
        op.drop_column('movements', 'write_off_id', schema='inventory')


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()

    # 1. Возвращаем колонки, если их нет
    if not column_exists(conn, 'inventory', 'movements', 'write_off_id'):
        op.add_column(
            'movements',
            sa.Column('write_off_id', sa.Integer(), nullable=True),
            schema='inventory'
        )

    if not column_exists(conn, 'inventory', 'movements', 'notes'):
        op.add_column(
            'movements',
            sa.Column('notes', sa.Text(), nullable=True),
            schema='inventory'
        )

    # 2. Удаляем FK, если он есть
    if foreign_key_exists(conn, 'inventory', 'movements', 'fk_movements_product'):
        op.drop_constraint(
            'fk_movements_product',
            'movements',
            schema='inventory',
            type_='foreignkey'
        )

    # 3. Удаляем product_id, если он есть
    if column_exists(conn, 'inventory', 'movements', 'product_id'):
        op.drop_column('movements', 'product_id', schema='inventory')