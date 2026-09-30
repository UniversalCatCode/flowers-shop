import sys
import asyncio
from pathlib import Path
from logging.config import fileConfig

from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from app.core.database import Base

from app.users.models import User, Role, Permission, user_roles, role_permissions
from app.catalog.models import Category, Product, Supplier, Recipe, RecipeItem
from app.inventory.models import Batch, Movement, WriteOff, Stock
from app.stores.models import Store, StoreProduct, StorePriority, AvailabilityAlert
from app.sales.models import Sale, SaleItem, SaleFee
from app.finance.models import PricingRule, ProfitTarget, PriceHistory
from app.integrations.models import Marketplace, MarketplaceFee, MarketplaceCategoryFee, SyncLog
from app.analytics.models import ProductSalesStat, ComponentDemandForecast, PurchaseRecommendation

target_metadata = Base.metadata
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", settings.database_url)


def include_object(object, name, type_, reflected, compare_to):
    if type_ == "table" and name == "alembic_version":
        return False
    return True


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_schemas=True,
        include_object=include_object,
        version_table_schema='public',
        version_table='alembic_version',
    )

    # ВСЁ внутри ОДНОЙ транзакции — как было, когда users прошла
    with context.begin_transaction():
        schemas = ['users', 'catalog', 'inventory', 'stores', 'sales', 'finance', 'integrations', 'analytics']
        for schema in schemas:
            connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))
            connection.execute(text(f"GRANT ALL ON SCHEMA {schema} TO flowers_user"))
        context.run_migrations()


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
        include_object=include_object,
        version_table_schema='public',
        version_table='alembic_version',
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

