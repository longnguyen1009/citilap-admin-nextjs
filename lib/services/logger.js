import { getSupabaseAdminClient } from '../supabaseAdmin';

/**
 * Ghi log thay đổi của một entity vào bảng activity_logs
 * @param {string} entityType 'LAPTOP' hoặc 'ORDER'
 * @param {string} entityId Mã của sản phẩm hoặc đơn hàng
 * @param {string} action 'CREATE', 'UPDATE', 'DELETE'
 * @param {object} changes Một object chứa thay đổi, vd: { status: { old: 'not_imported', new: 'available' } }
 * @param {string} userName Tên người thực hiện (hoặc Role)
 */
export const logActivity = async (entityType, entityId, action, changes = null, userName = 'Hệ thống') => {
  const client = getSupabaseAdminClient();
  if (!client) {
    console.error('Không thể khởi tạo Supabase Client để ghi log');
    return false;
  }

  // Nếu không có thay đổi nào (đối với UPDATE), bỏ qua không ghi log
  if (action === 'UPDATE' && (!changes || Object.keys(changes).length === 0)) {
    return true;
  }

  try {
    const { error } = await client.from('activity_logs').insert({
      entity_type: entityType,
      entity_id: String(entityId),
      user_name: userName,
      action: action,
      changes: changes
    });

    if (error) {
      console.error('Lỗi khi ghi log activity:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Exception khi ghi log activity:', err);
    return false;
  }
};
