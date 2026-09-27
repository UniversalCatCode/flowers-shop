from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base

from app.core.config import settings

# Создаём асинхронный движок
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    future=True,
)

# Фабрика сессий
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

# Базовый класс для всех моделей SQLAlchemy
Base = declarative_base()

# ==========================================================
# ВАЖНО: Импортируем все модели, чтобы SQLAlchemy знал 
# о них при разрешении межсхемных Foreign Key (NoReferencedTableError)
# ==========================================================
from app.users import models as users_models
from app.catalog import models as catalog_models
from app.inventory import models as inventory_models
from app.stores import models as stores_models
from app.sales import models as sales_models
from app.finance import models as finance_models
from app.integrations import models as integrations_models
from app.analytics import models as analytics_models
# ==========================================================

# Зависимость для получения сессии БД в эндпоинтах FastAPI
async def get_db() -> AsyncSession:
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
