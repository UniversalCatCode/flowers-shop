from decimal import Decimal
from typing import Dict, List, Optional
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog.models import Product, Recipe, RecipeItem
from app.inventory.models import Stock
from app.sales.models import Sale, SaleItem
from app.stores.models import AvailabilityAlert
from app.stores.alert_service import AlertService


class CapabilityService:
    """
    Сервис расчёта возможностей сборки букетов.
    
    Учитывает:
    - Текущие фактические остатки (таблица inventory.stock)
    - Компоненты, зарезервированные в активных заказах (статусы 'accepted', 'assembling')
    - Минимальный резерв на витрину (1 шт. на каждый товар-букет из рецепта)
    
    Логика:
    - Заказы 'accepted' и 'assembling' ещё НЕ списаны физически, но должны быть зарезервированы
    - Заказы 'assembled' и дальше уже списаны — их не вычитаем
    """
    
    # Статусы заказов, которые резервируют компоненты, но ещё не списаны
    ACTIVE_ORDER_STATUSES = ('accepted', 'assembling')
    
    @staticmethod
    async def calculate_capability(db: AsyncSession) -> dict:
        """
        Основной метод расчёта возможностей сборки.
        Возвращает полный отчёт по всем рецептам.
        """
        # 1. Получаем все активные рецепты с их компонентами
        recipes = await CapabilityService._get_active_recipes_with_items(db)
        
        # 2. Получаем фактические остатки на складе
        stock_map = await CapabilityService._get_stock_map(db)
        
        # 3. Получаем компоненты, зарезервированные в активных заказах
        reserved_map = await CapabilityService._get_reserved_components(db)
        
        # 4. Получаем все товары-букеты, привязанные к рецептам
        bouquet_products_map = await CapabilityService._get_bouquet_products_map(db)
        
        # 5. Для каждого рецепта считаем возможности
        report = {
            'generated_at': datetime.utcnow().isoformat(),
            'total_recipes': len(recipes),
            'critical_alerts': 0,
            'warning_alerts': 0,
            'recipes': []
        }
        
        for recipe in recipes:
            recipe_report = CapabilityService._analyze_recipe(
                recipe, stock_map, reserved_map, bouquet_products_map
            )
            report['recipes'].append(recipe_report)
            
            if recipe_report['recipe_status'] == 'critical':
                report['critical_alerts'] += 1
            elif recipe_report['recipe_status'] == 'warning':
                report['warning_alerts'] += 1
        
        return report
    
    @staticmethod
    async def _get_active_recipes_with_items(db: AsyncSession) -> List[Recipe]:
        """Загружает все активные рецепты с их компонентами."""
        stmt = (
            select(Recipe)
            .options(
                selectinload(Recipe.items).selectinload(RecipeItem.product)
            )
            .where(Recipe.is_active == True)
        )
        result = await db.execute(stmt)
        return result.scalars().all()
    
    @staticmethod
    async def _get_stock_map(db: AsyncSession) -> Dict[int, Decimal]:
        """
        Возвращает словарь {product_id: quantity} для всех товаров на складе.
        """
        stmt = select(Stock.product_id, Stock.quantity)
        result = await db.execute(stmt)
        return {row[0]: row[1] for row in result.all()}
    
    @staticmethod
    async def _get_reserved_components(db: AsyncSession) -> Dict[int, Decimal]:
        """
        Возвращает словарь {product_id: reserved_quantity}.
        Считает компоненты, которые зарезервированы в активных заказах,
        но ещё не списаны физически.
        """
        reserved: Dict[int, Decimal] = {}
        
        # Находим все активные заказы (принятые, но не собранные)
        stmt = (
            select(Sale)
            .options(
                selectinload(Sale.items).selectinload(SaleItem.product),
                selectinload(Sale.items)
                .selectinload(SaleItem.recipe)
                .selectinload(Recipe.items)
                .selectinload(RecipeItem.product)
            )
            .where(Sale.status.in_(CapabilityService.ACTIVE_ORDER_STATUSES))
        )
        result = await db.execute(stmt)
        active_orders = result.scalars().all()
        
        for order in active_orders:
            for item in order.items:
                product = item.product
                
                # Определяем, что резервировать: компоненты рецепта или сам товар
                if product.product_type == 'bouquet' and item.recipe:
                    # Резервируем компоненты рецепта * количество букетов в заказе
                    for recipe_item in item.recipe.items:
                        comp_id = recipe_item.product_id
                        comp_qty = recipe_item.quantity * item.quantity
                        reserved[comp_id] = reserved.get(comp_id, Decimal('0')) + comp_qty
                else:
                    # Резервируем сам товар (для одиночных цветов, упаковки и т.д.)
                    reserved[product.id] = reserved.get(product.id, Decimal('0')) + item.quantity
        
        return reserved
    
    @staticmethod
    async def _get_bouquet_products_map(db: AsyncSession) -> Dict[int, List[Product]]:
        """
        Возвращает словарь {recipe_id: [Product, ...]} для всех товаров-букетов.
        """
        stmt = (
            select(Product)
            .where(
                Product.product_type == 'bouquet',
                Product.recipe_id != None,
                Product.is_active == True
            )
        )
        result = await db.execute(stmt)
        bouquet_products = result.scalars().all()
        
        bouquet_map: Dict[int, List[Product]] = {}
        for product in bouquet_products:
            if product.recipe_id:
                if product.recipe_id not in bouquet_map:
                    bouquet_map[product.recipe_id] = []
                bouquet_map[product.recipe_id].append(product)
        
        return bouquet_map
    
    @staticmethod
    def _analyze_recipe(
        recipe: Recipe,
        stock_map: Dict[int, Decimal],
        reserved_map: Dict[int, Decimal],
        bouquet_products_map: Dict[int, List[Product]]
    ) -> dict:
        """
        Анализирует один рецепт и возвращает отчёт по нему.
        """
        recipe_report = {
            'recipe_id': recipe.id,
            'recipe_name': recipe.name,
            'recipe_status': 'ok',  # 'ok', 'warning', 'critical'
            'max_assemblable': 0,
            'limiting_component': None,
            'bouquet_products': [],
            'components_analysis': []
        }
        
        # Получаем товары-букеты этого рецепта
        bouquet_products = bouquet_products_map.get(recipe.id, [])
        
        # Заполняем информацию о товарах-букетах
        for bp in bouquet_products:
            recipe_report['bouquet_products'].append({
                'product_id': bp.id,
                'name': bp.name,
                'sku': bp.sku,
                'external_ids': bp.external_ids,
                'selling_price': float(bp.selling_price) if bp.selling_price else None
            })
        
        # Получаем компоненты рецепта (только те, которые не являются букетами)
        recipe_components = [
            item for item in recipe.items
            if item.product.product_type != 'bouquet'
        ]
        
        if not recipe_components:
            recipe_report['recipe_status'] = 'warning'
            recipe_report['warning_message'] = 'У рецепта нет компонентов'
            return recipe_report
        
        # Считаем, сколько можно собрать букетов с учётом доступных компонентов
        max_assemblable = None
        limiting_component = None
        
        for comp_item in recipe_components:
            product = comp_item.product
            needed_per_bouquet = comp_item.quantity or Decimal('0')
            
            if needed_per_bouquet <= 0:
                continue
            
            # Доступно на складе (фактический остаток)
            available = stock_map.get(product.id, Decimal('0'))
            
            # Зарезервировано в активных заказах
            reserved = reserved_map.get(product.id, Decimal('0'))
            
            # Эффективно доступно (что реально можно использовать для новых букетов)
            effective_available = available - reserved
            
            # Сколько букетов можно собрать из этого компонента
            can_make = int(effective_available / needed_per_bouquet) if needed_per_bouquet > 0 else 0
            if can_make < 0:
                can_make = 0
            
            # Проверяем, является ли этот компонент ограничивающим
            if max_assemblable is None or can_make < max_assemblable:
                max_assemblable = can_make
                limiting_component = {
                    'product_id': product.id,
                    'name': product.name,
                    'sku': product.sku,
                    'available': float(available),
                    'reserved': float(reserved),
                    'effective_available': float(effective_available),
                    'needed_per_unit': float(needed_per_bouquet),
                    'can_make': can_make,
                    'shortage': float(needed_per_bouquet - effective_available) if effective_available < needed_per_bouquet else 0
                }
            
            recipe_report['components_analysis'].append({
                'product_id': product.id,
                'name': product.name,
                'sku': product.sku,
                'product_type': product.product_type,
                'available': float(available),
                'reserved': float(reserved),
                'effective_available': float(effective_available),
                'needed_per_unit': float(needed_per_bouquet),
                'can_make': can_make,
                'is_limiting': False  # обновим ниже
            })
        
