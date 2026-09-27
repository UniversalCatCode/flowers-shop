import os
import uuid
from pathlib import Path
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.catalog.models import ProductImage

# Папка для хранения фото
UPLOAD_DIR = Path("uploads/products")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Максимальный размер файла (10 МБ)
MAX_FILE_SIZE = 10 * 1024 * 1024

# Разрешённые расширения
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}


class ProductImageService:
    
    @staticmethod
    async def upload_image(
        db: AsyncSession,
        product_id: int,
        file: UploadFile
    ) -> ProductImage:
        """Загружает фото товара на диск и создаёт запись в БД"""
        # Проверяем расширение
        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise ValueError(f"Недопустимый формат файла. Разрешены: {', '.join(ALLOWED_EXTENSIONS)}")
        
        # Проверяем размер
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise ValueError(f"Файл слишком большой. Максимум: {MAX_FILE_SIZE // (1024*1024)} МБ")
        
        # Генерируем уникальное имя файла
        filename = f"{uuid.uuid4().hex}{ext}"
        file_path = UPLOAD_DIR / filename
        
        # Сохраняем файл
        with open(file_path, 'wb') as f:
            f.write(content)
        
        # Относительный URL для доступа
        image_url = f"/uploads/products/{filename}"
        
        # Проверяем, есть ли уже фото у товара
        stmt = select(ProductImage).where(ProductImage.product_id == product_id)
        result = await db.execute(stmt)
        existing_images = result.scalars().all()
        
        # Если это первое фото — делаем его главным
        is_primary = len(existing_images) == 0
        
        # Создаём запись в БД
        image = ProductImage(
            product_id=product_id,
            image_url=image_url,
            sort_order=len(existing_images),
            is_primary=is_primary
        )
        db.add(image)
        await db.commit()
        await db.refresh(image)
        
        return image
    
    @staticmethod
    async def get_product_images(db: AsyncSession, product_id: int) -> list[ProductImage]:
        """Получает все фото товара, отсортированные по порядку"""
        stmt = (
            select(ProductImage)
            .where(ProductImage.product_id == product_id)
            .order_by(ProductImage.sort_order.asc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())
    
    @staticmethod
    async def delete_image(db: AsyncSession, product_id: int, image_id: int) -> bool:
        """Удаляет фото товара (и файл с диска)"""
        stmt = select(ProductImage).where(
            ProductImage.id == image_id,
            ProductImage.product_id == product_id
        )
        result = await db.execute(stmt)
        image = result.scalar_one_or_none()
        
        if not image:
            return False
        
        # Удаляем файл с диска
        file_path = Path(image.image_url.lstrip('/'))
        if file_path.exists():
            file_path.unlink()
        
        # Удаляем запись из БД
        await db.delete(image)
        
        # Если удалённое фото было главным, делаем главным следующее
        if image.is_primary:
            stmt_next = (
                select(ProductImage)
                .where(ProductImage.product_id == product_id)
                .order_by(ProductImage.sort_order.asc())
                .limit(1)
            )
            result_next = await db.execute(stmt_next)
            next_image = result_next.scalar_one_or_none()
            if next_image:
                next_image.is_primary = True
        
        await db.commit()
        return True
    
    @staticmethod
    async def set_primary(db: AsyncSession, product_id: int, image_id: int) -> bool:
        """Делает фото главным (сбрасывает флаг у остальных)"""
        # Сбрасываем флаг у всех фото товара
        stmt_reset = select(ProductImage).where(ProductImage.product_id == product_id)
        result_reset = await db.execute(stmt_reset)
        images = result_reset.scalars().all()
        
        target_found = False
        for img in images:
            if img.id == image_id:
                img.is_primary = True
                target_found = True
            else:
                img.is_primary = False
        
        if not target_found:
            return False
        
        await db.commit()
        return True
