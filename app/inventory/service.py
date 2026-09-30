from typing import Optional, List
from datetime import datetime
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from decimal import Decimal

from app.inventory.models import Batch, Stock, WriteOff, Movement, PurchaseOrder, PurchaseOrderItem, PurchaseOrderReceipt, PurchaseOrderReceiptItem
from app.inventory.schemas import BatchCreate, StockByProduct, WriteOffCreate
from app.catalog.models import Product, Recipe, RecipeItem
from app.stores.alert_service import AlertService
from app.catalog.models import Product as CatalogProduct

class BatchService:
    @staticmethod
    async def create(db: AsyncSession, data: BatchCreate, user_id: int) -> Batch:
        """Создаёт партию и обновляет остатки."""
        # Проверка существования товара
        product = await db.get(Product, data.product_id)
        if not product:
            raise ValueError(f"Product with id={data.product_id} not found")

        # Проверка существования поставщика (если указан)
        if data.supplier_id is not None:
            from app.catalog.models import Supplier
            supplier = await db.get(Supplier, data.supplier_id)
            if not supplier:
                raise ValueError(f"Supplier with id={data.supplier_id} not found")

        # Создаём партию
        batch = Batch(
            **data.model_dump(),
            current_qty=data.initial_qty,
            status='active'
        )
        db.add(batch)
        await db.flush()  # Получаем batch.id

        # Обновляем остатки (Stock)
        stock = await db.scalar(
            select(Stock).where(Stock.product_id == data.product_id)
        )
        if stock:
            stock.quantity += data.initial_qty
            stock.updated_at = datetime.utcnow()
        else:
            stock = Stock(
                product_id=data.product_id,
                quantity=data.initial_qty
            )
            db.add(stock)

        # Создаём движение (movement) — приход
        from app.inventory.models import Movement
        movement = Movement(
            batch_id=batch.id,
            movement_type='receipt',
            quantity=data.initial_qty,
            reason='Приходная накладная',
            created_by=user_id
        )
        db.add(movement)

        await db.commit()
        await db.refresh(batch)
        return batch

    @staticmethod
    async def _create_stock_entry(
        db: AsyncSession,
        product_id: int,
        supplier_id: int,
        quantity: float,
        purchase_price: float,
        batch_number: str,
        unit_type: str = None,
        base_quantity: float = None,
        base_unit: str = None,
        received_quality_pct: int = None
    ) -> None:
        """
        Создаёт партию или обновляет stock.
        Используется при приёмке товара по заказу поставщику.
        """
        from decimal import Decimal
        
        product = await db.get(Product, product_id)
        if not product:
            raise ValueError(f"Товар с id={product_id} не найден")
        
        received_at = datetime.utcnow()
        quantity = Decimal(str(quantity))
        
        if product.product_type == 'flower':
            # === ЦВЕТЫ: создаём партию ===
            batch = Batch(
                product_id=product_id,
                supplier_id=supplier_id,
                batch_number=batch_number,
                purchase_price=Decimal(str(purchase_price)),
                received_at=received_at,
                initial_qty=quantity,
                current_qty=quantity,
                status='active',
                received_quality_pct=received_quality_pct
            )
            db.add(batch)
            await db.flush()
            
            stock = await db.scalar(
                select(Stock).where(Stock.product_id == product_id)
            )
            if stock:
                stock.quantity += quantity
                stock.updated_at = datetime.utcnow()
            else:
                stock = Stock(product_id=product_id, quantity=quantity)
                db.add(stock)
            
            movement = Movement(
                batch_id=batch.id,
                movement_type='receipt',
                quantity=quantity,
                reason=f'Приёмка по заказу {batch_number}',
                created_by=None
            )
            db.add(movement)
            
        elif product.product_type in ('packaging', 'consumable'):
            # === УПАКОВКА / ПРОЧЕЕ: просто увеличиваем stock ===
            stock = await db.scalar(
                select(Stock).where(Stock.product_id == product_id)
            )
            if stock:
                stock.quantity += quantity
                stock.updated_at = datetime.utcnow()
            else:
                stock = Stock(product_id=product_id, quantity=quantity)
                db.add(stock)
            
            movement = Movement(
                product_id=product_id,
                batch_id=None,
                movement_type='receipt',
                quantity=quantity,
                reason=f'Приёмка по заказу {batch_number}',
                created_by=None
            )
            db.add(movement)
            
        elif product.product_type == 'bouquet':
            pass  # Букеты не принимаются на склад

    @staticmethod
    async def get_by_id(db: AsyncSession, batch_id: int) -> Optional[Batch]:
        return await db.get(Batch, batch_id)

    @staticmethod
    async def get_list(
        db: AsyncSession,
        product_id: Optional[int] = None,
        supplier_id: Optional[int] = None,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[List[Batch], int]:
        stmt = select(Batch)
        count_stmt = select(func.count()).select_from(Batch)

        if product_id is not None:
            stmt = stmt.where(Batch.product_id == product_id)
            count_stmt = count_stmt.where(Batch.product_id == product_id)
        if supplier_id is not None:
            stmt = stmt.where(Batch.supplier_id == supplier_id)
            count_stmt = count_stmt.where(Batch.supplier_id == supplier_id)
        if status:
            stmt = stmt.where(Batch.status == status)
            count_stmt = count_stmt.where(Batch.status == status)

        total = await db.scalar(count_stmt)
        stmt = stmt.order_by(Batch.received_at.desc()).offset(skip).limit(limit)
        result = await db.execute(stmt)
        items = list(result.scalars().all())
        return items, total or 0

    @staticmethod
    async def create_write_off(
        db: AsyncSession, 
        data: WriteOffCreate,
        user_id: int
    ) -> WriteOff:
        """Создаёт списание товара и обновляет остатки."""
        # Проверяем, что партия существует
        batch = await db.get(Batch, data.batch_id)
        if not batch:
            raise ValueError(f"Партия с id={data.batch_id} не найдена")
        
        # Проверяем, что достаточно остатков
        if batch.current_qty < data.quantity:
            raise ValueError(
                f"Недостаточно остатков в партии. "
                f"Доступно: {batch.current_qty}, требуется: {data.quantity}"
            )
        
        # Уменьшаем остаток партии
        batch.current_qty -= data.quantity
        if batch.current_qty == 0:
            batch.status = 'depleted'
        
        # Обновляем сводный кэш stock
        stock = await db.scalar(
            select(Stock).where(Stock.product_id == batch.product_id)
        )
        if stock:
            stock.quantity -= data.quantity
            stock.updated_at = datetime.utcnow()
        
        # Создаём запись о списании
        write_off = WriteOff(
            batch_id=data.batch_id,
            quantity=data.quantity,
            reason=data.reason,
            created_by=user_id
        )
        db.add(write_off)
        await db.flush()
        
        # Создаём движение (используем только reason)
        movement = Movement(
            batch_id=batch.id,
            movement_type='write_off',
            quantity=data.quantity,
            reason=f"Списание: {data.reason}",
            created_by=user_id
        )
        db.add(movement)
        
        await db.commit()
        await db.refresh(write_off)
        return write_off

    @staticmethod
    async def get_write_offs(
        db: AsyncSession,
        reason: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[List[WriteOff], int]:
        """Получает список списаний с фильтрами."""
        stmt = select(WriteOff)
        count_stmt = select(func.count()).select_from(WriteOff)
        
        if reason:
            stmt = stmt.where(WriteOff.reason == reason)
            count_stmt = count_stmt.where(WriteOff.reason == reason)
        if date_from:
            stmt = stmt.where(WriteOff.created_at >= date_from)
            count_stmt = count_stmt.where(WriteOff.created_at >= date_from)
        if date_to:
            stmt = stmt.where(WriteOff.created_at <= date_to)
            count_stmt = count_stmt.where(WriteOff.created_at <= date_to)
        
        total = await db.scalar(count_stmt)
        stmt = stmt.order_by(WriteOff.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(stmt)
        items = list(result.scalars().all())
        
        return items, total or 0

class StockService:
    @staticmethod
    async def get_by_product(db: AsyncSession, product_id: int) -> Optional[Stock]:
        return await db.scalar(
            select(Stock).where(Stock.product_id == product_id)
        )

    @staticmethod
    async def get_all_with_details(db: AsyncSession) -> List[StockByProduct]:
        """Возвращает остатки с информацией о товаре, партиях и единицах упаковки."""
        
        stmt = (
            select(
                Stock.product_id,
                Product.name.label('product_name'),
                Product.sku,
                Product.product_type,  # <-- ДОБАВЛЕНО
                Stock.quantity.label('total_quantity'),
                func.count(Batch.id).label('batches_count'),
            )
            .join(Product, Stock.product_id == Product.id)
            .outerjoin(Batch, (Batch.product_id == Stock.product_id) & (Batch.status == 'active'))
            .group_by(Stock.product_id, Product.name, Product.sku, Product.product_type, Stock.quantity)
            .order_by(Product.name)
        )
        result = await db.execute(stmt)
        return [StockByProduct(**row._mapping) for row in result]

    @staticmethod
    async def create_write_off(
        db: AsyncSession, 
        data: 'WriteOffCreate',  # type: ignore
        user_id: int
    ) -> 'WriteOff':  # type: ignore
        """Создаёт списание товара и обновляет остатки."""
        from app.inventory.models import WriteOff, Movement
        
        # Проверяем, что партия существует
        batch = await db.get(Batch, data.batch_id)
        if not batch:
            raise ValueError(f"Партия с id={data.batch_id} не найдена")
        
        # Проверяем, что достаточно остатков
        if batch.current_qty < data.quantity:
            raise ValueError(
                f"Недостаточно остатков в партии. "
                f"Доступно: {batch.current_qty}, требуется: {data.quantity}"
            )
        
        # Уменьшаем остаток партии
        batch.current_qty -= data.quantity
        if batch.current_qty == 0:
            batch.status = 'depleted'
        
        # Обновляем сводный кэш stock
        stock = await db.scalar(
            select(Stock).where(Stock.product_id == batch.product_id)
        )
        if stock:
            stock.quantity -= data.quantity
            stock.updated_at = datetime.utcnow()
        
        # Создаём запись о списании
        write_off = WriteOff(
            batch_id=data.batch_id,
            quantity=data.quantity,
            reason=data.reason,
            notes=data.notes,
            created_by=user_id
        )
        db.add(write_off)
        await db.flush()
        
        # Создаём движение
        movement = Movement(
            batch_id=batch.id,
            movement_type='write_off',
            quantity=data.quantity,
            reason=f'Списание: {data.reason}',
            created_by=user_id
        )
        db.add(movement)
        
        await db.commit()
        await db.refresh(write_off)
        return write_off

    @staticmethod
    async def get_write_offs(
        db: AsyncSession,
        reason: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[List['WriteOff'], int]:  # type: ignore
        """Получает список списаний с фильтрами."""
        from app.inventory.models import WriteOff
        
        stmt = select(WriteOff)
        count_stmt = select(func.count()).select_from(WriteOff)
        
        if reason:
            stmt = stmt.where(WriteOff.reason == reason)
            count_stmt = count_stmt.where(WriteOff.reason == reason)
        if date_from:
            stmt = stmt.where(WriteOff.created_at >= date_from)
            count_stmt = count_stmt.where(WriteOff.created_at >= date_from)
        if date_to:
            stmt = stmt.where(WriteOff.created_at <= date_to)
            count_stmt = count_stmt.where(WriteOff.created_at <= date_to)
        
        total = await db.scalar(count_stmt)
        stmt = stmt.order_by(WriteOff.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(stmt)
        items = list(result.scalars().all())
        
        return items, total or 0

# ============ PURCHASE ORDERS SERVICE (Заказы поставщикам) ============

class PurchaseOrderService:
    """Сервис для управления заказами поставщикам"""
    
    @staticmethod
    def _generate_order_number() -> str:
        """Генерирует внутренний номер заказа"""
        return f"ORD-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"
    
    @staticmethod
    async def create_order(db: AsyncSession, data, user_id: int):
        """Создаёт заказ поставщику"""
        from app.catalog.models import Supplier
        
        # Проверка поставщика
        supplier = await db.get(Supplier, data.supplier_id)
        if not supplier:
            raise ValueError(f"Поставщик с id={data.supplier_id} не найден")
        
        # Создаём заказ
        order = PurchaseOrder(
            order_number=PurchaseOrderService._generate_order_number(),
            supplier_invoice_number=data.supplier_invoice_number,
            supplier_id=data.supplier_id,
            status='draft',
            payment_status='pending',
            mode=data.mode,
            expected_date=data.expected_date,
            notes=data.notes,
            created_by=user_id
        )
        db.add(order)
        await db.flush()
        
        # Создаём позиции
        for item_data in data.items:
            item = PurchaseOrderItem(
                purchase_order_id=order.id,
                product_id=item_data.product_id,
                product_type=getattr(item_data, 'product_type', None),
                ordered_qty=item_data.ordered_qty,
                unit_price=item_data.unit_price,
                notes=item_data.notes
            )
            db.add(item)
        
        await db.commit()
        # Возвращаем полностью загруженный объект
        return await PurchaseOrderService.get_order(db, order.id)
    
    @staticmethod
    async def get_order(db: AsyncSession, order_id: int):
        """Получает заказ с позициями"""
        stmt = (
            select(PurchaseOrder)
            .options(
                selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.product),
                selectinload(PurchaseOrder.receipts).selectinload(PurchaseOrderReceipt.items),
                selectinload(PurchaseOrder.supplier),
                selectinload(PurchaseOrder.creator)
            )
            .where(PurchaseOrder.id == order_id)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def update_order(db: AsyncSession, order_id: int, data, user_id: int):
        """Обновляет заказ (только в статусе draft)"""
        order = await PurchaseOrderService.get_order(db, order_id)
        if not order:
            raise ValueError("Заказ не найден")
        
        if order.status != 'draft':
            raise ValueError(f"Нельзя редактировать заказ в статусе '{order.status}'")
        
        # Обновляем основные поля
        if data.supplier_invoice_number:
            order.supplier_invoice_number = data.supplier_invoice_number
        if data.supplier_id:
            order.supplier_id = data.supplier_id
        if data.expected_date is not None:
            order.expected_date = data.expected_date
        if data.notes is not None:
            order.notes = data.notes
        
        # Обновляем позиции, если они переданы
        if data.items is not None:
            # Удаляем старые позиции
            for item in order.items:
                await db.delete(item)
            await db.flush()
            
            # Создаём новые
            for item_data in data.items:
                prod = await db.get(Product, item_data.product_id or item.product_id)
                item = PurchaseOrderItem(
                    purchase_order_id=order.id,
                    product_id=item_data.product_id or item.product_id,
                    product_type=prod.product_type if prod else None,
                    ordered_qty=item_data.ordered_qty or item.ordered_qty,
                    unit_price=item_data.unit_price or item.unit_price,
                    notes=item_data.notes
                )
                db.add(item)
        
        await db.commit()
        # Возвращаем полностью загруженный объект
        return await PurchaseOrderService.get_order(db, order.id)
    
    @staticmethod
    async def change_status(db: AsyncSession, order_id: int, new_status: str, user_id: int, confirm_data=None):
        """Меняет статус заказа"""
        order = await PurchaseOrderService.get_order(db, order_id)
        if not order:
            raise ValueError("Заказ не найден")
        
        # Валидация переходов
        valid_transitions = {
            'draft': ['confirmed', 'cancelled'],
            'confirmed': ['received', 'cancelled', 'draft'],
            'received': ['confirmed'],  # Админ может откатить приёмку
        }
        
        if order.status not in valid_transitions:
            raise ValueError(f"Заказ в статусе '{order.status}' нельзя изменить")
        
        if new_status not in valid_transitions[order.status]:
            raise ValueError(f"Нельзя перейти из '{order.status}' в '{new_status}'")
        
        # При подтверждении — номер счёта обязателен
        if new_status == 'confirmed':
            if not confirm_data or not confirm_data.supplier_invoice_number:
                raise ValueError("Для подтверждения заказа необходим номер счёта поставщика")
            order.supplier_invoice_number = confirm_data.supplier_invoice_number
            if confirm_data.invoice_date:
                order.invoice_date = confirm_data.invoice_date
        
        # Для перехода в 'received' проверяем, что всё принято
        if new_status == 'received':
            for item in order.items:
                if item.received_qty < item.ordered_qty:
                    raise ValueError(
                        f"Нельзя закрыть заказ: позиция '{item.product.name}' "
                        f"принята не полностью ({item.received_qty}/{item.ordered_qty})"
                    )
        
        order.status = new_status
        order.updated_at = datetime.utcnow()
        
        await db.commit()
        # Возвращаем полностью загруженный объект
        return await PurchaseOrderService.get_order(db, order.id)
    
    @staticmethod
    async def receive_order(db: AsyncSession, order_id: int, data, user_id: int):
        """
        Принимает товар по заказу.
        Создаёт акт приёмки и сразу влияет на остаток.
        """
        from app.catalog.models import Supplier
        
        order = await PurchaseOrderService.get_order(db, order_id)
        if not order:
            raise ValueError("Заказ не найден")
        
        if order.status != 'confirmed':
            raise ValueError("Принимать товар можно только по подтверждённому заказу")
        
        # Создаём акт приёмки
        receipt = PurchaseOrderReceipt(
            purchase_order_id=order.id,
            receipt_number=data.receipt_number,
            received_by=user_id,
            notes=data.notes
        )
        db.add(receipt)
        await db.flush()
        
        try:
          # Обрабатываем позиции приёмки
          for item_data in data.items:
            # Ищем позицию в заказе
            order_item = None
            for oi in order.items:
                if oi.product_id == item_data.product_id:
                    order_item = oi
                    break
            
            if not order_item:
                raise ValueError(f"Товар с id={item_data.product_id} не найден в заказе")
            
            # Проверяем, не превышаем ли заказанное количество
            remaining = order_item.ordered_qty - order_item.received_qty
            if item_data.quantity > remaining:
                raise ValueError(
                    f"Нельзя принять {item_data.quantity} шт. "
                    f"Товар '{order_item.product.name}': осталось принять {remaining} шт."
                )
            
            # Цена: из приёмки или из заказа
            unit_price = item_data.unit_price if item_data.unit_price is not None else order_item.unit_price
            
            # Создаём позицию приёмки
            receipt_item = PurchaseOrderReceiptItem(
                receipt_id=receipt.id,
                product_id=item_data.product_id,
                quantity=item_data.quantity,
                unit_price=unit_price,
                notes=item_data.notes
            )
            db.add(receipt_item)
            
            # Обновляем принятое количество в заказе
            order_item.received_qty += item_data.quantity
            
            # === АЛЕРТ О ПОВЫШЕНИИ ЦЕНЫ ===
            product = await db.get(Product, item_data.product_id)
            if product and product.purchase_price is not None and unit_price > product.purchase_price:
                old_price = product.purchase_price
                # Ищем затронутые букеты
                from app.catalog.models import RecipeItem as RI
                stmt_bouquets = (
                    select(CatalogProduct.name)
                    .where(CatalogProduct.recipe_id.in_(
                        select(RI.recipe_id).where(RI.product_id == product.id)
                    ))
                    .distinct()
                )
                bouquet_result = await db.execute(stmt_bouquets)
                affected_bouquets = [row[0] for row in bouquet_result.all()]
                
                await AlertService.create_alert(
                    db=db,
                    alert_type='price_increase',
                    product_id=product.id,
                    required_qty=float(unit_price),
                    available_qty=float(old_price),
                    recommendations={
                        'old_price': float(old_price),
                        'new_price': float(unit_price),
                        'affected_bouquets': affected_bouquets,
                        'source': f'purchase_order_{order.order_number}'
                    }
                )
            
            # === СОЗДАЁМ ПАРТИЮ ИЛИ ЕДИНИЦУ УПАКОВКИ ===
            await BatchService._create_stock_entry(
                db=db,
                product_id=item_data.product_id,
                supplier_id=order.supplier_id,
                quantity=float(item_data.quantity),
                purchase_price=float(unit_price),
                batch_number=f"{order.order_number}-{receipt.id}",
                unit_type=getattr(item_data, 'unit_type', None),
                base_quantity=getattr(item_data, 'base_quantity', None),
                base_unit=getattr(item_data, 'base_unit', None),
                received_quality_pct=getattr(item_data, 'received_quality_pct', None)
            )
        
        except Exception as e:
            await db.rollback()
            raise ValueError(f"Ошибка при приёмке: {str(e)}")
        
        # Проверяем, полностью ли принят заказ
        all_received = all(
            item.received_qty >= item.ordered_qty for item in order.items
        )
        if all_received:
            order.status = 'received'
        
        await db.commit()
        # Перезагружаем приёмку со связями
        stmt = (
            select(PurchaseOrderReceipt)
            .options(
                selectinload(PurchaseOrderReceipt.items).selectinload(PurchaseOrderReceiptItem.product),
                selectinload(PurchaseOrderReceipt.receiver)
            )
            .where(PurchaseOrderReceipt.id == receipt.id)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

# ============ МЕТОДЫ ФОРМАТИРОВАНИЯ И РАСЧЁТА ============

    @staticmethod
    async def _format_receipt(receipt) -> dict:
        """Форматирует акт приёмки для ответа."""
        receipt_items = []
        for ri in receipt.items:
            receipt_items.append({
                "id": ri.id,
                "product_id": ri.product_id,
                "product_name": ri.product.name if ri.product else None,
                "quantity": ri.quantity,
                "unit_price": ri.unit_price,
                "notes": ri.notes
            })
        
        return {
            "id": receipt.id,
            "purchase_order_id": receipt.purchase_order_id,
            "receipt_number": receipt.receipt_number,
            "received_at": receipt.received_at,
            "received_by": receipt.received_by,
            "receiver_name": receipt.receiver.full_name if receipt.receiver else None,
            "status": receipt.status,
            "notes": receipt.notes,
            "items": receipt_items
        }

    @staticmethod
    async def _format_order(order) -> dict:
        """Форматирует заказ для вывода"""
        items = []
        total_amount = 0
        received_amount = 0
        
        for item in order.items:
            remaining = item.ordered_qty - item.received_qty
            items.append({
                "id": item.id,
                "product_id": item.product_id,
                "product_name": item.product.name if item.product else None,
                "product_sku": item.product.sku if item.product else None,
                "product_type": item.product_type or (item.product.product_type if item.product else None),
                "ordered_qty": item.ordered_qty,
                "received_qty": item.received_qty,
                "remaining_qty": remaining,
                "unit_price": item.unit_price,
                "notes": item.notes
            })
            total_amount += item.ordered_qty * item.unit_price
            received_amount += item.received_qty * item.unit_price
        
        receipts = []
        for receipt in order.receipts:
            receipt_items = []
            for ri in receipt.items:
                receipt_items.append({
                    "id": ri.id,
                    "product_id": ri.product_id,
                    "product_name": ri.product.name if ri.product else None,
                    "quantity": ri.quantity,
                    "unit_price": ri.unit_price,
                    "notes": ri.notes
                })
            receipts.append({
                "id": receipt.id,
                "purchase_order_id": receipt.purchase_order_id,
                "receipt_number": receipt.receipt_number,
                "received_at": receipt.received_at,
                "received_by": receipt.received_by,
                "receiver_name": receipt.receiver.full_name if receipt.receiver else None,
                "status": receipt.status,
                "notes": receipt.notes,
                "items": receipt_items
            })
        
        is_fully_received = all(
            item.received_qty >= item.ordered_qty for item in order.items
        ) if order.items else False
        
        return {
            "id": order.id,
            "order_number": order.order_number,
            "supplier_invoice_number": order.supplier_invoice_number,
            "supplier_id": order.supplier_id,
            "supplier_name": order.supplier.name if order.supplier else None,
            "status": order.status,
            "payment_status": order.payment_status,
            "mode": order.mode,
            "expected_date": order.expected_date,
            "created_at": order.created_at,
            "updated_at": order.updated_at,
            "notes": order.notes,
            "created_by": order.created_by,
            "creator_name": order.creator.full_name if order.creator else None,
            "total_amount": total_amount,
            "received_amount": received_amount,
            "is_fully_received": is_fully_received,
            "items": items,
            "receipts": receipts
        }
    
    @staticmethod
    async def calculate_from_bouquets(db: AsyncSession, data):
        """
        Рассчитывает потребности в компонентах на основе выбранных букетов.
        """
        from app.inventory.models import Stock
        from app.catalog.models import Product, Recipe, RecipeItem
        from app.inventory.capability_service import CapabilityService
        
        components = {}  # product_id -> {required_qty, ...}
        total_bouquet_units = 0
        
        for bouquet_selection in data.bouquets:
            # Находим букет
            bouquet = await db.get(Product, bouquet_selection.bouquet_product_id)
            if not bouquet or bouquet.product_type != 'bouquet':
                raise ValueError(f"Товар с id={bouquet_selection.bouquet_product_id} не является букетом")
            
            if not bouquet.recipe_id:
                continue
            
            total_bouquet_units += bouquet_selection.quantity
            
            # Получаем компоненты рецепта
            stmt = (
                select(RecipeItem)
                .where(RecipeItem.recipe_id == bouquet.recipe_id)
            )
            result = await db.execute(stmt)
            recipe_items = result.scalars().all()
            
            for ri in recipe_items:
                if ri.product_id not in components:
                    product = await db.get(Product, ri.product_id)
                    components[ri.product_id] = {
                        "product_id": ri.product_id,
                        "product_name": product.name if product else "Unknown",
                        "product_sku": product.sku if product else "",
                        "product_type": product.product_type if product else "unknown",
                        "required_qty": 0,
                        "last_purchase_price": product.purchase_price if product else None
                    }
                
                components[ri.product_id]["required_qty"] += ri.quantity * bouquet_selection.quantity
        
        # Теперь для каждого компонента считаем доступность
        result_components = []
        total_shortage_items = 0
        estimated_cost = 0
        
        for comp_id, comp_data in components.items():
            # Получаем текущий остаток
            stock = await db.scalar(
                select(Stock).where(Stock.product_id == comp_id)
            )
            available_qty = stock.quantity if stock else 0
            
            # Фактический остаток без вычета резерва
            # Заказ поставщику должен видеть реальное наличие на складе,
            # чтобы покрыть дефицит всех активных заказов
            effective_available = available_qty
            
            shortage = max(0, comp_data["required_qty"] - effective_available)
            
            if shortage > 0:
                total_shortage_items += 1
                if comp_data["last_purchase_price"]:
                    estimated_cost += shortage * comp_data["last_purchase_price"]
            
            result_components.append({
                "product_id": comp_data["product_id"],
                "product_name": comp_data["product_name"],
                "product_sku": comp_data["product_sku"],
                "product_type": comp_data["product_type"],
                "required_qty": comp_data["required_qty"],
                "available_qty": effective_available,
                "shortage_qty": shortage,
                "last_purchase_price": comp_data["last_purchase_price"]
            })
        
        # Сортируем по дефициту (сначала те, что нужно закупить)
        result_components.sort(key=lambda x: (-x["shortage_qty"], x["product_name"]))
        
        return {
            "bouquets_selected": len(data.bouquets),
            "total_bouquet_units": total_bouquet_units,
            "components": result_components,
            "total_shortage_items": total_shortage_items,
            "estimated_cost": estimated_cost
        }
