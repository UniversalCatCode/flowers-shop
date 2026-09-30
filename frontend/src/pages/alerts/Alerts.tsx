import React, { useEffect, useState } from 'react';
import { 
  Table, Button, Space, Tag, message, Card, Typography, 
  Popconfirm, Tooltip, Empty, Spin, Modal, Input, Collapse, Descriptions
} from 'antd';
import { 
  ReloadOutlined, CheckCircleOutlined, WarningOutlined,
  DollarOutlined, InboxOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import apiClient from '../../api/client';
import dayjs from 'dayjs';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;
const { Panel } = Collapse;

interface Alert {
  id: number;
  alert_type: string;
  product_id: number | null;
  batch_id: number | null;
  required_qty: number;
  available_qty: number;
  shortage_qty: number;
  recommendations: any;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: number | null;
  product_name: string | null;
}

const AlertsPage: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<any>('/stores/alerts?limit=500');
      setAlerts(response.data.items || []);
    } catch (error) {
      message.error('Не удалось загрузить алерты');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenResolveModal = (alert: Alert) => {
    setSelectedAlert(alert);
    setResolveNotes('');
    setResolveModalOpen(true);
  };

  const handleResolve = async () => {
    if (!selectedAlert) return;
    
    try {
      await apiClient.post(`/stores/alerts/${selectedAlert.id}/resolve`, {
        notes: resolveNotes
      });
      message.success('Алерт закрыт');
      setResolveModalOpen(false);
      fetchAlerts();
    } catch (error) {
      message.error('Ошибка при закрытии алерта');
    }
  };

  const getAlertTypeTag = (type: string) => {
    switch (type) {
      case 'price_increase':
        return <Tag color="orange" icon={<DollarOutlined />}>Повышение цены</Tag>;
      case 'low_stock':
        return <Tag color="red" icon={<WarningOutlined />}>Низкий остаток</Tag>;
      case 'no_price':
        return <Tag color="blue" icon={<DollarOutlined />}>Первая цена</Tag>;
      case 'capability_shortage':
        return <Tag color="red" icon={<InboxOutlined />}>Нельзя собрать букет</Tag>;
      case 'capability_low_stock':
        return <Tag color="orange" icon={<WarningOutlined />}>Мало на витрину</Tag>;
      default:
        return <Tag>{type}</Tag>;
    }
  };

  const renderAlertDetails = (alert: Alert) => {
    switch (alert.alert_type) {
      case 'price_increase':
        const oldPrice = alert.recommendations?.old_price;
        const newPrice = alert.recommendations?.new_price;
        const bouquets = alert.recommendations?.affected_bouquets || [];
        
        return (
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text strong>Товар:</Text> <Text>{alert.product_name || `ID: ${alert.product_id}`}</Text>
            </div>
            <div>
              <Text strong>Цена закупки:</Text>{' '}
              <Text delete style={{ color: '#ff4d4f' }}>{oldPrice ? `${oldPrice} ₽` : '—'}</Text>
              {' → '}
              <Text strong style={{ color: '#52c41a' }}>{newPrice} ₽</Text>
            </div>
            {bouquets.length > 0 && (
              <div>
                <Text strong>Затрагивает букеты:</Text>
                <div style={{ marginTop: 4, marginLeft: 16 }}>
                  {bouquets.map((b: string, i: number) => (
                    <div key={i}>• {b}</div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">
                Рекомендуется проверить и обновить цену продажи для сохранения маржи
              </Text>
            </div>
          </Space>
        );
      
      
      case 'no_price':
        return (
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text strong>Товар:</Text> <Text>{alert.product_name || `ID: ${alert.product_id}`}</Text>
            </div>
            <div>
              <Text strong>Установлена первая цена:</Text> {alert.required_qty} ₽
            </div>
            <div>
              <Text type="secondary">
                Не забудьте установить цену продажи
              </Text>
            </div>
          </Space>
        );

        case 'capability_shortage':
        case 'capability_low_stock':
            const recipeName = alert.recommendations?.recipe_name;
            const affectedBouquets = alert.recommendations?.affected_bouquets || [];
            const maxAssemblable = alert.recommendations?.max_assemblable;
            
            return (
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text strong>Ограничивающий компонент:</Text> <Text>{alert.product_name || `ID: ${alert.product_id}`}</Text>
                </div>
                {recipeName && (
                  <div>
                    <Text strong>Рецепт:</Text> <Text>{recipeName}</Text>
                  </div>
                )}
                <div>
                  <Text strong>Доступно (с учётом резерва):</Text> {alert.available_qty} ед.
                </div>
                <div>
                  <Text strong>Нужно на 1 букет:</Text> {alert.required_qty} ед.
                </div>
                {alert.shortage_qty > 0 && (
                  <div>
                    <Text strong type="danger">Нехватка:</Text> {alert.shortage_qty} ед.
                  </div>
                )}
                {maxAssemblable !== undefined && (
                  <div>
                    <Text strong>Можно собрать букетов:</Text>{' '}
                    <Text type={maxAssemblable === 0 ? 'danger' : 'warning'}>{maxAssemblable} шт.</Text>
                  </div>
                )}
                {affectedBouquets.length > 0 && (
                  <div>
                    <Text strong>Затрагивает товары на витрине:</Text>
                    <div style={{ marginTop: 4, marginLeft: 16 }}>
                      {affectedBouquets.map((b: string, i: number) => (
                        <div key={i}>• {b}</div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">
                    {alert.alert_type === 'capability_shortage' 
                      ? '⚠️ Необходимо срочно обновить витрину маркетплейса или пополнить запас!' 
                      : '⚡ Осталось на последний букет — пополните запас или снимите с витрины.'}
                  </Text>
                </div>
              </Space>
            );
    
        
      default:
        return (
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text strong>Товар:</Text> <Text>{alert.product_name || `ID: ${alert.product_id}`}</Text>
            </div>
            <div>
              <Text strong>Требуется:</Text> {alert.required_qty}
            </div>
            <div>
              <Text strong>Доступно:</Text> {alert.available_qty}
            </div>
            <div>
              <Text strong type="danger">Нехватка:</Text> {alert.shortage_qty}
            </div>
          </Space>
        );
    }
  };

  const columns = [
    {
      title: 'Тип',
      dataIndex: 'alert_type',
      key: 'alert_type',
      width: 150,
      render: (type: string) => getAlertTypeTag(type),
    },
    {
      title: 'Товар',
      key: 'product',
      width: 250,
      render: (_: any, alert: Alert) => (
        <Text strong>{alert.product_name || `ID: ${alert.product_id}`}</Text>
      ),
    },
    {
      title: 'Детали',
      key: 'details',
      render: (_: any, alert: Alert) => {
        let shortText = '';
        if (alert.alert_type === 'price_increase') {
          const oldPrice = alert.recommendations?.old_price;
          const newPrice = alert.recommendations?.new_price;
          shortText = `${oldPrice || '—'} ₽ → ${newPrice} ₽`;
        } else if (alert.alert_type === 'low_stock') {
          shortText = `Нехватка: ${alert.shortage_qty} ед.`;
        } else if (alert.alert_type === 'no_price') {
          shortText = `Первая цена: ${alert.required_qty} ₽`;
        }
        
        return (
          <Tooltip title="Нажмите для подробностей">
            <Text style={{ cursor: 'pointer' }}>{shortText}</Text>
          </Tooltip>
        );
      },
    },
    {
      title: 'Дата создания',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (date: string) => dayjs(date).format('DD.MM.YYYY HH:mm'),
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={status === 'active' ? 'orange' : 'green'}>
          {status === 'active' ? 'Активен' : 'Закрыт'}
        </Tag>
      ),
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 120,
      render: (_: any, record: Alert) => {
        if (record.status === 'resolved') {
          return <Tag color="green">Закрыт</Tag>;
        }
        return (
          <Button 
            type="link" 
            icon={<CheckCircleOutlined />}
            size="small"
            onClick={() => handleOpenResolveModal(record)}
          >
            Закрыть
          </Button>
        );
      },
    },
  ];

  return (
    <>
      <Card
        title={
          <Space>
            <WarningOutlined style={{ color: '#faad14' }} />
            <span>Алерты</span>
            <Tag color="orange">{alerts.filter(a => a.status === 'active').length} активных</Tag>
          </Space>
        }
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchAlerts} loading={loading}>
              Обновить
            </Button>
          </Space>
        }
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
          </div>
        ) : alerts.length === 0 ? (
          <Empty 
            description={
              <Space direction="vertical">
                <ExclamationCircleOutlined style={{ fontSize: 48, color: '#52c41a' }} />
                <Text>Нет активных алертов. Всё отлично!</Text>
              </Space>
            } 
          />
        ) : (
          <Collapse
            accordion={false}
            items={alerts.map((alert) => ({
              key: alert.id,
              label: (
                <Space>
                  {getAlertTypeTag(alert.alert_type)}
                  <Text strong>{alert.product_name || `Товар #${alert.product_id}`}</Text>
                  <Text type="secondary">
                    {dayjs(alert.created_at).format('DD.MM.YYYY HH:mm')}
                  </Text>
                  <Tag color={alert.status === 'active' ? 'orange' : 'green'}>
                    {alert.status === 'active' ? 'Активен' : 'Закрыт'}
                  </Tag>
                </Space>
              ),
              children: (
                <div style={{ padding: '16px 0' }}>
                  {renderAlertDetails(alert)}
                  {alert.status === 'active' && (
                    <div style={{ marginTop: 16, textAlign: 'right' }}>
                      <Button 
                        type="primary" 
                        icon={<CheckCircleOutlined />}
                        onClick={() => handleOpenResolveModal(alert)}
                      >
                        Закрыть алерт
                      </Button>
                    </div>
                  )}
                </div>
              ),
            }))}
          />
        )}
      </Card>

      {/* Модалка закрытия алерта */}
      <Modal
        title="Закрыть алерт"
        open={resolveModalOpen}
        onCancel={() => setResolveModalOpen(false)}
        onOk={handleResolve}
        okText="Закрыть"
        cancelText="Отмена"
      >
        <Paragraph>
          Вы уверены, что обработали этот алерт?
          {selectedAlert?.alert_type === 'price_increase' && (
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              Не забудьте обновить цену продажи в карточке товара
            </Text>
          )}
        </Paragraph>
        <TextArea
          rows={3}
          placeholder="Комментарий (опционально): что было сделано..."
          value={resolveNotes}
          onChange={(e) => setResolveNotes(e.target.value)}
        />
      </Modal>
    </>
  );
};

export default AlertsPage;

