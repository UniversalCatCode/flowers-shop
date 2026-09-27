from decimal import Decimal
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.models import Product, Recipe, RecipeItem
from app.inventory.models import Batch, PackagingUnit  # <-- Они живут здесь!



class CostService:
    """Сервис для расчёта себестоимости товаров"""
    
    @staticmethod
    async def calculate_product_cost(db: AsyncSession, product: Product) -> dict:
        """
        Рассчитывает себестоимость товара на лету.
        Возвращает:
        - calculated_cost: итоговая себестоимость
        - breakdown: детализация расчёта
        """
        if product.product_type == 'flower':
            return await CostService._calculate_flower_cost(db, product)
        elif product.product_type == 'packaging':
            return await CostService._calculate_packaging_cost(db, product)
        elif product.product_type == 'consumable':
            return {
                "calculated_cost": product.purchase_price,
                "breakdown": [
                    {
                        "type": "consumable",
                        "source": "purchase_price из карточки",
                        "value": float(product.purchase_price) if product.purchase_price else None
                    }
                ]
            }
        elif product.product_type == 'bouquet':
            return await CostService._calculate_bouquet_cost(db, product)
        
        return {"calculated_cost": None, "breakdown": []}
    
    @staticmethod
    async def _calculate_flower_cost(db: AsyncSession, product: Product) -> dict:
        """Средневзвешенная цена из активных партий"""
        stmt = (
            select(
                func.sum(Batch.current_qty * Batch.purchase_price).label('total_value'),
                func.sum(Batch.current_qty).label('total_qty')
            )
            .where(
                Batch.product_id == product.id,
                Batch.status == 'active',
                Batch.current_qty > 0,
                Batch.purchase_price.isnot(None)
            )
        )
        result = await db.execute(stmt)
        row = result.one()
        
        if row.total_qty and row.total_qty > 0:
            avg_cost = row.total_value / row.total_qty
            return {
                "calculated_cost": avg_cost,
                "breakdown": [
                    {
                        "type": "flower_avg",
                        "source": f"Средневзвешенная из {int(row.total_qty)} стеблей в партиях",
                        "value": float(avg_cost)
                    }
                ]
            }
        
        return {
            "calculated_cost": product.purchase_price,
            "breakdown": [
                {
                    "type": "fallback",
                    "source": "Нет активных партий, берём из карточки",
                    "value": float(product.purchase_price) if product.purchase_price else None
                }
            ]
        }
    
    @staticmethod
    async def _calculate_packaging_cost(db: AsyncSession, product: Product) -> dict:
        """Средневзвешенная цена из активных рулонов/пачек"""
        stmt = (
            select(
                func.sum(PackagingUnit.base_quantity * PackagingUnit.purchase_price).label('total_value'),
                func.sum(PackagingUnit.base_quantity).label('total_qty')
            )
            .where(
                PackagingUnit.product_id == product.id,
                PackagingUnit.is_active == True,
                PackagingUnit.purchase_price.isnot(None)
            )
        )
        result = await db.execute(stmt)
        row = result.one()
        
        if row.total_qty and row.total_qty > 0:
            avg_cost = row.total_value / row.total_qty
            return {
                "calculated_cost": avg_cost,
                "breakdown": [
                    {
                        "type": "packaging_avg",
                        "source": f"Средневзвешенная из {float(row.total_qty)} ед. в рулонах/пачках",
                        "value": float(avg_cost)
                    }
                ]
            }
        
        return {
            "calculated_cost": product.purchase_price,
            "breakdown": [
                {
                    "type": "fallback",
                    "source": "Нет активных рулонов, берём из карточки",
                    "value": float(product.purchase_price) if product.purchase_price else None
                }
            ]
        }
    
    @staticmethod
    async def _calculate_bouquet_cost(db: AsyncSession, product: Product) -> dict:
        """Сумма себестоимостей компонентов рецепта"""
        if not product.recipe_id:
            return {
                "calculated_cost": None,
                "breakdown": [{"type": "error", "source": "У букета нет рецепта", "value": None}]
            }
        
        # Загружаем рецепт с компонентами
        stmt = (
            select(Recipe)
            .where(Recipe.id == product.recipe_id)
        )
        result = await db.execute(stmt)
        recipe = result.scalar_one_or_none()
        
        if not recipe:
            return {"calculated_cost": None, "breakdown": []}
        
        total_cost = Decimal('0')
        breakdown = []
        has_unknown = False
        
        for item in recipe.items:
            comp_product = await db.get(Product, item.product_id)
            if not comp_product:
                continue
            
            comp_cost_result = await CostService.calculate_product_cost(db, comp_product)
            comp_cost = comp_cost_result["calculated_cost"]
            
            if comp_cost is None:
                has_unknown = True
                breakdown.append({
                    "type": "component",
                    "source": f"{comp_product.name} (цена неизвестна)",
                    "quantity": float(item.quantity),
                    "unit_cost": None,
                    "total": None
                })
            else:
                item_total = Decimal(str(comp_cost)) * item.quantity
                total_cost += item_total
                breakdown.append({
                    "type": "component",
                    "source": comp_product.name,
                    "quantity": float(item.quantity),
                    "unit_cost": float(comp_cost),
                    "total": float(item_total)
                })
        
        return {
            "calculated_cost": None if has_unknown else total_cost,
            "breakdown": breakdown
        }
