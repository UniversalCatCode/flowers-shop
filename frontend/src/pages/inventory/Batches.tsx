import React, { useEffect, useState, useMemo } from 'react';
import { 
  Table, Button, Space, Tag, message, Card, Modal, Form, 
  Input, Select, TreeSelect, InputNumber, DatePicker, Typography, Descriptions
} from 'antd';
import { PlusOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { Product, Supplier, Category } from '../../types/api';
import dayjs from 'dayjs';

const { Option } = Select;
const { TextArea } = Input;
const { Text } = Typography;

interface Batch {
  id: number;
  product_id: number;
  supplier_id: number | null;
  batch_number: string | null;
  purchase_price: number | string;
  received_at: string;
  expires_at: string | null;
  initial_qty: number | string;
  current_qty: number | string;
  status: string;
  quality_score: number | string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

const BatchesPage: React.FC = () => {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form] = Form.useForm();

  // Построение дерева категорий
  const buildCategoryTree = (cats: Category[]) => {
    const sorted = [...cats].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const catMap = new Map<number, any>();
    sorted.forEach(cat => {
      catMap.set(cat.id, { 
        title: cat.name, 
        value: `cat-${cat.id}`,
        key: `cat-${cat.id}`,
        selectable: false, // Категорию нельзя выбрать
        children: [] 
      });
    });

    const tree: any[] = [];
    sorted.forEach(cat => {
      const node = catMap.get(cat.id)!;
      if (cat.parent_id && catMap.has(cat.parent_id)) {
        catMap.get(cat.parent_id)!.children.push(node);
      } else {
        tree.push(node);
      }
    });
    return tree;
  };

  // Построение дерева товаров: категории как родители, товары как листья
  const productTreeData = useMemo(() => {
    const categoryTree = buildCategoryTree(categories);
    const catMap = new Map<string, any>();
    
    // Собираем все узлы категорий в карту
    const collectNodes = (nodes: any[]) => {
      nodes.forEach(node => {
        catMap.set(node.value, node);
        if (node.children) collectNodes(node.children);
      });
    };
    collectNodes(categoryTree);

    // Добавляем товары как листья в соответствующие категории
    products.forEach(prod => {
      const productNode = {
        title: `${prod.name} (${prod.sku})`,
        value: prod.id,
        key: `prod-${prod.id}`,
        selectable: true,
        // Кастомные данные для поиска
        searchText: `${prod.name} ${prod.sku}`.toLowerCase(),
      };

      const parentCatKey = `cat-${prod.category_id}`;
      if (catMap.has(parentCatKey)) {
        catMap.get(parentCatKey)!.children.push(productNode);
      } else {
        // Если категория не найдена (товар без категории), добавляем в корень
        categoryTree.push(productNode);
      }
    });

    // Сортируем товары внутри каждой категории по названию
    const sortChildren = (nodes: any[]): any[] => {
      return nodes.map(node => {
        if (node.children && node.children.length > 0) {
          const sortedChildren = [...node.children].sort((a, b) => {
            const aIsCat = String(a.value).startsWith('cat-');
            const bIsCat = String(b.value).startsWith('cat-');
            if (aIsCat && !bIsCat) return -1;
            if (!aIsCat && bIsCat) return 1;
            return String(a.title).localeCompare(String(b.title), 'ru');
          });
          return { ...node, children: sortChildren(sortedChildren) };
        }
        return node;
      });
    };
    

    return sortChildren(categoryTree);
  }, [products, categories]);

  // Загрузка данных
  const fetchData = async () => {
    setLoading(true);
    try {
      const [batchesRes, productsRes, suppliersRes, categoriesRes] = await Promise.all([
        apiClient.get<any>('/inventory/batches?limit=100'),
        apiClient.get<any>('/catalog/products?limit=500'),
        apiClient.get<any>('/catalog/suppliers?limit=100'),
        apiClient.get<any>('/catalog/categories?limit=500'),
      ]);

      const batchesData = Array.isArray(batchesRes.data) ? batchesRes.data : (batchesRes.data?.items || []);
      const prods = Array.isArray(productsRes.data) ? productsRes.data : (productsRes.data?.items || []);
      const sups = Array.isArray(suppliersRes.data) ? suppliersRes.data : (suppliersRes.data?.items || []);
      const cats = Array.isArray(categoriesRes.data) ? categoriesRes.data : (categoriesRes.data?.items || []);

      setBatches(batchesData);
      setProducts(prods);
      setSuppliers(sups);
      setCategories(cats);
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

  const handleCreate = async (values: any) => {
    try {
      const payload = {
        ...values,
        received_at: values.received_at.toISOString(),
        expires_at: values.expires_at ? values.expires_at.toISOString() : null,
      };

      await apiClient.post<Batch>('/inventory/batches', payload);
      message.success('Партия успешно создана!');
      setIsModalOpen(false);
      form.resetFields();
      fetchData();
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      if (Array.isArray(detail)) {
        message.error(detail.map((e: any) => e.msg).join(', '));
      } else {
        message.error(detail || 'Ошибка при создании партии');
      }
    }
  };

  const showBatchDetails = (batch: Batch) => {
    setSelectedBatch(batch);
    setIsDetailModalOpen(true);
  };

  const formatNumber = (val: any, decimals: number = 2) => {
    const num = Number(val);
    return isNaN(num) ? '—' : num.toFixed(decimals);
  };

  // Кастомный фильтр для TreeSelect: ищет и в названии, и в SKU
  const filterProductNode = (inputValue: string, treeNode: any) => {
    const searchText = inputValue.toLowerCase();
    const nodeText = String(treeNode.title || '').toLowerCase();
    const nodeSearchText = treeNode.searchText || '';
    return nodeText.includes(searchText) || nodeSearchText.includes(searchText);
  };

  const columns = [
    {
      title: 'Товар',
      key: 'product',
      render: (_: any, record: Batch) => {
        const product = products.find(p => p.id === record.product_id);
        if (!product) return '—';
        const category = categories.find(c => c.id === product.category_id);
        return (
          <Space direction="vertical" size={0}>
            <Text strong>{product.name}</Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {product.sku}
              {category && ` • ${category.name}`}
            </Text>
          </Space>
        );
      }
    },
    {
      title: 'Поставщик',
      key: 'supplier',
      render: (_: any, record: Batch) => {
        if (!record.supplier_id) return '—';
        const supplier = suppliers.find(s => s.id === record.supplier_id);
        return supplier ? supplier.name : '—';
      }
    },
    {
      title: 'Номер партии',
      dataIndex: 'batch_number',
      key: 'batch_number',
      width: 120,
      render: (val: string | null) => val || '—'
    },
    {
      title: 'Цена закупки',
      dataIndex: 'purchase_price',
      key: 'purchase_price',
      width: 120,
      render: (price: any) => `${formatNumber(price)} ₽`
    },
    {
      title: 'Остаток',
      key: 'quantity',
      width: 120,
      render: (_: any, record: Batch) => {
        const current = Number(record.current_qty);
        const initial = Number(record.initial_qty);
        const pct = initial > 0 ? ((current / initial) * 100).toFixed(0) : 0;
        return (
          <Space direction="vertical" size={0}>
            <Text strong>{formatNumber(current, 1)} / {formatNumber(initial, 1)}</Text>
            <Text type="secondary" style={{ fontSize: '11px' }}>{pct}%</Text>
          </Space>
        );
      }
    },
    {
      title: 'Дата поступления',
      dataIndex: 'received_at',
      key: 'received_at',
      width: 120,
      render: (date: string) => dayjs(date).format('DD.MM.YYYY')
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const color = status === 'active' ? 'green' : status === 'exhausted' ? 'default' : 'orange';
        const label = status === 'active' ? 'Активна' : status === 'exhausted' ? 'Исчерпана' : status;
        return <Tag color={color}>{label}</Tag>;
      }
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 80,
      render: (_: any, record: Batch) => (
        <Button 
          type="link" 
          icon={<EyeOutlined />} 
          onClick={() => showBatchDetails(record)}
        />
      )
    }
  ];

  return (
    <>
      <Card 
        title="Партии товаров (Приходные накладные)" 
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
              Обновить
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
              Оформить приход
            </Button>
          </Space>
        }
      >
        <Table 
          columns={columns} 
          dataSource={batches} 
          rowKey="id" 
          loading={loading}
          pagination={{ pageSize: 15, showSizeChanger: true }}
        />
      </Card>

      {/* Модальное окно создания партии */}
      <Modal
        title="Оформить приходную накладную"
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
        }}
        footer={null}
        width={650}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{ 
            received_at: dayjs(),
            initial_qty: 1,
          }}
        >
          <Form.Item 
            name="product_id" 
            label="Товар" 
            rules={[{ required: true, message: 'Выберите товар' }]}
            extra="Начните вводить название или SKU для поиска"
          >
            <TreeSelect
              showSearch
              style={{ width: '100%' }}
              styles={{ popup: { root: { maxHeight: 400, overflow: 'auto' } } }}
              placeholder="Выберите товар или начните вводить для поиска..."
              allowClear
              treeDefaultExpandAll
              treeData={productTreeData}
              treeNodeFilterProp="title"
              filterTreeNode={filterProductNode}
              listHeight={400}
              showCheckedStrategy={TreeSelect.SHOW_CHILD}
            />
          </Form.Item>

          <Form.Item name="supplier_id" label="Поставщик">
            <Select 
              placeholder="Выберите поставщика (необязательно)" 
              allowClear
              showSearch 
              optionFilterProp="children"
            >
              {suppliers.map(sup => (
                <Option key={sup.id} value={sup.id}>{sup.name}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="batch_number" label="Номер партии">
            <Input placeholder="Например: BATCH-2026-001" />
          </Form.Item>

          <Space style={{ width: '100%' }} size="large">
            <Form.Item 
              name="purchase_price" 
              label="Цена закупки (₽)" 
              rules={[{ required: true, message: 'Введите цену' }]}
              style={{ flex: 1 }}
            >
              <InputNumber 
                min={0} 
                step={0.01}
                style={{ width: '100%' }} 
                placeholder="150.00"
              />
            </Form.Item>

            <Form.Item 
              name="initial_qty" 
              label="Количество поступило" 
              rules={[{ required: true, message: 'Введите количество' }]}
              style={{ flex: 1 }}
            >
              <InputNumber 
                min={0.01}
                step={1}
                style={{ width: '100%' }} 
                placeholder="100"
              />
            </Form.Item>
          </Space>

          <Form.Item 
            name="received_at" 
            label="Дата поступления" 
            rules={[{ required: true, message: 'Выберите дату' }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
          </Form.Item>

          <Form.Item name="expires_at" label="Срок годности">
            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
          </Form.Item>

          <Form.Item 
            name="quality_score" 
            label="Оценка качества (0.0 - 1.0)"
            extra="1.0 = отличное качество, 0.5 = среднее, 0.1 = плохое"
          >
            <InputNumber 
              min={0} 
              max={1} 
              step={0.1}
              style={{ width: '100%' }} 
              placeholder="0.9"
            />
          </Form.Item>

          <Form.Item name="notes" label="Примечания">
            <TextArea rows={2} placeholder="Дополнительная информация о партии" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setIsModalOpen(false);
                form.resetFields();
              }}>
                Отмена
              </Button>
              <Button type="primary" htmlType="submit" loading={loading}>
                Создать партию
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Модальное окно деталей партии */}
      <Modal
        title="Детали партии"
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={null}
        width={600}
      >
        {selectedBatch && (() => {
          const product = products.find(p => p.id === selectedBatch.product_id);
          const category = product ? categories.find(c => c.id === product.category_id) : null;
          return (
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Товар">
                {product?.name || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="SKU">
                {product?.sku || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Категория">
                {category?.name || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Поставщик">
                {selectedBatch.supplier_id 
                  ? suppliers.find(s => s.id === selectedBatch.supplier_id)?.name || '—'
                  : '—'
                }
              </Descriptions.Item>
              <Descriptions.Item label="Номер партии">
                {selectedBatch.batch_number || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Цена закупки">
                {formatNumber(selectedBatch.purchase_price)} ₽
              </Descriptions.Item>
              <Descriptions.Item label="Количество">
                {formatNumber(selectedBatch.current_qty, 1)} / {formatNumber(selectedBatch.initial_qty, 1)}
                <Text type="secondary" style={{ marginLeft: 8 }}>
                  ({Number(selectedBatch.initial_qty) > 0 ? ((Number(selectedBatch.current_qty) / Number(selectedBatch.initial_qty)) * 100).toFixed(0) : 0}% осталось)
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Дата поступления">
                {dayjs(selectedBatch.received_at).format('DD.MM.YYYY HH:mm')}
              </Descriptions.Item>
              <Descriptions.Item label="Срок годности">
                {selectedBatch.expires_at 
                  ? dayjs(selectedBatch.expires_at).format('DD.MM.YYYY')
                  : '—'
                }
              </Descriptions.Item>
              <Descriptions.Item label="Оценка качества">
                {selectedBatch.quality_score !== null && selectedBatch.quality_score !== undefined 
                  ? formatNumber(selectedBatch.quality_score, 2) 
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Статус">
                <Tag color={selectedBatch.status === 'active' ? 'green' : 'default'}>
                  {selectedBatch.status === 'active' ? 'Активна' : 'Исчерпана'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Примечания">
                {selectedBatch.notes || '—'}
              </Descriptions.Item>
            </Descriptions>
          );
        })()}
      </Modal>
    </>
  );
};

export default BatchesPage;
