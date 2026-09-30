import React, { useEffect, useState, useMemo } from 'react';
import { 
  Table, Button, Space, Tag, message, Card, Modal, Typography, Descriptions
} from 'antd';
import { ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { Product, Supplier, Category } from '../../types/api';
import dayjs from 'dayjs';

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
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

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

  const showBatchDetails = (batch: Batch) => {
    setSelectedBatch(batch);
    setIsDetailModalOpen(true);
  };

  const formatNumber = (val: any, decimals: number = 2) => {
    const num = Number(val);
    return isNaN(num) ? '—' : num.toFixed(decimals);
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
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
            Обновить
          </Button>
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
