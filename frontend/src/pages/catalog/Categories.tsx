import React, { useEffect, useState } from 'react';
import { 
  Tree, Button, Space, Tag, message, Card, Modal, Form, 
  Input, Typography, Popconfirm, Empty, Spin, TreeSelect, Select
} from 'antd';
import { 
  PlusOutlined, ReloadOutlined, EditOutlined, 
  DeleteOutlined, FolderOutlined, FolderOpenOutlined
} from '@ant-design/icons';
import apiClient from '../../api/client';

const { Option } = Select;
const { Text } = Typography;

interface Category {
  id: number;
  name: string;
  category_type: string;
  parent_id: number | null;
  children?: Category[];
}

const CategoriesPage: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [flatCategories, setFlatCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [form] = Form.useForm();

  const buildTree = (cats: Category[]): Category[] => {
    const catMap = new Map<number, Category>();
    cats.forEach(cat => catMap.set(cat.id, { ...cat, children: [] }));

    const tree: Category[] = [];
    cats.forEach(cat => {
      const node = catMap.get(cat.id)!;
      if (cat.parent_id && catMap.has(cat.parent_id)) {
        catMap.get(cat.parent_id)!.children!.push(node);
      } else {
        tree.push(node);
      }
    });

    const sortTree = (nodes: Category[]): Category[] => {
      return nodes
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        .map(n => ({ ...n, children: sortTree(n.children || []) }));
    };

    return sortTree(tree);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const treeRes = await apiClient.get<any>('/catalog/categories/tree').catch(() => null);
      
      if (treeRes && treeRes.status === 200) {
        const treeData = Array.isArray(treeRes.data) ? treeRes.data : [];
        setCategories(treeData);
        
        const flatRes = await apiClient.get<any>('/catalog/categories?limit=500');
        const flatData = Array.isArray(flatRes.data) ? flatRes.data : (flatRes.data?.items || []);
        setFlatCategories(flatData);
      } else {
        const flatRes = await apiClient.get<any>('/catalog/categories?limit=500');
        const flatData = Array.isArray(flatRes.data) ? flatRes.data : (flatRes.data?.items || []);
        setFlatCategories(flatData);
        setCategories(buildTree(flatData));
      }
    } catch (error: any) {
      message.error('Не удалось загрузить категории.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAdd = (parentId: number | null = null) => {
    setEditingCategory(null);
    form.resetFields();
    form.setFieldsValue({ parent_id: parentId, category_type: 'flower' });
    setIsModalOpen(true);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    form.setFieldsValue({
      name: category.name,
      category_type: category.category_type,
      parent_id: category.parent_id,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (values: any) => {
    try {
      const payload: any = {
        name: String(values.name).trim(),
        category_type: values.category_type,
        parent_id: values.parent_id ? Number(values.parent_id) : null,
      };

      if (editingCategory) {
        await apiClient.patch(`/catalog/categories/${editingCategory.id}`, payload);
        message.success('Категория обновлена');
      } else {
        await apiClient.post('/catalog/categories', payload);
        message.success('Категория создана');
      }
      
      setIsModalOpen(false);
      form.resetFields();
      setEditingCategory(null);
      fetchData();
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      if (Array.isArray(detail)) {
        const errors = detail.map((e: any) => `${e.loc.join('.')}: ${e.msg}`).join('; ');
        message.error(`Ошибка валидации: ${errors}`);
      } else if (typeof detail === 'string') {
        message.error(detail);
      } else {
        message.error('Ошибка при сохранении');
      }
    }
  };

  const handleDelete = async (category: Category) => {
    try {
      await apiClient.delete(`/catalog/categories/${category.id}`);
      message.success('Категория удалена');
      fetchData();
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      if (error.response?.status === 400 || error.response?.status === 409) {
        message.error(`Нельзя удалить: ${typeof detail === 'string' ? detail : 'есть привязанные товары или подкатегории'}`);
      } else {
        message.error('Ошибка при удалении');
      }
    }
  };

  // Вспомогательные функции для красивых тегов
  const getTagColor = (type: string) => {
    if (type === 'flower') return 'red';
    if (type === 'packaging') return 'blue';
    if (type === 'bouquet') return 'green';
    if (type === 'consumable') return 'orange'; // <-- ДОБАВЛЕНО
    return 'default';
  };

  const getTagText = (type: string) => {
    if (type === 'flower') return 'Цветок';
    if (type === 'packaging') return 'Упаковка';
    if (type === 'bouquet') return 'Букет';
    if (type === 'consumable') return 'Прочее'; // <-- ДОБАВЛЕНО
    return type;
  };

  const renderTreeData = (cats: Category[]): any[] => {
    return cats.map(cat => ({
      key: cat.id,
      title: (
        <Space size={4} align="center">
          {cat.children && cat.children.length > 0 
            ? <FolderOpenOutlined style={{ color: '#faad14' }} />
            : <FolderOutlined style={{ color: '#faad14' }} />
          }
          <span>{cat.name}</span>
          <Tag color={getTagColor(cat.category_type)} style={{ marginLeft: 8 }}>
            {getTagText(cat.category_type)}
          </Tag>
        </Space>
      ),
      children: cat.children && cat.children.length > 0 ? renderTreeData(cat.children) : [],
      category: cat,
    }));
  };

  const titleRender = (nodeData: any) => {
    const cat: Category = nodeData.category;
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingRight: 8 }}>
        <span>{nodeData.title}</span>
        <Space size="small" onClick={(e) => e.stopPropagation()}>
          <Button 
            type="text" 
            size="small" 
            icon={<PlusOutlined style={{ color: '#52c41a' }} />}
            onClick={() => handleAdd(cat.id)}
            title="Добавить подкатегорию"
          />
          <Button 
            type="text" 
            size="small" 
            icon={<EditOutlined style={{ color: '#1890ff' }} />}
            onClick={() => handleEdit(cat)}
            title="Редактировать"
          />
          <Popconfirm
            title="Удалить категорию?"
            description="Если есть привязанные товары или подкатегории — удаление будет отклонено."
            onConfirm={() => handleDelete(cat)}
            okText="Да"
            cancelText="Нет"
          >
            <Button 
              type="text" 
              size="small" 
              icon={<DeleteOutlined style={{ color: '#ff4d4f' }} />}
              title="Удалить"
            />
          </Popconfirm>
        </Space>
      </div>
    );
  };

  const getParentTreeData = () => {
    const filterOut = (cats: Category[], excludeId: number | null): any[] => {
      return cats
        .filter(c => c.id !== excludeId)
        .map(c => ({
          title: c.name,
          value: c.id,
          key: c.id,
          children: c.children ? filterOut(c.children, excludeId) : [],
        }));
    };
    return filterOut(categories, editingCategory?.id || null);
  };

  const treeData = renderTreeData(categories);

  return (
    <>
      <Card 
        title="📂 Справочник категорий"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
              Обновить
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAdd(null)}>
              Добавить корневую категорию
            </Button>
          </Space>
        }
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
        ) : treeData.length === 0 ? (
          <Empty description="Нет категорий. Создайте первую!" />
        ) : (
          <Tree
            defaultExpandAll
            treeData={treeData}
            titleRender={titleRender}
            blockNode
            style={{ fontSize: '14px' }}
          />
        )}
      </Card>

      <Modal
        title={editingCategory ? 'Редактировать категорию' : 'Новая категория'}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
          setEditingCategory(null);
        }}
        footer={null}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{ parent_id: null, category_type: 'flower' }}
        >
          <Form.Item 
            name="name" 
            label="Название" 
            rules={[{ required: true, message: 'Введите название категории' }]}
          >
            <Input placeholder="Например: Расходные материалы" />
          </Form.Item>

          <Form.Item 
            name="category_type" 
            label="Тип категории" 
            rules={[{ required: true, message: 'Выберите тип категории' }]}
          >
            <Select>
              <Option value="flower">Цветы</Option>
              <Option value="packaging">Упаковка</Option>
              <Option value="bouquet">Букеты</Option>
              <Option value="consumable">Прочее / Расходник</Option> {/* <-- УЖЕ БЫЛО, ОСТАВЛЯЕМ */}
            </Select>
          </Form.Item>

          <Form.Item 
            name="parent_id" 
            label="Родительская категория"
            extra="Оставьте пустым для создания корневой категории"
          >
            <TreeSelect
              showSearch
              style={{ width: '100%' }}
              styles={{ popup: { root: { maxHeight: 300, overflow: 'auto' } } }}
              placeholder="Выберите родительскую категорию (или оставьте пустым)"
              allowClear
              treeDefaultExpandAll
              treeData={getParentTreeData()}
              treeNodeFilterProp="title"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setIsModalOpen(false);
                form.resetFields();
                setEditingCategory(null);
              }}>
                Отмена
              </Button>
              <Button type="primary" htmlType="submit">
                {editingCategory ? 'Сохранить' : 'Создать'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default CategoriesPage;
