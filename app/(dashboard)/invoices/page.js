import Invoices from '@/components/pages/Invoices';
export default async function Page({ searchParams }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['orderId','customerId','laptopId']) if (typeof params[key] === 'string') query.set(key, params[key]);
  return <Invoices query={query.toString()} />;
}
