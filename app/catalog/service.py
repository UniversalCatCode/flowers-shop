from typing import Optional, List
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.catalog.models import Category, Product, Supplier
from app.catalog.schemas import (
    CategoryCreate, CategoryUpdate,
    ProductCreate, ProductUpdate,
    SupplierCreate, SupplierUpdate,
)


# ============ CATEGORIES ============
class CategoryService:
    @staticmethod
    async def create(db: AsyncSession, data: CategoryCreate) -> Category:
        # Проверка, что parent существует (если указан)
        if data.parent_id is not None:
            parent = await db.get(Category, data.parent_id)
            if not parent:
                raise ValueError(f"Parent category with id={data.parent_id} not found")

        category = Category(**data.model_dump())
        db.add(category)
        try:
            await db.commit()
            await db.refresh(category)
        except IntegrityError:
            await db.rollback()
            raise ValueError("Category with this name already exists at this level")
        return category

    @staticmethod
    async def get_by_id(db: AsyncSession, category_id: int) -> Optional[Category]:
        return await db.get(Category, category_id)

    @staticmethod
    async def get_list(
        db: AsyncSession,
        category_type: Optional[str] = None,
        parent_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Category]:
        stmt = select(Category)
        if category_type:
            stmt = stmt.where(Category.category_type == category_type)
        if parent_id is not None:
            stmt = stmt.where(Category.parent_id == parent_id)
        stmt = stmt.order_by(Category.name).offset(skip).limit(limit)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def update(db: AsyncSession, category_id: int, data: CategoryUpdate) -> Optional[Category]:
        category = await db.get(Category, category_id)
        if not category:
            return None
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(category, key, value)
        await db.commit()
        await db.refresh(category)
        return category

    @staticmethod
    async def delete(db: AsyncSession, category_id: int) -> bool:
        category = await db.get(Category, category_id)
        if not category:
            return False
        # Проверка: нет ли дочерних категорий или товаров
        children_count = await db.scalar(
            select(func.count()).select_from(Category).where(Category.parent_id == category_id)
        )
        if children_count > 0:
            raise ValueError("Cannot delete category with children")
        products_count = await db.scalar(
            select(func.count()).select_from(Product).where(Product.category_id == category_id)
        )
        if products_count > 0:
            raise ValueError("Cannot delete category with products")
        await db.delete(category)
        await db.commit()
        return True


