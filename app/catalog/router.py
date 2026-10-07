from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import select, delete 
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload 

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_admin
from app.users.models import User
from app.catalog.models import Category,Recipe,RecipeItem,Product, ProductImage 
from app.catalog.schemas import (
    CategoryCreate, CategoryUpdate, CategoryOut, CategoryTree,
    ProductCreate, ProductUpdate, ProductOut, ProductListOut,
    SupplierCreate, SupplierUpdate, SupplierOut,
    RecipeCreate, RecipeUpdate, RecipeOut, RecipeListOut,ProductImageOut 
)
from app.catalog.service import CategoryService, ProductService, SupplierService, RecipeService  

from app.catalog.image_service import ProductImageService



router = APIRouter(prefix="/catalog", tags=["catalog"])



# ============ CATEGORIES ============
@router.post("/categories", response_model=CategoryOut, status_code=201)
async def create_category(
    data: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return await CategoryService.create(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/categories", response_model=List[CategoryOut])
async def list_categories(
    category_type: Optional[str] = None,
    parent_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await CategoryService.get_list(db, category_type, parent_id, skip, limit)

@router.get("/categories/tree", response_model=List[CategoryTree])
async def categories_tree(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Возвращает категории в виде дерева."""
    # Получаем все категории
    stmt = select(Category).order_by(Category.name)
    result = await db.execute(stmt)
    all_categories = list(result.scalars().all())
    
    # Преобразуем в словари, чтобы избежать lazy-loading отношений в Pydantic
    by_id = {}
    for c in all_categories:
        by_id[c.id] = {
            "id": c.id,
            "name": c.name,
            "category_type": c.category_type,
            "parent_id": c.parent_id,
            "created_at": c.created_at,
            "updated_at": c.updated_at,
            "children": []
        }

    # Собираем дерево
    roots = []
    for c_dict in by_id.values():
        if c_dict["parent_id"] and c_dict["parent_id"] in by_id:
            by_id[c_dict["parent_id"]]["children"].append(c_dict)
        else:
            roots.append(c_dict)
            
    return roots



@router.get("/categories/{category_id}", response_model=CategoryOut)
async def get_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    category = await CategoryService.get_by_id(db, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.patch("/categories/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: int,
    data: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    category = await CategoryService.update(db, category_id, data)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        deleted = await CategoryService.delete(db, category_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not deleted:
        raise HTTPException(status_code=404, detail="Category not found")


# ============ PRODUCTS ============
@router.post("/products", response_model=ProductOut, status_code=201)
async def create_product(
    data: ProductCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return await ProductService.create(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/products", response_model=ProductListOut)
async def list_products(
    category_id: Optional[int] = None,
    product_type: Optional[str] = None,
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = await ProductService.get_list(
        db, category_id, product_type, search, is_active, skip, limit
    )
    return ProductListOut(total=total, items=items)


@router.get("/products/{product_id}", response_model=ProductOut)
async def get_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = await ProductService.get_by_id(db, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.patch("/products/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: int,
    data: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        product = await ProductService.update(db, product_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.delete("/products/{product_id}", status_code=204)
async def delete_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = await ProductService.delete(db, product_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Product not found")


# ============ SUPPLIERS ============
@router.post("/suppliers", response_model=SupplierOut, status_code=201)
async def create_supplier(
    data: SupplierCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await SupplierService.create(db, data)


@router.get("/suppliers", response_model=List[SupplierOut])
async def list_suppliers(
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await SupplierService.get_list(db, is_active, search, skip, limit)


@router.get("/suppliers/{supplier_id}", response_model=SupplierOut)
async def get_supplier(
    supplier_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    supplier = await SupplierService.get_by_id(db, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier


@router.patch("/suppliers/{supplier_id}", response_model=SupplierOut)
async def update_supplier(
    supplier_id: int,
    data: SupplierUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    supplier = await SupplierService.update(db, supplier_id, data)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier


@router.delete("/suppliers/{supplier_id}", status_code=204)
async def delete_supplier(
    supplier_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = await SupplierService.delete(db, supplier_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Supplier not found")


# ============ RECIPES ============

@router.post("/recipes", response_model=RecipeOut, status_code=201)
async def create_recipe(
    data: RecipeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    # 1. Создаём основной рецепт
    recipe = Recipe(
        name=data.name,
        description=data.description,
        tolerance_pct=data.tolerance_pct,
        is_active=True
    )
    db.add(recipe)
    await db.flush()  # Получаем recipe.id, но ещё не коммитим

    # 2. Создаём компоненты и добавляем их В СЕССИЮ, а не в recipe.items
    # Это предотвращает попытку SQLAlchemy сделать lazy-load в асинхронном режиме
    for item_data in data.items:
        recipe_item = RecipeItem(
            recipe_id=recipe.id,  # Связь устанавливается через внешний ключ
            product_id=item_data.product_id,
            quantity=item_data.quantity,
            min_quantity=item_data.min_quantity,
            max_quantity=item_data.max_quantity,
            is_required=item_data.is_required
        )
        db.add(recipe_item)  # <-- БЕЗОПАСНЫЙ СПОСОБ для async

    # 3. Коммитим всё вместе
    await db.commit()
    
    # 4. Перечитываем объект с загруженными items для корректной сериализации Pydantic
    stmt = select(Recipe).options(selectinload(Recipe.items)).where(Recipe.id == recipe.id)
    result = await db.execute(stmt)
    return result.scalar_one()


@router.get("/recipes", response_model=RecipeListOut)
async def list_recipes(
    is_active: Optional[bool] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = await RecipeService.get_list(db, is_active, skip, limit)
    return RecipeListOut(total=total, items=items)


@router.get("/recipes/{recipe_id}", response_model=RecipeOut)
async def get_recipe(
    recipe_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Recipe).options(selectinload(Recipe.items)).where(Recipe.id == recipe_id)
    result = await db.execute(stmt)
    recipe = result.scalar_one_or_none()
    
    if not recipe:
        raise HTTPException(status_code=404, detail="Рецепт не найден")
    return recipe


@router.patch("/recipes/{recipe_id}", response_model=RecipeOut)
async def update_recipe(
    recipe_id: int,
    data: RecipeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    # 1. Загружаем рецепт СРАЗУ с компонентами
    stmt = select(Recipe).options(selectinload(Recipe.items)).where(Recipe.id == recipe_id)
    result = await db.execute(stmt)
    recipe = result.scalar_one_or_none()
    
    if not recipe:
        raise HTTPException(status_code=404, detail="Рецепт не найден")

    # 2. Обновляем основные поля
    update_data = data.model_dump(exclude_unset=True)
    items_data = update_data.pop("items", None)
    
    for key, value in update_data.items():
        setattr(recipe, key, value)

    # 3. Если пришли новые компоненты, заменяем их безопасно для async
    if items_data is not None:
        # Безопасно удаляем старые компоненты через SQL-запрос (избегаем recipe.items = [])
        await db.execute(
            delete(RecipeItem).where(RecipeItem.recipe_id == recipe.id)
        )
        await db.flush()
        
        # Добавляем новые компоненты напрямую в сессию
        for item_dict in items_data:
            new_item = RecipeItem(
                recipe_id=recipe.id,
                product_id=item_dict["product_id"],
                quantity=item_dict["quantity"],
                min_quantity=item_dict.get("min_quantity"),
                max_quantity=item_dict.get("max_quantity"),
                is_required=item_dict.get("is_required", True)
            )
            db.add(new_item)  # <-- БЕЗОПАСНЫЙ СПОСОБ для async

    await db.commit()
    
    # 4. КРИТИЧЕСКИ ВАЖНО: Перечитываем объект с загруженными items перед возвратом
    stmt = select(Recipe).options(selectinload(Recipe.items)).where(Recipe.id == recipe_id)
    result = await db.execute(stmt)
    return result.scalar_one()

    
@router.get("/products/{product_id}/cost")
async def get_product_cost(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Рассчитывает себестоимость товара на лету"""
    from app.catalog.cost_service import CostService
    
    product = await ProductService.get_by_id(db, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    
    cost = await CostService.calculate_product_cost(db, product)
    
    return {
        "product_id": product.id,
        "product_name": product.name,
        "product_type": product.product_type,
        "purchase_price": float(product.purchase_price) if product.purchase_price else None,
        "calculated_cost": float(cost["calculated_cost"]) if cost["calculated_cost"] else None,
        "cost_breakdown": cost["breakdown"],
        "has_price": product.purchase_price is not None
    }


# ============ PRODUCT IMAGES ============
@router.post("/products/{product_id}/images", response_model=ProductImageOut, status_code=201)
async def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Загружает фото для товара"""
    try:
        return await ProductImageService.upload_image(db, product_id, file)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/products/{product_id}/images", response_model=List[ProductImageOut])
async def get_product_images(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получает список фото товара"""
    return await ProductImageService.get_product_images(db, product_id)


@router.delete("/products/{product_id}/images/{image_id}", status_code=204)
async def delete_product_image(
    product_id: int,
    image_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Удаляет фото товара"""
    success = await ProductImageService.delete_image(db, product_id, image_id)
    if not success:
        raise HTTPException(status_code=404, detail="Фото не найдено")


@router.patch("/products/{product_id}/images/{image_id}/primary", response_model=ProductImageOut)
async def set_primary_image(
    product_id: int,
    image_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Делает фото главным"""
    success = await ProductImageService.set_primary(db, product_id, image_id)
    if not success:
        raise HTTPException(status_code=404, detail="Фото не найдено")
    
    stmt = select(ProductImage).where(ProductImage.id == image_id)
    result = await db.execute(stmt)
    return result.scalar_one()
