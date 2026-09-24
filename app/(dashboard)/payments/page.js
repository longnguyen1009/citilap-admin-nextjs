import Payments from '../../../components/pages/Payments';

export default async function PaymentsPage({ searchParams }) {
  const query = await searchParams;
  const orderId = Array.isArray(query?.orderId) ? query.orderId[0] : query?.orderId;
  return <Payments initialOrderId={/^\d+$/.test(String(orderId || '')) ? orderId : ''} />;
}
