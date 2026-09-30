import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Tag, Typography, Spin, Alert, Table, Button, Space, Badge, Empty, Collapse, Tooltip } from 'antd';
import { 
  ShoppingOutlined, 
  WarningOutlined, 
  CheckCircleOutlined,
  ToolOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  InboxOutlined,
  DownOutlined,
  RightOutlined
} from '@ant-design/icons';
import apiClient from '../api/client';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

interface DashboardData {
  today_stats: { orders_count: number; revenue: number };
  active_orders: number;
  pending_assembly: Array<{ id: number; sale_number: string; customer_name: string; created_at: string | null }>;
  active_alerts: number;
  recent_write_offs: Array<{ id: number; product_name: string; quantity: number; reason: string; created_at: string | null }>;
}

interface CapabilityRecipe {
  recipe_id: number;
  recipe_name: string;
  recipe_status: string;
  max_assemblable: number;
  limiting_component: {
    name: string;
    available: number;
    needed_per_unit: number;
    shortage: number;
  } | null;
  bouquet_products: Array<{ name: string }>;
}

const DashboardPage: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [capability, setCapability] = useState<CapabilityRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [capabilityLoading, setCapabilityLoading] = useState(false);
  const [capabilityExpanded, setCapabilityExpanded] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
    fetchCapability();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<DashboardData>('/dashboard/summary');
      setData(response.data);
    } catch (error) {
      console.error('Ошибка загрузки дашборда', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCapability = async () => {
    setCapabilityLoading(true);
    try {
      const response = await apiClient.get<any>('/inventory/capability');
      const problemRecipes = (response.data.recipes || [])
        .filter((r: any) => r.recipe_status === 'critical' || r.recipe_status === 'warning')
        .sort((a: any, b: any) => {
          if (a.recipe_status === 'critical' && b.recipe_status !== 'critical') return -1;
          if (a.recipe_status !== 'critical' && b.recipe_status === 'critical') return 1;
          return a.max_assemblable - b.max_assemblable;
        });
      setCapability(problemRecipes);
    } catch (error) {
      console.error('Ошибка загрузки возможностей сборки', error);
    } finally {
      setCapabilityLoading(false);
    }
  };

  const handleSyncAlerts = async () => {
    try {
      await apiClient.post('/inventory/capability/sync-alerts');
      fetchCapability();
    } catch (error) {
      console.error('Ошибка синхронизации алертов', error);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', marginTop: 100 }}><Spin size="large" /></div>;
  if (!data) return <Alert message="Не удалось загрузить данные дашборда" type="error" />;

  const criticalCount = capability.filter(r => r.recipe_status === 'critical').length;
  const warningCount = capability.filter(r => r.recipe_status === 'warning').length;
  const totalAffectedBouquets = capability.reduce((sum, r) => sum + (r.bouquet_products?.length || 0), 0);

  const assemblyColumns = [
    { title: '№ Заказа', dataIndex: 'sale_number', key: 'sale_number', width: 120 },
    { title: 'Клиент', dataIndex: 'customer_name', key: 'customer_name' },
    { 
      title: 'Время создания', 
      dataIndex: 'created_at', 
      key: 'created_at', 
      width: 160,
      render: (val: string) => val ? dayjs(val).format('DD.MM.YYYY HH:mm') : '—'
    },
    {
      title: 'Действие',
      key: 'action',
      width: 150,
      render: () => (
        <Button type="primary" size="small" icon={<PlayCircleOutlined />} onClick={() => navigate('/sales/orders')}>
          Начать сборку
        </Button>
      )
    }
  ];

  const capabilityColumns = [
    {
      title: 'Рецепт',
      dataIndex: 'recipe_name',
      key: 'recipe_name',
      width: 180,
      render: (name: string) => <Text strong>{name}</Text>
    },
    {
      title: 'Статус',
      dataIndex: 'recipe_status',
      key: 'recipe_status',
      width: 130,
      render: (status: string) => {
        if (status === 'critical') return <Tag color="red">Нельзя собрать</Tag>;
        if (status === 'warning') return <Tag color="orange">Мало остатков</Tag>;
        return <Tag color="green">ОК</Tag>;
      }
    },
    {
      title: 'Можно собрать',
      dataIndex: 'max_assemblable',
      key: 'max_assemblable',
      width: 110,
      render: (count: number) => {
        const color = count === 0 ? '#ff4d4f' : count === 1 ? '#faad14' : '#52c41a';
        return <Text style={{ color, fontWeight: 'bold' }}>{count} шт.</Text>;
      }
    },
    {
      title: 'Ограничитель',
      key: 'limiting',
      width: 200,
      render: (_: any, record: CapabilityRecipe) => {
        if (!record.limiting_component) return <Text type="secondary">—</Text>;
        const lc = record.limiting_component;
        return (
          <div>
            <div>{lc.name}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Нужно: {lc.needed_per_unit} | Есть: {lc.available}
              {lc.shortage > 0 && <Text type="danger"> | Дефицит: {lc.shortage}</Text>}
            </Text>
          </div>
        );
      }
    },
    {
      title: 'Букеты на витрине',
      key: 'bouquets',
      render: (_: any, record: CapabilityRecipe) => {
        if (!record.bouquet_products || record.bouquet_products.length === 0) {
          return <Text type="secondary">—</Text>;
        }
        return (
          <Tooltip 
            title={record.bouquet_products.map(bp => bp.name).join('\n')}
            overlayStyle={{ whiteSpace: 'pre-line', maxWidth: 400 }}
          >
            <div>
              <Text>{record.bouquet_products.length} шт.</Text>
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                {record.bouquet_products[0].name}
                {record.bouquet_products.length > 1 && ' и др.'}
              </Text>
            </div>
          </Tooltip>
        );
      }
    }
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Badge status="success" text={<Text type="secondary">Система работает стабильно</Text>} />
      </div>

      <Title level={2}>Обзор за сегодня</Title>
      
      {/* Ряд 1: Ключевые метрики за день */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Заказов создано сегодня"
              value={data.today_stats.orders_count}
              prefix={<ShoppingOutlined style={{ color: '#1890ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Выручка сегодня"
              value={data.today_stats.revenue}
              precision={2}
              prefix="₽"
              styles={{ content: {color: '#3f8600'} }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Требуют внимания (Алерты)"
              value={data.active_alerts}
              prefix={<WarningOutlined style={{ color: data.active_alerts > 0 ? '#faad14' : '#52c41a' }} />}
              styles={{ content: {color: data.active_alerts > 0 ? '#faad14' : '#52c41a'} }}
            />
          </Card>
        </Col>
      </Row>

      {/* Ряд 2: Возможности сборки букетов (компактный виджет) */}
      <Card 
        style={{ marginBottom: 24 }}
        styles={{ body: { padding: capabilityExpanded ? '16px 24px' : '12px 24px' } }}
      >
        <div 
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => setCapabilityExpanded(!capabilityExpanded)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <InboxOutlined style={{ fontSize: 20, color: capability.length > 0 ? '#faad14' : '#52c41a' }} />
            <Text strong style={{ fontSize: 15 }}>Возможности сборки букетов</Text>
            
            {capability.length === 0 ? (
              <Tag color="green" icon={<CheckCircleOutlined />}>Все букеты доступны</Tag>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                {criticalCount > 0 && <Tag color="red">Нельзя собрать: {criticalCount}</Tag>}
                {warningCount > 0 && <Tag color="orange">Мало остатков: {warningCount}</Tag>}
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Затронуто букетов на витрине: {totalAffectedBouquets}
                </Text>
              </div>
            )}
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
            <Button 
              icon={<ReloadOutlined />} 
              size="small" 
              onClick={fetchCapability}
              loading={capabilityLoading}
            >
              Обновить
            </Button>
            {capability.length > 0 && (
              <Button size="small" onClick={handleSyncAlerts}>
                Создать алерты
              </Button>
            )}
            <Button
              type="text"
              size="small"
              icon={
                <DownOutlined 
                  style={{ 
                    transition: 'transform 0.3s ease',
                    transform: capabilityExpanded ? 'rotate(0deg)' : 'rotate(-90deg)'
                  }} 
                />
              }
              onClick={(e) => {
                e.stopPropagation();
                setCapabilityExpanded(!capabilityExpanded);
              }}
              style={{ color: '#1890ff' }}
            />
          </div>
        </div>

        {capabilityExpanded && (
          <div style={{ marginTop: 16 }}>
            {capabilityLoading ? (
              <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
            ) : capability.length === 0 ? (
              <Empty description="Все букеты можно собрать. Отличная работа!" />
            ) : (
              <Table 
                columns={capabilityColumns} 
                dataSource={capability} 
                rowKey="recipe_id" 
                pagination={false} 
                size="small"
              />
            )}
          </div>
        )}
      </Card>

      {/* Ряд 3: Заказы на сборку */}
      <Card title={`Заказы, ожидающие сборки (${data.pending_assembly.length})`} style={{ marginBottom: 24 }}>
        {data.pending_assembly.length === 0 ? (
          <Text type="secondary">Отличная работа! Все заказы собраны или их пока нет.</Text>
        ) : (
          <Table 
            columns={assemblyColumns} 
            dataSource={data.pending_assembly} 
            rowKey="id" 
            pagination={false} 
            size="small"
          />
        )}
      </Card>

      {/* Ряд 4: Последние списания и Быстрые действия */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={14}>
          <Card title="Последние списания">
            {data.recent_write_offs.length === 0 ? (
              <Text type="secondary">Списаний пока не было</Text>
            ) : (
              <Table 
                dataSource={data.recent_write_offs} 
                rowKey="id" 
                pagination={false} 
                size="small"
                columns={[
                  { title: 'Товар', dataIndex: 'product_name', key: 'product_name' },
                  { title: 'Кол-во', dataIndex: 'quantity', key: 'quantity', width: 80 },
                  { 
                    title: 'Причина', 
                    dataIndex: 'reason', 
                    key: 'reason',
                    render: (text: string) => <Tag color="red">{text}</Tag>
                  },
                  { 
                    title: 'Дата', 
                    dataIndex: 'created_at', 
                    key: 'created_at', 
                    width: 140,
                    render: (val: string) => val ? dayjs(val).format('DD.MM.YYYY HH:mm') : '—'
                  }
                ]}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} md={10}>
          <Card title="Быстрые действия">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[                { title: 'Новый заказ', link: '/sales/orders', icon: <ShoppingOutlined /> },
                { title: 'Управление поставщиками', link: '/catalog/suppliers', icon: <CheckCircleOutlined /> },
              ].map((item, idx) => (
                <div 
                  key={idx} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    padding: '8px 0', 
                    borderBottom: idx < 2 ? '1px solid #f0f0f0' : 'none' 
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 20, color: '#1890ff', display: 'flex', alignItems: 'center' }}>
                      {item.icon}
                    </span>
                    <a href={item.link} style={{ fontWeight: 500, color: '#1890ff' }}>{item.title}</a>
                  </div>
                  <a href={item.link} style={{ color: '#1890ff' }}>Перейти →</a>
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;