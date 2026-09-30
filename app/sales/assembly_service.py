from datetime import datetime
from typing import List, Tuple
from decimal import Decimal
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.sales.models import Sale, SaleItem
from app.catalog.models import Product, Recipe, RecipeItem
from app.inventory.models import Batch, Movement, WriteOff, Stock


class OrderAssemblyService:
    """Сервис для управления жизненным циклом сборки заказа"""

    @staticmethod
    async def start_assembly(db: AsyncSession, sale_id: int, user_id: int) -> Sale:
        """
        Переводит заказ в статус 'assembling'.
        Проверяет наличие ресурсов, но НЕ списывает их.
        """
        # Загружаем заказ
        stmt = (
            select(Sale)
            .options(
                selectinload(Sale.items).selectinload(SaleItem.product)
            )
            .where(Sale.id == sale_id)
        )
        result = await db.execute(stmt)
        sale = result.scalar_one_or_none()

        if not sale:
            raise ValueError("Заказ не найден")

        if sale.status != 'accepted':
            raise ValueError(f"Нельзя начать сборку. Текущий статус: {sale.status}")

        # Меняем статус
        sale.status = 'assembling'
        sale.assembly_started_at = datetime.utcnow()
        
        await db.commit()
        
        # КЛЮЧЕВОЕ: заново загружаем объект из БД после commit
        # Это гарантирует, что FastAPI получит корректный объект для сериализации
        reload_stmt = (
            select(Sale)
            .options(
                selectinload(Sale.items).selectinload(SaleItem.product)
            )
            .where(Sale.id == sale_id)
        )
        reload_result = await db.execute(reload_stmt)
        return reload_result.scalar_one()


    @staticmethod
    async def check_assembly_resources(db: AsyncSession, sale_id: int) -> dict:
        """
        Проверяет наличие ресурсов для сборки заказа.
        Возвращает информацию о нехватке цветов и упаковки.
        """
        # Загружаем заказ с товарами и рецептами
        stmt = (
            select(Sale)
            .options(
                selectinload(Sale.items).selectinload(SaleItem.product),
                selectinload(Sale.items).selectinload(SaleItem.recipe)
                .selectinload(Recipe.items).selectinload(RecipeItem.product)
            )
            .where(Sale.id == sale_id)
        )
        result = await db.execute(stmt)
        sale = result.scalar_one_or_none()

        if not sale:
            raise ValueError("Заказ не найден")

        flower_shortages = []
        packaging_shortages = []
        consumable_shortages = []

        # Проходим по каждой позиции заказа
        for item in sale.items:
            product = item.product
            
            # Определяем компоненты для проверки
            components_to_check = []
            
            if product.product_type == 'bouquet' and item.recipe:
                for recipe_item in item.recipe.items:
                    components_to_check.append((recipe_item.product, recipe_item.quantity * item.quantity))
            else:
                components_to_check.append((product, item.quantity))

            # Проверяем каждый компонент
            for comp_product, required_qty in components_to_check:
                if comp_product.product_type == 'flower':
                    # Проверяем наличие цветов в партиях
                    stmt_batches = (
                        select(Batch)
                        .where(
                            Batch.product_id == comp_product.id,
                            Batch.current_qty > 0,
                            Batch.status == 'active'
                        )
                    )
                    batches_result = await db.execute(stmt_batches)
                    batches = batches_result.scalars().all()
                    
                    available_qty = sum(b.current_qty for b in batches)
                    
                    if available_qty < required_qty:
                        flower_shortages.append({
                            'product_id': comp_product.id,
                            'product_name': comp_product.name,
                            'required_qty': float(required_qty),
                            'available_qty': float(available_qty),
                            'shortage_qty': float(required_qty - available_qty)
                        })
                
                elif comp_product.product_type == 'packaging':
                    # Проверяем остаток в Stock (как для consumable)
                    stock = await db.scalar(
                        select(Stock).where(Stock.product_id == comp_product.id)
                    )
                    available_qty = stock.quantity if stock else 0
                    
                    if available_qty < required_qty:
                        packaging_shortages.append({
                            'product_id': comp_product.id,
                            'product_name': comp_product.name,
                            'required_qty': float(required_qty),
                            'available_qty': float(available_qty),
                            'shortage_qty': float(required_qty - available_qty)
                        })
                
                elif comp_product.product_type == 'consumable':
                    # Проверяем наличие consumable в stock
                    stock = await db.scalar(
                        select(Stock).where(Stock.product_id == comp_product.id)
                    )
                    available_qty = stock.quantity if stock else 0
                    
                    if available_qty < required_qty:
                        consumable_shortages.append({
                            'product_id': comp_product.id,
                            'product_name': comp_product.name,
                            'required_qty': float(required_qty),
                            'available_qty': float(available_qty),
                            'shortage_qty': float(required_qty - available_qty)
                        })

        return {
            'sale_id': sale_id,
            'sale_number': sale.sale_number,
            'status': sale.status,
            'flower_shortages': flower_shortages,
            'packaging_shortages': packaging_shortages,
            'consumable_shortages': consumable_shortages,
            'can_assemble': len(flower_shortages) == 0 and len(packaging_shortages) == 0 and len(consumable_shortages) == 0
        }


        
        sale.status = 'assembling'
        sale.assembly_started_at = datetime.utcnow()
        
        await db.commit()
        await db.refresh(sale)
        return sale

    @staticmethod
    async def complete_assembly(db: AsyncSession, sale_id: int, user_id: int) -> Sale:
        """
        Переводит заказ в статус 'assembled'.
        АВТОМАТИЧЕСКИ списывает цветы (FIFO) и фиксирует расход упаковки.
        """
        # 1. Загружаем заказ со всеми связями ПРАВИЛЬНЫМИ путями
        stmt = (
            select(Sale)
            .options(
                # Путь 1: Позиции заказа и их прямой товар
                selectinload(Sale.items).selectinload(SaleItem.product),
                
                # Путь 2: Позиции заказа -> Рецепт (привязанный к SaleItem!) -> Компоненты -> Товары компонентов
                selectinload(Sale.items)
                .selectinload(SaleItem.recipe)
                .selectinload(Recipe.items)
                .selectinload(RecipeItem.product)
            )
            .where(Sale.id == sale_id)
        )
        result = await db.execute(stmt)
        sale = result.scalar_one_or_none()

        if not sale:
            raise ValueError("Заказ не найден")

        if sale.status != 'assembling':
            raise ValueError(f"Нельзя завершить сборку. Текущий статус: {sale.status}")

        # 2. Проходим по каждой позиции заказа
        for item in sale.items:
            product = item.product
            
            # Определяем, что именно списывать: сам товар или компоненты его рецепта
            components_to_process: List[Tuple[Product, Decimal]] = []
            
            # ИСПРАВЛЕНО: проверяем item.recipe, а не product.recipe
            if product.product_type == 'bouquet' and item.recipe:
                # Если это букет с рецептом, берем компоненты рецепта
                for recipe_item in item.recipe.items:
                    components_to_process.append((recipe_item.product, recipe_item.quantity * item.quantity))
            else:
                # Если это обычный товар (или букет без рецепта в этой позиции), списываем его самого
                components_to_process.append((product, item.quantity))

            # 3. Списание компонентов
            packaging_warnings = []  # Собираем предупреждения о норме
            for comp_product, comp_qty in components_to_process:
                try:
                    if comp_product.product_type == 'flower':
                        await OrderAssemblyService._deduct_flower_fifo(
                            db, comp_product.id, comp_qty, sale.id, item.id, user_id
                        )
                    elif comp_product.product_type == 'packaging':
                        result = await OrderAssemblyService._deduct_packaging(
                            db, comp_product.id, comp_qty, sale.id, user_id
                        )
                        if result and result.get("norm_reached"):
                            packaging_warnings.append(result)
                    elif comp_product.product_type == 'consumable':
                        await OrderAssemblyService._deduct_consumable(
                            db, comp_product.id, comp_qty, sale.id, user_id
                        )
                except ValueError as e:
                    error_msg = str(e)
                    # Специальные ошибки упаковки — пробрасываем как есть для UI
                    if error_msg.startswith('PACKAGING_'):
                        await db.rollback()
                        raise
                    # Остальные ошибки тоже пробрасываем
                    await db.rollback()
                    raise

        # 4. Обновляем статус заказа
        sale.status = 'assembled'
        sale.assembly_completed_at = datetime.utcnow()
        
        # Обновляем статусы позиций
        for item in sale.items:
            item.status = 'assembled'

        await db.commit()
        await db.refresh(sale)
        
        # Если были предупреждения о норме упаковки — добавляем в ответ
        if packaging_warnings:
            # Возвращаем специальный объект вместо Sale
            raise ValueError(
                f"PACKAGING_NORM_REACHED|{packaging_warnings[0]['opening_id']}|"
                f"Нормативный расход достигнут. Подтвердите закрытие рулона."
            )
        
        return sale


    @staticmethod
    async def _deduct_flower_fifo(
        db: AsyncSession, 
        product_id: int, 
        qty_to_deduct: Decimal, 
        sale_id: int, 
        sale_item_id: int, 
        user_id: int
    ):
        """Списывает цветы из активных партий по FIFO (по дате получения)"""
        remaining_qty = qty_to_deduct
        
        # Ищем активные партии с остатком > 0, сортируем по дате получения (FIFO)
        stmt = (
            select(Batch)
            .where(
                Batch.product_id == product_id,
                Batch.current_qty > 0,
                Batch.status == 'active'
            )
            .order_by(Batch.received_at.asc())
            .with_for_update()  # <-- БЛОКИРУЕМ строки до конца транзакции
        )
        result = await db.execute(stmt)

        batches = result.scalars().all()

        if not batches:
            raise ValueError(f"Недостаточно остатков для товара ID {product_id}. Требуется: {qty_to_deduct}")

        first_batch_id = batches[0].id  # Запоминаем первую партию для привязки к sale_item

        for batch in batches:
            if remaining_qty <= 0:
                break

            deduct_from_batch = min(remaining_qty, batch.current_qty)
            
            # 1. Уменьшаем остаток партии
            batch.current_qty -= deduct_from_batch
            if batch.current_qty == 0:
                batch.status = 'depleted'
            
            # 2. Создаём запись о движении
            movement = Movement(
                batch_id=batch.id,
                movement_type='sale',
                quantity=deduct_from_batch,
                sale_id=sale_id,
                created_by=user_id,
                reason=f"Списание при сборке заказа #{sale_id}"
            )
            db.add(movement)
            
            remaining_qty -= deduct_from_batch

        if remaining_qty > 0:
            raise ValueError(f"Критическая ошибка: не удалось списать {remaining_qty} ед. товара ID {product_id}")

        # 3. Привязываем позицию продажи к первой использованной партии
        stmt_update = (
            update(SaleItem)
            .where(SaleItem.id == sale_item_id)
            .values(batch_id=first_batch_id)
        )
        await db.execute(stmt_update)

        # 4. ОБНОВЛЯЕМ СВОДНЫЙ КЭШ ОСТАТКОВ (таблица stock)
        stmt_stock = select(Stock).where(Stock.product_id == product_id)
        result_stock = await db.execute(stmt_stock)
        stock_record = result_stock.scalar_one_or_none()
        
        if stock_record:
            stock_record.quantity -= qty_to_deduct
            stock_record.updated_at = datetime.utcnow()
        else:
            # Если записи в кэше почему-то нет, создаём её
            new_stock = Stock(product_id=product_id, quantity=-qty_to_deduct)
            db.add(new_stock)


    @staticmethod
    async def _deduct_packaging(db: AsyncSession, product_id: int, qty: float, sale_id: int, user_id: int):
        """Списание упаковки — простая логика как у consumable"""
        from decimal import Decimal
        
        qty_to_deduct = Decimal(str(qty))
        
        stock = await db.scalar(
            select(Stock).where(Stock.product_id == product_id).with_for_update()
        )
        
        if not stock or stock.quantity < qty_to_deduct:
            available = float(stock.quantity) if stock else 0
            raise ValueError(f"Недостаточно остатков упаковки (ID {product_id}): нужно {qty}, доступно {available}")
        
        stock.quantity -= qty_to_deduct
        stock.updated_at = datetime.utcnow()
        
        movement = Movement(
            product_id=product_id,
            batch_id=None,
            movement_type='sale',
            quantity=qty_to_deduct,
            sale_id=sale_id,
            created_by=user_id,
            reason=f'Сборка заказа #{sale_id}'
        )
        db.add(movement)


    @staticmethod
    async def _deduct_consumable(
        db: AsyncSession,
        product_id: int,
        qty_to_deduct: Decimal,
        sale_id: int,
        user_id: int
    ):
        """Списывает consumable напрямую из stock"""
        stock = await db.scalar(
            select(Stock)
            .where(Stock.product_id == product_id)
            .with_for_update()  # <-- БЛОКИРУЕМ строку
        )

        
        if not stock or stock.quantity < qty_to_deduct:
            raise ValueError(f"Недостаточно остатков для товара ID {product_id}")
        
        # Уменьшаем остаток
        stock.quantity -= qty_to_deduct
        stock.updated_at = datetime.utcnow()
        
        # Создаём движение
        movement = Movement(
            product_id=product_id,
            movement_type='sale',
            quantity=qty_to_deduct,
            sale_id=sale_id,
            created_by=user_id,
            reason=f"Списание при сборке заказа #{sale_id}"
        )
        db.add(movement)


    @staticmethod
    async def cancel_order(db: AsyncSession, sale_id: int, reason: str, user_id: int) -> Sale:
        """
        Отменяет заказ. Если он был 'assembled' или дальше, возвращает остатки.
        """
        stmt = (
            select(Sale)
            .options(selectinload(Sale.items))
            .where(Sale.id == sale_id)
        )
        result = await db.execute(stmt)
        sale = result.scalar_one_or_none()

        if not sale:
            raise ValueError("Заказ не найден")

        if sale.status in ('completed', 'cancelled', 'returned'):
            raise ValueError(f"Нельзя отменить заказ в статусе {sale.status}")

        # Если заказ уже был собран, нужно вернуть остатки
        if sale.status in ('assembled', 'shipped'):
            for item in sale.items:
                if item.batch_id:
                    # Возвращаем количество в партию
                    stmt_batch = select(Batch).where(Batch.id == item.batch_id)
                    batch_result = await db.execute(stmt_batch)
                    batch = batch_result.scalar_one_or_none()
                    
                    if batch:
                        batch.current_qty += item.quantity
                        if batch.status == 'depleted':
                            batch.status = 'active'
                        
                        # Возвращаем количество в сводный кэш stock
                        stmt_stock = select(Stock).where(Stock.product_id == item.product_id)
                        result_stock = await db.execute(stmt_stock)
                        stock_record = result_stock.scalar_one_or_none()
                        
                        if stock_record:
                            stock_record.quantity += item.quantity
                            stock_record.updated_at = datetime.utcnow()
                        
                        # Создаем движение возврата
                        movement = Movement(
                            batch_id=batch.id,
                            movement_type='return_to_stock',
                            quantity=item.quantity,
                            sale_id=sale.id,
                            created_by=user_id,
                            reason=f"Возврат при отмене заказа #{sale.id}: {reason}"
                        )
                        db.add(movement)


        sale.status = 'cancelled'
        sale.cancelled_at = datetime.utcnow()
        sale.cancellation_reason = reason

        await db.commit()
        await db.refresh(sale)
        return sale
