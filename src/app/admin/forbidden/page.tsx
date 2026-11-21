import Link from "next/link";

export default async function Forbidden({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  const { need } = await searchParams;
  return (
    <main className="mx-auto max-w-lg px-6 py-20">
      <h1 className="text-3xl font-bold">Not allowed</h1>
      <p className="mt-3 text-neutral-600">Your role doesn&apos;t include {need ? <code>{need}</code> : "this area"}. Ask an owner if you need it.</p>
      <Link href="/admin" className="a-btn mt-6">
        Back to admin
      </Link>
    </main>
  );
}
