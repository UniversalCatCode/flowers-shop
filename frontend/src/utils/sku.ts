// Простая транслитерация кириллицы в латиницу
const translitMap: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    ' ': '-', '-': '-', '_': '-',
  };
  
  // Транслитерация текста
  const transliterate = (text: string): string => {
    return text
      .toLowerCase()
      .split('')
      .map(char => translitMap[char] || char)
      .join('');
  };
  
  // Генерация SKU из названия и типа
  export const generateSku = (name: string, productType: string): string => {
    if (!name) return '';
    
    // Транслитерируем
    let transliterated = transliterate(name);
    
    // Убираем всё, кроме букв, цифр и дефисов
    transliterated = transliterated.replace(/[^a-z0-9-]/g, '-');
    
    // Убираем повторяющиеся дефисы
    transliterated = transliterated.replace(/-+/g, '-');
    
    // Убираем дефисы в начале и конце
    transliterated = transliterated.replace(/^-+|-+$/g, '');
    
    // Разбиваем на слова и берем первые буквы (если слов больше 3)
    const words = transliterated.split('-').filter(w => w.length > 0);
    let shortSku: string;
    
    if (words.length <= 3) {
      // Если слов немного, берем все
      shortSku = words.join('-');
    } else {
      // Если много слов, берем первые 3 + последнее (часто это размер/характеристика)
      shortSku = [...words.slice(0, 3), words[words.length - 1]].join('-');
    }
    
    // Добавляем префикс типа
    const prefix = productType.substring(0, 3).toUpperCase();
    const sku = `${prefix}-${shortSku}`.toUpperCase();
    
    // Ограничиваем длину до 30 символов
    return sku.substring(0, 30);
  };
  
  // Санитизация SKU при ручном вводе
  export const sanitizeSku = (value: string): string => {
    // Разрешаем только латиницу, цифры и дефис
    let sanitized = value.toUpperCase().replace(/[^A-Z0-9-]/g, '-');
    
    // Убираем повторяющиеся дефисы
    sanitized = sanitized.replace(/-+/g, '-');
    
    // Убираем дефисы в начале и конце
    sanitized = sanitized.replace(/^-+|-+$/g, '');
    
    // Ограничиваем длину
    return sanitized.substring(0, 30);
  };
  
  // Валидация SKU
  export const validateSku = (sku: string): { valid: boolean; message: string } => {
    if (!sku) {
      return { valid: false, message: 'SKU обязателен' };
    }
    if (sku.length < 3) {
      return { valid: false, message: 'SKU слишком короткий (минимум 3 символа)' };
    }
    if (sku.length > 30) {
      return { valid: false, message: 'SKU слишком длинный (максимум 30 символов)' };
    }
    if (!/^[A-Z0-9-]+$/.test(sku)) {
      return { valid: false, message: 'SKU должен содержать только латиницу, цифры и дефисы' };
    }
    if (sku.startsWith('-') || sku.endsWith('-')) {
      return { valid: false, message: 'SKU не должен начинаться или заканчиваться дефисом' };
    }
    return { valid: true, message: '' };
  };
  