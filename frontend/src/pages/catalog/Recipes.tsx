import React, { useEffect, useState, useMemo } from 'react';
import { 
  Table, Button, Space, Tag, message, Card, Modal, Form, 
  Input, InputNumber, Switch, Typography, Popconfirm, Select, Descriptions
} from 'antd';
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { Product } from '../../types/api';

const { TextArea } = Input;
const { Option } = Select;
const { Text } = Typography;

interface RecipeItem {
  id?: number;
  product_id: number;
  quantity: number;
  min_quantity?: number;
  max_quantity?: number;
  is_required: boolean;
}

interface Recipe {
  id: number;
  name: string;
  description?: string;
  tolerance_pct?: number;
  is_active: boolean;
  items: RecipeItem[];
  created_at: string;
  updated_at?: string;
}

const RecipesPage: React.FC = () => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [form] = Form.useForm();
  const [items, setItems] = useState<RecipeItem[]>([]);

  const recipeCost = useMemo(() => {
    let total = 0;
    let hasMissingPrice = false;
    items.forEach(item => {
      const product = products.find(p => p.id === item.product_id);
      const price = product?.purchase_price ? Number(product.purchase_price) : 0;
      if (price <= 0 && item.product_id) hasMissingPrice = true;
      total += price * Number(item.quantity || 0);
    });
    return { total, hasMissingPrice };
  }, [items, products]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [recipesRes, productsRes] = await Promise.all([
        apiClient.get<any>('/catalog/recipes?limit=100'),
        apiClient.get<any>('/catalog/products?limit=500'),
      ]);
  
      console.log('📦 Рецепты:', recipesRes.data);
      console.log('📦 Товары:', productsRes.data);
  
      const recs = Array.isArray(recipesRes.data) ? recipesRes.data : (recipesRes.data?.items || []);
      const prods = Array.isArray(productsRes.data) ? productsRes.data : (productsRes.data?.items || []);
  
      console.log('✅ Обработанные рецепты:', recs);
      console.log('✅ Обработанные товары:', prods);
  
      setRecipes(recs);
      setProducts(prods);
    } catch (error: any) {
      message.error('Не удалось загрузить данные.');
      console.error('❌ Ошибка загрузки:', error);
    } finally {
      setLoading(false);
    }
  };
  

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = () => {
    setEditingRecipe(null);
    form.resetFields();
    setItems([]);
    setIsModalOpen(true);
  };

  const handleEdit = (recipe: Recipe) => {
    setEditingRecipe(recipe);
    form.setFieldsValue({
      name: recipe.name,
      description: recipe.description,
      tolerance_pct: recipe.tolerance_pct,
      is_active: recipe.is_active,
    });
    setItems(recipe.items || []);
    setIsModalOpen(true);
  };

  const handleSave = async (values: any) => {
    if (items.length === 0) {
      message.error('Добавьте хотя бы один компонент в рецепт');
      return;
    }

    // Проверка: все ли компоненты имеют выбранный товар
    const hasInvalidItems = items.some(item => !item.product_id || item.product_id === 0);
    if (hasInvalidItems) {
      message.error('Во всех компонентах должен быть выбран товар');
      return;
    }

    const payload = {
      ...values,
      items: items.map(item => ({
        product_id: Number(item.product_id),
        quantity: Number(item.quantity),
        min_quantity: item.min_quantity ? Number(item.min_quantity) : null,
        max_quantity: item.max_quantity ? Number(item.max_quantity) : null,
        is_required: item.is_required,
      })),
    };

    console.log('📤 Отправляем payload рецепта:', JSON.stringify(payload, null, 2));

    try {
      if (editingRecipe) {
        await apiClient.patch(`/catalog/recipes/${editingRecipe.id}`, payload);
        message.success('Рецепт обновлён');
      } else {
        await apiClient.post('/catalog/recipes', payload);
        message.success('Рецепт создан');
      }

      setIsModalOpen(false);
      form.resetFields();
      setItems([]);
      setEditingRecipe(null);
      fetchData();
    } catch (error: any) {
      console.error('❌ Ошибка сохранения:', error.response?.data);
      const detail = error.response?.data?.detail;
      if (Array.isArray(detail)) {
        message.error(detail.map((e: any) => `${e.loc.join('.')}: ${e.msg}`).join('; '));
      } else {
        message.error(detail || 'Ошибка при сохранении');
      }
    }
  };


  const handleDelete = async (recipeId: number) => {
    try {
      await apiClient.delete(`/catalog/recipes/${recipeId}`);
      message.success('Рецепт удалён');
      fetchData();
    } catch (error: any) {
      message.error('Ошибка при удалении');
    }
  };

  const showDetails = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setIsDetailModalOpen(true);
  };

  const addIngredient = () => {
    setItems([...items, { product_id: 0, quantity: 1, is_required: true }]);
  };

  const removeIngredient = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, field: keyof RecipeItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const columns = [
    { title: 'Название', dataIndex: 'name', key: 'name' },
    {
      title: 'Компонентов',
      key: 'items_count',
      width: 120,
      render: (_: any, record: Recipe) => record.items?.length || 0
    },
    {
      title: 'Допуск (%)',
      dataIndex: 'tolerance_pct',
      key: 'tolerance_pct',
      width: 120,
      render: (val: number) => val ? `${val}%` : '—'
    },
    {
      title: 'Статус',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'success' : 'default'}>{isActive ? 'Активен' : 'Неактивен'}</Tag>
      )
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 150,
      render: (_: any, record: Recipe) => (
        <Space>
          <Button type="link" icon={<EyeOutlined />} onClick={() => showDetails(record)} />
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title="Удалить рецепт?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <>
      <Card 
        title="Рецепты букетов"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Обновить</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Создать рецепт</Button>
          </Space>
        }
      >
        <Table columns={columns} dataSource={recipes} rowKey="id" loading={loading} />
      </Card>

      <Modal
        title={editingRecipe ? 'Редактировать рецепт' : 'Новый рецепт'}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
          setItems([]);
          setEditingRecipe(null);
        }}
        footer={null}
        width={870}
      >
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ is_active: true }}>
          <Form.Item name="name" label="Название" rules={[{ required: true }]}>
            <Input placeholder="Например: Букет 'Нежность'" />
          </Form.Item>

          <Form.Item name="description" label="Описание">
            <TextArea rows={2} placeholder="Описание рецепта" />
          </Form.Item>

          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="tolerance_pct" label="Допуск (%)" style={{ flex: 1 }}>
              <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} placeholder="5.0" />
            </Form.Item>
            <Form.Item name="is_active" label="Активен" valuePropName="checked" style={{ flex: 1 }}>
              <Switch />
            </Form.Item>
          </Space>

          <Card title="Компоненты" size="small" style={{ marginBottom: 16 }}>
            {items.map((item, index) => (
              <Space key={index} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                <Select
                  style={{ width: 250 }} // Само поле ввода остается компактным
                  dropdownMatchSelectWidth={false} // Разрешаем выпадающему списку быть шире поля ввода
                  dropdownStyle={{ minWidth: 350, maxWidth: 600 }} // Задаем комфортную ширину списка
                  placeholder="Выберите товар"
                  value={item.product_id || undefined}
                  onChange={(val) => updateIngredient(index, 'product_id', val)}
                  showSearch
                  optionFilterProp="label" // Поиск будет работать по полному тексту из label
                  listHeight={250} // Ограничиваем высоту, чтобы появился скролл, если товаров много
                >
                  {products
                  .filter(p => p.product_type !== 'bouquet')
                  .map(p => (
                    <Option 
                      key={p.id} 
                      value={p.id} 
                      label={`${p.name} (${p.sku})`} // Текст, по которому работает поиск
                      title={`${p.name} (${p.sku})`} // Нативная всплывающая подсказка при наведении мыши
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </span>
                        <Text type="secondary" style={{ fontSize: 12, marginLeft: 12, flexShrink: 0 }}>
                          {p.sku}
                        </Text>
                      </div>
                    </Option>
                  ))}
                </Select>

                <InputNumber
                  disabled
                  value={(() => {
                    const p = products.find(pr => pr.id === item.product_id);
                    return p?.purchase_price ? Number(p.purchase_price) : null;
                  })()}
                  formatter={(value) => `${value} ₽`}
                  style={{ width: 70 }}
                  size="middle"
                />



                <InputNumber
                  min={0.01}
                  step={0.1}
                  placeholder="Кол-во"
                  value={item.quantity}
                  onChange={(val) => updateIngredient(index, 'quantity', val)}
                />
                <InputNumber
                  min={0}
                  step={0.1}
                  placeholder="Мин"
                  value={item.min_quantity}
                  onChange={(val) => updateIngredient(index, 'min_quantity', val)}
                />
                <InputNumber
                  min={0}
                  step={0.1}
                  placeholder="Макс"
                  value={item.max_quantity}
                  onChange={(val) => updateIngredient(index, 'max_quantity', val)}
                />
                <Switch
                  checked={item.is_required}
                  onChange={(val) => updateIngredient(index, 'is_required', val)}
                  checkedChildren="Обяз."
                  unCheckedChildren="Опц."
                />
                <Button danger onClick={() => removeIngredient(index)}>Удалить</Button>
              </Space>
            ))}
            <Button type="dashed" onClick={addIngredient} block icon={<PlusOutlined />}>
              Добавить компонент
            </Button>
          </Card>


          <Card size="small" style={{ marginBottom: 16, background: '#f6ffed', borderColor: '#b7eb8f' }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text strong style={{ fontSize: 16 }}>
                💰 Себестоимость рецепта:
              </Text>
              <Text strong style={{ fontSize: 18, color: recipeCost.total > 0 ? '#52c41a' : '#999' }}>
                {recipeCost.total > 0 ? `${recipeCost.total.toFixed(2)} ₽` : '—'}
              </Text>
            </Space>
            {recipeCost.hasMissingPrice && (
              <Text type="warning" style={{ display: 'block', marginTop: 4 }}>
                ⚠️ У некоторых компонентов не указана цена закупки
              </Text>
            )}
            {items.length > 0 && recipeCost.total > 0 && (
              <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                Рекомендованная цена продажи (наценка 200%): {(recipeCost.total * 3).toFixed(2)} ₽
              </Text>
            )}
          </Card>


          <Form.Item style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setIsModalOpen(false);
                form.resetFields();
                setItems([]);
                setEditingRecipe(null);
              }}>Отмена</Button>
              <Button type="primary" htmlType="submit">Сохранить</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Детали рецепта"
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={null}
        width={600}
      >
        {selectedRecipe && (
          <>
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Название">{selectedRecipe.name}</Descriptions.Item>
              <Descriptions.Item label="Описание">{selectedRecipe.description || '—'}</Descriptions.Item>
              <Descriptions.Item label="Допуск">{selectedRecipe.tolerance_pct ? `${selectedRecipe.tolerance_pct}%` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Статус">
                <Tag color={selectedRecipe.is_active ? 'success' : 'default'}>
                  {selectedRecipe.is_active ? 'Активен' : 'Неактивен'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
            <Card title="Компоненты" size="small" style={{ marginTop: 16 }}>
              <Table
                dataSource={selectedRecipe.items}
                rowKey="id"
                pagination={false}
                size="small"
                columns={[
                  {
                    title: 'Товар',
                    key: 'product',
                    render: (_: any, record: RecipeItem) => {
                      const prod = products.find(p => p.id === record.product_id);
                      return prod ? `${prod.name} (${prod.sku})` : '—';
                    }
                  },
                  { title: 'Кол-во', dataIndex: 'quantity', width: 100 },
                  { title: 'Мин', dataIndex: 'min_quantity', width: 80, render: (v: any) => v || '—' },
                  { title: 'Макс', dataIndex: 'max_quantity', width: 80, render: (v: any) => v || '—' },
                  {
                    title: 'Обяз.',
                    dataIndex: 'is_required',
                    width: 80,
                    render: (v: boolean) => v ? 'Да' : 'Нет'
                  }
                ]}
              />
            </Card>
          </>
        )}
      </Modal>
    </>
  );
};

export default RecipesPage;
