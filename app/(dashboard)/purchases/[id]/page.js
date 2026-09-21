import { redirect } from 'next/navigation';
export default async function Page({ params }) {
  const { id } = await params;
  redirect(`/purchases?id=${encodeURIComponent(id)}`);
}
