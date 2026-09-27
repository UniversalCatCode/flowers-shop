from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime


from sqlalchemy import select, desc, func

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_permission
from app.users.models import User

from app.inventory.schemas import (PurchaseOrderConfirm,
    BatchCreate, BatchOut, BatchListOut, StockOut, StockByProduct,
    PackagingUnitCreate, PackagingUnitUpdate, PackagingUnitOut, PackagingUnitListOut,
    PackagingOpeningCreate, PackagingOpeningUpdate, PackagingOpeningOut, PackagingOpeningListOut,
    PackagingConsumptionCreate, PackagingConsumptionOut, PackagingConsumptionListOut,
    PackagingAdjustmentOut, PackagingAdjustmentListOut,
    ReceiptCreate,
    WriteOffCreate, WriteOffOut, WriteOffListOut, WriteOffUpdate,
    PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderOut, PurchaseOrderListOut,
    PurchaseOrderStatusUpdate, PurchaseOrderReceiptCreate, PurchaseOrderReceiptOut,
    BouquetCalculationRequest, BouquetCalculationResponse
)

from app.inventory.service import BatchService, StockService, PurchaseOrderService
from app.inventory.packaging_service import PackagingService  
from app.inventory.capability_service import CapabilityService


router = APIRouter(prefix="/inventory", tags=["inventory"])



