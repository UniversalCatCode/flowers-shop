import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings

engine = create_async_engine(settings.database_url, echo=False)

async def migrate():
    async with engine.begin() as conn:
        # Выполняем команды ПО ОТДЕЛЬНОСТИ
        await conn.execute(text(
            'ALTER TABLE catalog.products ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10, 2)'
        ))
        await conn.execute(text(
            'ALTER TABLE catalog.products ADD COLUMN IF NOT EXISTS selling_price DECIMAL(10, 2)'
        ))
    print('✅ Поля purchase_price и selling_price успешно добавлены в catalog.products')
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(migrate())
