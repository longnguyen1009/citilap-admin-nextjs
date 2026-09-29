import DirectIntake from '@/components/pages/DirectIntake';
export default async function Page({ searchParams }) {
  const params = await searchParams;
  return <DirectIntake batchId={typeof params.id === 'string' ? params.id : ''} />;
}