# ============ PRODUCTS ============
class ProductService:
    @staticmethod
    async def create(db: AsyncSession, data: ProductCreate) -> Product:
        # Проверка существования категории
        category = await db.get(Category, data.category_id)
        if not category:
            raise ValueError(f"Category with id={data.category_id} not found")

        # Проверка соответствия типа товара типу категории
        if category.category_type != data.product_type:
            raise ValueError(
                f"Product type '{data.product_type}' does not match category type '{category.category_type}'"
            )

        product = Product(**data.model_dump())
        db.add(product)
        try:
            await db.commit()
            await db.refresh(product)
        except IntegrityError:
            await db.rollback()
            raise ValueError(f"Product with SKU '{data.sku}' already exists")
        return product

    @staticmethod
    async def get_by_id(db: AsyncSession, product_id: int) -> Optional[Product]:
        return await db.get(Product, product_id)

    @staticmethod
    async def get_list(
        db: AsyncSession,
        category_id: Optional[int] = None,
        product_type: Optional[str] = None,
        search: Optional[str] = None,
        is_active: Optional[bool] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[List[Product], int]:
        stmt = select(Product)
        count_stmt = select(func.count()).select_from(Product)

        if category_id is not None:
            stmt = stmt.where(Product.category_id == category_id)
            count_stmt = count_stmt.where(Product.category_id == category_id)
        if product_type:
            stmt = stmt.where(Product.product_type == product_type)
            count_stmt = count_stmt.where(Product.product_type == product_type)
        if is_active is not None:
            stmt = stmt.where(Product.is_active == is_active)
            count_stmt = count_stmt.where(Product.is_active == is_active)
        if search:
            pattern = f"%{search}%"
            filter_expr = or_(Product.name.ilike(pattern), Product.sku.ilike(pattern))
            stmt = stmt.where(filter_expr)
            count_stmt = count_stmt.where(filter_expr)

        total = await db.scalar(count_stmt)
        stmt = stmt.order_by(Product.name).offset(skip).limit(limit)
        result = await db.execute(stmt)
        items = list(result.scalars().all())
        return items, total or 0

    @staticmethod
    async def update(db: AsyncSession, product_id: int, data: ProductUpdate) -> Optional[Product]:
        product = await db.get(Product, product_id)
        if not product:
            return None
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(product, key, value)
        try:
            await db.commit()
            await db.refresh(product)
        except IntegrityError:
            await db.rollback()
            raise ValueError("SKU must be unique")
        return product

    @staticmethod
    async def delete(db: AsyncSession, product_id: int) -> bool:
        product = await db.get(Product, product_id)
        if not product:
            return False
        # Мягкое удаление — просто деактивируем
        product.is_active = False
        await db.commit()
        return True


# ============ SUPPLIERS ============
class SupplierService:
    @staticmethod
    async def create(db: AsyncSession, data: SupplierCreate) -> Supplier:
        supplier = Supplier(**data.model_dump())
        db.add(supplier)
        await db.commit()
        await db.refresh(supplier)
        return supplier

    @staticmethod
    async def get_by_id(db: AsyncSession, supplier_id: int) -> Optional[Supplier]:
        return await db.get(Supplier, supplier_id)

    @staticmethod
    async def get_list(
        db: AsyncSession,
        is_active: Optional[bool] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Supplier]:
        stmt = select(Supplier)
        if is_active is not None:
            stmt = stmt.where(Supplier.is_active == is_active)
        if search:
            stmt = stmt.where(Supplier.name.ilike(f"%{search}%"))
        stmt = stmt.order_by(Supplier.name).offset(skip).limit(limit)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def update(db: AsyncSession, supplier_id: int, data: SupplierUpdate) -> Optional[Supplier]:
        supplier = await db.get(Supplier, supplier_id)
        if not supplier:
            return None
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(supplier, key, value)
        await db.commit()
        await db.refresh(supplier)
        return supplier

    @staticmethod
    async def delete(db: AsyncSession, supplier_id: int) -> bool:
        supplier = await db.get(Supplier, supplier_id)
        if not supplier:
            return False
        supplier.is_active = False
        await db.commit()
        return True

# ============ RECIPES ============
class RecipeService:
    @staticmethod
    async def create(db: AsyncSession, data: 'RecipeCreate') -> 'Recipe':
        from app.catalog.models import Recipe, RecipeItem
        from app.catalog.schemas import RecipeCreate

        # Проверка, что все компоненты существуют
        for item in data.items:
            product = await db.get(Product, item.product_id)
            if not product:
                raise ValueError(f"Product with id={item.product_id} not found")

        # Создаём рецепт
        recipe = Recipe(
            name=data.name,
            description=data.description,
            tolerance_pct=data.tolerance_pct or 0
        )
        db.add(recipe)
        await db.flush()  # Получаем recipe.id

        # Создаём компоненты
        for item_data in data.items:
            item = RecipeItem(
                recipe_id=recipe.id,
                **item_data.model_dump()
            )
            db.add(item)

        await db.commit()
        await db.refresh(recipe)

        # Загружаем items для ответа
        from sqlalchemy.orm import selectinload
        stmt = select(Recipe).options(selectinload(Recipe.items)).where(Recipe.id == recipe.id)
        result = await db.execute(stmt)
        return result.scalar_one()

    @staticmethod
    async def get_by_id(db: AsyncSession, recipe_id: int) -> Optional['Recipe']:
        from app.catalog.models import Recipe
        from sqlalchemy.orm import selectinload
        stmt = select(Recipe).options(selectinload(Recipe.items)).where(Recipe.id == recipe_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_list(
        db: AsyncSession,
        is_active: Optional[bool] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[List['Recipe'], int]:
        from app.catalog.models import Recipe
        from sqlalchemy.orm import selectinload

        stmt = select(Recipe).options(selectinload(Recipe.items))
        count_stmt = select(func.count()).select_from(Recipe)

        if is_active is not None:
            stmt = stmt.where(Recipe.is_active == is_active)
            count_stmt = count_stmt.where(Recipe.is_active == is_active)

        total = await db.scalar(count_stmt)
        stmt = stmt.order_by(Recipe.name).offset(skip).limit(limit)
        result = await db.execute(stmt)
        items = list(result.scalars().all())
        return items, total or 0

    @staticmethod
    async def update(db: AsyncSession, recipe_id: int, data: 'RecipeUpdate') -> Optional['Recipe']:
        from app.catalog.models import Recipe
        from app.catalog.schemas import RecipeUpdate

        recipe = await db.get(Recipe, recipe_id)
        if not recipe:
            return None
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(recipe, key, value)
        await db.commit()
        await db.refresh(recipe)
        return recipe
