import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Button, Switch, Space, Typography, Spin, message } from 'antd';
import { PrinterOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface OrderItem {
  product_name: string;
  product_sku: string;
  product_type: string;
  ordered_qty: number;
  unit_price: number;
}

interface Order {
  id: number;
  order_number: string;
  supplier_name: string;
  supplier_invoice_number?: string;
  invoice_date?: string;
  expected_date?: string;
  status: string;
  notes?: string;
  created_at: string;
  creator_name?: string;
  items: OrderItem[];
  total_amount: number;
}

const PurchaseOrderPrint: React.FC = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPrices, setShowPrices] = useState(searchParams.get('prices') !== '0');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiClient.get(`/inventory/purchase-orders/${id}`)
      .then(res => { setOrder(res.data); setLoading(false); })
      .catch(() => { message.error('Не удалось загрузить заказ'); setLoading(false); });
  }, [id]);

  const handlePrint = () => window.print();

  if (loading) return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  if (!order) return <div style={{ textAlign: 'center', padding: 100 }}>Заказ не найден</div>;

  const statusLabels: Record<string, string> = {
    draft: 'Черновик', confirmed: 'Подтверждён', received: 'Принят', cancelled: 'Отменён',
  };

  return (
    <>
      {/* Панель управления (скрыта при печати) */}
      <div className="print-controls" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => { if (window.opener) window.close(); else window.history.back(); }}>Закрыть</Button>
          <Text>Показать цены:</Text>
          <Switch checked={showPrices} onChange={setShowPrices} />
        </Space>
        <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint}>Печать</Button>
      </div>

      {/* Печатная форма */}
      <div id="print-area" style={{ maxWidth: 800, margin: '0 auto', background: '#fff', padding: 40 }}>
        <Title level={3} style={{ textAlign: 'center', marginBottom: 4 }}>Заказ поставщику №{order.order_number}</Title>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Text type="secondary">от {dayjs(order.created_at).format('DD.MM.YYYY')}</Text>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
          <tbody>
            <tr>
              <td style={{ padding: '4px 0', width: '40%' }}><Text strong>Поставщик:</Text></td>
              <td style={{ padding: '4px 0' }}>{order.supplier_name}</td>
            </tr>
            {order.supplier_invoice_number && (
              <tr>
                <td style={{ padding: '4px 0' }}><Text strong>Счёт поставщика:</Text></td>
                <td style={{ padding: '4px 0' }}>№{order.supplier_invoice_number}{order.invoice_date ? ` от ${dayjs(order.invoice_date).format('DD.MM.YYYY')}` : ''}</td>
              </tr>
            )}
            {order.expected_date && (
              <tr>
                <td style={{ padding: '4px 0' }}><Text strong>Ожидаемая дата:</Text></td>
                <td style={{ padding: '4px 0' }}>{dayjs(order.expected_date).format('DD.MM.YYYY')}</td>
              </tr>
            )}
            <tr>
              <td style={{ padding: '4px 0' }}><Text strong>Статус:</Text></td>
              <td style={{ padding: '4px 0' }}>{statusLabels[order.status] || order.status}</td>
            </tr>
            {order.creator_name && (
              <tr>
                <td style={{ padding: '4px 0' }}><Text strong>Создал:</Text></td>
                <td style={{ padding: '4px 0' }}>{order.creator_name}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Таблица позиций */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #000' }}>
              <th style={{ padding: '8px 4px', textAlign: 'left' }}>№</th>
              <th style={{ padding: '8px 4px', textAlign: 'left' }}>Товар</th>
              <th style={{ padding: '8px 4px', textAlign: 'left' }}>Артикул</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>Кол-во</th>
              {showPrices && (
                <>
                  <th style={{ padding: '8px 4px', textAlign: 'right' }}>Цена</th>
                  <th style={{ padding: '8px 4px', textAlign: 'right' }}>Сумма</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '6px 4px' }}>{idx + 1}</td>
                <td style={{ padding: '6px 4px' }}>{item.product_name}</td>
                <td style={{ padding: '6px 4px' }}>{item.product_sku}</td>
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>{item.ordered_qty}</td>
                {showPrices && (
                  <>
                    <td style={{ padding: '6px 4px', textAlign: 'right' }}>{Number(item.unit_price).toFixed(2)}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right' }}>{(item.ordered_qty * item.unit_price).toFixed(2)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
          {showPrices && (
            <tfoot>
              <tr style={{ borderTop: '2px solid #000' }}>
                <td colSpan={5} style={{ padding: '8px 4px', textAlign: 'right' }}><Text strong>Итого:</Text></td>
                <td style={{ padding: '8px 4px', textAlign: 'right' }}><Text strong>{Number(order.total_amount).toFixed(2)} ₽</Text></td>
              </tr>
            </tfoot>
          )}
        </table>

        {order.notes && (
          <div style={{ marginTop: 24 }}>
            <Text strong>Примечание:</Text>
            <div style={{ marginTop: 4 }}>{order.notes}</div>
          </div>
        )}

        <div style={{ marginTop: 48, display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <Text>Подпись: _________________</Text>
          </div>
          <div>
            <Text>Дата: _________________</Text>
          </div>
        </div>
      </div>

      {/* Стили для печати */}
      <style>{`
        @media print {
          .print-controls, .ant-layout-sider, .ant-layout-header, .ant-menu { display: none !important; }
          body { background: #fff !important; }
          #print-area { padding: 0 !important; max-width: 100% !important; }
          @page { margin: 15mm; size: A4; }
        }
      `}</style>
    </>
  );
};

export default PurchaseOrderPrint;
