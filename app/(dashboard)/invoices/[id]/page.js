import Invoices from '@/components/pages/Invoices';
export default async function Page({ params }) {
  const { id } = await params;
  return <Invoices id={id} />;
}
