from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func  # <-- ДОБАВЬ select и func СЮДА
from sqlalchemy.orm import selectinload # <-- И ЭТО
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.users.models import User
from app.catalog.models import Product # <-- ДОБАВЬ Product
from app.stores.schemas import (
    AvailabilityAlertOut, 
    AvailabilityAlertListOut,
    AlertResolveRequest
)
from app.stores.alert_service import AlertService
from app.stores.models import AvailabilityAlert



router = APIRouter(prefix="/stores", tags=["stores"])


@router.get("/alerts", response_model=AvailabilityAlertListOut)
async def list_alerts(
    alert_type: Optional[str] = None,
    product_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Список активных алертов с названием товара"""
    stmt = select(AvailabilityAlert).where(AvailabilityAlert.status == 'active')
    
    if alert_type:
        stmt = stmt.where(AvailabilityAlert.alert_type == alert_type)
    if product_id:
        stmt = stmt.where(AvailabilityAlert.product_id == product_id)
    
    # Загружаем связанный товар, чтобы получить его имя
    stmt = stmt.options(selectinload(AvailabilityAlert.product)).order_by(AvailabilityAlert.created_at.desc()).offset(skip).limit(limit)
    
    result = await db.execute(stmt)
    items = list(result.scalars().all())
    
    # Добавляем product_name в каждый объект для схемы
    for item in items:
        if item.product:
            item.product_name = item.product.name
        else:
            item.product_name = None
    
    # Считаем общее количество для пагинации
    count_stmt = select(func.count(AvailabilityAlert.id)).where(AvailabilityAlert.status == 'active')
    if alert_type:
        count_stmt = count_stmt.where(AvailabilityAlert.alert_type == alert_type)
    total = await db.scalar(count_stmt) or 0
    
    return AvailabilityAlertListOut(total=total, items=items)




@router.post("/alerts/{alert_id}/resolve", response_model=AvailabilityAlertOut)
async def resolve_alert(
    alert_id: int,
    request: AlertResolveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Закрыть алерт"""
    try:
        alert = await AlertService.resolve_alert(
            db=db,
            alert_id=alert_id,
            resolved_by=current_user.id,
            notes=request.notes
        )
        if not alert:
            raise HTTPException(status_code=404, detail="Алерт не найден")
        return alert
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
