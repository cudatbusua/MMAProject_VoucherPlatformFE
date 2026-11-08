import type { OrderStatus, Refund, VoucherStatus } from '../types';
import type { Tone } from './ui';

export const orderStatus: Record<OrderStatus, [string, Tone]> = {
  PENDING: ['Chờ thanh toán', 'warning'],
  FULFILLED: ['Đã thanh toán', 'success'],
  CANCELLED: ['Đã hủy', 'neutral'],
};

export const voucherStatus: Record<VoucherStatus, [string, Tone]> = {
  ACTIVE: ['Còn hiệu lực', 'success'],
  USED: ['Đã dùng hết', 'neutral'],
  EXPIRED: ['Hết hạn', 'danger'],
  REFUND_PENDING: ['Đang chờ hoàn', 'warning'],
  REFUNDED: ['Đã hoàn tiền', 'info'],
};

export const refundStatus: Record<Refund['status'], [string, Tone]> = {
  REQUESTED: ['Đang xử lý', 'warning'],
  COMPLETED: ['Đã hoàn', 'success'],
  REJECTED: ['Bị từ chối', 'danger'],
};
