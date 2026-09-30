from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload  # <-- ДОБАВЛЕН ЭТОТ ИМПОРТ

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_permission
from app.users.models import User

# Объединённые импорты схем (без дублирования)
from app.sales.schemas import (
    SaleCreate, SaleOut, SaleListOut, StockByBatch, 
    SalesReportItem, SaleActionRequest
)

from app.sales.service import SaleService, ReportService
from app.sales.models import Sale
from app.sales.assembly_service import OrderAssemblyService  

# ПРЕФИКС ЗАДАЁТСЯ ЗДЕСЬ, ОДИН РАЗ
router = APIRouter(prefix="/sales", tags=["sales"])

# ============ SALES (Продажи) ============
# Пути ОТНОСИТЕЛЬНЫЕ — без "/sales" в начале
@router.post("", response_model=SaleOut, status_code=201)
async def create_sale(
    data: SaleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Создаёт продажу и автоматически списывает товары с партий (FIFO)."""
    try:
        return await SaleService.create(db, data, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("", response_model=SaleListOut)
async def list_sales(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    store_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = await SaleService.get_list(
        db, date_from, date_to, store_id, skip, limit
    )
    return SaleListOut(total=total, items=items)

@router.get("/{sale_id}", response_model=SaleOut)
async def get_sale(
    sale_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sale = await SaleService.get_by_id(db, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    return sale

# ============ ОТЧЁТЫ ============
@router.get("/reports/stock-by-batches", response_model=List[StockByBatch])
async def report_stock_by_batches(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Возвращает остатки с разбивкой по партиям."""
    return await ReportService.get_stock_by_batches(db)

@router.get("/reports/sales", response_model=List[SalesReportItem])
async def report_sales(
    date_from: datetime = Query(..., description="Начало периода (ISO format)"),
    date_to: datetime = Query(..., description="Конец периода (ISO format)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Возвращает детализацию продаж за период."""
    return await ReportService.get_sales_report(db, date_from, date_to)

# ============ ORDER LIFECYCLE ENDPOINTS ============
@router.get("/{sale_id}/check_resources", response_model=dict)
async def check_assembly_resources(
    sale_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("order.assemble"))
):
    """Проверяет наличие ресурсов для сборки заказа"""
    try:
        result = await OrderAssemblyService.check_assembly_resources(db, sale_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/{sale_id}/assemble", response_model=SaleOut)
async def start_assembly(
    sale_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("order.assemble"))
):
    """Начать сборку заказа (перевод в статус assembling)"""
    try:
        sale = await OrderAssemblyService.start_assembly(db, sale_id, current_user.id)
        return sale  # <-- Возвращаем объект напрямую, FastAPI сам преобразует его через SaleOut
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{sale_id}/complete", response_model=SaleOut)
async def complete_assembly(
    sale_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("order.assemble"))
):
    """Завершить сборку заказа (автоматическое списание цветов по FIFO и фиксация расхода упаковки)"""
    try:
        sale = await OrderAssemblyService.complete_assembly(db, sale_id, current_user.id)
        return sale
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{sale_id}/cancel", response_model=SaleOut)
async def cancel_order(
    sale_id: int,
    action: SaleActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("order.cancel"))
):
    """Отменить заказ (с возвратом остатков, если заказ уже был собран)"""
    try:
        reason = action.reason or "Отменено пользователем"
        sale = await OrderAssemblyService.cancel_order(db, sale_id, reason, current_user.id)
        return sale
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{sale_id}/ship", response_model=SaleOut)
async def ship_order(
    sale_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("order.ship"))
):
    """Отгрузить заказ (перевод в статус shipped)"""
    # ДОБАВЛЕНО: selectinload(Sale.items)
    stmt = select(Sale).options(selectinload(Sale.items)).where(Sale.id == sale_id)
    result = await db.execute(stmt)
    sale = result.scalar_one_or_none()
    
    if not sale:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    if sale.status not in ('assembled', 'assembling'):
        raise HTTPException(status_code=400, detail=f"Нельзя отгрузить заказ в статусе {sale.status}")
    
    sale.status = 'shipped'
    sale.shipped_at = datetime.utcnow()
    await db.commit()
    await db.refresh(sale)
    return sale

@router.post("/{sale_id}/complete_delivery", response_model=SaleOut)
async def complete_delivery(
    sale_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("order.ship"))
):
    """Завершить доставку (перевод в статус completed)"""
    # ДОБАВЛЕНО: selectinload(Sale.items)
    stmt = select(Sale).options(selectinload(Sale.items)).where(Sale.id == sale_id)
    result = await db.execute(stmt)
    sale = result.scalar_one_or_none()
    
    if not sale:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    if sale.status != 'shipped':
        raise HTTPException(status_code=400, detail=f"Нельзя завершить доставку для статуса {sale.status}")
    
    sale.status = 'completed'
    sale.completed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(sale)
    return sale

@router.post("/{sale_id}/return", response_model=SaleOut)
async def return_order(
    sale_id: int,
    action: SaleActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("order.return"))
):
    """Оформить возврат от клиента (только для статуса completed)"""
    # ДОБАВЛЕНО: selectinload(Sale.items)
    stmt = select(Sale).options(selectinload(Sale.items)).where(Sale.id == sale_id)
    result = await db.execute(stmt)
    sale = result.scalar_one_or_none()
    
    if not sale:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    if sale.status != 'completed':
        raise HTTPException(status_code=400, detail="Возврат возможен только для завершённых заказов")
    
    sale.status = 'returned'
    sale.returned_at = datetime.utcnow()
    sale.return_reason = action.reason or "Возврат от клиента"
    
    # Возвращаем остатки
    for item in sale.items:
        if item.batch_id and item.quantity > 0:
            from app.inventory.models import Batch, Movement
            stmt_batch = select(Batch).where(Batch.id == item.batch_id)
            batch_result = await db.execute(stmt_batch)
            batch = batch_result.scalar_one_or_none()
            
            if batch:
                batch.current_qty += item.quantity
                if batch.status == 'depleted':
                    batch.status = 'active'
                
                movement = Movement(
                    batch_id=batch.id,
                    movement_type='return_to_stock',
                    quantity=item.quantity,
                    sale_id=sale.id,
                    created_by=current_user.id,
                    reason=f"Возврат от клиента по заказу #{sale.id}: {sale.return_reason}"
                )
                db.add(movement)

    await db.commit()
    await db.refresh(sale)
    return sale