# Помечаем ограничивающий компонент
        if limiting_component:
            recipe_report['limiting_component'] = limiting_component
            for comp in recipe_report['components_analysis']:
                if comp['product_id'] == limiting_component['product_id']:
                    comp['is_limiting'] = True
                    break
        
        if max_assemblable is None:
            max_assemblable = 0
        
        recipe_report['max_assemblable'] = max_assemblable
        
        # Определяем статус рецепта
        if max_assemblable <= 0:
            recipe_report['recipe_status'] = 'critical'
        elif max_assemblable == 1:
            recipe_report['recipe_status'] = 'warning'
        else:
            recipe_report['recipe_status'] = 'ok'
        
        return recipe_report
    
    @staticmethod
    async def sync_capability_alerts(db: AsyncSession) -> dict:
        """
        Синхронизирует алерты на основе расчёта возможностей сборки.
        
        Для рецептов со статусом 'critical' создаёт алерты типа 'capability_shortage'.
        Для рецептов со статусом 'warning' создаёт алерты типа 'capability_low_stock'.
        
        Группирует алерты по ограничивающему компоненту: если один компонент
        является узким местом для нескольких рецептов, создаётся ОДИН алерт
        со всеми затронутыми букетами.
        
        Нехватка считается как сумма потребностей всех затронутых рецептов
        (по 1 букету на каждый), минус доступный остаток.
        """
        # Рассчитываем возможности
        report = await CapabilityService.calculate_capability(db)
        
        # Группируем проблемные рецепты по ограничивающему компоненту
        # Структура: {component_product_id: {recipes: [...], bouquet_names: [...], worst_status: str, total_needed: float, available: float}}
        grouped_by_component: Dict[int, dict] = {}
        
        for recipe_report in report['recipes']:
            recipe_status = recipe_report['recipe_status']
            limiting = recipe_report.get('limiting_component')
            
            # Обрабатываем только критические и предупреждающие рецепты
            if recipe_status not in ('critical', 'warning'):
                continue
            
            if not limiting:
                continue
            
            comp_product_id = limiting['product_id']
            bouquet_names = [bp['name'] for bp in recipe_report.get('bouquet_products', [])]
            
            if comp_product_id not in grouped_by_component:
                grouped_by_component[comp_product_id] = {
                    'recipes': [],
                    'bouquet_names': [],
                    'worst_status': recipe_status,
                    'total_needed': 0.0,
                    'available': limiting['effective_available'],
                    'component_name': limiting['name']
                }
            
            group = grouped_by_component[comp_product_id]
            
            # Добавляем потребность этого рецепта (нужно на 1 букет)
            group['total_needed'] += limiting['needed_per_unit']
            
            group['recipes'].append({
                'recipe_id': recipe_report['recipe_id'],
                'recipe_name': recipe_report['recipe_name'],
                'needed_per_unit': limiting['needed_per_unit'],
                'max_assemblable': recipe_report['max_assemblable']
            })
            group['bouquet_names'].extend(bouquet_names)
            
            # Обновляем худший статус (critical важнее warning)
            if recipe_status == 'critical':
                group['worst_status'] = 'critical'
        
        created_alerts = 0
        skipped_alerts = 0
        
        for comp_product_id, group in grouped_by_component.items():
            # Проверяем, есть ли уже активный алерт для этого компонента
            existing_alert = await db.scalar(
                select(AvailabilityAlert)
                .where(
                    AvailabilityAlert.product_id == comp_product_id,
                    AvailabilityAlert.alert_type.in_([
                        'capability_shortage',
                        'capability_low_stock'
                    ]),
                    AvailabilityAlert.status == 'active'
                )
            )
            
            if existing_alert:
                skipped_alerts += 1
                continue
            
            # Определяем тип алерта по худшему статусу
            alert_type = 'capability_shortage' if group['worst_status'] == 'critical' else 'capability_low_stock'
            
            # Формируем рекомендации со всеми затронутыми рецептами и букетами
            recommendations = {
                'recipes': group['recipes'],
                'affected_bouquets': group['bouquet_names'],
                'total_bouquets_affected': len(group['bouquet_names']),
                'message': f"Компонент '{group['component_name']}' ограничивает {len(group['recipes'])} рецепт(ов)"
            }
            
            # Создаём алерт через существующий AlertService
            # required_qty = общая потребность всех рецептов
            # available_qty = доступно с учётом резерва
            await AlertService.create_alert(
                db=db,
                alert_type=alert_type,
                product_id=comp_product_id,
                required_qty=group['total_needed'],
                available_qty=group['available'],
                recommendations=recommendations
            )
            created_alerts += 1
        
        return {
            'created_alerts': created_alerts,
            'skipped_alerts': skipped_alerts,
            'total_recipes_analyzed': report['total_recipes'],
            'critical_recipes': report['critical_alerts'],
            'warning_recipes': report['warning_alerts']
        }

    @staticmethod
    async def get_reserved_for_bouquets(db: AsyncSession, product_id: int) -> Decimal:
        """
        Возвращает количество компонента, зарезервированное в активных заказах.
        Используется при расчёте дефицита для заказов поставщикам.
        """
        reserved_map = await CapabilityService._get_reserved_components(db)
        return reserved_map.get(product_id, Decimal('0'))
