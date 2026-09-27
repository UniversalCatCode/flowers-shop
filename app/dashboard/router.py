from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, date

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.users.models import User
from app.sales.models import Sale
from app.stores.models import AvailabilityAlert
from app.inventory.models import WriteOff, Batch
from app.catalog.models import Product

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# Словарь для перевода технических причин в человеческие
REASON_MAP = {
    'expiry': 'Истечение срока годности',
    'damage': 'Повреждение / Бой',
    'rejection_at_receipt': 'Отклонение при приёмке',
    'damage_during_assembly': 'Бой при сборке',
    'return_damage': 'Повреждение при возврате',
    'other': 'Другое'
}

@router.get("/summary")
async def get_dashboard_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today_start = datetime.combine(date.today(), datetime.min.time())
    
    # 1. Статистика за сегодня
    today_orders_count = await db.scalar(
        select(func.count(Sale.id)).where(Sale.created_at >= today_start)
    ) or 0
    
    today_revenue = await db.scalar(
        select(func.sum(Sale.final_amount)).where(
            and_(Sale.status.in_(['completed', 'assembled', 'assembling', 'accepted', 'shipped']), Sale.created_at >= today_start)
        )
    ) or 0

    # 2. Заказы, ожидающие сборки (с деталями)
    pending_assembly_stmt = (
        select(Sale.id, Sale.sale_number, Sale.customer_name, Sale.created_at)
        .where(Sale.status == 'accepted')
        .order_by(Sale.created_at.asc())
        .limit(5) # Показываем 5 самых старых
    )
    pending_result = await db.execute(pending_assembly_stmt)
    pending_orders = [
        {
            "id": row.id,
            "sale_number": row.sale_number,
            "customer_name": row.customer_name or "Без имени",
            "created_at": row.created_at.isoformat() if row.created_at else None
        }
        for row in pending_result.all()
    ]

    # Общее количество активных заказов
    active_orders = await db.scalar(
        select(func.count(Sale.id)).where(Sale.status.in_(['accepted', 'assembling', 'assembled', 'shipped']))
    ) or 0

    # 3. Активные алерты
    active_alerts = await db.scalar(
        select(func.count(AvailabilityAlert.id)).where(AvailabilityAlert.status == 'active')
    ) or 0

    # 4. Последние 5 списаний (с названием товара и читаемой причиной)
    write_off_stmt = (
        select(WriteOff.id, WriteOff.quantity, WriteOff.reason, WriteOff.created_at, Product.name.label('product_name'))
        .join(Batch, WriteOff.batch_id == Batch.id)
        .join(Product, Batch.product_id == Product.id)
        .order_by(WriteOff.created_at.desc())
        .limit(5)
    )
    result = await db.execute(write_off_stmt)
    recent_write_offs = [
        {
            "id": row.id,
            "product_name": row.product_name,
            "quantity": float(row.quantity),
            "reason": REASON_MAP.get(row.reason, row.reason), # Переводим в читаемый вид
            "created_at": row.created_at.isoformat() if row.created_at else None
        }
        for row in result.all()
    ]

    return {
        "today_stats": {
            "orders_count": today_orders_count,
            "revenue": float(today_revenue)
        },
        "active_orders": active_orders,
        "pending_assembly": pending_orders,
        "active_alerts": active_alerts,
        "recent_write_offs": recent_write_offs
    }

