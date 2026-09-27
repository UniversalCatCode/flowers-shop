import React, { useEffect, useState } from 'react';
import { 
  Modal, Upload, Button, Image, Space, message, Typography, 
  Empty, Spin, Tag, Popconfirm, Tooltip
} from 'antd';
import { 
  PlusOutlined, DeleteOutlined, StarOutlined, StarFilled,
  UploadOutlined, InboxOutlined
} from '@ant-design/icons';
import apiClient from '../../api/client';

const { Text, Title } = Typography;
const { Dragger } = Upload;

interface ProductImage {
  id: number;
  product_id: number;
  image_url: string;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

interface ProductImagesProps {
  productId: number;
  productName: string;
  open: boolean;
  onClose: () => void;
}



const ProductImages: React.FC<ProductImagesProps> = ({ 
  productId, 
  productName, 
  open, 
  onClose 
}) => {
  const [images, setImages] = useState<ProductImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchImages();
    }
  }, [open, productId]);

  const fetchImages = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<ProductImage[]>(
        `/catalog/products/${productId}/images`
      );
      
      // СОРТИРОВКА: главное фото всегда первое, остальные по sort_order
      const sorted = response.data.sort((a, b) => {
        if (a.is_primary && !b.is_primary) return -1;
        if (!a.is_primary && b.is_primary) return 1;
        return a.sort_order - b.sort_order;
      });
      
      setImages(sorted);
    } catch (error) {
      message.error('Не удалось загрузить фото');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      await apiClient.post(`/catalog/products/${productId}/images`, formData, {
        headers: {
          'Content-Type': undefined,
        },
      });
      
      message.success('Фото загружено');
      fetchImages();
    } catch (error: any) {
      console.error('❌ Ошибка загрузки фото:', error);
      console.error('📥 Ответ сервера:', error.response?.data);
      message.error(error.response?.data?.detail || 'Ошибка загрузки фото');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (imageId: number) => {
    try {
      await apiClient.delete(`/catalog/products/${productId}/images/${imageId}`);
      message.success('Фото удалено');
      fetchImages();
    } catch (error) {
      message.error('Ошибка удаления');
    }
  };

  const handleSetPrimary = async (imageId: number) => {
    try {
      await apiClient.patch(`/catalog/products/${productId}/images/${imageId}/primary`);
      message.success('Фото сделано главным');
      fetchImages(); // После обновления главное фото автоматически станет первым
    } catch (error) {
      message.error('Ошибка');
    }
  };

  return (
    <Modal
      title={
        <Space>
          <span>Фото товара: </span>
          <Text strong>{productName}</Text>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={800}
    >
      {/* Галерея (СВЕРХУ) */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : images.length === 0 ? (
        <Empty description="Нет фото. Загрузите первое!" />
      ) : (
        <>
          <Title level={5} style={{ marginBottom: 16 }}>
            Загружено фото: {images.length}
          </Title>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', 
            gap: 16,
            marginBottom: 24
          }}>
            {images.map((image) => (
              <div 
                key={image.id}
                style={{
                  position: 'relative',
                  border: image.is_primary ? '3px solid #1890ff' : '1px solid #f0f0f0',
                  borderRadius: 8,
                  overflow: 'hidden',
                  backgroundColor: '#fafafa'
                }}
              >
                {/* Главное фото - бейдж */}
                {image.is_primary && (
                  <div style={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    zIndex: 10,
                  }}>
                    <Tag color="blue" icon={<StarFilled />}>Главное</Tag>
                  </div>
                )}

                {/* Само изображение */}
                <Image
                  src={image.image_url}
                  alt={productName}
                  style={{ 
                    width: '100%', 
                    height: 180, 
                    objectFit: 'cover',
                    display: 'block'
                  }}
                  preview={{ mask: 'Просмотр' }}
                />

                {/* Панель действий */}
                <div style={{
                  padding: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: '#fff',
                  borderTop: '1px solid #f0f0f0'
                }}>
                  <Tooltip title={image.is_primary ? 'Это главное фото' : 'Сделать главным'}>
                    <Button
                      type="text"
                      size="small"
                      icon={image.is_primary ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
                      onClick={() => !image.is_primary && handleSetPrimary(image.id)}
                      disabled={image.is_primary}
                    />
                  </Tooltip>
                  
                  <Popconfirm
                    title="Удалить фото?"
                    onConfirm={() => handleDelete(image.id)}
                    okText="Да"
                    cancelText="Нет"
                  >
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                    />
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Зона загрузки (СНИЗУ) */}
      <Dragger
        multiple={false}
        showUploadList={false}
        beforeUpload={(file) => {
          handleUpload(file);
          return false;
        }}
        disabled={uploading}
        style={{ padding: '20px 0' }}
      >
        <p className="ant-upload-drag-icon">
          {uploading ? <Spin /> : <InboxOutlined />}
        </p>
        <p className="ant-upload-text">
          {uploading ? 'Загрузка...' : 'Нажмите или перетащите файл сюда'}
        </p>
        <p className="ant-upload-hint">
          JPG, PNG, WEBP. Максимум 10 МБ
        </p>
      </Dragger>
    </Modal>
  );
};

export default ProductImages;
