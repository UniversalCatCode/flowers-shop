from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.sales.models import Sale, SaleItem
from app.sales.schemas import SaleCreate, StockByBatch, SalesReportItem
from app.catalog.models import Product, Recipe
from app.inventory.models import Batch, Stock, Movement


class SaleService:
    @staticmethod
    async def create(db: AsyncSession, data: SaleCreate, user_id: int) -> Sale:
        """Создаёт черновик заказа (статус accepted). НЕ списывает остатки!"""
        
        total_amount = Decimal('0')

        # 1. Предварительная валидация и расчёт общей суммы
        for item_data in data.items:
            product = await db.get(Product, item_data.product_id)
            if not product:
                raise ValueError(f"Товар с id={item_data.product_id} не найден")
            total_amount += item_data.quantity * item_data.unit_price

        # 2. Создаём запись о продаже со статусом 'accepted'
        sale = Sale(
            sale_number=data.sale_number,
            store_id=data.store_id,
            customer_name=data.customer_name,
            customer_phone=data.customer_phone,
            payment_method=data.payment_method,
            notes=data.notes,
            created_by=user_id,
            status='accepted',  # <-- КЛЮЧЕВОЕ ИЗМЕНЕНИЕ
            total_amount=total_amount,
            final_amount=total_amount,
            discount_amount=Decimal('0'),
            total_fees=Decimal('0'),
            net_amount=total_amount
        )
        db.add(sale)
        await db.flush()

        # 3. Создаём позиции чека (без списания!)
        for item_data in data.items:
            # Получаем товар, чтобы подтянуть recipe_id, если это букет
            product = await db.get(Product, item_data.product_id)
            
            # Если это букет и рецепт не указан явно, берём из товара
            recipe_id = item_data.recipe_id
            if product.product_type == 'bouquet' and not recipe_id and product.recipe_id:
                recipe_id = product.recipe_id
            
            sale_item = SaleItem(
                sale_id=sale.id,
                product_id=item_data.product_id,
                quantity=item_data.quantity,
                recipe_id=recipe_id,  # <-- ИСПРАВЛЕНО: теперь не будет NULL для букетов
                unit_price=item_data.unit_price,
                total_price=item_data.quantity * item_data.unit_price,
                status='pending'
            )
            db.add(sale_item)


        await db.commit()
        
        # 4. Загружаем items для ответа
        stmt = select(Sale).options(selectinload(Sale.items)).where(Sale.id == sale.id)
        result = await db.execute(stmt)
        return result.scalar_one()


    @staticmethod
    async def _deduct_from_batches(
        db: AsyncSession, sale_id: int, product_id: int, required_qty: Decimal
    ) -> Decimal:
        """Списывает товары с партий по FIFO (сначала самые старые)."""
        
        stmt = (
            select(Batch)
            .where(
                and_(
                    Batch.product_id == product_id,
                    Batch.status == 'active',
                    Batch.current_qty > 0
                )
            )
            .order_by(Batch.received_at.asc())
        )
        result = await db.execute(stmt)
        batches = list(result.scalars().all())

        total_cost = Decimal('0')
        remaining_qty = required_qty

        for batch in batches:
            if remaining_qty <= 0:
                break

            deduct_qty = min(remaining_qty, batch.current_qty)
            batch.current_qty -= deduct_qty
            remaining_qty -= deduct_qty

            batch_cost = deduct_qty * batch.purchase_price
            total_cost += batch_cost

            movement = Movement(
                batch_id=batch.id,
                movement_type='sale',
                quantity=deduct_qty,
                sale_id=sale_id,
                reason=f'Продажа по заказу #{sale_id}',
                created_by=None
            )
            db.add(movement)

            if batch.current_qty == 0:
                batch.status = 'exhausted'

        if remaining_qty > 0:
            raise ValueError(
                f"Insufficient stock for product_id={product_id}. "
                f"Required: {required_qty}, available: {required_qty - remaining_qty}"
            )

        stock = await db.scalar(
            select(Stock).where(Stock.product_id == product_id)
        )
        if stock:
            stock.quantity -= required_qty
            stock.updated_at = datetime.utcnow()
        else:
            raise ValueError(f"Stock record not found for product_id={product_id}")

        return total_cost

    @staticmethod
    async def get_by_id(db: AsyncSession, sale_id: int) -> Optional[Sale]:
        stmt = select(Sale).options(selectinload(Sale.items)).where(Sale.id == sale_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_list(
        db: AsyncSession,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        store_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[List[Sale], int]:
        stmt = select(Sale).options(selectinload(Sale.items))
        count_stmt = select(func.count()).select_from(Sale)

        if date_from:
            stmt = stmt.where(Sale.created_at >= date_from)
            count_stmt = count_stmt.where(Sale.created_at >= date_from)
        if date_to:
            stmt = stmt.where(Sale.created_at <= date_to)
            count_stmt = count_stmt.where(Sale.created_at <= date_to)
        if store_id is not None:
            stmt = stmt.where(Sale.store_id == store_id)
            count_stmt = count_stmt.where(Sale.store_id == store_id)

        total = await db.scalar(count_stmt)
        stmt = stmt.order_by(Sale.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(stmt)
        items = list(result.scalars().all())
        return items, total or 0


class ReportService:
    @staticmethod
    async def get_stock_by_batches(db: AsyncSession) -> List[StockByBatch]:
        stmt = (
            select(
                Batch.id.label('batch_id'),
                Batch.batch_number,
                Batch.product_id,
                Product.name.label('product_name'),
                Batch.purchase_price,
                Batch.received_at,
                Batch.expires_at,
                Batch.current_qty,
                Batch.status
            )
            .join(Product, Batch.product_id == Product.id)
            .where(Batch.current_qty > 0)
            .order_by(Batch.received_at.asc())
        )
        result = await db.execute(stmt)
        return [StockByBatch(**row._mapping) for row in result]

    @staticmethod
    async def get_sales_report(
        db: AsyncSession,
        date_from: datetime,
        date_to: datetime,
    ) -> List[SalesReportItem]:
        stmt = (
            select(
                Sale.id.label('sale_id'),
                Sale.sale_number,
                Sale.created_at.label('sale_date'),
                SaleItem.product_id,
                Product.name.label('product_name'),
                SaleItem.quantity,
                SaleItem.unit_price,
                SaleItem.total_price
            )
            .join(SaleItem, Sale.id == SaleItem.sale_id)
            .join(Product, SaleItem.product_id == Product.id)
            .where(
                and_(
                    Sale.created_at >= date_from,
                    Sale.created_at <= date_to
                )
            )
            .order_by(Sale.created_at.desc())
        )
        result = await db.execute(stmt)
        return [SalesReportItem(**row._mapping) for row in result]

