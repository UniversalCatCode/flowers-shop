import React, { useEffect, useState, useMemo } from 'react';
import { 
  Table, Button, Space, Tag, message, Card, Modal, Form, 
  Input, TreeSelect, Select, InputNumber, Switch, Typography, Layout, Tree, Divider, Radio, Checkbox
} from 'antd';
import { 
  PlusOutlined, ReloadOutlined, BulbOutlined, EditOutlined, 
  WarningOutlined, AppstoreOutlined, SearchOutlined, InboxOutlined,
  CameraOutlined, DollarOutlined, LineChartOutlined
} from '@ant-design/icons';
import apiClient from '../../api/client';
import { Product, Category } from '../../types/api';
import { generateSku, sanitizeSku, validateSku } from '../../utils/sku';
import ProductImages from './ProductImages';

const { TextArea } = Input;
const { Option } = Select;
const { Text } = Typography;
const { Sider, Content } = Layout;



interface RecipeItem {
  product_id: number;
  quantity: number;
}

interface RecipeSelect {
  id: number;
  name: string;
  items?: RecipeItem[]; // Добавляем массив компонентов рецепта
}


interface EnrichedProduct extends Product {
  stock_qty?: number;
  batches_count?: number;
}

const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [stockMap, setStockMap] = useState<Map<number, any>>(new Map());
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState('');
  const [recipes, setRecipes] = useState<RecipeSelect[]>([]);
  const [form] = Form.useForm();
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);
  const [isCyrillicInSku, setIsCyrillicInSku] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  
  // Новые состояния для отображения
  const [showOnlyInStock, setShowOnlyInStock] = useState(false);
  const [priceDisplay, setPriceDisplay] = useState<'all' | 'purchase' | 'selling' | 'margin'>('all');

  // Состояния для модалки с фото
  const [isImagesModalOpen, setIsImagesModalOpen] = useState(false);
  const [productForImages, setProductForImages] = useState<Product | null>(null);

  const buildCategoryTree = (cats: Category[], prods: Product[]): any[] => {
    const sorted = [...cats].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const countByCategory = new Map<number, number>();
    prods.forEach(p => {
      countByCategory.set(p.category_id, (countByCategory.get(p.category_id) || 0) + 1);
    });

    const categoryMap = new Map<number, any>();
    sorted.forEach(cat => {
      categoryMap.set(cat.id, { 
        title: cat.name, value: cat.id, key: cat.id, children: [],
        productCount: countByCategory.get(cat.id) || 0,
      });
    });

    const tree: any[] = [];
    sorted.forEach(cat => {
      const node = categoryMap.get(cat.id)!;
      if (cat.parent_id && categoryMap.has(cat.parent_id)) {
        categoryMap.get(cat.parent_id)!.children.push(node);
      } else {
        tree.push(node);
      }
    });
    return tree;
  };

  const categoryTreeData = useMemo(() => {
    const tree = buildCategoryTree(categories, products);
    const enrichWithTotalCount = (nodes: any[]): any[] => {
      return nodes.map(node => {
        const enrichedChildren = node.children ? enrichWithTotalCount(node.children) : [];
        const totalCount = node.productCount + enrichedChildren.reduce((sum: number, c: any) => sum + (c.totalCount || 0), 0);
        return {
          ...node, children: enrichedChildren, totalCount,
          title: (<span>{node.title}<Text type="secondary" style={{ marginLeft: 8, fontSize: '12px' }}>({totalCount})</Text></span>),
        };
      });
    };
    return enrichWithTotalCount(tree);
  }, [categories, products]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [productsRes, categoriesRes, recipesRes, stockRes] = await Promise.all([
        apiClient.get<any>('/catalog/products?limit=500'),
        apiClient.get<any>('/catalog/categories?limit=500'),
        apiClient.get<any>('/catalog/recipes?limit=500&is_active=true'),
        apiClient.get<any>('/inventory/stock'), // Загружаем остатки
      ]);

      const prods = Array.isArray(productsRes.data) ? productsRes.data : (productsRes.data?.items || []);
      const cats = Array.isArray(categoriesRes.data) ? categoriesRes.data : (categoriesRes.data?.items || []);
      const recs = Array.isArray(recipesRes.data) ? recipesRes.data : (recipesRes.data?.items || []);
      const stocks = Array.isArray(stockRes.data) ? stockRes.data : (stockRes.data?.items || []);

      setProducts(prods);
      setCategories(cats);
      setRecipes(recs);

      // Создаем карту остатков для быстрого доступа по product_id
      const newStockMap = new Map<number, any>();
      stocks.forEach((s: any) => {
        newStockMap.set(s.product_id, {
          stock_qty: Number(s.total_quantity) || 0,
          batches_count: Number(s.batches_count) || 0
        });
      });
      setStockMap(newStockMap);
    } catch (error: any) {
      message.error('Не удалось загрузить данные.');
      console.error('Ошибка загрузки:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Обогащаем товары данными об остатках
  const enrichedProducts: EnrichedProduct[] = useMemo(() => {
    return products.map(p => {
      const stock = stockMap.get(p.id);
      return {
        ...p,
        stock_qty: stock?.stock_qty || 0,
        batches_count: stock?.batches_count || 0
      };
    });
  }, [products, stockMap]);

  // ФИЛЬТРАЦИЯ (не сбрасывается при переключении радио-кнопок)
  const filteredProducts = useMemo(() => {
    let result = enrichedProducts;

    if (selectedCategoryId) {
      const getCategoryAndChildrenIds = (id: number): number[] => {
        const res = [id];
        categories.forEach(cat => {
          if (cat.parent_id === id) res.push(...getCategoryAndChildrenIds(cat.id));
        });
        return res;
      };
      const categoryIds = getCategoryAndChildrenIds(selectedCategoryId);
      result = result.filter(p => categoryIds.includes(p.category_id));
    }

    if (searchText.trim()) {
      const search = searchText.toLowerCase().trim();
      result = result.filter(p => p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search));
    }

    if (showOnlyInStock) {
      result = result.filter(p => (p.stock_qty || 0) > 0);
    }

    return result;
  }, [enrichedProducts, selectedCategoryId, searchText, categories, showOnlyInStock]);

  const handleCreate = async (values: any) => {
    if (isCyrillicInSku) { message.error('SKU должен содержать только латинские буквы, цифры и дефисы!'); return; }
    const skuValidation = validateSku(values.sku);
    if (!skuValidation.valid) { message.error(skuValidation.message); return; }

    try {
      let metaData = null;
      if (values.meta_data) {
        try { metaData = JSON.parse(values.meta_data); } catch (e) { message.error('Ошибка: meta_data должен быть валидным JSON'); return; }
      }
      const payload: any = { ...values, meta_data: metaData, recipe_id: values.product_type === 'bouquet' ? values.recipe_id : null };

      if (editingProduct) {
        await apiClient.patch(`/catalog/products/${editingProduct.id}`, payload);
        message.success('Товар обновлён!');
      } else {
        await apiClient.post<Product>('/catalog/products', payload);
        message.success('Товар успешно создан!');
      }
      setIsModalOpen(false);
      form.resetFields();
      setEditingProduct(null);
      setSkuManuallyEdited(false);
      setIsCyrillicInSku(false);
      fetchData();
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      message.error(Array.isArray(detail) ? detail.map((e: any) => e.msg).join(', ') : (detail || 'Ошибка при сохранении'));
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setSkuManuallyEdited(true);
    setIsCyrillicInSku(false);
    form.setFieldsValue({
      name: product.name, sku: product.sku, category_id: product.category_id,
      product_type: product.product_type, unit: product.unit, shelf_life_days: product.shelf_life_days,
      is_active: product.is_active, recipe_id: product.recipe_id,
      meta_data: product.meta_data ? JSON.stringify(product.meta_data, null, 2) : '',
      purchase_price: product.purchase_price, selling_price: product.selling_price,
    });
    setIsModalOpen(true);
  };

  const handleOpenImages = (product: Product) => {
    setProductForImages(product);
    setIsImagesModalOpen(true);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    form.setFieldsValue({ name: e.target.value });
    if (!skuManuallyEdited && !editingProduct) {
      form.setFieldsValue({ sku: generateSku(e.target.value, form.getFieldValue('product_type') || 'flower') });
    }
  };

  const handleTypeChange = (type: string) => {
    form.setFieldsValue({ product_type: type });
    if (type !== 'bouquet') form.setFieldsValue({ recipe_id: undefined });
    if (!skuManuallyEdited && !editingProduct) {
      form.setFieldsValue({ sku: generateSku(form.getFieldValue('name') || '', type) });
    }
  };

  const handleSkuChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const cursorPosition = input.selectionStart || 0;
    const originalValue = input.value;
    setIsCyrillicInSku(/[а-яА-ЯёЁ]/.test(originalValue));
    const sanitized = sanitizeSku(originalValue);
    if (sanitized !== originalValue) form.setFieldsValue({ sku: sanitized });
    setSkuManuallyEdited(true);
    setTimeout(() => input.setSelectionRange(Math.max(0, cursorPosition - (originalValue.length - sanitized.length)), Math.max(0, cursorPosition - (originalValue.length - sanitized.length))), 0);
  };

  const currentProductType = Form.useWatch('product_type', form);
  const selectedRecipeId = Form.useWatch('recipe_id', form);

  // Функция для расчета себестоимости и проверки цен компонентов
  const updateRecipeCost = (recipeId: number) => {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe || !recipe.items) return;

    let totalCost = 0;
    let hasMissingPrice = false;

    recipe.items.forEach((item: any) => {
      const component = products.find(p => p.id === item.product_id);
      const price = component?.purchase_price ? Number(component.purchase_price) : 0;
      
      if (price <= 0) {
        hasMissingPrice = true;
      }
      
      totalCost += price * Number(item.quantity);
    });

    // Показываем предупреждение, если у какого-то компонента нет цены
    if (hasMissingPrice) {
      message.warning('Внимание: у некоторых компонентов рецепта не указана цена закупки (или она = 0). Себестоимость может быть некорректной.');
    }

    // Обновляем поле цены закупки (и при создании, и при редактировании)
    form.setFieldsValue({ purchase_price: totalCost });
  };

  // Автозаполнение цены закупки при выборе рецепта или загрузке данных
  useEffect(() => {
    if (currentProductType === 'bouquet' && selectedRecipeId) {
      updateRecipeCost(selectedRecipeId);
    }
  }, [selectedRecipeId, currentProductType, products, recipes]); // Добавили products и recipes в зависимости, чтобы пересчитывало, когда данные загрузятся

  // ДИНАМИЧЕСКИЕ КОЛОНКИ
  const getColumns = () => {
    const cols: any[] = [
      { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 120 },
      { title: 'Название', dataIndex: 'name', key: 'name', width: 200 },
      { 
        title: 'Тип', dataIndex: 'product_type', key: 'product_type', width: 100,
        render: (type: string) => {
          const color = type === 'flower' ? 'red' : type === 'packaging' ? 'blue' : type === 'consumable' ? 'orange' : 'green';
          const label = type === 'flower' ? 'Цветок' : type === 'packaging' ? 'Упаковка' : type === 'consumable' ? 'Прочее' : 'Букет';
          return <Tag color={color}>{label}</Tag>;
        }
      },
      { 
        title: 'Остаток', key: 'stock', width: 100,
        render: (_: any, record: EnrichedProduct) => (
          <Text strong style={{ color: (record.stock_qty || 0) > 0 ? '#52c41a' : '#ff4d4f' }}>
            {(record.stock_qty || 0).toFixed(1)}
          </Text>
        )
      }
    ];

    if (priceDisplay === 'all' || priceDisplay === 'purchase') {
      cols.push({ title: 'Закупка', dataIndex: 'purchase_price', key: 'purchase_price', width: 100, render: (p: any) => p ? `${Number(p).toFixed(2)} ₽` : '—' });
    }
    if (priceDisplay === 'all' || priceDisplay === 'selling') {
      cols.push({ title: 'Продажа', dataIndex: 'selling_price', key: 'selling_price', width: 100, render: (p: any) => p ? `${Number(p).toFixed(2)} ₽` : '—' });
    }
    if (priceDisplay === 'all' || priceDisplay === 'margin') {
      cols.push({ 
        title: 'Маржа', key: 'margin', width: 120,
        render: (_: any, record: any) => {
          const purchase = Number(record.purchase_price);
          const selling = Number(record.selling_price);
          if (!isNaN(purchase) && !isNaN(selling) && record.purchase_price != null && record.selling_price != null) {
            const margin = selling - purchase;
            const marginPct = purchase > 0 ? (margin / purchase) * 100 : 0;
            return <Text strong style={{ color: margin < 0 ? '#ff4d4f' : '#52c41a' }}>{margin.toFixed(2)} ₽ ({marginPct.toFixed(0)}%)</Text>;
          }
          return <Text type="secondary">—</Text>;
        }
      });
    }

    cols.push({
      title: 'Действия', key: 'actions', width: 120, fixed: 'right',
      render: (_: any, record: Product) => (
        <Space size="small">
          <Button type="text" size="small" icon={<CameraOutlined />} onClick={() => handleOpenImages(record)} title="Фото" />
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>Изменить</Button>
        </Space>
      )
    });

    return cols;
  };

  const selectedCategoryName = selectedCategoryId ? categories.find(c => c.id === selectedCategoryId)?.name : null;

  return (
    <>
      <Layout style={{ background: 'transparent' }}>
        <Sider width={280} style={{ background: '#fff', padding: '16px', marginRight: '16px', borderRadius: '8px', height: 'calc(100vh - 140px)', overflow: 'auto' }}>
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ fontSize: '16px', display: 'block', marginBottom: 8 }}><AppstoreOutlined style={{ marginRight: 8 }} />Категории</Text>
            <Button type={selectedCategoryId === null ? 'primary' : 'default'} block icon={<InboxOutlined />} onClick={() => setSelectedCategoryId(null)}>Все товары ({products.length})</Button>
          </div>
          {categoryTreeData.length > 0 ? (
            <Tree showLine defaultExpandAll={false} selectedKeys={selectedCategoryId ? [selectedCategoryId] : []} onSelect={(keys) => setSelectedCategoryId(keys[0] as number || null)} treeData={categoryTreeData} blockNode />
          ) : <Text type="secondary">Нет категорий</Text>}
        </Sider>

        <Content>
          <Card 
            title={<Space><span>Справочник товаров и остатков</span>{selectedCategoryName && <Tag color="blue" closable onClose={() => setSelectedCategoryId(null)}>{selectedCategoryName}</Tag>}{searchText && <Tag color="green" closable onClose={() => setSearchText('')}>Поиск: "{searchText}"</Tag>}</Space>}
            extra={
              <Space orientation="vertical" size="small" style={{ alignItems: 'flex-end' }}>
                <Space>
                  <Input placeholder="Поиск по названию или SKU..." prefix={<SearchOutlined />} value={searchText} onChange={(e) => setSearchText(e.target.value)} allowClear style={{ width: 250 }} />
                  <Checkbox checked={showOnlyInStock} onChange={(e) => setShowOnlyInStock(e.target.checked)}>Только в наличии</Checkbox>
                  <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Обновить</Button>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingProduct(null); form.resetFields(); setSkuManuallyEdited(false); setIsCyrillicInSku(false); setIsModalOpen(true); }}>Добавить товар</Button>
                </Space>
                <Radio.Group value={priceDisplay} onChange={(e) => setPriceDisplay(e.target.value)} size="small">
                  <Radio.Button value="all"><DollarOutlined /> Все цены</Radio.Button>
                  <Radio.Button value="purchase">Закупка</Radio.Button>
                  <Radio.Button value="selling">Продажа</Radio.Button>
                  <Radio.Button value="margin"><LineChartOutlined /> Маржа</Radio.Button>
                </Radio.Group>
              </Space>
            }
          >
            <Table 
              columns={getColumns()} 
              dataSource={filteredProducts} 
              rowKey="id" 
              loading={loading}
              pagination={{ 
                current: currentPage,
                pageSize: pageSize,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                showTotal: (total, range) => `${range[0]}-${range[1]} из ${total} товаров`,
                onChange: (page, size) => {
                  setCurrentPage(page);
                  setPageSize(size);
                },
                onShowSizeChange: (current, size) => {
                setCurrentPage(current);
                setPageSize(size);
                }
              }}
            />
          </Card>
        </Content>
      </Layout>

      <Modal title={editingProduct ? 'Редактировать товар' : 'Добавить новый товар'} open={isModalOpen} onCancel={() => { setIsModalOpen(false); form.resetFields(); setEditingProduct(null); setSkuManuallyEdited(false); setIsCyrillicInSku(false); }} footer={null} width={650}>
        <Form form={form} layout="vertical" onFinish={handleCreate} initialValues={{ is_active: true, product_type: 'flower', unit: 'stem' }}>
          <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}><Input placeholder="Например: Роза Солайя Красная 50см" onChange={handleNameChange} /></Form.Item>
          <Form.Item name="sku" label={<Space><span>Артикул (SKU)</span>{!editingProduct && <Button type="link" size="small" icon={<BulbOutlined />} onClick={() => { form.setFieldsValue({ sku: generateSku(form.getFieldValue('name') || '', form.getFieldValue('product_type') || 'flower') }); setSkuManuallyEdited(false); setIsCyrillicInSku(false); }} style={{ padding: 0 }}>Предложить</Button>}</Space>} rules={[{ required: true }, { pattern: /^[A-Z0-9-]+$/, message: 'Только латиница, цифры и дефисы' }, { min: 3 }, { max: 30 }]} extra={isCyrillicInSku ? <span style={{color: '#ff4d4f'}}><WarningOutlined /> Обнаружена кириллица!</span> : "Автоматически генерируется из названия."}>
            <Input placeholder="ROSE-SOLAYA-50" onChange={handleSkuChange} style={{ fontFamily: 'monospace', textTransform: 'uppercase', borderColor: isCyrillicInSku ? '#ff4d4f' : undefined }} />
          </Form.Item>
          <Form.Item name="category_id" label="Категория" rules={[{ required: true, message: 'Выберите категорию' }]}><TreeSelect showSearch style={{ width: '100%' }} placeholder="Выберите категорию" allowClear treeDefaultExpandAll treeData={categoryTreeData.map(n => ({ ...n, title: n.title.props.children[0] }))} treeNodeFilterProp="value" /></Form.Item>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="product_type" label="Тип товара" rules={[{ required: true }]} style={{ flex: 1 }}><Select style={{ width: '100%' }} onChange={handleTypeChange}><Option value="flower">Цветок</Option><Option value="packaging">Упаковка</Option><Option value="bouquet">Букет</Option><Option value="consumable">Прочее / Расходник</Option></Select></Form.Item>
            <Form.Item name="unit" label="Ед. измерения" rules={[{ required: true }]} style={{ flex: 1 }}><Select style={{ width: '100%' }}><Option value="stem">шт (стебель)</Option><Option value="meter">метры</Option><Option value="piece">шт (штука)</Option></Select></Form.Item>
          </Space>
          {currentProductType === 'bouquet' && (
            <Form.Item 
              name="recipe_id" 
              label="Рецепт букета" 
              extra="Выберите рецепт. Цена закупки будет рассчитана автоматически на основе компонентов."
            >
              <Select 
                placeholder="Выберите рецепт" 
                allowClear 
                showSearch 
                optionFilterProp="children"
                dropdownMatchSelectWidth={false} // Разрешаем выпадающему списку быть шире поля ввода
                dropdownStyle={{ minWidth: 350 }} // Минимальная ширина выпадающего списка
                listHeight={250}
              >
                {recipes.map(r => (
                  <Option key={r.id} value={r.id} title={r.name}>
                    {r.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          )}

          <Form.Item name="shelf_life_days" label="Срок годности (дней)"><InputNumber min={1} style={{ width: '100%' }} placeholder="Например: 7" /></Form.Item>
          <Form.Item name="meta_data" label="Метаданные (JSON)" extra='{"color": "red", "country": "Ecuador"}'><TextArea rows={3} placeholder='{"color": "red"}' /></Form.Item>
          
          <Divider>Ценообразование</Divider>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item 
              name="purchase_price" 
              label="Цена закупки (₽)" 
              style={{ flex: 1 }}
            >
              <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="0.00" />
            </Form.Item>

            <Form.Item 
              name="selling_price" 
              label="Цена продажи (₽)" 
              style={{ flex: 1 }} 
              rules={[
                { required: true, message: 'Укажите цену продажи' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const p = getFieldValue('purchase_price');
                    if (value != null && p != null && value < p) {
                      return Promise.reject(new Error('Цена продажи не может быть меньше закупки!'));
                    }
                    return Promise.resolve();
                  }
                })
              ]}
            >
              <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="0.00" />
            </Form.Item>
          </Space>

          <Form.Item name="is_active" label="Активен" valuePropName="checked" style={{ marginTop: 16 }}><Switch /></Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}><Space><Button onClick={() => { setIsModalOpen(false); form.resetFields(); setEditingProduct(null); setSkuManuallyEdited(false); setIsCyrillicInSku(false); }}>Отмена</Button><Button type="primary" htmlType="submit" loading={loading}>{editingProduct ? 'Сохранить' : 'Создать'}</Button></Space></Form.Item>
        </Form>
      </Modal>

      {productForImages && (<ProductImages productId={productForImages.id} productName={productForImages.name} open={isImagesModalOpen} onClose={() => { setIsImagesModalOpen(false); setProductForImages(null); }} />)}
    </>
  );
};

export default ProductsPage;