# ============ BATCHES (Партии) ============
@router.post("/batches", response_model=BatchOut, status_code=201)
async def create_batch(
    data: BatchCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Создаёт партию и автоматически обновляет остатки."""
    try:
        return await BatchService.create(db, data, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/batches", response_model=BatchListOut)
async def list_batches(
    product_id: Optional[int] = None,
    supplier_id: Optional[int] = None,
    status: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = await BatchService.get_list(
        db, product_id, supplier_id, status, skip, limit
    )
    return BatchListOut(total=total, items=items)


@router.get("/batches/{batch_id}", response_model=BatchOut)
async def get_batch(
    batch_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    batch = await BatchService.get_by_id(db, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return batch


# ============ RECEIPT (Приёмка товара) ============
@router.post("/receipts", response_model=dict, status_code=201)
async def create_receipt(
    data: ReceiptCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("inventory.receipts.write")),
):
    """
    Единая приёмка товара от поставщика.
    Автоматически создаёт партии для цветов и рулоны/пачки для упаковки.
    """
    try:
        result = await BatchService.create_receipt(db, data, current_user.id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))



# ============ WRITE-OFF (Списание) ============
@router.post("/write-offs", response_model=WriteOffOut, status_code=201)
async def create_write_off(
    data: WriteOffCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Создаёт списание товара (брак, истечение срока, бой и т.д.)"""
    try:
        return await BatchService.create_write_off(db, data, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/write-offs", response_model=WriteOffListOut)
async def list_write_offs(
    reason: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Список списаний с фильтрами"""
    items, total = await BatchService.get_write_offs(
        db, reason, date_from, date_to, skip, limit
    )
    return WriteOffListOut(total=total, items=items)

@router.patch("/write-offs/{write_off_id}", response_model=WriteOffOut)
async def update_write_off(
    write_off_id: int,
    data: WriteOffUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Обновляет причину списания (количество и партию менять нельзя во избежание ошибок учёта)"""
    from app.inventory.models import WriteOff
    from sqlalchemy import select
    
    stmt = select(WriteOff).where(WriteOff.id == write_off_id)
    result = await db.execute(stmt)
    wo = result.scalar_one_or_none()
    
    if not wo:
        raise HTTPException(status_code=404, detail="Списание не найдено")
    
    if data.reason is not None:
        wo.reason = data.reason
        
    await db.commit()
    await db.refresh(wo)
    return wo

# ============ STOCK (Остатки) ============
@router.get("/stock", response_model=List[StockByProduct])
async def get_stock_all(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Возвращает текущие остатки по всем товарам."""
    return await StockService.get_all_with_details(db)


@router.get("/stock/{product_id}", response_model=StockOut)
async def get_stock_by_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stock = await StockService.get_by_product(db, product_id)
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found for this product")
    return stock


# ============ PACKAGING UNITS ============

@router.post("/packaging/units", response_model=PackagingUnitOut, status_code=201)
async def create_packaging_unit(
    data: PackagingUnitCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Создание единицы упаковки (рулона/пачки)"""
    unit = await PackagingService.create_unit(db, data.model_dump())
    return unit


@router.get("/packaging/units", response_model=PackagingUnitListOut)
async def list_packaging_units(
    is_active: Optional[bool] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Список единиц упаковки"""
    items, total = await PackagingService.list_units(db, is_active, skip, limit)
    return PackagingUnitListOut(total=total, items=items)


@router.get("/packaging/units/{unit_id}", response_model=PackagingUnitOut)
async def get_packaging_unit(
    unit_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Получение единицы упаковки по ID"""
    unit = await PackagingService.get_unit(db, unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Единица упаковки не найдена")
    return unit


@router.patch("/packaging/units/{unit_id}", response_model=PackagingUnitOut)
async def update_packaging_unit(
    unit_id: int,
    data: PackagingUnitUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Обновление единицы упаковки"""
    unit = await PackagingService.update_unit(db, unit_id, data.model_dump(exclude_unset=True))
    if not unit:
        raise HTTPException(status_code=404, detail="Единица упаковки не найдена")
    return unit


# ============ PACKAGING OPENINGS ============

@router.post("/packaging/openings", response_model=PackagingOpeningOut, status_code=201)
async def open_packaging_unit(
    data: PackagingOpeningCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Открытие рулона/пачки"""
    try:
        opening = await PackagingService.open_unit(
            db,
            packaging_unit_id=data.packaging_unit_id,
            initial_qty=data.initial_qty,
            opened_by=current_user.id,
            notes=data.notes
        )
        return opening
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/packaging/openings", response_model=PackagingOpeningListOut)
async def list_packaging_openings(
    status: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Список открытий рулонов"""
    items, total = await PackagingService.list_openings(db, status, skip, limit)
    return PackagingOpeningListOut(total=total, items=items)


@router.get("/packaging/openings/{opening_id}", response_model=PackagingOpeningOut)
async def get_packaging_opening(
    opening_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Получение открытия по ID"""
    opening = await PackagingService.get_opening(db, opening_id)
    if not opening:
        raise HTTPException(status_code=404, detail="Открытие не найдено")
    return opening


@router.patch("/packaging/openings/{opening_id}/close", response_model=PackagingOpeningOut)
async def close_packaging_opening(
    opening_id: int,
    data: PackagingOpeningUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Закрытие рулона с расчётом коэффициента корректировки"""
    if data.final_qty is None:
        raise HTTPException(status_code=400, detail="final_qty обязателен для закрытия")
    
    try:
        opening, adjustment = await PackagingService.close_opening(
            db,
            opening_id=opening_id,
            final_qty=data.final_qty,
            notes=data.notes
        )
        return opening
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============ PACKAGING CONSUMPTION ============

@router.post("/packaging/consumption", response_model=PackagingConsumptionOut, status_code=201)
async def record_packaging_consumption(
    data: PackagingConsumptionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Запись нормативного расхода упаковки"""
    try:
        consumption = await PackagingService.record_consumption(
            db,
            opening_id=data.opening_id,
            product_id=data.product_id,
            normative_qty=data.normative_qty,
            normative_unit=data.normative_unit,
            sale_id=data.sale_id
        )
        return consumption
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/packaging/consumption", response_model=PackagingConsumptionListOut)
async def list_packaging_consumption(
    opening_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Список записей нормативного расхода"""
    items, total = await PackagingService.list_consumption(db, opening_id, skip, limit)
    return PackagingConsumptionListOut(total=total, items=items)


# ============ CAPABILITY (Возможности сборки) ============

@router.get("/capability", response_model=dict)
async def get_capability_report(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Рассчитывает возможности сборки букетов с учётом:
    - Текущих остатков на складе
    - Активных заказов (принятых, но не собранных)
    - Минимального резерва на витрину
    
    Возвращает отчёт по всем рецептам с алертами.
    """
    return await CapabilityService.calculate_capability(db)

@router.post("/capability/sync-alerts", response_model=dict)
async def sync_capability_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Синхронизирует алерты на основе расчёта возможностей сборки.
    
    Создаёт алерты типа 'capability_shortage' для критических дефицитов
    и 'capability_low_stock' для предупреждений.
    
    Вызывайте этот эндпоинт после:
    - Создания нового заказа
    - Смены статуса заказа (особенно 'assembled', 'cancelled')
    - Приёмки товара
    - Списания товара
    """
    return await CapabilityService.sync_capability_alerts(db)
    
# ============ PACKAGING ADJUSTMENTS ============

@router.get("/packaging/adjustments", response_model=PackagingAdjustmentListOut)
async def list_packaging_adjustments(
    is_anomaly: Optional[bool] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Список корректировок себестоимости"""
    items, total = await PackagingService.list_adjustments(db, is_anomaly, skip, limit)
    return PackagingAdjustmentListOut(total=total, items=items)


# ============ PURCHASE ORDERS (Заказы поставщикам) ============

@router.post("/purchase-orders", response_model=PurchaseOrderOut, status_code=201)
async def create_purchase_order(
    data: PurchaseOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Создаёт заказ поставщику."""
    try:
        order = await PurchaseOrderService.create_order(db, data, current_user.id)
        return await PurchaseOrderService._format_order(order)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/purchase-orders", response_model=PurchaseOrderListOut)
async def list_purchase_orders(
    status: Optional[str] = Query(None, description="Фильтр по статусу"),
    payment_status: Optional[str] = Query(None, description="Фильтр по статусу оплаты"),
    supplier_id: Optional[int] = Query(None, description="Фильтр по поставщику"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Список заказов поставщикам."""
    from app.inventory.models import PurchaseOrder, PurchaseOrderItem, PurchaseOrderReceipt, PurchaseOrderReceiptItem
    from sqlalchemy.orm import selectinload
    
    # Базовый запрос с загрузкой связей
    base_stmt = select(PurchaseOrder).options(
        selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.product),
        selectinload(PurchaseOrder.receipts).selectinload(PurchaseOrderReceipt.items).selectinload(PurchaseOrderReceiptItem.product),
        selectinload(PurchaseOrder.supplier),
        selectinload(PurchaseOrder.creator)
    ).order_by(desc(PurchaseOrder.created_at))
    
    # Применяем фильтры к базовому запросу
    stmt = base_stmt
    if status:
        stmt = stmt.where(PurchaseOrder.status == status)
    if payment_status:
        stmt = stmt.where(PurchaseOrder.payment_status == payment_status)
    if supplier_id:
        stmt = stmt.where(PurchaseOrder.supplier_id == supplier_id)
    
    # Подсчёт общего количества (без связей — быстрее)
    count_query = select(PurchaseOrder)
    if status:
        count_query = count_query.where(PurchaseOrder.status == status)
    if payment_status:
        count_query = count_query.where(PurchaseOrder.payment_status == payment_status)
    if supplier_id:
        count_query = count_query.where(PurchaseOrder.supplier_id == supplier_id)
    count_stmt = select(func.count()).select_from(count_query.subquery())
    total = await db.scalar(count_stmt)
    
    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    orders = result.scalars().unique().all()
    
    formatted_orders = []
    for order in orders:
        formatted = await PurchaseOrderService._format_order(order)
        formatted_orders.append(formatted)
    
    return {"total": total, "items": formatted_orders}


@router.get("/purchase-orders/{order_id}", response_model=PurchaseOrderOut)
async def get_purchase_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Получает заказ по ID."""
    order = await PurchaseOrderService.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    return await PurchaseOrderService._format_order(order)


@router.put("/purchase-orders/{order_id}", response_model=PurchaseOrderOut)
async def update_purchase_order(
    order_id: int,
    data: PurchaseOrderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Обновляет заказ (только в статусе draft)."""
    try:
        order = await PurchaseOrderService.update_order(db, order_id, data, current_user.id)
        return await PurchaseOrderService._format_order(order)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/purchase-orders/{order_id}/confirm", response_model=PurchaseOrderOut)
async def confirm_purchase_order(
    order_id: int,
    data: PurchaseOrderConfirm,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Подтверждает заказ (draft → confirmed). Номер счёта обязателен."""
    try:
        order = await PurchaseOrderService.change_status(db, order_id, 'confirmed', current_user.id, confirm_data=data)
        return await PurchaseOrderService._format_order(order)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/purchase-orders/{order_id}/cancel", response_model=PurchaseOrderOut)
async def cancel_purchase_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Отменяет заказ."""
    try:
        order = await PurchaseOrderService.change_status(db, order_id, 'cancelled', current_user.id)
        return await PurchaseOrderService._format_order(order)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/purchase-orders/{order_id}/receive", response_model=PurchaseOrderReceiptOut)
async def receive_purchase_order(
    order_id: int,
    data: PurchaseOrderReceiptCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Принимает товар по заказу (создаёт акт приёмки)."""
    try:
        receipt = await PurchaseOrderService.receive_order(db, order_id, data, current_user.id)
        return await PurchaseOrderService._format_receipt(receipt)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/purchase-orders/calculate-from-bouquets", response_model=BouquetCalculationResponse)
async def calculate_from_bouquets(
    data: BouquetCalculationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Рассчитывает потребности в компонентах на основе выбранных букетов.
    Учитывает текущие остатки и резерв на витрину.
    """
    try:
        result = await PurchaseOrderService.calculate_from_bouquets(db, data)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


