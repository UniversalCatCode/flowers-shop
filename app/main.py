from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.users.router import router as users_router
from app.catalog.router import router as catalog_router
from app.inventory.router import router as inventory_router
from app.sales.router import router as sales_router
from app.stores.router import router as stores_router
from app.dashboard.router import router as dashboard_router

Path("uploads/products").mkdir(parents=True, exist_ok=True)

# Создаём экземпляр приложения
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug,
)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Настраиваем CORS (чтобы веб-интерфейс мог обращаться к API)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В production заменим на конкретный домен
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Простой эндпоинт для проверки работоспособности
@app.get("/health", tags=["System"])
async def health_check():
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": settings.app_version,
    }

# В будущем здесь будем подключать роутеры модулей:
# app.include_router(catalog.router, prefix="/catalog", tags=["Catalog"])

app.include_router(users_router)
app.include_router(catalog_router)
app.include_router(inventory_router)
app.include_router(sales_router)
app.include_router(stores_router)
app.include_router(dashboard_router)
